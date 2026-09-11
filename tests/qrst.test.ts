import { readFileSync } from 'fs';
import { join } from 'path';
import * as nip44 from 'nostr-tools/nip44';

import {
  acknowledgeQrstFailures,
  buildQrstConsentPrompt,
  buildQrstFrostSharePayload,
  buildQrstFrostUri,
  buildQrstUri,
  checkQrstFrostSharePayload,
  deriveQrstCommit,
  deriveQrstSas,
  describeQrstFrostSharePayload,
  getQrstRestartThrottle,
  parseQrstFrostSharePayload,
  parseQrstUri,
  resetQrstFailureMemory,
  startQrstReceive,
  startQrstSend,
  QRST_DEFAULT_BOUNCE_HOST,
  QRST_FROST_SHARE_MAX_PAYLOAD_BYTES,
  QRST_KINDS,
  QRST_MAX_SAS_ATTEMPTS,
  QRST_PROFILE_FROST_SHARE,
  QRST_VERSION,
  type QrstNotice,
  type QrstTransport,
  type QrstTransportConfig
} from '../src/qrst.js';
import { QrstError } from '../src/types.js';

const { __fixtures } = require('@frostr/bifrost');

const sasVectors = JSON.parse(
  readFileSync(join(__dirname, '..', 'vectors', 'qrst-sas.json'), 'utf8')
);
const maxVectors = JSON.parse(
  readFileSync(join(__dirname, '..', 'vectors', 'qrst-frost-share-max.json'), 'utf8')
);

const RELAY = 'wss://relay.example';

/* -------------------------------------------------------------------------- */
/*                             Credential fixtures                            */
/* -------------------------------------------------------------------------- */

/**
 * A bfshare1/bfgroup1 pair the mocked bifrost encoders resolve to real package
 * shapes, so the P4 check and the P5 rendering run over structured data rather
 * than over the mock's own credential strings.
 */
function registerKeyset(options: {
  share: string;
  group: string;
  shareIdx: number;
  threshold: number;
  members: number;
  memberPubkeyPrefix?: string;
}) {
  const prefix = options.memberPubkeyPrefix ?? '02';
  const pubkeyFor = (idx: number) => `${prefix}${String(idx).padStart(64, '0')}`;
  __fixtures.shares.set(options.share, {
    idx: options.shareIdx,
    seckey: '11'.repeat(32),
    pubkey: pubkeyFor(options.shareIdx)
  });
  __fixtures.groups.set(options.group, {
    threshold: options.threshold,
    group_pk: `02${'ab'.repeat(32)}`,
    commits: Array.from({ length: options.members }, (_, i) => ({
      idx: i + 1,
      pubkey: pubkeyFor(i + 1)
    }))
  });
}

const SHARE = `bfshare1${'q'.repeat(160)}`;
const GROUP = `bfgroup1${'q'.repeat(220)}`;
const OTHER_GROUP = `bfgroup1${'p'.repeat(220)}`;

beforeEach(() => {
  __fixtures.reset();
  resetQrstFailureMemory();
  registerKeyset({ share: SHARE, group: GROUP, shareIdx: 2, threshold: 2, members: 3 });
  registerKeyset({
    share: `bfshare1${'z'.repeat(160)}`,
    group: OTHER_GROUP,
    shareIdx: 2,
    threshold: 2,
    members: 3,
    memberPubkeyPrefix: '03'
  });
});

/* -------------------------------------------------------------------------- */
/*                          A loopback QRST transport                         */
/* -------------------------------------------------------------------------- */

/**
 * Both sides of a session on one in-memory bus, addressed by the wrap's `p`
 * tag. Everything above the socket -- sealing, attribution, the session window,
 * the SAS -- is the real implementation.
 */
function createLoopbackBus() {
  const subscribers = new Map<string, (event: any) => void>();
  const published: any[] = [];
  const injected: any[] = [];

  const factory = (_config: QrstTransportConfig): QrstTransport => ({
    relays: [RELAY],
    publish(event) {
      published.push(event);
      deliver(event);
    },
    subscribe(pubkey, _since, onEvent) {
      subscribers.set(pubkey, onEvent);
    },
    close() {
      // Sessions tear down independently; the bus outlives them in a test.
    }
  });

  function deliver(event: any) {
    const recipient = event.tags.find((tag: string[]) => tag[0] === 'p')?.[1];
    const handler = recipient ? subscribers.get(recipient) : undefined;
    // Delivery is asynchronous, as it is over a relay.
    if (handler) setTimeout(() => handler(event), 0);
  }

  return {
    factory,
    published,
    injected,
    /** Hand an event straight to a subscriber, bypassing any sender. */
    inject(pubkey: string, event: any) {
      injected.push(event);
      subscribers.get(pubkey)?.(event);
    },
    kinds: () => published.length
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

/* -------------------------------------------------------------------------- */

describe('section 6 -- commit and short authentication string', () => {
  it('reproduces the commit for the contacting party in both flows', () => {
    expect(deriveQrstCommit(sasVectors.v, sasVectors.snd_pubkey, sasVectors.nonce_s)).toBe(
      sasVectors.commit_snd_contacting.commit
    );
    expect(deriveQrstCommit(sasVectors.v, sasVectors.rcv_pubkey, sasVectors.nonce_r)).toBe(
      sasVectors.commit_rcv_contacting.commit
    );
  });

  it('reproduces the transcript hash and the five digits', () => {
    const { code, digits } = deriveQrstSas({
      version: sasVectors.v,
      profile: sasVectors.profile,
      senderPubkey: sasVectors.snd_pubkey,
      receiverPubkey: sasVectors.rcv_pubkey,
      senderNonce: sasVectors.nonce_s,
      receiverNonce: sasVectors.nonce_r
    });
    expect(code).toBe(sasVectors.code);
    expect(digits).toBe(sasVectors.digits);
    expect(digits).toHaveLength(5);
  });

  it('orders the burners by role, not by which party made contact', () => {
    // The negative vector exists to catch an implementation that agrees with
    // itself and fails only against a real peer.
    const transposed = deriveQrstSas({
      version: sasVectors.v,
      profile: sasVectors.profile,
      senderPubkey: sasVectors.rcv_pubkey,
      receiverPubkey: sasVectors.snd_pubkey,
      senderNonce: sasVectors.nonce_r,
      receiverNonce: sasVectors.nonce_s
    });
    expect(transposed.code).toBe(sasVectors.code_with_roles_transposed.code);
    expect(transposed.code).not.toBe(sasVectors.code);
  });

  it('binds the profile into the transcript', () => {
    const other = deriveQrstSas({
      version: sasVectors.v,
      profile: QRST_PROFILE_FROST_SHARE,
      senderPubkey: sasVectors.snd_pubkey,
      receiverPubkey: sasVectors.rcv_pubkey,
      senderNonce: sasVectors.nonce_s,
      receiverNonce: sasVectors.nonce_r
    });
    expect(other.code).not.toBe(sasVectors.code);
  });

  it('binds the version as a single byte', () => {
    const v2 = deriveQrstSas({
      version: 2,
      profile: sasVectors.profile,
      senderPubkey: sasVectors.snd_pubkey,
      receiverPubkey: sasVectors.rcv_pubkey,
      senderNonce: sasVectors.nonce_s,
      receiverNonce: sasVectors.nonce_r
    });
    expect(v2.code).not.toBe(sasVectors.code);
    expect(() => deriveQrstCommit(256, sasVectors.snd_pubkey, sasVectors.nonce_s)).toThrow(
      QrstError
    );
  });

  it('rejects malformed transcript material', () => {
    expect(() => deriveQrstCommit(1, 'not-hex', sasVectors.nonce_s)).toThrow(QrstError);
    expect(() =>
      deriveQrstSas({
        version: 1,
        profile: '',
        senderPubkey: sasVectors.snd_pubkey,
        receiverPubkey: sasVectors.rcv_pubkey,
        senderNonce: sasVectors.nonce_s,
        receiverNonce: sasVectors.nonce_r
      })
    ).toThrow(QrstError);
  });
});

describe('section 11.2 -- the QR URI', () => {
  const pubkey = sasVectors.rcv_pubkey;

  it('puts every parameter in the fragment', () => {
    const uri = buildQrstUri({
      mode: 'offer',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey,
      relays: [RELAY]
    });
    const [beforeFragment, fragment] = uri.split('#');
    expect(beforeFragment).toBe(`https://${QRST_DEFAULT_BOUNCE_HOST}/qrst`);
    expect(beforeFragment).not.toContain('npub');
    expect(beforeFragment).not.toContain('relay');
    expect(fragment).toContain(`v=${QRST_VERSION}`);
    expect(fragment).toContain('mode=offer');
    expect(fragment).toContain(`p=${QRST_PROFILE_FROST_SHARE}`);
    expect(fragment).toContain('npub=npub1');
  });

  it('round-trips through the parser', () => {
    const uri = buildQrstUri({
      mode: 'offer',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey,
      relays: [RELAY, 'wss://relay.two'],
      host: 'pair.example.org',
      path: '/x'
    });
    expect(parseQrstUri(uri)).toMatchObject({
      version: QRST_VERSION,
      mode: 'offer',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey,
      relays: [RELAY, 'wss://relay.two'],
      host: 'pair.example.org',
      path: '/x',
      carrier: 'https'
    });
  });

  it('round-trips the frost:// carrier of section 12.3', () => {
    const uri = buildQrstFrostUri({
      mode: 'offer',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey,
      relays: [RELAY],
      secret: '0a'.repeat(32)
    });
    expect(uri.startsWith('frost://npub1')).toBe(true);
    const parsed = parseQrstUri(uri);
    expect(parsed.carrier).toBe('frost');
    expect(parsed.secret).toBe('0a'.repeat(32));
  });

  it('rejects an unknown version, a missing mode and a missing profile', () => {
    const npub = parseQrstUri(
      buildQrstUri({ mode: 'offer', profile: QRST_PROFILE_FROST_SHARE, pubkey, relays: [RELAY] })
    ).npub;
    const base = `https://h/p#v=1&mode=offer&p=${QRST_PROFILE_FROST_SHARE}&npub=${npub}`;
    expect(() => parseQrstUri(base.replace('v=1', 'v=9'))).toThrow(/Unsupported QRST version/);
    expect(() => parseQrstUri(base.replace('&mode=offer', ''))).toThrow(/missing mode/);
    expect(() => parseQrstUri(base.replace(`&p=${QRST_PROFILE_FROST_SHARE}`, ''))).toThrow(
      /missing p/
    );
    expect(() => parseQrstUri(base.replace(QRST_PROFILE_FROST_SHARE, 'nostr-nsec'))).toThrow(
      /Unsupported profile/
    );
  });

  it('rejects a burner key whose bech32 checksum does not hold', () => {
    const uri = buildQrstUri({
      mode: 'offer',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey,
      relays: [RELAY]
    });
    const broken = uri.replace(/npub=npub1(.)/, (_m, c) => `npub=npub1${c === 'q' ? 'p' : 'q'}`);
    expect(() => parseQrstUri(broken)).toThrow(/Invalid burner public key/);
  });

  it('carries at most four relays', () => {
    expect(() =>
      buildQrstUri({
        mode: 'offer',
        profile: QRST_PROFILE_FROST_SHARE,
        pubkey,
        relays: ['wss://a', 'wss://b', 'wss://c', 'wss://d', 'wss://e']
      })
    ).toThrow(/at most four relays/);
  });
});

describe('section 9.1 -- release consent', () => {
  const uriFor = (overrides: { origin?: string } = {}) =>
    parseQrstUri(
      buildQrstUri({
        mode: 'offer',
        profile: QRST_PROFILE_FROST_SHARE,
        pubkey: sasVectors.rcv_pubkey,
        relays: [RELAY],
        ...overrides
      })
    );

  it('contradicts the login mental model and makes declining a named control', () => {
    const prompt = buildQrstConsentPrompt({
      uri: uriFor(),
      pairingSource: 'camera',
      handshake: 'sas'
    });
    expect(prompt.heading).toMatch(/not a login/i);
    expect(prompt.declineLabel).toMatch(/don't send/i);
    // The affirmative control describes the transfer rather than expressing
    // agreement: never "OK", never "Continue".
    expect(prompt.affirmativeLabel).toMatch(/send a share of my key/i);
    expect(prompt.affirmativeLabel).not.toMatch(/^(ok|continue)$/i);
    expect(prompt.body.join(' ')).toMatch(/leaves this device/i);
  });

  it('never calls the code a PIN and says where it comes from', () => {
    const prompt = buildQrstConsentPrompt({
      uri: uriFor(),
      pairingSource: 'camera',
      handshake: 'sas'
    });
    const text = [prompt.codeFieldLabel, prompt.codeSourceText].join(' ').toLowerCase();
    expect(text).not.toContain('pin');
    expect(text).not.toContain('passcode');
    expect(prompt.codeSourceText).toMatch(/shown on your other device/i);
  });

  it('gives standard friction only to a native peer read by this camera', () => {
    expect(
      buildQrstConsentPrompt({ uri: uriFor(), pairingSource: 'camera', handshake: 'sas' }).friction
    ).toBe('standard');
  });

  it('fails closed to the maximum for a pasted URI and for a web origin', () => {
    const pasted = buildQrstConsentPrompt({
      uri: uriFor(),
      pairingSource: 'paste',
      handshake: 'sas'
    });
    expect(pasted.friction).toBe('maximum');
    expect(pasted.peer.kind).toBe('unestablished');
    expect(pasted.notFromScan).toBe(true);
    expect(pasted.notFromScanNotice).toMatch(/did not come from a code you scanned/i);

    const web = buildQrstConsentPrompt({
      uri: uriFor({ origin: 'https://wallet.example' }),
      pairingSource: 'camera',
      handshake: 'sas'
    });
    expect(web.friction).toBe('maximum');
    expect(web.peer.kind).toBe('web');
    // Where an origin is claimed it MUST be named in the affirmative control.
    expect(web.affirmativeLabel).toContain('https://wallet.example');
    expect(web.requiresExtraStep).toBe(true);
  });

  it('refuses an origin it cannot render as punycode', () => {
    expect(() =>
      buildQrstUri({
        mode: 'offer',
        profile: QRST_PROFILE_FROST_SHARE,
        pubkey: sasVectors.rcv_pubkey,
        relays: [RELAY],
        origin: 'not a url äöü'
      })
    ).toThrow(QrstError);
  });
});

describe('section 4 -- the frost-share payload', () => {
  it('carries the credential pair and parses back', () => {
    const content = buildQrstFrostSharePayload({ share: SHARE, group: GROUP });
    expect(parseQrstFrostSharePayload(content)).toEqual({ share: SHARE, group: GROUP });
  });

  it('refuses anything that is not a bfshare/bfgroup pair', () => {
    expect(() => buildQrstFrostSharePayload({ share: 'nope', group: GROUP })).toThrow(QrstError);
    expect(() => buildQrstFrostSharePayload({ share: SHARE, group: 'nope' })).toThrow(QrstError);
    expect(() => parseQrstFrostSharePayload('{}')).toThrow(QrstError);
    expect(() => parseQrstFrostSharePayload('not json')).toThrow(QrstError);
  });

  it('refuses a payload over the declared maximum (P1)', () => {
    const oversized = `bfgroup1${'q'.repeat(maxVectors.over_declared_maximum.payload_bytes)}`;
    try {
      buildQrstFrostSharePayload({ share: SHARE, group: oversized });
      throw new Error('expected a refusal');
    } catch (error: any) {
      expect(error).toBeInstanceOf(QrstError);
      expect(error.details.reason).toBe('payload-too-large');
      expect(error.details.max).toBe(QRST_FROST_SHARE_MAX_PAYLOAD_BYTES);
    }
  });

  it('applies the P4 check against the group the share arrived with', () => {
    expect(checkQrstFrostSharePayload({ share: SHARE, group: GROUP }).ok).toBe(true);
    const mismatched = checkQrstFrostSharePayload({ share: SHARE, group: OTHER_GROUP });
    expect(mismatched.ok).toBe(false);
    expect(mismatched.reason).toMatch(/does not belong to the group/i);
    expect(checkQrstFrostSharePayload({ share: 'bfshare1bad', group: GROUP }).ok).toBe(false);
  });

  it('renders per P5 without alarming the receiver', () => {
    const rendering = describeQrstFrostSharePayload({ share: SHARE, group: GROUP });
    expect(rendering.npub.startsWith('npub1')).toBe(true);
    expect(rendering.shareIndex).toBe(2);
    expect(rendering.threshold).toBe(2);
    expect(rendering.totalMembers).toBe(3);
    const text = rendering.lines.join(' ');
    expect(text).toMatch(/one share of/i);
    expect(text).toMatch(/not the key/i);
    expect(text).toMatch(/cannot sign at all until/i);
  });
});

describe('section 4 P1 -- the payload-ceiling vector', () => {
  it('is exactly the declared maximum', () => {
    expect(maxVectors.declared_max_payload_bytes).toBe(QRST_FROST_SHARE_MAX_PAYLOAD_BYTES);
    expect(Buffer.byteLength(maxVectors.at_declared_maximum.payload)).toBe(
      QRST_FROST_SHARE_MAX_PAYLOAD_BYTES
    );
  });

  it('still parses as a frost-share record', () => {
    const parsed = parseQrstFrostSharePayload(maxVectors.at_declared_maximum.payload);
    expect(parsed.share).toBe(maxVectors.at_declared_maximum.share_credential);
    expect(parsed.group).toBe(maxVectors.at_declared_maximum.group_credential);
  });

  it('reproduces the seal ciphertext at the ceiling, padding included', () => {
    // The case P1 exists for: NIP-44's power-of-two padding rounds a 2271-byte
    // rumor to 2560 plus the two-byte length prefix, one 512-byte chunk past
    // what an implementation gets by adding the prefix alone.
    const f = maxVectors.fixtures;
    const e = maxVectors.at_declared_maximum.envelope;
    expect(2 + nip44.v2.utils.calcPaddedLen(e.rumor_json_bytes)).toBe(
      e.seal_nip44_padded_plaintext_bytes
    );
    const rumor = {
      created_at: f.created_at,
      kind: QRST_KINDS.PAYLOAD,
      content: maxVectors.at_declared_maximum.payload,
      tags: [],
      pubkey: f.sender_burner_pubkey,
      id: e.rumor_id
    };
    const rumorJson = JSON.stringify(rumor);
    expect(Buffer.byteLength(rumorJson)).toBe(e.rumor_json_bytes);
    const key = nip44.v2.utils.getConversationKey(
      Uint8Array.from(Buffer.from(f.sender_burner_seckey, 'hex')),
      f.receiver_burner_pubkey
    );
    const content = nip44.v2.encrypt(
      rumorJson,
      key,
      Uint8Array.from(Buffer.from(f.seal_nip44_nonce, 'hex'))
    );
    expect(Buffer.byteLength(content)).toBe(e.seal_content_bytes);
  });

  it('fits the NIP-11 example content cap at the ceiling', () => {
    const e = maxVectors.at_declared_maximum.envelope;
    expect(e.fits_nip11_example_max_content_length_8196).toBe(true);
    expect(e.wrap_content_bytes).toBeLessThanOrEqual(8196);
  });

  it('records the member count at which the pair crosses the ceiling', () => {
    const ladder = maxVectors.member_count_ladder.bytes_by_members;
    expect(ladder['10']).toBeLessThanOrEqual(QRST_FROST_SHARE_MAX_PAYLOAD_BYTES);
    expect(ladder['11']).toBeGreaterThan(QRST_FROST_SHARE_MAX_PAYLOAD_BYTES);
    expect(maxVectors.over_declared_maximum.must_be_refused).toBe(true);
  });
});

describe('section 7 -- Flow A end to end', () => {
  async function pair(options: { light?: boolean } = {}) {
    const bus = createLoopbackBus();
    const notices: QrstNotice[] = [];
    const seen: { digits?: string; rendering?: any } = {};

    const receiver = startQrstReceive({
      relays: [RELAY],
      light: options.light,
      transportFactory: bus.factory,
      sendEchoAfterCommit: false,
      onNotice: n => notices.push(n),
      onSasReady: digits => {
        seen.digits = digits;
      },
      onPayload: rendering => {
        seen.rendering = rendering;
      }
    });

    const sender = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });

    await settle();
    return { bus, receiver, sender, notices, seen };
  }

  it('derives the same five digits on both devices', async () => {
    const { receiver, sender, seen } = await pair();
    expect(seen.digits).toMatch(/^[0-9]{5}$/);
    expect(receiver.candidates()).toHaveLength(1);
    expect(receiver.candidates()[0].digits).toBe(seen.digits);
    expect(sender.handshake).toBe('sas');
    // The Sender never displays the code it derived itself (section 9.1 item 3).
    expect(JSON.stringify(sender.consent)).not.toContain(seen.digits!);
    receiver.cancel();
    sender.cancel();
  });

  it('releases nothing until the typed digits match, then commits on confirmation', async () => {
    const { receiver, sender, seen } = await pair();

    const wrong = await sender.submitCode('00000' === seen.digits ? '11111' : '00000');
    expect(wrong.matched).toBe(false);
    expect(wrong.attemptsRemaining).toBe(QRST_MAX_SAS_ATTEMPTS - 1);
    await settle();
    expect(seen.rendering).toBeUndefined();
    expect(receiver.candidates()[0].holdingPayload).toBe(false);

    const right = await sender.submitCode(seen.digits!);
    expect(right.matched).toBe(true);
    expect(right.released).toBe(true);
    expect(right.record?.sas).toBe(seen.digits);
    await settle();

    // Held, not committed, until accept() (section 7 step 15).
    expect(seen.rendering).toBeDefined();
    expect(seen.rendering.npub.startsWith('npub1')).toBe(true);
    expect(receiver.candidates()[0].holdingPayload).toBe(true);

    const result = await receiver.accept();
    expect(result.shareCredential).toBe(SHARE);
    expect(result.groupCredential).toBe(GROUP);
    expect(result.record.sas).toBe(seen.digits);
    expect(result.record.multi).toBe(false);
    expect(result.record.transport).toBe('relay');
    expect(result.echoSent).toBe(false);
    sender.cancel();
  });

  it('never puts the typed code on the wire', async () => {
    const { bus, receiver, sender, seen } = await pair();
    await sender.submitCode(seen.digits!);
    await settle();
    const wire = JSON.stringify(bus.published);
    expect(wire).not.toContain(seen.digits!);
    // The payload itself is never in the clear either.
    expect(wire).not.toContain(SHARE);
    receiver.cancel();
    sender.cancel();
  });

  it('spends five attempts, then refuses that burner for an hour', async () => {
    const { receiver, sender, seen } = await pair();
    const wrong = seen.digits === '00000' ? '11111' : '00000';
    for (let i = 1; i <= QRST_MAX_SAS_ATTEMPTS; i++) {
      const result = await sender.submitCode(wrong);
      expect(result.matched).toBe(false);
      expect(result.attemptsRemaining).toBe(QRST_MAX_SAS_ATTEMPTS - i);
    }
    await expect(sender.submitCode(wrong)).rejects.toThrow(QrstError);

    const throttle = getQrstRestartThrottle();
    expect(throttle.refusedPeers).toContain(sender.peerPubkey);
    expect(throttle.failedSessionsLastHour).toBe(1);

    // Section 9.3: never begin a new session with a burner already failed against.
    await expect(
      startQrstSend({
        uri: receiver.uri,
        pairingSource: 'camera',
        payload: { share: SHARE, group: GROUP },
        transportFactory: createLoopbackBus().factory
      })
    ).rejects.toThrow(/already failed/i);
    receiver.cancel();
  });

  it('rejects a code that is not exactly five digits', async () => {
    const { receiver, sender } = await pair();
    await expect(sender.submitCode('1234')).rejects.toThrow(/exactly five digits/);
    await expect(sender.submitCode('123456')).rejects.toThrow(/exactly five digits/);
    await expect(sender.submitCode('12a45')).rejects.toThrow(/exactly five digits/);
    expect(sender.attemptsRemaining()).toBe(QRST_MAX_SAS_ATTEMPTS);
    receiver.cancel();
    sender.cancel();
  });

  it('refuses a URI whose mode implies the role this device already holds', async () => {
    const collision = buildQrstUri({
      mode: 'request',
      profile: QRST_PROFILE_FROST_SHARE,
      pubkey: sasVectors.rcv_pubkey,
      relays: [RELAY]
    });
    await expect(
      startQrstSend({
        uri: collision,
        pairingSource: 'camera',
        payload: { share: SHARE, group: GROUP },
        transportFactory: createLoopbackBus().factory
      })
    ).rejects.toThrow(/also wants to send/i);
  });

  it('holds a second responder without aborting the session', async () => {
    const bus = createLoopbackBus();
    const notices: QrstNotice[] = [];
    const receiver = startQrstReceive({
      relays: [RELAY],
      transportFactory: bus.factory,
      sendEchoAfterCommit: false,
      onNotice: n => notices.push(n)
    });

    const first = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    const second = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    await settle();

    expect(receiver.candidates()).toHaveLength(2);
    const notice = notices.find(n => n.kind === 'multiple-responders');
    expect(notice?.message).toMatch(/Another device also responded/);
    expect(notice?.message).toMatch(/Nothing was shared with them/);

    // The first responder is active; the display is lazy and advances on demand.
    expect(receiver.candidates()[0].order).toBe(0);
    const next = receiver.advanceCandidate();
    expect(next?.order).toBe(1);

    first.cancel();
    second.cancel();
    receiver.cancel();
  });

  it('records the multiple-responder flag on the transfer it commits', async () => {
    const bus = createLoopbackBus();
    const seen: { digits?: string } = {};
    const receiver = startQrstReceive({
      relays: [RELAY],
      transportFactory: bus.factory,
      sendEchoAfterCommit: false,
      onSasReady: digits => {
        seen.digits = digits;
      }
    });
    const first = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    const second = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    await settle();
    const firstBurner = receiver.candidates()[0].pubkey;
    await first.submitCode(seen.digits!);
    await settle();

    const result = await receiver.accept();
    expect(result.record.multi).toBe(true);
    // The committed candidate is the responder whose code the Sender matched.
    expect(result.record.peer_burner).toBe(firstBurner);
    first.cancel();
    second.cancel();
  });

  it('has nothing to accept before a payload arrives', async () => {
    const { receiver, sender } = await pair();
    await expect(receiver.accept()).rejects.toThrow(/Nothing has arrived/);
    receiver.cancel();
    sender.cancel();
  });

  it('ends the session on decline, from either side', async () => {
    const { receiver, sender } = await pair();
    sender.decline();
    await settle();
    expect(receiver.candidates()).toHaveLength(0);
    receiver.cancel();
  });
});

describe('section 12.3 -- the light flow', () => {
  it('pairs by returned secret with no code to type', async () => {
    const bus = createLoopbackBus();
    const seen: { digits?: string; rendering?: any } = {};
    const receiver = startQrstReceive({
      relays: [RELAY],
      light: true,
      transportFactory: bus.factory,
      sendEchoAfterCommit: false,
      onSasReady: digits => {
        seen.digits = digits;
      },
      onPayload: rendering => {
        seen.rendering = rendering;
      }
    });
    expect(receiver.handshake).toBe('returned-secret');
    expect(parseQrstUri(receiver.uri).secret).toMatch(/^[0-9a-f]{64}$/);

    const sender = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    expect(sender.handshake).toBe('returned-secret');
    await expect(sender.submitCode('12345')).rejects.toThrow(/returned secret/);

    await sender.release();
    await settle();
    expect(seen.digits).toBeUndefined();
    expect(seen.rendering).toBeDefined();

    const result = await receiver.accept();
    expect(result.record.sas).toBe('returned-secret');
    sender.cancel();
  });

  it('refuses a light-flow URI that did not come from this camera', async () => {
    const bus = createLoopbackBus();
    const receiver = startQrstReceive({
      relays: [RELAY],
      light: true,
      transportFactory: bus.factory
    });
    await expect(
      startQrstSend({
        uri: receiver.uri,
        pairingSource: 'paste',
        payload: { share: SHARE, group: GROUP },
        transportFactory: bus.factory
      })
    ).rejects.toThrow(/channel you control/i);
    receiver.cancel();
  });

  it('ignores a HELLO that does not echo the token', async () => {
    const bus = createLoopbackBus();
    const receiver = startQrstReceive({
      relays: [RELAY],
      light: true,
      transportFactory: bus.factory
    });
    // A URI with a different secret: the responder never received the token.
    const parsed = parseQrstUri(receiver.uri);
    const forged = buildQrstUri({
      mode: 'offer',
      profile: parsed.profile,
      pubkey: parsed.pubkey,
      relays: parsed.relays,
      secret: '0c'.repeat(32)
    });
    const sender = await startQrstSend({
      uri: forged,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    await settle();
    expect(receiver.candidates()).toHaveLength(0);
    sender.cancel();
    receiver.cancel();
  });
});

describe('section 11.4 -- attribution and the session window', () => {
  it('discards a wrap whose rumor timestamp falls outside the widened window', async () => {
    const bus = createLoopbackBus();
    const receiver = startQrstReceive({
      relays: [RELAY],
      transportFactory: bus.factory
    });
    const sender = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    await settle();
    expect(receiver.candidates()).toHaveLength(1);

    // Everything the honest session produced is inside the window; a rumor
    // dated a day ago is not, and is discarded from the session entirely.
    const stale = { ...bus.published[0], created_at: bus.published[0].created_at - 86400 };
    bus.inject(receiver.candidates()[0].pubkey, stale);
    await settle();
    expect(receiver.candidates()).toHaveLength(1);

    sender.cancel();
    receiver.cancel();
  });

  it('discards a wrap that does not decrypt to this burner', async () => {
    const bus = createLoopbackBus();
    const receiver = startQrstReceive({ relays: [RELAY], transportFactory: bus.factory });
    const otherBus = createLoopbackBus();
    const otherReceiver = startQrstReceive({ relays: [RELAY], transportFactory: otherBus.factory });
    const sender = await startQrstSend({
      uri: otherReceiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: otherBus.factory
    });
    await settle();

    // A wrap sealed to somebody else, handed to this receiver.
    const foreign = otherBus.published[0];
    const parsed = parseQrstUri(receiver.uri);
    bus.inject(parsed.pubkey, foreign);
    await settle();
    expect(receiver.candidates()).toHaveLength(0);

    sender.cancel();
    receiver.cancel();
    otherReceiver.cancel();
  });
});

describe('section 9.3 -- the restart throttle', () => {
  it('requires an acknowledgement after three failed sessions in an hour', async () => {
    const wrongFor = async () => {
      const bus = createLoopbackBus();
      const seen: { digits?: string } = {};
      const receiver = startQrstReceive({
        relays: [RELAY],
        transportFactory: bus.factory,
        onSasReady: d => {
          seen.digits = d;
        }
      });
      const sender = await startQrstSend({
        uri: receiver.uri,
        pairingSource: 'camera',
        payload: { share: SHARE, group: GROUP },
        transportFactory: bus.factory
      });
      await settle();
      const wrong = seen.digits === '00000' ? '11111' : '00000';
      for (let i = 0; i < QRST_MAX_SAS_ATTEMPTS; i++) await sender.submitCode(wrong);
      receiver.cancel();
    };

    await wrongFor();
    await wrongFor();
    expect(getQrstRestartThrottle().requiresAcknowledgement).toBe(false);
    await wrongFor();

    const throttle = getQrstRestartThrottle();
    expect(throttle.failedSessionsLastHour).toBe(3);
    expect(throttle.requiresAcknowledgement).toBe(true);
    expect(throttle.message).toMatch(/interfering with the transfer, not that you mistyped/i);

    const bus = createLoopbackBus();
    const receiver = startQrstReceive({ relays: [RELAY], transportFactory: bus.factory });
    await expect(
      startQrstSend({
        uri: receiver.uri,
        pairingSource: 'camera',
        payload: { share: SHARE, group: GROUP },
        transportFactory: bus.factory
      })
    ).rejects.toThrow(/interfering/i);

    acknowledgeQrstFailures();
    expect(getQrstRestartThrottle().requiresAcknowledgement).toBe(false);
    const sender = await startQrstSend({
      uri: receiver.uri,
      pairingSource: 'camera',
      payload: { share: SHARE, group: GROUP },
      transportFactory: bus.factory
    });
    sender.cancel();
    receiver.cancel();
  });
});

describe('section 11.4 -- clock skew', () => {
  it('warns when the supplied skew exceeds SLACK and never widens it', () => {
    const notices: QrstNotice[] = [];
    const bus = createLoopbackBus();
    const receiver = startQrstReceive({
      relays: [RELAY],
      transportFactory: bus.factory,
      clockSkewSeconds: 500,
      onNotice: n => notices.push(n)
    });
    expect(notices.find(n => n.kind === 'clock-skew')?.message).toMatch(/clock is off/i);
    receiver.cancel();

    const quiet: QrstNotice[] = [];
    const ok = startQrstReceive({
      relays: [RELAY],
      transportFactory: createLoopbackBus().factory,
      clockSkewSeconds: 30,
      onNotice: n => quiet.push(n)
    });
    expect(quiet.find(n => n.kind === 'clock-skew')).toBeUndefined();
    ok.cancel();
  });
});
