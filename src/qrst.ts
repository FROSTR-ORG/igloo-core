/**
 * QRST — QR Secret Transfer, the `frost-share` profile.
 *
 * A transfer method that sits beside {@link sendEcho} rather than replacing it.
 * Today a keyset share moves between devices as a `bfshare1` string rendered
 * directly into a QR code, so a photograph of the screen is a share. QRST puts
 * only a burner public key and relay hints in the code, has a person carry a
 * five-digit code between the two screens, and moves the credential NIP-59
 * gift-wrapped over public relays.
 *
 * Specification: `QR_SECRET_TRANSFER.md` v1.4-draft, in
 * https://github.com/sybenx/nostr-key-management. Section references in this
 * file are to that document unless they are prefixed `NKM`, which is
 * `NOSTR_KEY_MANAGEMENT.md` in the same repository.
 *
 * Two entry points:
 *
 * - {@link startQrstReceive} — this device wants a share. It shows the QR
 *   (`mode=offer`, Flow A of §7), displays the pairing code, holds what
 *   arrives, and commits only after the application confirms the §4 P5
 *   rendering.
 * - {@link startQrstSend} — this device holds a share and releases one. It
 *   scans or pastes the URI, runs the handshake, exposes the §9.1 release
 *   consent data, and releases only after five typed digits match the code it
 *   computed itself.
 *
 * @module
 */

import { sha256 } from '@noble/hashes/sha256';
import { nip19, nip42 } from 'nostr-tools';
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  verifyEvent,
  type Event as NostrEvent,
  type EventTemplate,
  type UnsignedEvent,
  type VerifiedEvent
} from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { fetchRelayInformation } from 'nostr-tools/nip11';
import * as nip44 from 'nostr-tools/nip44';
import { is_group_member } from '@frostr/bifrost/lib';

import { decodeGroup, decodeShare } from './keyset.js';
import { sendEcho, DEFAULT_ECHO_RELAYS } from './echo.js';
import type { NodeEventConfig } from './node.js';
import { QrstError, type GroupPackage, type SharePackage } from './types.js';

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

/** Protocol version carried in the QR and hashed into every transcript (§6, §11.2). */
export const QRST_VERSION = 1;

/** Session lifetime (§2). Burners are never reused across sessions. */
export const QRST_SESSION_LIFETIME_MS = 600_000;

/**
 * Normative timestamp tolerance at each end of the session window (§11.4).
 *
 * "`SLACK` is normative: if one client accepts what another rejects, honest
 * pairings fail between them." It is never widened locally.
 */
export const QRST_SLACK_SECONDS = 120;

/** At most five code attempts per session (§9.2). */
export const QRST_MAX_SAS_ATTEMPTS = 5;

/** At most three candidate responders held per session (§13). */
export const QRST_MAX_HELD_CANDIDATES = 3;

/** Failed sessions within an hour before the client must warn about interference (§9.3). */
export const QRST_FAILED_SESSION_WARN_THRESHOLD = 3;

/** How long a burner that failed a code entry stays refused (§9.3). */
export const QRST_FAILURE_MEMORY_MS = 3_600_000;

/** Relay reachability probe timeout (§11.3). Advisory: it never closes out a session. */
export const QRST_PROBE_TIMEOUT_MS = 3_000;

/** Seconds the Sender waits for an ACK before zeroizing anyway (§7 step 18). */
export const QRST_ACK_GRACE_MS = 60_000;

/**
 * Provisional event kinds (§11.4). They sit in the ephemeral range and were
 * checked free of collision as of 2026-09-02, but are not yet reserved by a
 * NIP. "Interoperability is not promised before that NIP."
 */
export const QRST_KINDS = {
  /** Sender → Receiver, Flow A: the Sender's commit. */
  HELLO: 24401,
  /** Receiver → Sender, Flow B: the Receiver's commit. */
  REQUEST: 24402,
  /** Non-contacting party → contacting party. */
  NONCE: 24403,
  /** Contacting party opens its commit. */
  REVEAL: 24404,
  /** Sender → Receiver. */
  PAYLOAD: 24405,
  /** Receiver → Sender, after the payload is committed. */
  ACK: 24406,
  /** Either party → peer: this session is over (§9.3). */
  ABORT: 24407
} as const;

/** NIP-59 seal kind. */
const SEAL_KIND = 13;
/** NIP-59 gift wrap kind. */
const GIFT_WRAP_KIND = 1059;

/** Profile identifier registered against §5 by NKM §3.3. */
export const QRST_PROFILE_FROST_SHARE = 'frost-share';

/**
 * The `frost-share` maximum payload, in bytes.
 *
 * NKM §3.3 declares "Default (2048 B)", which is P1's default, so this is that
 * number rather than a local choice. It is a real ceiling for this profile as
 * igloo encodes it: a `bfshare1` + `bfgroup1` pair for an n-member keyset
 * measures 606 B at n=2, 1925 B at n=10 and 2089 B at n=11, so a keyset with
 * more than ten members cannot be delivered by QRST at the declared maximum.
 * {@link buildQrstFrostSharePayload} refuses to build one rather than emitting
 * a payload a conforming peer must reject. See `SPEC_ISSUES.md`.
 */
export const QRST_FROST_SHARE_MAX_PAYLOAD_BYTES = 2048;

/**
 * Default host for the §11.2 pairing link.
 *
 * **Placeholder.** The FROSTR community bounce host has not been named yet;
 * this value is a stand-in so the default is a single reviewable constant
 * rather than a value each client invents. Pass `bounceHost` to override.
 *
 * Whatever host is chosen has to serve two things and nothing else: the §11.2a
 * static bounce page, and `/.well-known/apple-app-site-association` so that a
 * scan by the platform camera app opens the installed client instead of a
 * browser. The fragment never reaches it, so it learns nothing about a pairing.
 */
export const QRST_DEFAULT_BOUNCE_HOST = 'qrst.frostr.org';

/** Default path for the §11.2 pairing link. "qrst" is a name, not a scheme. */
export const QRST_DEFAULT_BOUNCE_PATH = '/qrst';

/**
 * Default relays for a transfer session. The same list {@link sendEcho} falls
 * back to, so a device that can echo can also pair.
 */
export const QRST_DEFAULT_RELAYS = DEFAULT_ECHO_RELAYS;

/** Custom scheme for the §12.3 light flow. Pasting and deep-linking only. */
export const QRST_FROST_SCHEME = 'frost:';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/** Which party shows the QR: `offer` = the Receiver (Flow A), `request` = the Sender (Flow B). */
export type QrstMode = 'offer' | 'request';

/** How the local device obtained the pairing URI. Sets the §9.1 friction tier. */
export type QrstPairingSource =
  /** Read by this device's own camera — the one channel that proves the code was in front of the user. */
  | 'camera'
  /** Pasted, deep-linked, or arrived by any route other than this device's camera (§12.1). */
  | 'paste';

/** §9.1 friction tier. The default is the maximum and it fails closed. */
export type QrstFrictionTier = 'standard' | 'maximum';

/** How the session authenticates the pairing: the §6 SAS, or the §12.3 returned secret. */
export type QrstHandshake = 'sas' | 'returned-secret';

/** Parsed form of a §11.2 pairing URI. */
export interface QrstUriParams {
  /** Protocol version. A client MUST reject an unknown value. */
  version: number;
  /** Role the showing device has taken. */
  mode: QrstMode;
  /** Profile identifier (§5). REQUIRED — it is hashed into the SAS. */
  profile: string;
  /** Burner public key of the showing device, bech32. */
  npub: string;
  /** The same key as 32-byte lowercase hex. */
  pubkey: string;
  /** 1–4 relay URLs the showing device is subscribed to. */
  relays: string[];
  /** Present if and only if the showing device is a web client. Unverified. */
  origin?: string;
  /** §12.3 light flow only: the returned-secret token, 64 hex characters. */
  secret?: string;
  /** Host of the bounce page, for an `https` URI. */
  host?: string;
  /** Path of the bounce page, for an `https` URI. */
  path?: string;
  /** Which carrier the URI used. */
  carrier: 'https' | 'frost';
}

/** What the local device believes the peer to be (§9.1 item 2). Always a claim. */
export interface QrstPeerClaim {
  kind: 'web' | 'native' | 'unestablished';
  /** Punycode origin, where the peer claims one. */
  origin?: string;
  /** One line naming the peer, for the consent prompt. */
  display: string;
}

/**
 * Everything §9.1 requires a Sender's release prompt to present.
 *
 * The strings are the profile's own words (§5 item 5, NKM §3.3). They are
 * supplied here rather than left to each client because §9.1 makes the wording
 * normative: the heading has to contradict the login mental model, the
 * affirmative control has to describe the transfer rather than express
 * agreement, and the prompt has to say where the code comes from.
 *
 * The caller still owns the layout, and §9.1's layout rules are not negotiable:
 * declining is the prominent control, the affirmative control is not focused,
 * not default, and not activated by a default keyboard action.
 */
export interface QrstConsentPrompt {
  /** Contradicts the expected mental model (§9.1). */
  heading: string;
  /** Body lines, in order. Names what is being sent, and what can be undone. */
  body: string[];
  /** What the other party claims to be. Unverified. */
  peer: QrstPeerClaim;
  /** Tier set by what the peer is *established* to be. Defaults to the maximum. */
  friction: QrstFrictionTier;
  /** Describes the transfer. Never "OK" or "Continue". */
  affirmativeLabel: string;
  /** The prominent control. */
  declineLabel: string;
  /** Where the code comes from — never "your code". */
  codeSourceText: string;
  /** Field label. Never "PIN" or "passcode" (§9.2). */
  codeFieldLabel: string;
  /** Maximum tier: the prompt SHOULD require a deliberate act beyond a single tap. */
  requiresExtraStep: boolean;
  /** True when the URI did not come from this device's own camera (§12.1). */
  notFromScan: boolean;
  /** §12.1: stated explicitly when a pasted URI makes this device the Sender. */
  notFromScanNotice?: string;
  /** Whether the payload can be undone after release. `frost-share`: rotation, forward only. */
  revocable: boolean;
}

/** The `frost-share` payload: the credential pair igloo already stores. */
export interface QrstFrostSharePayload {
  /** `bfshare1…` — the share credential. */
  share: string;
  /** `bfgroup1…` — the group credential the share belongs to. */
  group: string;
}

/**
 * §4 P5 rendering of a `frost-share` payload, shown before anything is
 * committed. NKM §3.3: the identity the share belongs to, and that this device
 * will hold one share, not the key.
 */
export interface QrstFrostShareRendering {
  profile: typeof QRST_PROFILE_FROST_SHARE;
  /** Headline for the acceptance confirmation. Not alarming (§9.4). */
  headline: string;
  /** Supporting lines, in order. */
  lines: string[];
  /** The identity the share belongs to, as an npub. */
  npub: string;
  /** This share's index within the keyset. */
  shareIndex: number;
  /** Signatures required. */
  threshold: number;
  /** Members in the keyset. */
  totalMembers: number;
}

/** Result of the §4 P4 check. */
export interface QrstPayloadCheck {
  ok: boolean;
  /** Why the payload does not belong to the declared profile. */
  reason?: string;
  share?: SharePackage;
  group?: GroupPackage;
}

/** Why a QRST session failed. Carried on {@link QrstError} as `details.reason`. */
export type QrstFailureReason =
  | 'invalid-uri'
  | 'unsupported-version'
  | 'unsupported-profile'
  | 'role-collision'
  | 'payload-too-large'
  | 'payload-rejected'
  | 'session-expired'
  | 'attempts-exhausted'
  | 'restart-throttle'
  | 'peer-refused'
  | 'declined'
  | 'no-transport'
  | 'cancelled';

/** A non-blocking notice for the user (§13, §11.3, §11.4). */
export interface QrstNotice {
  kind:
    /** A second or later distinct burner responded to this code (§13). */
    | 'multiple-responders'
    /** No relay is reachable yet. The session continues; §11.3's probe is advisory. */
    | 'no-relay-yet'
    /** A relay cannot carry this profile's declared maximum and was skipped (P1, §11.6). */
    | 'relay-skipped'
    /** The supplied clock skew exceeds SLACK; transfers may fail (§11.4). */
    | 'clock-skew';
  /** Text in the specification's own words where it supplies any. */
  message: string;
  data?: Record<string, unknown>;
}

/** One held responder (§13). */
export interface QrstCandidateInfo {
  /** The responder's burner public key, hex. */
  pubkey: string;
  /** Position in arrival order: 0 is the first responder, the active candidate. */
  order: number;
  /** The five digits to display for this candidate, once its SAS is derived. */
  digits?: string;
  /** Whether a payload has arrived from this candidate and is being held. */
  holdingPayload: boolean;
}

/** The §14 transfer record. Every transfer writes one. */
export interface QrstTransferRecord {
  ts: Date;
  profile: string;
  transport: 'relay';
  /** The five digits, or the light flow's marker. Never the peer's assertion. */
  sas: string;
  /** The peer's burner public key, hex. */
  peer_burner: string;
  /** Whether more than one distinct burner responded (§13). */
  multi: boolean;
}

/** What {@link QrstReceiveSession.accept} returns once the payload is committed. */
export interface QrstReceiveResult {
  /** `bfshare1…`, checked against the group by P4 before this resolved. */
  shareCredential: string;
  /** `bfgroup1…`. */
  groupCredential: string;
  /** The §5 P5 rendering the user confirmed. */
  rendering: QrstFrostShareRendering;
  /** The §14 record. Persist it. */
  record: QrstTransferRecord;
  /** Whether the post-commit echo reached the group. */
  echoSent: boolean;
}

/** Outcome of comparing five typed digits against the locally computed code. */
export interface QrstCodeResult {
  matched: boolean;
  /** Attempts left in this session. Zero means the session is over (§9.3). */
  attemptsRemaining: number;
  /** Set when the payload was released. */
  released?: boolean;
  /** The §14 record, once the payload has been released. */
  record?: QrstTransferRecord;
}

/* ------------------------------- transport -------------------------------- */

/**
 * The §3 transport contract, as this module consumes it. The default
 * implementation is {@link createQrstRelayTransport}; tests and any future
 * binding supply their own.
 */
export interface QrstTransport {
  readonly relays: string[];
  /**
   * Publish to every relay with an open socket, and retain in the session
   * outbox for republication when a socket opens or a NIP-42 auth succeeds
   * (§11.5).
   */
  publish(event: NostrEvent): void;
  /** Subscribe for wraps addressed to `pubkey`, deduped by event id (§11.5). */
  subscribe(pubkey: string, since: number, onEvent: (event: NostrEvent) => void): void;
  /** Close every socket and drop the outbox. */
  close(): void;
}

/** What a transport needs to know about the session it is carrying. */
export interface QrstTransportConfig {
  relays: string[];
  /** Burner secret key. Used only for NIP-42; a long-lived identity never is. */
  secretKey: Uint8Array;
  /** The declared profile maximum, for the §11.6 NIP-11 check. */
  maxPayloadBytes: number;
  /** Milliseconds until the session expires; reconnection stops there. */
  sessionLifetimeMs: number;
  log: (level: string, message: string, data?: unknown) => void;
  onNotice?: (notice: QrstNotice) => void;
}

export type QrstTransportFactory = (config: QrstTransportConfig) => QrstTransport;

/**
 * Persistence for the §9.3 restart throttle.
 *
 * §9.3 requires a Sender to remember burners it has failed a code entry against
 * "for at least one hour", and to count failed sessions across that hour. The
 * default store is in memory, which does not survive an application restart —
 * supply one backed by storage to meet §9.3 across launches.
 */
export interface QrstFailureStore {
  /** Burner public keys the local device has failed a code entry against, with the time of failure. */
  getRefusedPeers(): Record<string, number>;
  /** Record a burner as refused. */
  addRefusedPeer(pubkey: string, at: number): void;
  /** Timestamps of failed sessions. */
  getFailedSessions(): number[];
  /** Record a failed session. */
  addFailedSession(at: number): void;
  /** Time the user last acknowledged repeated failures, or 0. */
  getAcknowledgedAt(): number;
  setAcknowledgedAt(at: number): void;
}

/* -------------------------------------------------------------------------- */
/*                              Bytes and hashing                             */
/* -------------------------------------------------------------------------- */

const HEX32 = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new QrstError('Expected a lowercase hexadecimal string', { reason: 'invalid-uri' });
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      throw new QrstError('Profile identifiers are ASCII (§5)', { reason: 'unsupported-profile' });
    }
    out[i] = code;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function randomBytes32(): Uint8Array {
  // generateSecretKey() is a CSPRNG draw reduced into the secp256k1 field. Used
  // here only as a 32-byte random source for nonces and the §12.3 secret.
  return generateSecretKey();
}

/**
 * Overwrite key material in place.
 *
 * This reaches the burner secret and the nonces, which are held as byte arrays
 * for exactly this reason. It cannot reach anything that has been turned into a
 * JavaScript string — credential strings, the digits a user typed — because
 * strings are immutable and the runtime decides when their storage is reused.
 */
function zeroize(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) {
    if (buffer) buffer.fill(0);
  }
}

/** Constant-time comparison of two five-digit strings. */
function digitsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/*                     §6 — Session and short authentication string           */
/* -------------------------------------------------------------------------- */

/**
 * The commit the contacting party publishes before the other reveals its nonce.
 *
 * ```
 * commit = SHA-256("qrst-commit" || v || C.pub || nonce_C)
 * ```
 *
 * `v` is the protocol version as a single byte — `0x01` for `v=1` — hashed as a
 * field rather than baked into the label, "so that a future version changes the
 * transcript mechanically and no two implementations can disagree on a
 * domain-separator suffix" (§6).
 *
 * @param version         Protocol version from the QR.
 * @param contactingPubkey The contacting party's burner public key, 32-byte hex.
 * @param nonce           That party's 32-byte nonce, hex.
 * @returns The commit as 32-byte lowercase hex.
 */
export function deriveQrstCommit(
  version: number,
  contactingPubkey: string,
  nonce: string
): string {
  assertVersionByte(version);
  return toHex(
    sha256(
      concat(
        ascii('qrst-commit'),
        Uint8Array.of(version),
        assertHex32(contactingPubkey, 'contacting burner public key'),
        assertHex32(nonce, 'nonce')
      )
    )
  );
}

/** Inputs to the §6 short authentication string. */
export interface QrstSasInput {
  version: number;
  /** Profile identifier from the QR, ASCII. */
  profile: string;
  /** The Sender's burner public key, 32-byte hex. Role order, not arrival order. */
  senderPubkey: string;
  /** The Receiver's burner public key, 32-byte hex. */
  receiverPubkey: string;
  /** The Sender's nonce, 32-byte hex. */
  senderNonce: string;
  /** The Receiver's nonce, 32-byte hex. */
  receiverNonce: string;
}

/**
 * The five digits a person carries from the Receiver's screen to the Sender.
 *
 * ```
 * code   = SHA-256("qrst-sas" || v || len(p) || p
 *                  || SND.pub || RCV.pub || nonce_S || nonce_R)
 * digits = (code[0..5] as u40 BE) mod 100_000, zero-padded to 5
 * ```
 *
 * `SND.pub` and `RCV.pub` are in **role order regardless of which party made
 * contact** (§6). An implementation that gets that backwards agrees with itself
 * and fails only against a real peer, which is what the
 * `code_with_roles_transposed` vector exists to catch.
 *
 * The transcript binds the version, the profile, both burners, the role each
 * holds, and both nonces. It deliberately does not bind the relay set: §11.3
 * permits the transport to be raced and fallen back on mid-session, "and a
 * transcript committing to the transport would render every such recovery
 * indistinguishable from an attack."
 *
 * Reduction bias over 40 bits is below 3×10⁻⁶ against a 10⁻⁵ per-session target
 * and is not corrected (§6).
 */
export function deriveQrstSas(input: QrstSasInput): { code: string; digits: string } {
  assertVersionByte(input.version);
  const profile = ascii(input.profile);
  if (profile.length === 0 || profile.length > 24) {
    throw new QrstError('Profile identifier must be 1–24 characters (§5)', {
      reason: 'unsupported-profile',
      profile: input.profile
    });
  }
  const code = sha256(
    concat(
      ascii('qrst-sas'),
      Uint8Array.of(input.version),
      Uint8Array.of(profile.length),
      profile,
      assertHex32(input.senderPubkey, 'sender burner public key'),
      assertHex32(input.receiverPubkey, 'receiver burner public key'),
      assertHex32(input.senderNonce, 'sender nonce'),
      assertHex32(input.receiverNonce, 'receiver nonce')
    )
  );
  let value = 0n;
  for (let i = 0; i < 5; i++) value = (value << 8n) | BigInt(code[i]);
  return {
    code: toHex(code),
    digits: String(value % 100_000n).padStart(5, '0')
  };
}

function assertVersionByte(version: number): void {
  if (!Number.isInteger(version) || version < 0 || version > 255) {
    throw new QrstError('Protocol version is hashed as a single byte (§6)', {
      reason: 'unsupported-version',
      version
    });
  }
}

function assertHex32(value: string, what: string): Uint8Array {
  if (typeof value !== 'string' || !HEX32.test(value)) {
    throw new QrstError(`Expected ${what} as 32-byte lowercase hex`, {
      reason: 'invalid-uri',
      what
    });
  }
  return fromHex(value);
}

/* -------------------------------------------------------------------------- */
/*                              §11.2 — The QR URI                            */
/* -------------------------------------------------------------------------- */

/** Options for {@link buildQrstUri}. */
export interface QrstUriOptions {
  mode: QrstMode;
  profile: string;
  /** Burner public key, 32-byte hex or npub. */
  pubkey: string;
  /** 1–4 relay URLs the showing device is subscribed to. */
  relays: string[];
  version?: number;
  host?: string;
  path?: string;
  /** Required if and only if the showing device is a web client. */
  origin?: string;
  /** §12.3 light flow: the returned-secret token, 32 bytes hex. */
  secret?: string;
}

/**
 * Build the §11.2 pairing link.
 *
 * ```
 * https://<host>/<path>#v=1&mode=<offer|request>&p=<profile>&npub=<npub>[&relay=<wss>]*
 * ```
 *
 * Every parameter lives in the **fragment**, "so that neither the burner key
 * nor the relay list reaches the host's server or its logs" (§11.2). The
 * primary path never visits the host at all: a client whose own camera reads
 * the code parses the fragment and pairs directly, making no HTTP request. The
 * host matters only when the platform camera app scans the code and opens a
 * browser, where the §11.2a bounce page hands off to the associated
 * application.
 */
export function buildQrstUri(options: QrstUriOptions): string {
  const version = options.version ?? QRST_VERSION;
  assertVersionByte(version);
  const relays = normalizeRelayList(options.relays);
  const npub = toNpub(options.pubkey);
  const host = (options.host ?? QRST_DEFAULT_BOUNCE_HOST).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const rawPath = options.path ?? QRST_DEFAULT_BOUNCE_PATH;
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  const params = [
    `v=${version}`,
    `mode=${options.mode}`,
    `p=${encodeURIComponent(options.profile)}`,
    `npub=${npub}`,
    ...relays.map(relay => `relay=${encodeURIComponent(relay)}`)
  ];
  if (options.origin) params.push(`origin=${encodeURIComponent(normalizeOrigin(options.origin))}`);
  if (options.secret) {
    assertHex32(options.secret, 'returned secret');
    params.push(`secret=${options.secret}`);
  }

  return `https://${host}${path}#${params.join('&')}`;
}

/**
 * Build the §12.3 `frost://` carrier.
 *
 * "a custom scheme so it reads as a token to hand to an app, and opens the app
 * when tapped, which an `https` link does not." It is for pasting and
 * deep-linking; the QR form of the light flow stays the `https` fragment link
 * of §11.2, which keeps fragment privacy and the camera-read path.
 */
export function buildQrstFrostUri(options: QrstUriOptions): string {
  const version = options.version ?? QRST_VERSION;
  assertVersionByte(version);
  const relays = normalizeRelayList(options.relays);
  const npub = toNpub(options.pubkey);
  const params = [
    `v=${version}`,
    `mode=${options.mode}`,
    `p=${encodeURIComponent(options.profile)}`,
    ...relays.map(relay => `relay=${encodeURIComponent(relay)}`)
  ];
  if (options.origin) params.push(`origin=${encodeURIComponent(normalizeOrigin(options.origin))}`);
  if (options.secret) {
    assertHex32(options.secret, 'returned secret');
    params.push(`secret=${options.secret}`);
  }
  return `frost://${npub}?${params.join('&')}`;
}

/**
 * Parse a §11.2 `https` pairing link or a §12.3 `frost://` token.
 *
 * "A client MUST reject URIs with unknown `v`, missing `mode`, or missing `p`,
 * and MUST abort before generating a burner if it does not implement the
 * declared profile" (§11.2). All four rejections happen here, before any key
 * material exists.
 *
 * @throws {QrstError} with `details.reason` of `invalid-uri`,
 *   `unsupported-version` or `unsupported-profile`.
 */
export function parseQrstUri(uri: string, options: { profiles?: string[] } = {}): QrstUriParams {
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    throw new QrstError('A pairing URI is required', { reason: 'invalid-uri' });
  }
  const trimmed = uri.trim();
  const lower = trimmed.toLowerCase();

  let query: string;
  let carrier: 'https' | 'frost';
  let host: string | undefined;
  let path: string | undefined;
  let npubFromAuthority: string | undefined;

  if (lower.startsWith('https://')) {
    carrier = 'https';
    const hashIndex = trimmed.indexOf('#');
    if (hashIndex < 0) {
      throw new QrstError('A QRST link carries its parameters in the fragment (§11.2)', {
        reason: 'invalid-uri'
      });
    }
    const withoutFragment = trimmed.slice(0, hashIndex);
    query = trimmed.slice(hashIndex + 1);
    const authority = withoutFragment.slice('https://'.length);
    const slash = authority.indexOf('/');
    host = slash < 0 ? authority : authority.slice(0, slash);
    path = slash < 0 ? '/' : authority.slice(slash);
  } else if (lower.startsWith('frost://')) {
    carrier = 'frost';
    const rest = trimmed.slice('frost://'.length);
    const qIndex = rest.indexOf('?');
    if (qIndex < 0) {
      throw new QrstError('A frost:// token carries its parameters in the query (§12.3)', {
        reason: 'invalid-uri'
      });
    }
    npubFromAuthority = rest.slice(0, qIndex);
    query = rest.slice(qIndex + 1);
  } else {
    throw new QrstError('Not a QRST pairing URI', { reason: 'invalid-uri' });
  }

  const values = new Map<string, string[]>();
  for (const pair of query.split('&')) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    const existing = values.get(key);
    if (existing) existing.push(value);
    else values.set(key, [value]);
  }
  const first = (key: string): string | undefined => values.get(key)?.[0];

  // §11.2: reject unknown v, missing mode, missing p — in that order, and
  // before any burner exists.
  const rawVersion = first('v');
  if (rawVersion === undefined) {
    throw new QrstError('Pairing URI is missing v (§11.2)', { reason: 'invalid-uri' });
  }
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version !== QRST_VERSION) {
    throw new QrstError(`Unsupported QRST version: ${rawVersion}`, {
      reason: 'unsupported-version',
      version: rawVersion
    });
  }

  const mode = first('mode');
  if (mode !== 'offer' && mode !== 'request') {
    // Profiles MAY register additional mode values; this client implements none.
    throw new QrstError(
      mode === undefined
        ? 'Pairing URI is missing mode (§11.2)'
        : `Unsupported pairing mode: ${mode}`,
      { reason: 'invalid-uri', mode }
    );
  }

  const profile = first('p');
  if (profile === undefined || profile.length === 0) {
    throw new QrstError('Pairing URI is missing p (§11.2)', { reason: 'invalid-uri' });
  }
  if (!/^[a-z0-9-]{1,24}$/.test(profile)) {
    throw new QrstError(`Malformed profile identifier: ${profile}`, {
      reason: 'unsupported-profile',
      profile
    });
  }
  const supported = options.profiles ?? [QRST_PROFILE_FROST_SHARE];
  if (!supported.includes(profile)) {
    throw new QrstError(`Unsupported profile: ${profile}`, {
      reason: 'unsupported-profile',
      profile
    });
  }

  const npub = first('npub') ?? npubFromAuthority;
  if (!npub) {
    throw new QrstError('Pairing URI is missing the burner public key (§11.2)', {
      reason: 'invalid-uri'
    });
  }
  const pubkey = fromNpub(npub);

  const relays = normalizeRelayList(values.get('relay') ?? []);

  const origin = first('origin');
  const secret = first('secret');
  if (secret !== undefined && !HEX32.test(secret)) {
    throw new QrstError('The §12.3 returned secret is 32 bytes of hex', { reason: 'invalid-uri' });
  }

  return {
    version,
    mode,
    profile,
    npub: toNpub(pubkey),
    pubkey,
    relays,
    origin: origin ? normalizeOrigin(origin) : undefined,
    secret,
    host,
    path,
    carrier
  };
}

function normalizeRelayList(relays: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of relays) {
    if (typeof raw !== 'string') continue;
    const relay = raw.trim().replace(/\/+$/, '');
    if (!/^wss?:\/\/\S+$/i.test(relay)) {
      throw new QrstError(`Not a relay URL: ${raw}`, { reason: 'invalid-uri', relay: raw });
    }
    if (seen.has(relay)) continue;
    seen.add(relay);
    out.push(relay);
  }
  // §11.2: "1–4 relay URLs the showing device is subscribed to."
  if (out.length > 4) {
    throw new QrstError('A pairing URI carries at most four relays (§11.2)', {
      reason: 'invalid-uri',
      count: out.length
    });
  }
  return out;
}

/**
 * §9.1 item 2: "Origins containing non-ASCII MUST be shown as punycode."
 *
 * Where the platform's URL parser produces punycode we use it. Where it does
 * not — several React Native URL implementations leave Unicode hostnames
 * untouched — we refuse the origin rather than display a homograph, which keeps
 * §9.1 failing closed. A refused origin still reaches the prompt as an
 * unestablished peer, which draws the maximum friction tier.
 */
function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const punycoded = `${url.protocol}//${url.host}`;
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]*$/.test(punycoded)) return punycoded;
  } catch {
    // fall through
  }
  throw new QrstError(
    'Origin contains non-ASCII and this platform cannot render it as punycode (§9.1)',
    { reason: 'invalid-uri' }
  );
}

function toNpub(pubkey: string): string {
  if (pubkey.startsWith('npub1')) {
    fromNpub(pubkey);
    return pubkey;
  }
  if (!HEX32.test(pubkey)) {
    throw new QrstError('Burner public key must be 32-byte hex or an npub', { reason: 'invalid-uri' });
  }
  return nip19.npubEncode(pubkey);
}

function fromNpub(npub: string): string {
  if (HEX32.test(npub)) return npub;
  try {
    const { type, data } = nip19.decode(npub);
    if (type !== 'npub') throw new Error(`expected npub, got ${type}`);
    return data as string;
  } catch (error: any) {
    // §12.1: "the bech32 checksum on the burner key catches transcription errors."
    throw new QrstError(`Invalid burner public key: ${error.message}`, {
      reason: 'invalid-uri',
      npub
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                      §5 / NKM §3.3 — the frost-share profile               */
/* -------------------------------------------------------------------------- */

/**
 * Serialise a `frost-share` payload.
 *
 * NKM §3.3 describes the payload as the share scalar in hex alongside `index`,
 * `group_pub`, `commitment`, `epoch` and the rest of the NKM share record.
 * igloo has no such record: a share here is a `bfshare1` credential and the
 * material that verifies it is a `bfgroup1` credential, both bech32m from
 * bifrost's own encoders. The profile as implemented therefore carries **the
 * credential pair**, which is the same information in the encoding the two
 * devices already store and the one the receiving device must end up with. The
 * divergence is recorded in `SPEC_ISSUES.md`.
 *
 * P1's ceiling is real here rather than theoretical: the pair measures 606
 * bytes for a 2-member keyset and 2089 bytes for an 11-member one, so a keyset
 * with more than ten members exceeds the declared maximum and this function
 * refuses it.
 *
 * @throws {QrstError} `payload-too-large` when the pair exceeds
 *   {@link QRST_FROST_SHARE_MAX_PAYLOAD_BYTES}.
 */
export function buildQrstFrostSharePayload(payload: QrstFrostSharePayload): string {
  const share = payload.share?.trim();
  const group = payload.group?.trim();
  if (!share || !share.startsWith('bfshare1')) {
    throw new QrstError('A frost-share payload needs a bfshare1 credential', {
      reason: 'payload-rejected'
    });
  }
  if (!group || !group.startsWith('bfgroup1')) {
    throw new QrstError('A frost-share payload needs a bfgroup1 credential', {
      reason: 'payload-rejected'
    });
  }
  const encoded = JSON.stringify({ v: QRST_VERSION, share, group });
  const size = byteLength(encoded);
  if (size > QRST_FROST_SHARE_MAX_PAYLOAD_BYTES) {
    throw new QrstError(
      `This keyset's credentials are ${size} bytes, over the ${QRST_FROST_SHARE_MAX_PAYLOAD_BYTES}-byte maximum the frost-share profile declares (P1). ` +
        'A bfgroup credential grows with the number of members; keysets of more than ten members cannot be delivered by QRST at this ceiling.',
      { reason: 'payload-too-large', size, max: QRST_FROST_SHARE_MAX_PAYLOAD_BYTES }
    );
  }
  return encoded;
}

/** Parse a `frost-share` payload. Structural only — the P4 check is separate. */
export function parseQrstFrostSharePayload(content: string): QrstFrostSharePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new QrstError('Payload is not a frost-share record', { reason: 'payload-rejected' });
  }
  const record = parsed as { share?: unknown; group?: unknown };
  if (typeof record.share !== 'string' || typeof record.group !== 'string') {
    throw new QrstError('Payload is not a frost-share record', { reason: 'payload-rejected' });
  }
  return { share: record.share, group: record.group };
}

function byteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/**
 * §4 P4 — is what arrived a member of the profile declared in the QR?
 *
 * NKM §3.3 states the check as `share·G == group_pub + commitment·index`. In
 * bifrost that relation is already computed by `is_group_member`, which derives
 * the share's public key from its scalar and looks for a commitment at the same
 * index carrying that key — the same equation over the encoding igloo uses.
 * Using bifrost's own function rather than re-deriving the curve arithmetic
 * keeps one implementation of the check in the tree.
 *
 * "The Receiver MUST be able to determine that what it received belongs to the
 * profile declared in the QR, and MUST abort if it does not."
 */
export function checkQrstFrostSharePayload(payload: QrstFrostSharePayload): QrstPayloadCheck {
  let share: SharePackage;
  let group: GroupPackage;
  try {
    share = decodeShare(payload.share);
  } catch (error: any) {
    return { ok: false, reason: `Share credential does not decode: ${error.message}` };
  }
  try {
    group = decodeGroup(payload.group);
  } catch (error: any) {
    return { ok: false, reason: `Group credential does not decode: ${error.message}` };
  }
  let member = false;
  try {
    member = is_group_member(group, share);
  } catch (error: any) {
    return { ok: false, reason: `Share could not be checked against the group: ${error.message}` };
  }
  if (!member) {
    return {
      ok: false,
      reason: 'The share does not belong to the group it arrived with',
      share,
      group
    };
  }
  return { ok: true, share, group };
}

/**
 * §4 P5 — the rendering shown before anything is committed.
 *
 * NKM §3.3: "The identity the share belongs to, and that this device will hold
 * **one share, not the key** — it cannot sign alone, and cannot sign at all
 * until admitted." §9.4 adds that this side "MUST NOT be presented as
 * alarming", so the wording states what the device is getting rather than
 * warning about it.
 */
export function describeQrstFrostSharePayload(
  payload: QrstFrostSharePayload
): QrstFrostShareRendering {
  const check = checkQrstFrostSharePayload(payload);
  if (!check.ok || !check.share || !check.group) {
    throw new QrstError(check.reason ?? 'Payload failed the frost-share check', {
      reason: 'payload-rejected'
    });
  }
  const share = check.share;
  const group = check.group;
  const npub = groupPubkeyToNpub(group.group_pk);
  const totalMembers = countGroupMembers(group);
  const lines = [
    `This device will hold one share of ${npub}, not the key.`,
    `It cannot sign on its own: ${group.threshold} of ${totalMembers} shares have to take part in every signature.`,
    'It cannot sign at all until the rest of the group admits it.'
  ];
  return {
    profile: QRST_PROFILE_FROST_SHARE,
    headline: 'Keep this share?',
    lines,
    npub,
    shareIndex: share.idx,
    threshold: group.threshold,
    totalMembers
  };
}

function countGroupMembers(group: GroupPackage): number {
  const anyGroup = group as unknown as { commits?: unknown[]; members?: unknown[] };
  // bifrost 1.x serialises members as `commits`; 2.x renames the field to
  // `members`. Both decode through the same PackageEncoder, so accept either.
  return anyGroup.commits?.length ?? anyGroup.members?.length ?? 0;
}

function groupPubkeyToNpub(groupPk: string): string {
  // bifrost stores the group key in compressed (33-byte) form; nostr identities
  // are x-only.
  const xOnly = groupPk.length === 66 ? groupPk.slice(2) : groupPk;
  return nip19.npubEncode(xOnly);
}

/**
 * §9.1 — the Sender's release prompt, in the profile's words.
 *
 * NKM §3.3 gives the prompt wording as "Give *X* a share of your key", and
 * calls it "materially less severe than `nostr-nsec`: a share alone signs
 * nothing, and the device can be revoked". §9.1 requires the heading to
 * contradict the mental model of a person who has just scanned a code and
 * believes they are signing in, so the heading says what is happening rather
 * than what is not.
 *
 * The friction tier fails closed (§9.1): the maximum applies whenever the peer
 * claims a web origin **and whenever its nature is unestablished** — including
 * a URI that arrived by paste rather than by this device's own camera. Standard
 * friction needs both a positive native claim and a camera read.
 */
export function buildQrstConsentPrompt(options: {
  uri: QrstUriParams;
  pairingSource: QrstPairingSource;
  handshake: QrstHandshake;
}): QrstConsentPrompt {
  const { uri, pairingSource, handshake } = options;
  const fromCamera = pairingSource === 'camera';
  const peer: QrstPeerClaim = uri.origin
    ? { kind: 'web', origin: uri.origin, display: `a web page at ${uri.origin}` }
    : fromCamera
      ? { kind: 'native', display: 'an app on the device you scanned' }
      : { kind: 'unestablished', display: 'a device that has not said what it is' };

  const friction: QrstFrictionTier =
    peer.kind === 'native' && fromCamera ? 'standard' : 'maximum';

  const target = uri.origin ?? 'that device';
  const body = [
    `Give ${target} a share of your key.`,
    'The share itself leaves this device. It is not a session and not a permission you can withdraw from here.',
    'A share on its own signs nothing, and the group can rotate it out later. Rotation is forward-only: it does not undo a share that was handed to the wrong device today.'
  ];
  if (peer.kind === 'web') {
    body.push(`${uri.origin} is what that page says it is. Nothing here has checked it.`);
  } else if (peer.kind === 'unestablished') {
    body.push('Nothing here has established what that device is.');
  }
  if (handshake === 'returned-secret') {
    body.push(
      'This transfer is authenticated by the token you handed over, not by a code you compare. It is safe only over a channel you control.'
    );
  }

  return {
    heading: 'This is not a login. You are about to give that device a share of your key.',
    body,
    peer,
    friction,
    affirmativeLabel:
      peer.kind === 'web' && uri.origin
        ? `Send a share of my key to ${uri.origin}`
        : 'Send a share of my key to that device',
    declineLabel: "Don't send anything",
    codeSourceText: 'Type the code shown on your other device.',
    codeFieldLabel: 'Pairing code',
    requiresExtraStep: friction === 'maximum',
    notFromScan: !fromCamera,
    notFromScanNotice: fromCamera
      ? undefined
      : 'This request did not come from a code you scanned. Someone could have sent you the link.',
    revocable: true
  };
}

/* -------------------------------------------------------------------------- */
/*                       §11.4 — Sealing and gift-wrapping                    */
/* -------------------------------------------------------------------------- */

/** A rumor as it comes back off the wire, after both decryptions. */
interface QrstRumor extends UnsignedEvent {
  id: string;
}

/**
 * Seal and gift-wrap one message.
 *
 * "These are unsigned rumors. **Every one of them** is sealed — kind 13, signed
 * by the sending burner, NIP-44 to the recipient burner — and gift-wrapped —
 * kind 1059, random one-time signing key, `p` tag set to the recipient burner.
 * There are no exceptions." (§11.4)
 *
 * Contrary to NIP-59 the wrap's `created_at` is the true current time. The
 * randomisation "exists to obscure authoring time for asynchronous
 * correspondents; here every wrap is published immediately, both parties are
 * single-session burners, and the randomisation buys nothing while forcing a
 * 48-hour subscription window and a second timestamp to reason about."
 *
 * The spec names only the wrap's timestamp. The seal's is set to the true time
 * for the same reason and because a randomised seal timestamp would be a second
 * value to reason about with no reader — the rumor's own timestamp is the one
 * expiry is enforced against. Recorded in `SPEC_ISSUES.md`.
 */
function sealAndWrap(
  template: EventTemplate,
  senderSecret: Uint8Array,
  recipientPubkey: string,
  now: number
): NostrEvent {
  const senderPubkey = getPublicKey(senderSecret);
  const rumor: QrstRumor = {
    ...template,
    created_at: now,
    pubkey: senderPubkey,
    id: ''
  };
  rumor.id = getEventHash(rumor);

  const sealKey = nip44.v2.utils.getConversationKey(senderSecret, recipientPubkey);
  const seal = finalizeEvent(
    {
      kind: SEAL_KIND,
      content: nip44.v2.encrypt(JSON.stringify(rumor), sealKey),
      created_at: now,
      tags: []
    },
    senderSecret
  );

  const wrapSecret = generateSecretKey();
  const wrapKey = nip44.v2.utils.getConversationKey(wrapSecret, recipientPubkey);
  const wrap = finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      content: nip44.v2.encrypt(JSON.stringify(seal), wrapKey),
      created_at: now,
      tags: [
        ['p', recipientPubkey],
        // NIP-40, advisory only. Expiry is enforced by the receiver against the
        // rumor's own timestamp, which is what the seal signature covers.
        ['expiration', String(now + Math.floor(QRST_SESSION_LIFETIME_MS / 1000))]
      ]
    },
    wrapSecret
  );
  zeroize(wrapSecret);
  return wrap;
}

/** Why a wrap was discarded. Every one of these is silent to the peer. */
type QrstDiscardReason =
  | 'undecryptable'
  | 'not-a-seal'
  | 'bad-seal-signature'
  | 'attribution-mismatch'
  | 'outside-session-window';

interface QrstUnwrapResult {
  rumor?: QrstRumor;
  discarded?: QrstDiscardReason;
}

/**
 * Unwrap, verify attribution, and apply the session-window test.
 *
 * **Attribution (T5).** "The rumor's `pubkey` field MUST be set to the sending
 * burner and MUST equal the key that signed the seal; a rumor failing either
 * test is discarded."
 *
 * **Window.** Enforced against the rumor's own timestamp — the one the seal
 * signature covers and therefore attributable to the sending burner — over the
 * session's ten-minute lifetime with `SLACK` seconds at each end. "A rumor
 * whose timestamp falls outside that widened window MUST be discarded from the
 * session entirely — never shown, never given a nonce exchange, never in the
 * SAS candidate list, and not merely excluded from the §13 counter."
 */
function unwrapAndVerify(
  wrap: NostrEvent,
  recipientSecret: Uint8Array,
  sessionStartSeconds: number
): QrstUnwrapResult {
  let seal: NostrEvent;
  try {
    const wrapKey = nip44.v2.utils.getConversationKey(recipientSecret, wrap.pubkey);
    seal = JSON.parse(nip44.v2.decrypt(wrap.content, wrapKey));
  } catch {
    return { discarded: 'undecryptable' };
  }
  if (!seal || seal.kind !== SEAL_KIND) return { discarded: 'not-a-seal' };
  if (!verifyEvent(seal as VerifiedEvent)) return { discarded: 'bad-seal-signature' };

  let rumor: QrstRumor;
  try {
    const sealKey = nip44.v2.utils.getConversationKey(recipientSecret, seal.pubkey);
    rumor = JSON.parse(nip44.v2.decrypt(seal.content, sealKey));
  } catch {
    return { discarded: 'undecryptable' };
  }
  if (!rumor || typeof rumor.pubkey !== 'string' || rumor.pubkey !== seal.pubkey) {
    return { discarded: 'attribution-mismatch' };
  }
  if (typeof rumor.created_at !== 'number' || !Number.isFinite(rumor.created_at)) {
    return { discarded: 'outside-session-window' };
  }
  const lifetime = Math.floor(QRST_SESSION_LIFETIME_MS / 1000);
  const lower = sessionStartSeconds - QRST_SLACK_SECONDS;
  const upper = sessionStartSeconds + lifetime + QRST_SLACK_SECONDS;
  if (rumor.created_at < lower || rumor.created_at > upper) {
    return { discarded: 'outside-session-window' };
  }
  return { rumor };
}

function tagValue(rumor: QrstRumor, name: string): string | undefined {
  for (const tag of rumor.tags) {
    if (tag[0] === name) return tag[1];
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*                     §11.3 / §11.5 — Relays as the transport                */
/* -------------------------------------------------------------------------- */

/**
 * The default transport: one socket per relay, a session outbox, and NIP-42
 * authentication with the **burner**.
 *
 * §11.5 in three rules:
 *
 * - "Publishing is parallel, not serial." Each message goes to every relay with
 *   an open socket.
 * - "Clients MUST keep a session outbox." Everything published during the
 *   session is retained and republished when a socket opens and after a NIP-42
 *   authentication succeeds, because "a relay may accept a socket, receive a
 *   publish, and only then demand `AUTH`, leaving the event discarded on a
 *   relay the peer is subscribed to." Recipients dedupe by event id, so the
 *   replay costs nothing.
 * - "Neither side ever uses a long-lived identity for relay authentication
 *   during a transfer."
 *
 * §11.3's probe is advisory: an unreachable relay is retried for the remaining
 * lifetime of the session, and failure is reported only when the session
 * expires.
 */
export function createQrstRelayTransport(config: QrstTransportConfig): QrstTransport {
  const relays = [...config.relays];
  const outbox = new Map<string, NostrEvent>();
  const sockets = new Map<string, Relay>();
  const skipped = new Set<string>();
  const seen = new Set<string>();
  const deadline = Date.now() + config.sessionLifetimeMs;

  let subscriptionPubkey: string | null = null;
  let subscriptionSince = 0;
  let onEvent: ((event: NostrEvent) => void) | null = null;
  let closed = false;
  let announcedNoRelay = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const log = config.log;

  const flushOutbox = (relay: Relay) => {
    for (const event of outbox.values()) {
      relay.publish(event).catch(error => {
        log('debug', `Publish to ${relay.url} failed`, error);
      });
    }
  };

  const openSubscription = (relay: Relay) => {
    if (!subscriptionPubkey || !onEvent) return;
    relay.subscribe(
      [
        {
          kinds: [GIFT_WRAP_KIND],
          '#p': [subscriptionPubkey],
          since: subscriptionSince
        }
      ],
      {
        onevent: (event: NostrEvent) => {
          // §11.5: dedupe by event id.
          if (seen.has(event.id)) return;
          seen.add(event.id);
          onEvent?.(event);
        },
        onclose: (reason: string) => {
          log('debug', `Subscription on ${relay.url} closed: ${reason}`);
        }
      }
    );
  };

  /**
   * §11.6: "Clients MUST read `max_message_length` and `max_content_length`
   * from NIP-11 during the §11.3 probe and skip relays that cannot carry the
   * declared profile's maximum."
   *
   * A relay that advertises no limit is not a relay that cannot carry the
   * payload, so an absent field is not a reason to skip. Only a value we can
   * read and that is too small is.
   */
  const probeLimits = async (url: string): Promise<boolean> => {
    try {
      const info = await fetchRelayInformation(url);
      const limits = info?.limitation ?? {};
      // Measured expansion from raw payload to published event is ×3.4 for
      // base64 payloads and ×4.7 for hex (§11.6). frost-share payloads are
      // bech32 text, so the base64 figure applies.
      const needed = Math.ceil(config.maxPayloadBytes * 3.4);
      const contentCap = limits.max_content_length;
      const messageCap = limits.max_message_length;
      if (typeof contentCap === 'number' && contentCap > 0 && contentCap < needed) {
        return false;
      }
      if (typeof messageCap === 'number' && messageCap > 0 && messageCap < needed + 1024) {
        return false;
      }
    } catch {
      // NIP-11 is fetched over HTTP and is frequently unavailable. Unknown is
      // not "cannot carry".
    }
    return true;
  };

  const connect = async (url: string) => {
    if (closed || skipped.has(url) || sockets.has(url)) return;
    if (!(await probeLimits(url))) {
      skipped.add(url);
      config.onNotice?.({
        kind: 'relay-skipped',
        message: `${url} cannot carry this profile's maximum payload and was skipped.`,
        data: { relay: url }
      });
      return;
    }
    if (closed) return;
    let relay: Relay;
    try {
      relay = new Relay(url);
      relay.connectionTimeout = QRST_PROBE_TIMEOUT_MS;
      // §11.5: authenticate with the burner, never a long-lived identity.
      relay._onauth = (challenge: string) => {
        relay
          .auth(async (evt: EventTemplate) =>
            finalizeEvent(nip42.makeAuthEvent(relay.url, challenge), config.secretKey) as VerifiedEvent
          )
          .then(() => {
            log('debug', `Authenticated to ${url} with the session burner`);
            // A relay may have discarded an event published before AUTH.
            flushOutbox(relay);
          })
          .catch(error => log('debug', `AUTH to ${url} failed`, error));
      };
      relay.onclose = () => {
        sockets.delete(url);
      };
      await relay.connect();
    } catch (error) {
      log('debug', `Relay ${url} unreachable`, error);
      return;
    }
    if (closed) {
      relay.close();
      return;
    }
    sockets.set(url, relay);
    openSubscription(relay);
    flushOutbox(relay);
  };

  const sweep = () => {
    if (closed) return;
    if (Date.now() > deadline) return;
    const pending = relays.filter(url => !sockets.has(url) && !skipped.has(url));
    if (pending.length > 0) {
      void Promise.all(pending.map(connect)).then(() => {
        if (!closed && sockets.size === 0 && !announcedNoRelay) {
          announcedNoRelay = true;
          config.onNotice?.({
            kind: 'no-relay-yet',
            message:
              'No relay has answered yet. The code stays valid and the transfer continues as soon as one does.'
          });
        }
      });
    }
    retryTimer = setTimeout(sweep, QRST_PROBE_TIMEOUT_MS);
  };

  sweep();

  return {
    relays,
    publish(event: NostrEvent) {
      // Retained for the session; republished on every socket open and after
      // every successful AUTH.
      outbox.set(event.id, event);
      for (const relay of sockets.values()) {
        relay.publish(event).catch(error => {
          log('debug', `Publish to ${relay.url} failed`, error);
        });
      }
    },
    subscribe(pubkey: string, since: number, handler: (event: NostrEvent) => void) {
      subscriptionPubkey = pubkey;
      subscriptionSince = since;
      onEvent = handler;
      for (const relay of sockets.values()) openSubscription(relay);
    },
    close() {
      closed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      for (const relay of sockets.values()) {
        try {
          relay.close();
        } catch {
          // socket already gone
        }
      }
      sockets.clear();
      outbox.clear();
      seen.clear();
      onEvent = null;
    }
  };
}

/* -------------------------------------------------------------------------- */
/*                          §9.3 — The restart throttle                       */
/* -------------------------------------------------------------------------- */

function createMemoryFailureStore(): QrstFailureStore {
  const refused: Record<string, number> = {};
  let sessions: number[] = [];
  let acknowledgedAt = 0;
  return {
    getRefusedPeers: () => refused,
    addRefusedPeer: (pubkey, at) => {
      refused[pubkey] = at;
    },
    getFailedSessions: () => sessions,
    addFailedSession: at => {
      sessions = [...sessions, at];
    },
    getAcknowledgedAt: () => acknowledgedAt,
    setAcknowledgedAt: at => {
      acknowledgedAt = at;
    }
  };
}

let failureStore: QrstFailureStore = createMemoryFailureStore();

/**
 * Replace the store behind the §9.3 restart throttle.
 *
 * The default store is in memory. §9.3 requires a Sender to remember burners it
 * failed a code entry against "for at least one hour", which an in-memory store
 * does not survive an application restart; a client that can persist should.
 */
export function setQrstFailureStore(store: QrstFailureStore): void {
  failureStore = store;
}

/** Reset the throttle. For tests and for a deliberate "forget this" action. */
export function resetQrstFailureMemory(): void {
  failureStore = createMemoryFailureStore();
}

/** State of the §9.3 restart throttle. */
export interface QrstRestartThrottle {
  /** Failed sessions in the last hour. */
  failedSessionsLastHour: number;
  /**
   * After three failed sessions in an hour "the client MUST tell the user that
   * repeated failures can indicate interference rather than mistyping, and
   * SHOULD require an explicit acknowledgement before another attempt."
   */
  requiresAcknowledgement: boolean;
  /** The message §9.3 asks for, once it applies. */
  message?: string;
  /** Burner public keys this device has failed a code entry against. */
  refusedPeers: string[];
}

/** Read the §9.3 throttle. A client shows this before offering another attempt. */
export function getQrstRestartThrottle(now: number = Date.now()): QrstRestartThrottle {
  const cutoff = now - QRST_FAILURE_MEMORY_MS;
  const recent = failureStore.getFailedSessions().filter(at => at > cutoff);
  const acknowledged = failureStore.getAcknowledgedAt() > cutoff;
  const requiresAcknowledgement =
    recent.length >= QRST_FAILED_SESSION_WARN_THRESHOLD && !acknowledged;
  const refusedPeers = Object.entries(failureStore.getRefusedPeers())
    .filter(([, at]) => at > cutoff)
    .map(([pubkey]) => pubkey);
  return {
    failedSessionsLastHour: recent.length,
    requiresAcknowledgement,
    message: requiresAcknowledgement
      ? 'Codes have failed three times in the last hour. Repeated failures can mean something is interfering with the transfer, not that you mistyped.'
      : undefined,
    refusedPeers
  };
}

/** Record that the user has read the §9.3 warning and wants to try again. */
export function acknowledgeQrstFailures(now: number = Date.now()): void {
  failureStore.setAcknowledgedAt(now);
}

/* -------------------------------------------------------------------------- */
/*                              Shared session bits                           */
/* -------------------------------------------------------------------------- */

function makeLogger(prefix: string, eventConfig: NodeEventConfig) {
  return (level: string, message: string, data?: unknown) => {
    if (eventConfig.customLogger) {
      eventConfig.customLogger(level, `${prefix} ${message}`, data);
    } else if (eventConfig.enableLogging) {
      console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data ?? '');
    }
  };
}

function checkClock(
  clockSkewSeconds: number | undefined,
  onNotice?: (notice: QrstNotice) => void
): void {
  if (clockSkewSeconds === undefined) return;
  if (Math.abs(clockSkewSeconds) <= QRST_SLACK_SECONDS) return;
  // §11.4: a client that cannot keep its clock within SLACK "MUST warn that
  // transfers may fail, and MUST NOT widen SLACK locally to compensate".
  onNotice?.({
    kind: 'clock-skew',
    message:
      "This device's clock is off by more than two minutes. Transfers may fail until it is corrected.",
    data: { clockSkewSeconds }
  });
}

/** Shared options for both sides of a transfer. */
interface QrstCommonOptions {
  relays?: string[];
  /** Injected transport. Defaults to {@link createQrstRelayTransport}. */
  transportFactory?: QrstTransportFactory;
  /**
   * This device's clock offset from true time in seconds, if the application
   * has a network time source. §11.4 requires a warning when it exceeds SLACK.
   */
  clockSkewSeconds?: number;
  eventConfig?: NodeEventConfig;
  onNotice?: (notice: QrstNotice) => void;
  onError?: (error: QrstError) => void;
}

/* -------------------------------------------------------------------------- */
/*                        §7 Flow A — the Receiver's side                     */
/* -------------------------------------------------------------------------- */

/** Options for {@link startQrstReceive}. */
export interface QrstReceiveOptions extends QrstCommonOptions {
  /** Profile to declare in the QR. Only `frost-share` is implemented. */
  profile?: string;
  /** Host of the §11.2a bounce page. Defaults to {@link QRST_DEFAULT_BOUNCE_HOST}. */
  bounceHost?: string;
  /** Path of the bounce page. */
  bouncePath?: string;
  /**
   * Declare the §12.3 light flow: a returned secret in place of the SAS.
   *
   * Read {@link startQrstSend}'s note on when this is safe before enabling it.
   */
  light?: boolean;
  /** The five digits to display for the active candidate (§7 step 12). */
  onSasReady?: (digits: string, candidate: QrstCandidateInfo) => void;
  /**
   * A payload has arrived from the active candidate and passed nothing yet. The
   * rendering is P5; the payload is **not** committed until
   * {@link QrstReceiveSession.accept} is called (§9.4).
   */
  onPayload?: (rendering: QrstFrostShareRendering, candidate: QrstCandidateInfo) => void;
  /** Send an echo to the group once the share is committed. Default true. */
  sendEchoAfterCommit?: boolean;
  /** Relays for that echo. Defaults to the relays in the group credential. */
  echoRelays?: string[];
  /** Timeout for that echo, in milliseconds. */
  echoTimeout?: number;
}

/** The Receiver's handle on a running Flow A session. */
export interface QrstReceiveSession {
  /** The §11.2 link to render as a QR. See §11.2b on how it must be presented. */
  readonly uri: string;
  /** The same link as a `frost://` token, for the §12.1 copy path. */
  readonly frostUri: string;
  /** This session's burner, bech32. */
  readonly npub: string;
  /** Relays named in the URI. */
  readonly relays: string[];
  /** When the session ends (§2). */
  readonly expiresAt: Date;
  /** Which handshake this session runs. */
  readonly handshake: QrstHandshake;
  /** Responders held, in arrival order. The first is active (§13). */
  candidates(): QrstCandidateInfo[];
  /**
   * Move the display to the next held candidate (§9.2, §13).
   *
   * The code is never transmitted, so this Receiver cannot see that the Sender
   * typed a value matching no candidate. The user drives this — "that code
   * didn't work" — which is the only signal available on this side.
   */
  advanceCandidate(): QrstCandidateInfo | null;
  /**
   * §9.4 — commit the active candidate's payload after the user confirms the P5
   * rendering. Applies the P4 check first; on failure the candidate is
   * discarded and the display advances (§13).
   */
  accept(): Promise<QrstReceiveResult>;
  /** The user declined. Discard everything held and abort (§7 step 17). */
  decline(): void;
  /** Abandon the session and zeroize. */
  cancel(): void;
}

interface ReceiveCandidate {
  pubkey: string;
  order: number;
  commit: string;
  nonceR: Uint8Array;
  nonceS?: string;
  digits?: string;
  payload?: QrstFrostSharePayload;
}

/**
 * Flow A (§7) — this device wants a share and shows the QR.
 *
 * Returns synchronously with the URI to render, because §11.3 is explicit that
 * the three-second relay probe "MUST NOT close out a ten-minute session": the
 * client shows the transfer UI, keeps re-attempting an unreachable relay for
 * the remaining lifetime of the session, proceeds as soon as one becomes
 * reachable, and reports failure only once the session has expired.
 *
 * The steps this runs are §7 7–17. Nothing is committed until
 * {@link QrstReceiveSession.accept}.
 *
 * @example
 * ```ts
 * const session = startQrstReceive({
 *   relays: ['wss://relay.damus.io'],
 *   onSasReady: digits => showCode(digits),
 *   onPayload: rendering => showConfirmation(rendering)
 * });
 * renderQr(session.uri);
 * // …user confirms the rendering…
 * const { shareCredential, groupCredential } = await session.accept();
 * ```
 */
export function startQrstReceive(options: QrstReceiveOptions = {}): QrstReceiveSession {
  const profile = options.profile ?? QRST_PROFILE_FROST_SHARE;
  if (profile !== QRST_PROFILE_FROST_SHARE) {
    throw new QrstError(`Unsupported profile: ${profile}`, {
      reason: 'unsupported-profile',
      profile
    });
  }
  const relays = normalizeRelayList(
    options.relays && options.relays.length > 0 ? options.relays : QRST_DEFAULT_RELAYS
  );
  if (relays.length === 0) {
    throw new QrstError('At least one relay is required (§11.2)', { reason: 'no-transport' });
  }

  const log = makeLogger('[qrst:receive]', options.eventConfig ?? { enableLogging: false });
  const notice = (value: QrstNotice) => {
    try {
      options.onNotice?.(value);
    } catch (error) {
      log('error', 'onNotice callback threw', error);
    }
  };
  checkClock(options.clockSkewSeconds, notice);

  const handshake: QrstHandshake = options.light ? 'returned-secret' : 'sas';
  const secret = handshake === 'returned-secret' ? randomBytes32() : null;

  const burnerSecret = generateSecretKey();
  const burnerPubkey = getPublicKey(burnerSecret);
  const startedAt = Date.now();
  const startedAtSeconds = Math.floor(startedAt / 1000);
  const expiresAt = new Date(startedAt + QRST_SESSION_LIFETIME_MS);

  const uriOptions: QrstUriOptions = {
    mode: 'offer',
    profile,
    pubkey: burnerPubkey,
    relays,
    host: options.bounceHost,
    path: options.bouncePath,
    // §12.3 says the QR form of the light flow stays the §11.2 fragment link,
    // and §11.2's grammar has no `secret`. The returned-secret handshake cannot
    // run from a scan unless the token reaches the scanner, and the fragment is
    // the one part of the link that never leaves the device, so the secret
    // travels there. Recorded in SPEC_ISSUES.md.
    secret: secret ? toHex(secret) : undefined
  };
  const uri = buildQrstUri(uriOptions);
  const frostUri = buildQrstFrostUri(uriOptions);

  const candidates: ReceiveCandidate[] = [];
  let activeIndex = 0;
  let multipleResponders = false;
  let finished = false;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const transportFactory = options.transportFactory ?? createQrstRelayTransport;
  const transport = transportFactory({
    relays,
    secretKey: burnerSecret,
    maxPayloadBytes: QRST_FROST_SHARE_MAX_PAYLOAD_BYTES,
    sessionLifetimeMs: QRST_SESSION_LIFETIME_MS,
    log,
    onNotice: notice
  });

  const send = (template: EventTemplate, to: string) => {
    transport.publish(sealAndWrap(template, burnerSecret, to, Math.floor(Date.now() / 1000)));
  };

  const info = (candidate: ReceiveCandidate): QrstCandidateInfo => ({
    pubkey: candidate.pubkey,
    order: candidate.order,
    digits: candidate.digits,
    holdingPayload: candidate.payload !== undefined
  });

  const teardown = () => {
    finished = true;
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    transport.close();
    zeroize(burnerSecret, secret, ...candidates.map(c => c.nonceR));
    // Held payloads are discarded with the session (P6).
    candidates.length = 0;
  };

  const fail = (error: QrstError) => {
    try {
      options.onError?.(error);
    } catch (callbackError) {
      log('error', 'onError callback threw', callbackError);
    }
  };

  const announceActive = () => {
    const candidate = candidates[activeIndex];
    if (!candidate) return;
    if (candidate.digits) {
      try {
        options.onSasReady?.(candidate.digits, info(candidate));
      } catch (error) {
        log('error', 'onSasReady callback threw', error);
      }
    }
    if (candidate.payload) {
      announcePayload(candidate);
    }
  };

  const announcePayload = (candidate: ReceiveCandidate) => {
    if (!candidate.payload) return;
    let rendering: QrstFrostShareRendering;
    try {
      rendering = describeQrstFrostSharePayload(candidate.payload);
    } catch (error: any) {
      // P4 failed at acceptance: discard this candidate and advance (§13).
      log('warn', `Candidate ${candidate.pubkey.slice(0, 8)} failed the P4 check`, error);
      discardCandidate(candidate);
      return;
    }
    try {
      options.onPayload?.(rendering, info(candidate));
    } catch (error) {
      log('error', 'onPayload callback threw', error);
    }
  };

  const discardCandidate = (candidate: ReceiveCandidate) => {
    const index = candidates.indexOf(candidate);
    if (index < 0) return;
    zeroize(candidate.nonceR);
    candidates.splice(index, 1);
    if (activeIndex >= candidates.length) activeIndex = Math.max(0, candidates.length - 1);
    if (candidates.length === 0) {
      fail(new QrstError('No candidate remains', { reason: 'payload-rejected' }));
      return;
    }
    announceActive();
  };

  const onRumor = (rumor: QrstRumor) => {
    if (finished) return;
    const peer = rumor.pubkey;
    let candidate = candidates.find(c => c.pubkey === peer);

    if (rumor.kind === QRST_KINDS.HELLO) {
      // §13: retransmissions from the same burner are not a distinct responder.
      if (candidate) return;
      const commit = tagValue(rumor, 'commit');

      if (handshake === 'returned-secret') {
        // §12.3: the other party echoes the token's secret in its first sealed
        // message; a HELLO without it never becomes a candidate.
        const echoed = tagValue(rumor, 'secret');
        if (!secret || !echoed || echoed !== toHex(secret)) {
          log('debug', 'HELLO without a matching returned secret; ignored');
          return;
        }
      } else if (!commit || !HEX32.test(commit)) {
        log('debug', 'HELLO without a well-formed commit; ignored');
        return;
      }

      if (candidates.length >= QRST_MAX_HELD_CANDIDATES) {
        log('debug', 'Candidate list is full; further responders dropped (§13)');
        return;
      }
      if (candidates.length > 0) {
        // §13: a later responder MUST NOT abort the session.
        multipleResponders = true;
        notice({
          kind: 'multiple-responders',
          message:
            "Another device also responded to this code. If that wasn't you, someone nearby may have scanned it. Nothing was shared with them.",
          data: { responders: candidates.length + 1 }
        });
      }
      candidate = {
        pubkey: peer,
        order: candidates.length,
        commit: commit ?? '',
        nonceR: randomBytes32()
      };
      candidates.push(candidate);

      if (handshake === 'sas') {
        // §7 step 8.
        send(
          { kind: QRST_KINDS.NONCE, content: '', tags: [['nonce', toHex(candidate.nonceR)]], created_at: 0 },
          peer
        );
      }
      return;
    }

    if (!candidate) return;

    if (rumor.kind === QRST_KINDS.REVEAL && handshake === 'sas') {
      const nonceS = tagValue(rumor, 'nonce');
      if (!nonceS || !HEX32.test(nonceS)) return;
      // §6: verify the commit before deriving anything from the nonce.
      const expected = deriveQrstCommit(QRST_VERSION, peer, nonceS);
      if (expected !== candidate.commit) {
        log('warn', 'Commit did not open; candidate discarded');
        discardCandidate(candidate);
        return;
      }
      candidate.nonceS = nonceS;
      candidate.digits = deriveQrstSas({
        version: QRST_VERSION,
        profile,
        senderPubkey: peer,
        receiverPubkey: burnerPubkey,
        senderNonce: nonceS,
        receiverNonce: toHex(candidate.nonceR)
      }).digits;
      if (candidates.indexOf(candidate) === activeIndex) announceActive();
      return;
    }

    if (rumor.kind === QRST_KINDS.PAYLOAD) {
      // §7 step 15: hold keyed by sending burner. MUST NOT commit.
      if (candidate.payload) return; // P2: one payload per session, per peer.
      if (handshake === 'sas' && !candidate.digits) {
        log('debug', 'Payload from a candidate whose SAS is not derived; held anyway');
      }
      let payload: QrstFrostSharePayload;
      try {
        payload = parseQrstFrostSharePayload(rumor.content);
      } catch (error: any) {
        log('warn', 'Payload is not a frost-share record; candidate discarded', error);
        discardCandidate(candidate);
        return;
      }
      candidate.payload = payload;
      if (candidates.indexOf(candidate) === activeIndex) announcePayload(candidate);
      return;
    }

    if (rumor.kind === QRST_KINDS.ABORT) {
      log('info', 'Peer aborted the session');
      discardCandidate(candidate);
    }
  };

  transport.subscribe(burnerPubkey, startedAtSeconds - QRST_SLACK_SECONDS, event => {
    const result = unwrapAndVerify(event, burnerSecret, startedAtSeconds);
    if (result.discarded) {
      log('debug', `Wrap discarded: ${result.discarded}`);
      return;
    }
    if (result.rumor) onRumor(result.rumor);
  });

  expiryTimer = setTimeout(() => {
    if (finished) return;
    fail(new QrstError('The transfer session expired', { reason: 'session-expired' }));
    teardown();
  }, QRST_SESSION_LIFETIME_MS);

  return {
    uri,
    frostUri,
    npub: nip19.npubEncode(burnerPubkey),
    relays,
    expiresAt,
    handshake,
    candidates: () => candidates.map(info),
    advanceCandidate: () => {
      if (candidates.length === 0) return null;
      activeIndex = (activeIndex + 1) % candidates.length;
      announceActive();
      return info(candidates[activeIndex]);
    },
    async accept(): Promise<QrstReceiveResult> {
      if (finished) {
        throw new QrstError('The transfer session is over', { reason: 'session-expired' });
      }
      const candidate = candidates[activeIndex];
      if (!candidate?.payload) {
        throw new QrstError('Nothing has arrived to accept yet', { reason: 'payload-rejected' });
      }
      // §13: a candidate that fails its P4 check at acceptance is discarded and
      // the client advances to the next held candidate, or aborts if none remain.
      const check = checkQrstFrostSharePayload(candidate.payload);
      if (!check.ok) {
        const error = new QrstError(check.reason ?? 'Payload failed the P4 check', {
          reason: 'payload-rejected'
        });
        discardCandidate(candidate);
        throw error;
      }
      const payload = candidate.payload;
      const rendering = describeQrstFrostSharePayload(payload);
      const record: QrstTransferRecord = {
        ts: new Date(),
        profile,
        transport: 'relay',
        sas: candidate.digits ?? 'returned-secret',
        peer_burner: candidate.pubkey,
        multi: multipleResponders
      };

      // §7 step 17: commit, ACK, then zeroize this burner and every other held
      // payload.
      send({ kind: QRST_KINDS.ACK, content: '', tags: [], created_at: 0 }, candidate.pubkey);

      let echoSent = false;
      if (options.sendEchoAfterCommit !== false) {
        try {
          echoSent = await sendEcho(payload.group, payload.share, toHex(randomBytes32()), {
            relays: options.echoRelays,
            timeout: options.echoTimeout,
            eventConfig: options.eventConfig
          });
        } catch (error) {
          // The share is committed either way; the echo only tells the group.
          log('warn', 'Echo after commit failed', error);
        }
      }

      teardown();
      return {
        shareCredential: payload.share,
        groupCredential: payload.group,
        rendering,
        record,
        echoSent
      };
    },
    decline() {
      if (finished) return;
      const candidate = candidates[activeIndex];
      if (candidate) {
        send({ kind: QRST_KINDS.ABORT, content: '', tags: [], created_at: 0 }, candidate.pubkey);
      }
      teardown();
    },
    cancel() {
      if (finished) return;
      teardown();
    }
  };
}

/* -------------------------------------------------------------------------- */
/*                         §7 Flow A — the Sender's side                      */
/* -------------------------------------------------------------------------- */

/** Options for {@link startQrstSend}. */
export interface QrstSendOptions extends QrstCommonOptions {
  /** The pairing URI, scanned or pasted. */
  uri: string;
  /**
   * How this device obtained the URI. This is not cosmetic: §9.1's friction
   * tier is set by it, and the tier defaults to the maximum. Report `camera`
   * only when this device's own camera read the code.
   */
  pairingSource: QrstPairingSource;
  /** The credential pair to release. */
  payload: QrstFrostSharePayload;
  /** Extra relays to try alongside the ones named in the URI. */
  relays?: string[];
}

/** The Sender's handle on a running Flow A session. */
export interface QrstSendSession {
  /** Everything §9.1 requires the release prompt to present. */
  readonly consent: QrstConsentPrompt;
  /** The peer's burner public key, hex. */
  readonly peerPubkey: string;
  /** Which handshake this session runs. */
  readonly handshake: QrstHandshake;
  /** When the session ends. */
  readonly expiresAt: Date;
  /** Attempts left in this session (§9.2). */
  attemptsRemaining(): number;
  /**
   * §9.2 — compare five digits read from the Receiver's screen against the code
   * this device computed itself, and release on a match.
   *
   * The value is never sent to the peer in any form, and a comparison result
   * asserted by the peer is never accepted. On the fifth failure the session
   * ends and the burner is zeroized; the client must return the user to the
   * scan step rather than reopening the field (§9.3).
   *
   * @throws {QrstError} `attempts-exhausted` once the budget is spent.
   */
  submitCode(digits: string): Promise<QrstCodeResult>;
  /**
   * §12.3 light flow only — release after the user accepts the §9.1 prompt.
   * There is no code to compare; the returned secret did the authentication.
   *
   * @throws {QrstError} on a SAS session, where {@link submitCode} is the only
   *   way to release.
   */
  release(): Promise<QrstCodeResult>;
  /** The user declined. Send ABORT and zeroize (§9.1 item 4, §9.3). */
  decline(): void;
  /** Abandon the session and zeroize. */
  cancel(): void;
}

/**
 * Flow A (§7) — this device holds a share and releases one.
 *
 * Runs §7 steps 4–14. The returned promise resolves at step 11, once the SAS is
 * derived and the §9.1 release prompt can be shown; nothing has left the device
 * at that point and nothing will until {@link QrstSendSession.submitCode}
 * matches.
 *
 * **On the light flow (§12.3).** When the scanned URI carries a `secret`, this
 * session authenticates by echoing that token rather than by a typed code, and
 * `release()` replaces `submitCode()`. The specification is exact about when
 * that is acceptable and this JSDoc quotes it rather than paraphrasing:
 *
 * > The returned secret stops a party that never received the token — a racing
 * > responder, an overheard relay. It does **not** stop interception of the
 * > token itself: whoever obtains the token obtains the secret, receives the
 * > payload, and — for a threshold share — holds one of the shares the key
 * > reconstructs from. Admission gates *signing*, not reconstruction, and
 * > rotation is forward-only, so **neither undoes a share intercepted in
 * > transit and combined with another**.
 *
 * So: the light flow "suits delivery over a channel the sender controls — its
 * own camera, or a local same-user paste — where interception means a local
 * compromise that already loses. Over a channel the sender does not control (a
 * link relayed through a third party), the SAS is required." `frost-share` is
 * eligible for it at all only because a share is revocable and admission-gated;
 * `nostr-nsec` and any other irreversible payload must use the SAS (§12.3).
 *
 * This function enforces the one part of that it can see: a light-flow URI that
 * did not come from this device's own camera is refused, because a pasted link
 * is exactly the uncontrolled channel the paragraph above excludes. Everything
 * else is the operator's judgement, which is why it is written out here.
 *
 * @throws {QrstError} `unsupported-version`, `unsupported-profile`,
 *   `invalid-uri`, `role-collision`, `payload-too-large`, `peer-refused` or
 *   `restart-throttle` — all of them before a burner exists.
 */
export async function startQrstSend(options: QrstSendOptions): Promise<QrstSendSession> {
  const log = makeLogger('[qrst:send]', options.eventConfig ?? { enableLogging: false });
  const notice = (value: QrstNotice) => {
    try {
      options.onNotice?.(value);
    } catch (error) {
      log('error', 'onNotice callback threw', error);
    }
  };

  // §7 step 4: verify the URI implements the profile "else abort before
  // generating anything".
  const uri = parseQrstUri(options.uri, { profiles: [QRST_PROFILE_FROST_SHARE] });

  // §11.2 role collision. This device has committed to being the Sender, so a
  // code that also wants to send is a collision and is named as one.
  if (uri.mode !== 'offer') {
    throw new QrstError(
      'That code is from another device that also wants to send a share. One of you has to be receiving.',
      { reason: 'role-collision', mode: uri.mode }
    );
  }

  const handshake: QrstHandshake = uri.secret ? 'returned-secret' : 'sas';
  if (handshake === 'returned-secret' && options.pairingSource !== 'camera') {
    throw new QrstError(
      'This code uses the light flow, which is only safe over a channel you control. It has to be read by this device’s own camera, not pasted.',
      { reason: 'invalid-uri' }
    );
  }

  // §9.3: never begin a new session with a burner already failed against.
  const throttle = getQrstRestartThrottle();
  if (throttle.refusedPeers.includes(uri.pubkey)) {
    throw new QrstError(
      'A code for that device has already failed in the last hour. Start again from the other device.',
      { reason: 'peer-refused' }
    );
  }
  if (throttle.requiresAcknowledgement) {
    throw new QrstError(throttle.message!, {
      reason: 'restart-throttle',
      failedSessionsLastHour: throttle.failedSessionsLastHour
    });
  }

  // P1 before anything else: refuse a payload the profile cannot carry.
  const payloadContent = buildQrstFrostSharePayload(options.payload);

  const relays = normalizeRelayList([
    ...uri.relays,
    ...(options.relays ?? []),
    ...(uri.relays.length === 0 && !options.relays?.length ? QRST_DEFAULT_RELAYS : [])
  ]);
  if (relays.length === 0) {
    throw new QrstError('The pairing code named no relay and none was supplied', {
      reason: 'no-transport'
    });
  }

  checkClock(options.clockSkewSeconds, notice);

  // §7 step 5.
  const burnerSecret = generateSecretKey();
  const burnerPubkey = getPublicKey(burnerSecret);
  const nonceS = randomBytes32();
  const startedAt = Date.now();
  const startedAtSeconds = Math.floor(startedAt / 1000);
  const expiresAt = new Date(startedAt + QRST_SESSION_LIFETIME_MS);

  const transportFactory = options.transportFactory ?? createQrstRelayTransport;
  const transport = transportFactory({
    relays,
    secretKey: burnerSecret,
    maxPayloadBytes: QRST_FROST_SHARE_MAX_PAYLOAD_BYTES,
    sessionLifetimeMs: QRST_SESSION_LIFETIME_MS,
    log,
    onNotice: notice
  });

  const send = (template: EventTemplate) => {
    transport.publish(
      sealAndWrap(template, burnerSecret, uri.pubkey, Math.floor(Date.now() / 1000))
    );
  };

  let finished = false;
  let released = false;
  let attempts = 0;
  let expectedDigits: string | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let ackTimer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    finished = true;
    if (expiryTimer) clearTimeout(expiryTimer);
    if (ackTimer) clearTimeout(ackTimer);
    expiryTimer = null;
    ackTimer = null;
    transport.close();
    zeroize(burnerSecret, nonceS);
    expectedDigits = null;
  };

  const fail = (error: QrstError) => {
    try {
      options.onError?.(error);
    } catch (callbackError) {
      log('error', 'onError callback threw', callbackError);
    }
  };

  let resolveHandshake: (() => void) | null = null;
  let rejectHandshake: ((error: QrstError) => void) | null = null;
  const handshakeComplete = new Promise<void>((resolve, reject) => {
    resolveHandshake = resolve;
    rejectHandshake = reject;
  });

  transport.subscribe(burnerPubkey, startedAtSeconds - QRST_SLACK_SECONDS, event => {
    const result = unwrapAndVerify(event, burnerSecret, startedAtSeconds);
    if (result.discarded) {
      log('debug', `Wrap discarded: ${result.discarded}`);
      return;
    }
    const rumor = result.rumor!;
    // Flow A: the Sender speaks only to the burner from the QR.
    if (rumor.pubkey !== uri.pubkey) return;

    if (rumor.kind === QRST_KINDS.NONCE && handshake === 'sas' && !expectedDigits) {
      // §7 step 9.
      const nonceR = tagValue(rumor, 'nonce');
      if (!nonceR || !HEX32.test(nonceR)) return;
      // §7 step 10.
      send({ kind: QRST_KINDS.REVEAL, content: '', tags: [['nonce', toHex(nonceS)]], created_at: 0 });
      // §7 step 11.
      expectedDigits = deriveQrstSas({
        version: QRST_VERSION,
        profile: uri.profile,
        senderPubkey: burnerPubkey,
        receiverPubkey: uri.pubkey,
        senderNonce: toHex(nonceS),
        receiverNonce: nonceR
      }).digits;
      resolveHandshake?.();
      return;
    }

    if (rumor.kind === QRST_KINDS.ACK) {
      // §7 step 18: zeroize on ACK.
      log('info', 'Receiver acknowledged the share');
      if (released) teardown();
      return;
    }

    if (rumor.kind === QRST_KINDS.ABORT) {
      const error = new QrstError('The other device ended the transfer', { reason: 'declined' });
      fail(error);
      rejectHandshake?.(error);
      teardown();
    }
  });

  expiryTimer = setTimeout(() => {
    if (finished) return;
    const error = new QrstError('The transfer session expired', { reason: 'session-expired' });
    fail(error);
    rejectHandshake?.(error);
    teardown();
  }, QRST_SESSION_LIFETIME_MS);

  // §7 step 6.
  const helloTags: string[][] = [];
  if (handshake === 'sas') {
    helloTags.push(['commit', deriveQrstCommit(QRST_VERSION, burnerPubkey, toHex(nonceS))]);
  } else {
    // §12.3: echo the token's secret inside the first sealed message. §11.4
    // reserves only `commit` and `nonce`, and names no tag for this; `secret`
    // is this implementation's choice. Recorded in SPEC_ISSUES.md.
    helloTags.push(['secret', uri.secret!]);
  }
  send({ kind: QRST_KINDS.HELLO, content: '', tags: helloTags, created_at: 0 });

  if (handshake === 'sas') {
    await handshakeComplete;
  }

  const consent = buildQrstConsentPrompt({
    uri,
    pairingSource: options.pairingSource,
    handshake
  });

  const releasePayload = (): QrstCodeResult => {
    // §7 step 14.
    send({ kind: QRST_KINDS.PAYLOAD, content: payloadContent, tags: [], created_at: 0 });
    released = true;
    const record: QrstTransferRecord = {
      ts: new Date(),
      profile: uri.profile,
      transport: 'relay',
      sas: expectedDigits ?? 'returned-secret',
      peer_burner: uri.pubkey,
      multi: false
    };
    // §7 step 18: zeroize on ACK or after 60 s, whichever comes first.
    ackTimer = setTimeout(() => {
      if (!finished) teardown();
    }, QRST_ACK_GRACE_MS);
    return { matched: true, attemptsRemaining: QRST_MAX_SAS_ATTEMPTS - attempts, released: true, record };
  };

  const abandon = () => {
    // §9.3: the Sender SHOULD send ABORT before zeroizing. Its absence means
    // nothing and is never relied on.
    if (!finished) {
      send({ kind: QRST_KINDS.ABORT, content: '', tags: [], created_at: 0 });
      teardown();
    }
  };

  return {
    consent,
    peerPubkey: uri.pubkey,
    handshake,
    expiresAt,
    attemptsRemaining: () => Math.max(0, QRST_MAX_SAS_ATTEMPTS - attempts),
    async submitCode(digits: string): Promise<QrstCodeResult> {
      if (handshake !== 'sas') {
        throw new QrstError('This session authenticates by returned secret; call release()', {
          reason: 'invalid-uri'
        });
      }
      if (finished) {
        throw new QrstError('The transfer session is over', { reason: 'session-expired' });
      }
      if (attempts >= QRST_MAX_SAS_ATTEMPTS) {
        throw new QrstError('No attempts remain', { reason: 'attempts-exhausted' });
      }
      // §9.2: five discrete positions, exactly five digits, never more.
      const value = typeof digits === 'string' ? digits.trim() : '';
      if (!/^[0-9]{5}$/.test(value)) {
        throw new QrstError('The pairing code is exactly five digits', { reason: 'invalid-uri' });
      }
      attempts += 1;
      if (expectedDigits && digitsEqual(value, expectedDigits)) {
        return releasePayload();
      }
      const remaining = QRST_MAX_SAS_ATTEMPTS - attempts;
      if (remaining <= 0) {
        // §9.3: remember this burner, count the failed session, zeroize, end.
        const now = Date.now();
        failureStore.addRefusedPeer(uri.pubkey, now);
        failureStore.addFailedSession(now);
        abandon();
        fail(new QrstError('Five codes failed; the transfer was abandoned', {
          reason: 'attempts-exhausted'
        }));
      }
      return { matched: false, attemptsRemaining: Math.max(0, remaining) };
    },
    async release(): Promise<QrstCodeResult> {
      if (handshake !== 'returned-secret') {
        throw new QrstError(
          'This session authenticates by a typed code; call submitCode() with the digits from the other screen',
          { reason: 'invalid-uri' }
        );
      }
      if (finished) {
        throw new QrstError('The transfer session is over', { reason: 'session-expired' });
      }
      return releasePayload();
    },
    decline() {
      if (finished) return;
      abandon();
    },
    cancel() {
      if (finished) return;
      abandon();
    }
  };
}
