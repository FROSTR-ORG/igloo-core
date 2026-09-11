# Entries for `nostr-key-management/SPEC_ISSUES.md`

Every interpretation that implementing QRST v1.4-draft for the `frost-share`
profile forced, from two pull requests:

- [FROSTR-ORG/igloo-core](https://github.com/FROSTR-ORG/igloo-core) — `src/qrst.ts`,
  §6, §7, §9, §11, §12.3, §13 for the `frost-share` profile.
- [FROSTR-ORG/igloo-ios](https://github.com/FROSTR-ORG/igloo-ios) — the consent
  and code-entry surface of §9, and the §11.2a Universal Link hand-off.

Formatted to be appended under `## Open` in `SPEC_ISSUES.md` as-is. Nothing here
concerns the two gaps already named in `README.md` (the placeholder event kinds
and the incomplete vectors), except where a new vector is offered to close one of
them.

Measurements were taken against `@frostr/bifrost` 1.0.7 and `nostr-tools` 2.14.2,
and are reproducible from `vectors/qrst-frost-share-max.json` in the igloo-core
pull request.

---

### `frost-share` has no field-wise payload in any client that exists

**Document:** NOSTR_KEY_MANAGEMENT.md
**Section:** §3.3 (and QRST §4 P3, §5)
**Kind:** ambiguity

§3.3 gives the `frost-share` payload as "The 32-byte share scalar, 64 lowercase
hex characters, plus `index`, `group_pub`, `commitment`, `epoch`,
`group_secret`, and `CK` only when the receiver is trusted".

Every field in that list except the scalar and the index belongs to the NKM §7
epoch record, which no deployed FROSTR client has. What the two devices in a
real `frost-share` transfer hold, and what the receiving device has to end up
with in order to sign, is a pair of bech32m credentials from bifrost's own
encoders: `bfshare1…`, which serialises `{idx, seckey}`, and `bfgroup1…`, which
serialises `{group_pk, threshold, commits[]}`. There is no `epoch`, no
`commitment` scalar, and no `CK`.

An implementer therefore has to choose between a payload the specification
describes and a payload the profile's only real users can produce. The two are
not convertible: `commitment` is `a_1·G` from the dealing polynomial, which
bifrost does not retain, and `bfgroup1` carries a per-member public key list,
which the NKM record has no field for.

igloo-core carries `{"v":1,"share":"bfshare1…","group":"bfgroup1…"}` as JSON.
This is not a proposal that every client do the same — it is a report that the
profile as written is not implementable against the ecosystem it names, and that
two clients reading §3.3 today will not interoperate because each will invent
its own encoding of whatever it actually holds.

**Proposed fix:** §3.3's payload row should give a concrete wire encoding and
say which system produced it, rather than listing fields. Either (a) name the
bifrost credential pair as the encoding — "a JSON object `{v, share, group}`
where `share` is a `bfshare1` and `group` a `bfgroup1` bech32m credential" — and
give the NKM field-wise record as the form used once §7's epoch records exist;
or (b) state that §3.3's payload applies only to NKM §7 deployments and register
a second profile identifier (`frost-share-bifrost`, say) for the credential
pair. The profile identifier is hashed into the SAS (§6), so two encodings under
one identifier is the case QRST §11.2 already argues against for `p` being
optional.

---

### The declared 2048-byte maximum cannot carry a `frost-share` payload above ten members

**Document:** NOSTR_KEY_MANAGEMENT.md
**Section:** §3.3 (and QRST §4 P1, §11.6)
**Kind:** suspected error

§3.3's "Max size" row reads "Default (2048 B)". QRST §4 P1 makes that a hard
ceiling: one payload, one message, and "A profile MAY declare a larger maximum;
where it does, clients MUST read the transport's advertised limits".

A `bfgroup1` credential grows by one commitment per member. Measured, for the
JSON record `{"v":1,"share":…,"group":…}`:

| Members | Payload |
|---|---|
| 2 | 606 B |
| 3 | 771 B |
| 5 | 1 101 B |
| 7 | 1 430 B |
| 10 | 1 925 B |
| 11 | **2 089 B** |
| 12 | 2 254 B |
| 15 | 2 749 B |

The ceiling is crossed between ten and eleven members. bifrost's own
`MAX_COMMITS` is 15, and igloo desktop offers keysets up to that, so the
profile's declared maximum refuses roughly a third of the keysets the ecosystem
can produce. A Sender that discovers this at handover has already made the user
deal a key it cannot deliver.

This is not a size that can be worked around inside the profile: P2 forbids
chunking, and the group credential is not compressible in any way both ends
would agree on. The 2048 figure comes from §11.6's reading of NIP-11's *example*
`max_content_length` of 8196 through a ×3.4 expansion factor, and both halves of
that derivation are conservative (see the next entry).

**Proposed fix:** §3.3's "Max size" row should read "**4096 B.** Larger than
P1's default because the payload is a credential pair whose group half grows with
member count: 1 925 B at ten members and 2 749 B at fifteen, which is bifrost's
`MAX_COMMITS`. Per P1, a client using this profile MUST read
`max_content_length` and `max_message_length` from NIP-11 during the §11.3 probe
and skip operators that cannot carry 4096 B." QRST §4 P1 should additionally say
what a Sender does when the payload it holds exceeds the declared maximum:
"A Sender MUST refuse to begin a session for a payload over the profile's
maximum, and MUST say which limit was exceeded rather than truncating or
chunking."

igloo-core implements the 2048 figure as written and refuses above ten members,
because a profile's declared maximum is not a client's to raise.

---

### §11.6's expansion factor and its derived ceiling are both conservative

**Document:** QR_SECRET_TRANSFER.md
**Section:** §11.6
**Kind:** suspected error (a number, not a mechanism)

§11.6 states "Measured expansion from raw payload to published event is **×3.4
for base64 payloads**", and derives from it a 2 082 B payload ceiling for a relay
advertising `max_content_length = 8196`.

Measured end to end — a 2048-byte `frost-share` payload through the full §11.4
chain, rumor → seal (kind 13, NIP-44) → wrap (kind 1059, NIP-44), with the
timestamps and tags §11.4 requires:

| | Bytes | × payload |
|---|---|---|
| payload | 2 048 | 1.00 |
| rumor JSON | 2 271 | 1.11 |
| seal `content` | 3 504 | 1.71 |
| seal JSON | 3 847 | 1.88 |
| wrap `content` | 5 552 | **2.71** |
| wrap JSON (published event) | 5 997 | **2.93** |

So ×3.4 is an over-estimate of about 16% against the published event, and
`max_content_length` caps the `content` field, where the factor is ×2.71 rather
than ×3.4. A relay advertising 8196 will carry a payload of roughly 3 000 bytes,
not 2 082.

This matters in one direction only — a client skips relays it did not need to
skip, never the reverse — but it is also the arithmetic that produced the 2048 B
default, and the entry above turns on it.

The measurement depends on NIP-44's power-of-two padding, which is why P1 asks
for a vector at exactly the declared maximum and why the numbers above are not
linear: the 2 271-byte rumor pads to 2 560, one 512-byte chunk past what an
implementation gets by adding the two-byte length prefix and stopping. That case
is invisible at every other size.

**Proposed fix:** §11.6 should give the two factors separately — "×2.7 from raw
payload to the `content` field and ×2.9 to the published event, for base64
payloads" — recompute the table's "Max payload" column from the `content`
factor, and say which build the figures came from. The vector below supplies the
underlying numbers.

*Offered with this:* `vectors/qrst-frost-share-max.json` in the igloo-core pull
request is the §4 P1 conformance vector at exactly the declared maximum that
`vectors/README.md` lists as missing. It pins the payload, the rumor, both
NIP-44 padded plaintext lengths and both ciphertext lengths, with the NIP-44
nonces fixed so the ciphertexts reproduce byte for byte. It is offered upstream
under whatever name the repository prefers.

---

### §3.3's P4 check names a commitment the credential form does not carry

**Document:** NOSTR_KEY_MANAGEMENT.md
**Section:** §3.3 (and QRST §4 P4)
**Kind:** ambiguity

§3.3's P4 row is `share·G == group_pub + commitment·index`. That is a check over
a degree-1 verifiable sharing: `group_pub` is `a_0·G`, `commitment` is `a_1·G`,
and the relation holds because `f(i) = a_0 + a_1·i`.

A `bfgroup1` credential carries neither `a_1·G` nor anything from which it can be
recovered. What it carries is `commits[]`, a list of `{idx, pubkey}` where
`pubkey` is `f(idx)·G` for each member — the *evaluated* points rather than the
coefficients. The equivalent check over that form is

```
share·G == commits[share.idx].pubkey
```

which is what bifrost's own `is_group_member` computes, and which is strictly
stronger at `t > 2`: the degree-1 relation is wrong above threshold 2 (the
existing `t = 3` entry in this file covers that), while the point comparison is
correct at every threshold because it does not model the polynomial at all.

An implementer working from §3.3 alone, against a real `bfgroup1`, has no way to
perform the stated check and must either skip P4 — which QRST §4 makes
mandatory, and §13 relies on for discarding a bad candidate — or substitute
something. Two implementers will substitute differently.

**Proposed fix:** §3.3's P4 row should state the check against whatever payload
encoding the first entry above settles on. For the credential-pair encoding:
"`share·G` equals the member public key at `share.idx` in the accompanying group
credential." For the NKM record: keep the coefficient form, corrected per the
existing `t = 3` entry. Either way the row should say that the check is over the
material that travels in the payload, since P4's whole purpose is that the
Receiver can perform it with nothing but what arrived.

---

### §11.4 fixes the wrap's timestamp and says nothing about the seal's

**Document:** QR_SECRET_TRANSFER.md
**Section:** §11.4
**Kind:** ambiguity

§11.4's Timestamps paragraph says "the **wrap's** `created_at` MUST be the true
current time rather than a randomised past value", and gives the reasoning:
every wrap is published immediately, both parties are single-session burners, and
the randomisation "buys nothing while forcing a 48-hour subscription window and a
second timestamp to reason about."

NIP-59 randomises two timestamps, the seal's and the wrap's. The paragraph
overrides one of them by name. The seal's is left at whatever the implementer's
NIP-59 library does, which for `nostr-tools` is a random value up to two days in
the past.

Nothing downstream reads it — expiry is enforced against the rumor's timestamp,
which the paragraph is explicit about — so the two readings interoperate. But the
stated reason for overriding the wrap applies word for word to the seal, and a
"second timestamp to reason about" is exactly what leaving it randomised
produces. The published gift-wrap vector this repository is holding back is
described as having a randomisation problem of precisely this shape.

igloo-core sets both to the true current time.

**Proposed fix:** §11.4's first Timestamps sentence should read "Contrary to
NIP-59, **neither the seal's nor the wrap's** `created_at` is randomised; both
MUST be the true current time", and the bullet list should add "The seal's
timestamp is not read by either party; it is fixed only so that a session has one
clock rather than three."

---

### §12.3's light flow cannot run from a scan, because §11.2's grammar has no `secret`

**Document:** QR_SECRET_TRANSFER.md
**Section:** §12.3 (and §11.2)
**Kind:** suspected error

§12.3 carries the light flow's token in a `frost://` URI with a `secret`
parameter, and then says: "The QR form for this flow stays the `https` fragment
link of §11.2 (fragment privacy, camera-read); `frost://` is for pasting and
deep-linking".

§11.2's grammar is

```
https://<host>/<path>#v=1&mode=…&p=…&npub=…[&relay=…]*[&origin=…]
```

with no `secret`. So the QR form of the light flow carries no token, the
scanning party has nothing to echo, and "the shower proceeds only if the echo
matches" can never be satisfied from a scan. As written, the light flow works
only over the paste path — which is the one channel §12.3's own security
paragraph excludes, since it "suits delivery over a channel the sender controls
— its own camera, or a local same-user paste". The camera half of that sentence
is unreachable.

The fix is available and consistent with §11.2's own argument: the fragment is
the part of the link that "never reaches the host's server or its logs", which
is why the burner key travels there, and the token has the same requirement.

igloo-core puts `secret` in the fragment for `mode=offer` light sessions, and
refuses a light-flow URI that did not come from the device's own camera.

**Proposed fix:** §11.2's grammar should read
`…[&origin=<claimed-origin>][&secret=<hex>]`, with a bullet: "`secret` — present
if and only if the profile declares the light flow of §12.3 and this session
uses it. 32 bytes, lowercase hex. It travels in the fragment for the same reason
the burner key does." §12.3 should then say the `https` and `frost://` carriers
take the same parameters and differ only in reach.

---

### §12.3 says the secret is echoed "inside the first sealed message" and §11.4 gives it nowhere to go

**Document:** QR_SECRET_TRANSFER.md
**Section:** §12.3 (and §11.4)
**Kind:** ambiguity

§12.3: "the other party echoes it inside its first sealed message; the shower
proceeds only if the echo matches."

§11.4 defines HELLO as `{ "kind": 24401, "content": "", "tags":
[["commit","<hex>"]] }` and reserves the tag names `commit` and `nonce`. It
permits profiles to add tags. It does not name a tag for the echoed secret, and
does not say whether the echo goes in `content` or in a tag, nor whether the
`commit` tag is still present in a session that has no SAS to commit to.

Three readings all satisfy the prose and none interoperate: `["secret","<hex>"]`
alongside a commit, `["secret","<hex>"]` instead of one, and the hex in
`content`.

A related gap: §12.3 replaces "the SAS (§6) and its typed comparison (§9.2)", and
§6 exists only to produce the SAS. So a light session presumably runs no nonce
exchange at all — HELLO, then the payload — but §7's step list is not given a
light variant, and an implementer may reasonably keep steps 8–12 running with
their output discarded.

igloo-core sends `["secret","<hex>"]` on HELLO with no `commit` tag, runs no
nonce exchange, and treats a HELLO whose secret does not match as though it never
arrived — not as a §13 candidate, so it does not consume a candidate slot or
raise the multiple-responder notice.

**Proposed fix:** §11.4 should add the message shape explicitly — "In a §12.3
light session HELLO and REQUEST carry `["secret","<hex>"]` in place of
`["commit","<hex>"]`, and `secret` is a reserved tag name" — and §12.3 should
state the abbreviated step list: "Steps 7–12 of §7 (and 7–12 of §8) do not run.
The showing party verifies the echoed secret on the first message and proceeds
directly to the consent of §9.1. A message whose echo does not match MUST be
discarded without becoming a §13 candidate."

---

### In Flow A the Receiver cannot observe the no-match that §7 step 12 tells it to act on

**Document:** QR_SECRET_TRANSFER.md
**Section:** §7 step 12 (and §9.2, §13)
**Kind:** suspected error

§7 step 12 has the Receiver "DISPLAY the active candidate's code, **advancing to
the next held on no-match** (§13)". §9.2 describes the same behaviour from the
other side: "a value the Sender obtains that matches none of its held candidates
advances the display to the next held candidate."

The second sentence is written for Flow B, where the Sender holds the candidates
and therefore knows when a value matched none of them. In Flow A the candidates
are held by the Receiver and the comparison happens on the Sender, and §9.2 is
categorical that the result never crosses: "The obtained value MUST NOT be sent
to the peer, in any form, encrypted or not… A comparison result asserted by the
peer MUST NOT be accepted under any circumstances."

So in Flow A the Receiver has no signal at all. It cannot know a code was typed,
let alone that it failed. The advance has to be triggered by the user — some
control on the Receiver meaning "that code did not work" — and §7 does not say
so, does not say what that control is, and does not say what the Receiver shows
while waiting to be told.

This is not cosmetic. A Receiver that never advances shows the first responder's
code forever, and a user with a real second responder has no way to reach it; a
Receiver that advances on a timer will walk past the honest Sender mid-typing.

**Proposed fix:** §7 step 12 should read: "derive SAS for this SND; DISPLAY the
active candidate's code: 'Type this on your other device'. Where more than one
candidate is held, offer a control that advances the display to the next held
candidate. In Flow A the Receiver cannot observe a no-match — §9.2 forbids the
result reaching it — so the advance is user-driven, and the control is labelled
for what the user knows ('that code didn't work'), not for what the protocol is
doing. The Receiver MUST NOT advance on a timer." §9.2's corresponding bullet
should say that the advance is automatic on the party that performs the
comparison and user-driven on the party that does not.

---

### §9.4's "the candidate whose SAS the Sender confirmed" is not observable either

**Document:** QR_SECRET_TRANSFER.md
**Section:** §9.4 (and §13, §7 steps 15–17)
**Kind:** ambiguity

§9.4: "the Receiver MUST commit only the candidate whose SAS the Sender confirmed
(§13) — the one the Sender read from this Receiver's screen and matched locally".

The Receiver is never told which that was, by the same §9.2 rule as above. What
it can observe is which candidates sent a PAYLOAD, and an honest Sender sends one
only after matching. So "the candidate whose SAS the Sender confirmed" is
knowable exactly when one candidate has sent a payload; when two have — which
§13 explicitly allows for, since a hostile responder can send a payload
unprompted — the sentence identifies nothing.

igloo-core commits the payload held by the **active** candidate: the one whose
code is currently displayed, which the user advanced to until the Sender's typed
value matched. A payload from a non-active candidate is held under P6 and wiped
with the session.

**Proposed fix:** §9.4 should name the observable: "the Receiver MUST commit only
the payload held for the candidate whose code was displayed when the transfer
completed — the active candidate of §13 — and MUST discard payloads held for any
other. A payload arriving from a candidate that is not active MUST NOT change the
display, raise a prompt, or become committable by any path other than the user
advancing to that candidate."

---

### §9.3's one-hour memory has no stated durability

**Document:** QR_SECRET_TRANSFER.md
**Section:** §9.3
**Kind:** ambiguity

§9.3: "The Sender MUST NOT begin a new session with a peer burner it has already
failed a code entry against, and **MUST remember those burners for at least one
hour**", and after three failed sessions in an hour the client must warn about
interference and require an acknowledgement.

Neither requirement says whether the memory survives the process. On a phone it
routinely does not: an app that is backgrounded during a failed transfer may be
terminated within seconds, and in-memory state is gone. An attacker who can cause
three failures can probably also cause a relaunch, and both controls then reset
to zero — which is the situation the throttle exists to prevent.

Persisting it has its own cost: a list of burner public keys the user failed
against, on disk, is a small record of pairing attempts that the session
otherwise leaves nowhere.

igloo-core keeps it in memory by default and exposes the store as an interface so
a client can back it with storage, which resolves nothing about what is
*required*.

**Proposed fix:** §9.3 should state the durability and the disposal: "The record
of refused burners and failed sessions MUST survive a restart of the client for
its one-hour lifetime, and MUST be deleted once the hour has passed. It holds
burner public keys and timestamps only, and MUST NOT record the payload, the
profile, the relays, or the code that was entered."

---

### §11.6's "skip relays that cannot carry" does not say what an unadvertised limit means

**Document:** QR_SECRET_TRANSFER.md
**Section:** §11.6 (and §4 P1, §11.3)
**Kind:** ambiguity

§11.6: "Clients MUST read `max_message_length` and `max_content_length` from
NIP-11 during the §11.3 probe and skip relays that cannot carry the declared
profile's maximum."

Most relays advertise neither field, and the section itself notes that "strfry's
stock configuration sets no content cap, and deployed enforcement is unmeasured".
NIP-11 is also fetched over HTTP, so the document may be unreachable while the
WebSocket works perfectly well.

Read strictly — skip anything not shown to be capable — a client skips nearly
every relay in use, including the ones in §11.2 examples, and the transport
disappears. Read leniently — skip only what is shown to be incapable — a client
may publish an event a relay silently drops, which §11.3's ten-minute retry makes
survivable but slow to diagnose.

igloo-core reads it leniently: a limit it cannot read is not a limit it can act
on, so the relay is kept.

**Proposed fix:** §11.6's last paragraph should read: "Clients MUST read
`max_message_length` and `max_content_length` from NIP-11 during the §11.3 probe
and MUST skip a relay whose advertised value is smaller than the declared
maximum. An absent field, or an unreachable NIP-11 document, is not a value:
the relay is kept. A relay that silently drops an oversized event is
indistinguishable from one that is slow, which is what the §11.3 retry window
covers."

---

### §11.4 requires a clock a mobile client cannot check

**Document:** QR_SECRET_TRANSFER.md
**Section:** §11.4
**Kind:** ambiguity

§11.4: "clients MUST keep their wall clock within `SLACK` of true time — by NTP
or the platform's network time. A client that cannot MUST warn that transfers may
fail, and MUST NOT widen `SLACK` locally to compensate."

An application on iOS or Android cannot do this. There is no API that returns
network time, no API that reports whether automatic time is enabled, and no way
to distinguish a correct clock from a wrong one without asking something over the
network — which is a request the transfer does not otherwise make and a party it
does not otherwise trust. The requirement is stated as something the client does;
in practice it is something the platform either did or did not do, invisibly.

The failure mode is worth naming because it is silent and confusing: a device
whose clock is two minutes off discards every rumor as outside the session window
(§11.4's own rule), so the pairing simply never happens and neither screen says
why.

igloo-core accepts an optional caller-supplied skew and emits a warning above
`SLACK`, which means the warning appears exactly when an application already knew
enough not to need it.

**Proposed fix:** §11.4's clock bullet should separate the obligation from the
diagnosis: "Clients MUST keep their wall clock within `SLACK` of true time and
MUST NOT widen `SLACK` locally to compensate. Where the platform does not let an
application verify this, the client MUST instead report it after the fact: a
session that reaches its ten-minute expiry having discarded one or more rumors by
the session-window test MUST tell the user that the two devices disagree about
the time and name it as a likely cause, rather than reporting a generic
timeout."

---

### §9.1's punycode requirement has no defined behaviour where the platform cannot satisfy it

**Document:** QR_SECRET_TRANSFER.md
**Section:** §9.1 item 2
**Kind:** ambiguity

§9.1: "Origins containing non-ASCII MUST be shown as punycode."

Browsers and Node produce punycode from `new URL()` as a matter of course. Several
React Native URL implementations do not: Hermes ships a partial `URL` that leaves
Unicode hostnames untouched, and no punycode encoder is in the standard library.
So a client can be structurally unable to obey, and the specification does not say
what it does then — show the Unicode, which is the homograph case the requirement
exists to stop, or refuse.

igloo-core refuses the origin, which makes the peer's nature unestablished and
therefore draws the maximum friction tier under §9.1's own fail-closed rule. That
seems right but it is a choice, and a client that displays the Unicode instead is
not visibly non-conforming.

**Proposed fix:** §9.1 item 2 should add: "A client that cannot render a non-ASCII
origin as punycode MUST NOT display it at all. The peer's nature is then
unestablished and the maximum friction tier applies."

---

### §11.2 says a QR carries 1–4 relays and the grammar permits zero

**Document:** QR_SECRET_TRANSFER.md
**Section:** §11.2
**Kind:** ambiguity

The grammar is `[&relay=<wss url>]*`, which is zero or more. The bullet below it
reads "`relay` — 1–4 relay URLs the showing device is subscribed to."

Zero relays is a coherent thing to want: §11.7's local path needs none, and a
client whose relay set is configured identically on both devices arguably does
not need to name them. It is also a coherent thing to reject, since a scanning
device with no relay in common has no transport and will fail at the ten-minute
mark rather than immediately.

igloo-core parses zero (the grammar) and refuses to start a session with none
(the bullet), falling back to its own defaults when the scanning side supplies
them.

**Proposed fix:** the grammar should read `[&relay=<wss url>]{0,4}` and the
bullet should say: "`relay` — 0–4 relay URLs the showing device is subscribed
to. Zero is permitted only where the session will use the local path of §11.7;
over relays, a scanning client that is given none MUST use its own configured
relays and MUST tell the user that the two devices may not share one."
