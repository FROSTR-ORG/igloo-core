# QRST test vectors

Known answers for the derivations in
[QR_SECRET_TRANSFER.md](https://github.com/sybenx/nostr-key-management/blob/main/QR_SECRET_TRANSFER.md),
exercised by `tests/qrst.test.ts`.

| File | Covers | Origin |
|---|---|---|
| `qrst-sas.json` | §6 — the commit, the transcript hash, and the five digits | Verbatim copy of `vectors/qrst-sas.json` from the specification repository. **Normative, and not ours to edit.** Where this file and `src/qrst.ts` disagree, `src/qrst.ts` is wrong. |
| `qrst-frost-share-max.json` | §4 P1 at exactly the declared maximum, plus the §11.4 envelope over it | Generated here. Offered upstream: the specification's own `vectors/README.md` lists the payload-ceiling vector as missing, and P1 requires one to exist. |

`qrst-frost-share-max.json` pins two things the §6 vectors cannot reach.

**The ceiling.** P1 asks for a vector at exactly the declared maximum "because
NIP-44's power-of-two padding makes an off-by-one-chunk error invisible
everywhere else". The payload here is a real 2-of-10 `frost-share` record padded
to exactly 2048 bytes; the seal's padded plaintext is 2562 bytes, which is one
512-byte chunk past the 2273 an implementation gets by adding the two-byte
length prefix and stopping. An implementation that reproduces
`seal_content_bytes` has the padding right.

**The member-count ladder.** A `bfgroup1` credential grows by roughly 165 bytes
per member, so the credential pair crosses the declared 2048-byte maximum
between a ten-member and an eleven-member keyset. `over_declared_maximum`
records the case a conforming Sender must refuse rather than truncate.

Every key, nonce and identity in these files is a fixture chosen for the file.
None belongs to anybody, and none should ever be used for anything. The NIP-44
nonces in `qrst-frost-share-max.json` are pinned so the ciphertexts reproduce
byte for byte; a real client MUST draw them at random.
