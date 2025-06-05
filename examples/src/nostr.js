import { nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { NostrError } from './types.js';
/**
 * Converts a nostr secret key (nsec) to its hex representation
 * @param nsec The nostr secret key in nsec format
 * @returns The secret key in hex format
 */
export function nsecToHex(nsec) {
    try {
        const { type, data } = nip19.decode(nsec);
        if (type !== 'nsec') {
            throw new NostrError('Invalid nsec format');
        }
        return Buffer.from(data).toString('hex');
    }
    catch (error) {
        throw new NostrError(`Failed to decode nsec: ${error.message}`, { nsec, error });
    }
}
/**
 * Converts a hex secret key to nostr secret key (nsec) format
 * @param hex The secret key in hex format
 * @returns The secret key in nsec format
 */
export function hexToNsec(hex) {
    try {
        validateHexKey(hex);
        const bytes = new Uint8Array(Buffer.from(hex, 'hex'));
        return nip19.nsecEncode(bytes);
    }
    catch (error) {
        throw new NostrError(`Failed to encode nsec: ${error.message}`, { hex, error });
    }
}
/**
 * Converts a hex public key to nostr public key (npub) format
 * @param hex The public key in hex format
 * @returns The public key in npub format
 */
export function hexToNpub(hex) {
    try {
        validateHexKey(hex);
        return nip19.npubEncode(hex);
    }
    catch (error) {
        throw new NostrError(`Failed to encode npub: ${error.message}`, { hex, error });
    }
}
/**
 * Converts a nostr public key (npub) to its hex representation
 * @param npub The nostr public key in npub format
 * @returns The public key in hex format
 */
export function npubToHex(npub) {
    try {
        const { type, data } = nip19.decode(npub);
        if (type !== 'npub') {
            throw new NostrError('Invalid npub format');
        }
        return data;
    }
    catch (error) {
        throw new NostrError(`Failed to decode npub: ${error.message}`, { npub, error });
    }
}
/**
 * Generates a new nostr key pair (nsec and npub)
 * @returns Object containing both nsec and npub, plus hex versions
 */
export function generateNostrKeyPair() {
    try {
        const sk = generateSecretKey();
        const hexPublicKey = getPublicKey(sk);
        const hexPrivateKey = Buffer.from(sk).toString('hex');
        return {
            nsec: nip19.nsecEncode(sk),
            npub: nip19.npubEncode(hexPublicKey),
            hexPrivateKey,
            hexPublicKey
        };
    }
    catch (error) {
        throw new NostrError(`Failed to generate nostr key pair: ${error.message}`, { error });
    }
}
/**
 * Derives the public key from a private key
 * @param privateKey The private key in hex or nsec format
 * @returns Object containing npub and hex public key
 */
export function derivePublicKey(privateKey) {
    try {
        let hexPrivateKey;
        if (privateKey.startsWith('nsec')) {
            hexPrivateKey = nsecToHex(privateKey);
        }
        else {
            validateHexKey(privateKey);
            hexPrivateKey = privateKey;
        }
        const privateKeyBytes = new Uint8Array(Buffer.from(hexPrivateKey, 'hex'));
        const hexPublicKey = getPublicKey(privateKeyBytes);
        return {
            npub: nip19.npubEncode(hexPublicKey),
            hexPublicKey
        };
    }
    catch (error) {
        throw new NostrError(`Failed to derive public key: ${error.message}`, { privateKey: privateKey.startsWith('nsec') ? '[REDACTED]' : privateKey, error });
    }
}
/**
 * Validates a hex key format (private or public)
 * @param hex The hex string to validate
 * @param keyType Optional key type for more specific validation
 */
export function validateHexKey(hex, keyType) {
    if (!hex || typeof hex !== 'string') {
        throw new NostrError('Hex key must be a non-empty string');
    }
    const expectedLength = keyType === 'public' ? 64 : keyType === 'private' ? 64 : 64;
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(hex)) {
        throw new NostrError('Invalid hex format - must contain only hexadecimal characters');
    }
    if (hex.length !== expectedLength) {
        throw new NostrError(`Invalid hex key length - expected ${expectedLength} characters, got ${hex.length}`);
    }
}
/**
 * Validates a nostr key format (nsec or npub)
 * @param key The nostr key to validate
 * @param expectedType Optional expected type ('nsec' or 'npub')
 */
export function validateNostrKey(key, expectedType) {
    try {
        const { type } = nip19.decode(key);
        if (expectedType && type !== expectedType) {
            throw new NostrError(`Expected ${expectedType} but got ${type}`);
        }
        if (type !== 'nsec' && type !== 'npub') {
            throw new NostrError(`Invalid nostr key type: ${type}`);
        }
    }
    catch (error) {
        if (error instanceof NostrError) {
            throw error;
        }
        throw new NostrError(`Invalid nostr key format: ${error.message}`, { key: key.substring(0, 10) + '...', error });
    }
}
