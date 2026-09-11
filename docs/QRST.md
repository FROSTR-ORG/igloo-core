# QRST — QR Secret Transfer

`src/qrst.ts` implements the [QR Secret Transfer specification][spec] v1.4-draft
for the `frost-share` profile. It is a second way to move a share between two
devices, alongside the existing echo flow; nothing about echo changes, and
`sendEcho` is what a QRST receiver calls once it has committed.

Section references below are to [QR_SECRET_TRANSFER.md][spec] unless prefixed
`NKM`, which is [NOSTR_KEY_MANAGEMENT.md][nkm].

## The problem it addresses

A share is currently handed over as its own `bfshare1` string rendered into a QR
code. igloo desktop's `handleShowQrCode` puts the credential itself in the code,
and igloo-ios scans `bfgroup` then `bfshare` in the clear. That makes the
credential readable by anything that can see the screen — a photograph across a
room, a shoulder, a screen recording, a shared-screen call — and the reader does
not have to be the device the user meant to give it to. Bifrost's own
`docs/SECURITY.md` threat model lists relay surveillance, nonce reuse, replay
and tampering; the moment a share is in transit between two devices is not on
either list, because the protocol has never had a transit step to model.

QRST replaces the payload in the code with a pairing address. The QR carries a
burner public key and relay hints and nothing else; the two devices derive a
five-digit code from a commit-then-reveal transcript; a person reads those
digits off the receiving device and types them into the sending one; and the
credential travels NIP-59 gift-wrapped over relays neither device operates. A
photograph of the code yields a public key.

## What is implemented

| Spec | Implemented |
|---|---|
| §6 SAS, commit-then-reveal | `deriveQrstCommit`, `deriveQrstSas`, checked against `vectors/qrst-sas.json` |
| §7 Flow A, Receiver shows the QR | `startQrstReceive` (steps 7–17), `startQrstSend` (steps 4–14, 18) |
| §8 Flow B, Sender shows the QR | Not implemented. Both igloo clients have cameras; §7 covers them |
| §9 Consent and confirmation | `buildQrstConsentPrompt`, `submitCode`, `accept` |
| §9.3 Restart throttle | `getQrstRestartThrottle`, `acknowledgeQrstFailures`, `setQrstFailureStore` |
| §10 Offline tier | Not implemented. Needs the NKM §3.3 `frostshare1` container first |
| §11 Nostr binding | Kinds 24401–24407, sealed and gift-wrapped, true `created_at`, NIP-40, `SLACK = 120`, session outbox |
| §11.2 QR URI | `buildQrstUri`, `parseQrstUri` |
| §11.7 Local network path | Not implemented. Explicitly optional and outside the conformance surface |
| §12.1 Copy-paste pairing | `pairingSource: 'paste'`, which fails closed to maximum friction |
| §12.3 Light flow | `light: true`, `buildQrstFrostUri`, `release()` |
| §13 Multiple responders | Candidate list, soft notice, lazy display, `advanceCandidate` |
| §14 Policy record | `QrstTransferRecord`, returned from both sides |

## Receiving a share

```typescript
import { startQrstReceive } from '@frostr/igloo-core';

const session = startQrstReceive({
  relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  onSasReady: (digits) => showPairingCode(digits),
  onPayload: (rendering) => showConfirmation(rendering),
  onNotice: (notice) => showNotice(notice.message)
});

renderQrCode(session.uri);

// …the user confirms the rendering…
const { shareCredential, groupCredential, record } = await session.accept();
await saveCredentials(shareCredential, groupCredential);
```

`startQrstReceive` returns synchronously. §11.3 is explicit that the
three-second relay probe "MUST NOT close out a ten-minute session": show the QR
immediately, keep retrying relays for the remaining lifetime, and report failure
only at expiry. The transport does that on its own.

Nothing is committed before `accept()`. A payload that arrives is held, keyed by
the burner that sent it, and discarded with the session if the user never
confirms.

### Presenting the code (§11.2b)

A QR "MUST NOT be displayed bare". The line beside it states the direction and
what moves, in the profile's words. Release and receipt must look different: a
`mode=offer` code, which makes whoever scans it the Sender, is presented with
visibly greater weight than a `mode=request` one. If you overlay a logo, raise
error correction to level H, keep the overlay under 25% of the code's area, and
put nothing there that reads as assurance — no badge, seal, shield, tick,
padlock or ribbon, and nothing in the colour you use elsewhere for verified
states.

## Sending a share

```typescript
import { startQrstSend } from '@frostr/igloo-core';

const session = await startQrstSend({
  uri: scannedUri,
  pairingSource: 'camera',       // 'paste' for anything this camera did not read
  payload: { share: shareCredential, group: groupCredential }
});

// session.consent carries everything §9.1 requires the prompt to present.
const result = await session.submitCode(fiveDigitsTypedByTheUser);
if (!result.matched) {
  showAttemptsRemaining(result.attemptsRemaining);
}
```

The promise resolves once the handshake is done and the release prompt can be
shown. Nothing has left the device at that point.

`pairingSource` is not cosmetic. §9.1's friction tier is set by what the peer is
*established* to be, and the default is the maximum: a URI that this device's
own camera did not read gets web-tier friction whatever it claims, because a
pasted link is not evidence that the code was ever in front of the user.

### What the consent prompt must do (§9.1)

`session.consent` supplies the wording; the layout is yours, and these rules are
not negotiable:

- The heading contradicts the expected mental model. A person who has just
  scanned a QR believes they are signing in.
- **Declining is the prominent control.** The affirmative control is not
  visually dominant, is not focused, is not the default, and is not activated by
  a default keyboard action.
- The affirmative control describes the transfer — "Send a share of my key to
  that device" — rather than expressing agreement.
- At maximum friction the prompt requires a deliberate act beyond a single tap,
  and where an origin is claimed it is named in the affirmative control itself.
- Consent authorises exactly one session. It is never remembered, defaulted,
  cached, or carried into the next transfer.

### What the code field must do (§9.2)

- Five discrete character positions, exactly five digits, never silently more.
- Never pre-filled, never auto-completed from the clipboard.
- Never labelled "PIN" or "passcode". It is a pairing code belonging to one
  session, and the prompt says where it comes from — "the code shown on your
  other device", not "your code".
- A control that merely asks whether the codes match — a tap, a button, a
  biometric prompt — **does not conform**. The Sender is the party performing
  the irreversible release, so the Sender is the party that must actively prove
  it read the other screen.
- The value never goes on the wire, never reaches logs or analytics, and a
  comparison result asserted by the peer is never accepted.

## The light flow (§12.3)

`light: true` swaps the typed code for a returned secret: the receiver puts a
fresh 32-byte token in the pairing URI and the sender echoes it in its first
sealed message. It is one-and-done — nothing is shown, typed, or read back.

This is safe over a channel the sender controls and not otherwise. The spec is
worth quoting rather than paraphrasing:

> The returned secret stops a party that never received the token — a racing
> responder, an overheard relay. It does **not** stop interception of the token
> itself: whoever obtains the token obtains the secret, receives the payload,
> and — for a threshold share — holds one of the shares the key reconstructs
> from. Admission gates *signing*, not reconstruction, and rotation is
> forward-only, so **neither undoes a share intercepted in transit and combined
> with another**.

`startQrstSend` refuses a light-flow URI that did not come from this device's
own camera for that reason. Over any channel the sender does not control, use
the SAS. No irreversible payload may use the light flow at all — which is why
`nostr-nsec` is not eligible and `frost-share` is.

## Residual risk this does not address (§15)

**A hostile party acting as Receiver is not stopped by the SAS.** Such a party
holds a real burner, receives the real messages, and displays a matching code.
It is stopped only by a user declining the release prompt. The specification
requires implementations to document this and to not describe the SAS as
protecting against it, so: the SAS proves the two devices in the ceremony are
the two devices in the ceremony. It proves nothing about whether the other one
should be given a share.

What blunts it is that the payload is a threshold share rather than a whole key
— bounded, admission-gated, revocable by rotation — not anything in the pairing
mechanism.

## Sizes and relays

The `frost-share` payload is the credential pair, and a `bfgroup1` credential
grows with the number of members. Against NKM §3.3's declared 2048-byte maximum:

| Members | Payload |
|---|---|
| 2 | 606 B |
| 5 | 1 101 B |
| 10 | 1 925 B |
| 11 | 2 089 B — over the maximum |

`buildQrstFrostSharePayload` refuses a pair over the ceiling rather than
emitting a payload a conforming peer must reject. Keysets of more than ten
members cannot be delivered by QRST as the profile currently stands; this is
filed upstream.

## The bounce host

`QRST_DEFAULT_BOUNCE_HOST` is a placeholder. The primary path never visits it: a
client whose own camera reads the code parses the fragment and pairs directly,
making no HTTP request at all, and every parameter lives in the fragment so
nothing reaches the host's logs even when a browser does open the link. The host
matters only when the platform camera app scans the code, and what it serves is
two static things:

- the §11.2a bounce page, which reads its own fragment and hands off to the
  associated app;
- `/.well-known/apple-app-site-association`, so that hand-off is a direct open
  rather than a browser detour.

Pass `bounceHost` to use your own.

## Test vectors

`vectors/qrst-sas.json` is a verbatim copy of the specification's own normative
vector; where it and this implementation disagree, this implementation is wrong.
`vectors/qrst-frost-share-max.json` is the §4 P1 ceiling vector, which the
specification lists as missing and which is offered back upstream. See
`vectors/README.md`.

[spec]: https://github.com/sybenx/nostr-key-management/blob/main/QR_SECRET_TRANSFER.md
[nkm]: https://github.com/sybenx/nostr-key-management/blob/main/NOSTR_KEY_MANAGEMENT.md
