import { 
  generateNostrKeyPair,
  nsecToHex,
  hexToNsec,
  npubToHex,
  hexToNpub,
  derivePublicKey,
  validateHexKey,
  validateNostrKey
} from '../src/nostr';
import { NostrError } from '../src/types';

describe('Nostr Utilities', () => {
  describe('generateNostrKeyPair', () => {
    it('should generate a valid nostr key pair', () => {
      const keyPair = generateNostrKeyPair();

      expect(keyPair).toHaveProperty('nsec');
      expect(keyPair).toHaveProperty('npub');
      expect(keyPair).toHaveProperty('hexPrivateKey');
      expect(keyPair).toHaveProperty('hexPublicKey');

      // Validate formats
      expect(keyPair.nsec).toMatch(/^nsec1[a-z0-9]+$/);
      expect(keyPair.npub).toMatch(/^npub1[a-z0-9]+$/);
      expect(keyPair.hexPrivateKey).toMatch(/^[a-f0-9]{64}$/);
      expect(keyPair.hexPublicKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique key pairs', () => {
      const keyPair1 = generateNostrKeyPair();
      const keyPair2 = generateNostrKeyPair();

      expect(keyPair1.nsec).not.toBe(keyPair2.nsec);
      expect(keyPair1.npub).not.toBe(keyPair2.npub);
      expect(keyPair1.hexPrivateKey).not.toBe(keyPair2.hexPrivateKey);
      expect(keyPair1.hexPublicKey).not.toBe(keyPair2.hexPublicKey);
    });
  });

  describe('nsecToHex and hexToNsec', () => {
    it('should convert nsec to hex and back', () => {
      const keyPair = generateNostrKeyPair();
      
      const convertedHex = nsecToHex(keyPair.nsec);
      expect(convertedHex).toBe(keyPair.hexPrivateKey);
      
      const convertedNsec = hexToNsec(convertedHex);
      expect(convertedNsec).toBe(keyPair.nsec);
    });

    it('should throw error for invalid nsec format', () => {
      expect(() => nsecToHex('invalid')).toThrow(NostrError);
      expect(() => nsecToHex('npub1abc')).toThrow(NostrError);
      expect(() => nsecToHex('')).toThrow(NostrError);
    });

    it('should throw error for invalid hex format', () => {
      expect(() => hexToNsec('invalid')).toThrow(NostrError);
      expect(() => hexToNsec('123')).toThrow(NostrError);
      expect(() => hexToNsec('')).toThrow(NostrError);
      expect(() => hexToNsec('x'.repeat(64))).toThrow(NostrError);
    });
  });

  describe('npubToHex and hexToNpub', () => {
    it('should convert npub to hex and back', () => {
      const keyPair = generateNostrKeyPair();
      
      const convertedHex = npubToHex(keyPair.npub);
      expect(convertedHex).toBe(keyPair.hexPublicKey);
      
      const convertedNpub = hexToNpub(convertedHex);
      expect(convertedNpub).toBe(keyPair.npub);
    });

    it('should throw error for invalid npub format', () => {
      expect(() => npubToHex('invalid')).toThrow(NostrError);
      expect(() => npubToHex('nsec1abc')).toThrow(NostrError);
      expect(() => npubToHex('')).toThrow(NostrError);
    });

    it('should throw error for invalid hex format', () => {
      expect(() => hexToNpub('invalid')).toThrow(NostrError);
      expect(() => hexToNpub('123')).toThrow(NostrError);
      expect(() => hexToNpub('')).toThrow(NostrError);
      expect(() => hexToNpub('x'.repeat(64))).toThrow(NostrError);
    });
  });

  describe('derivePublicKey', () => {
    it('should derive public key from nsec format', () => {
      const keyPair = generateNostrKeyPair();
      const derived = derivePublicKey(keyPair.nsec);

      expect(derived.npub).toBe(keyPair.npub);
      expect(derived.hexPublicKey).toBe(keyPair.hexPublicKey);
    });

    it('should derive public key from hex format', () => {
      const keyPair = generateNostrKeyPair();
      const derived = derivePublicKey(keyPair.hexPrivateKey);

      expect(derived.npub).toBe(keyPair.npub);
      expect(derived.hexPublicKey).toBe(keyPair.hexPublicKey);
    });

    it('should throw error for invalid private key', () => {
      expect(() => derivePublicKey('invalid')).toThrow(NostrError);
      expect(() => derivePublicKey('')).toThrow(NostrError);
      expect(() => derivePublicKey('npub1abc')).toThrow(NostrError);
    });
  });

  describe('validateHexKey', () => {
    it('should validate correct hex keys', () => {
      const keyPair = generateNostrKeyPair();
      
      expect(() => validateHexKey(keyPair.hexPrivateKey)).not.toThrow();
      expect(() => validateHexKey(keyPair.hexPublicKey)).not.toThrow();
      expect(() => validateHexKey(keyPair.hexPrivateKey, 'private')).not.toThrow();
      expect(() => validateHexKey(keyPair.hexPublicKey, 'public')).not.toThrow();
    });

    it('should throw error for invalid hex keys', () => {
      expect(() => validateHexKey('')).toThrow(NostrError);
      expect(() => validateHexKey('invalid')).toThrow(NostrError);
      expect(() => validateHexKey('123')).toThrow(NostrError);
      expect(() => validateHexKey('x'.repeat(64))).toThrow(NostrError);
      expect(() => validateHexKey('a'.repeat(63))).toThrow(NostrError);
      expect(() => validateHexKey('a'.repeat(65))).toThrow(NostrError);
    });
  });

  describe('validateNostrKey', () => {
    it('should validate correct nostr keys', () => {
      const keyPair = generateNostrKeyPair();
      
      expect(() => validateNostrKey(keyPair.nsec)).not.toThrow();
      expect(() => validateNostrKey(keyPair.npub)).not.toThrow();
      expect(() => validateNostrKey(keyPair.nsec, 'nsec')).not.toThrow();
      expect(() => validateNostrKey(keyPair.npub, 'npub')).not.toThrow();
    });

    it('should throw error for wrong key types', () => {
      const keyPair = generateNostrKeyPair();
      
      expect(() => validateNostrKey(keyPair.nsec, 'npub')).toThrow(NostrError);
      expect(() => validateNostrKey(keyPair.npub, 'nsec')).toThrow(NostrError);
    });

    it('should throw error for invalid nostr keys', () => {
      expect(() => validateNostrKey('')).toThrow(NostrError);
      expect(() => validateNostrKey('invalid')).toThrow(NostrError);
      expect(() => validateNostrKey('nsec')).toThrow(NostrError);
      expect(() => validateNostrKey('npub')).toThrow(NostrError);
      expect(() => validateNostrKey('nsec1')).toThrow(NostrError);
      expect(() => validateNostrKey('abc123')).toThrow(NostrError);
    });
  });

  describe('Integration tests', () => {
    it('should maintain consistency across all conversion functions', () => {
      const keyPair = generateNostrKeyPair();
      
      // Test complete round trip
      const hexFromNsec = nsecToHex(keyPair.nsec);
      const nsecFromHex = hexToNsec(hexFromNsec);
      const hexFromNpub = npubToHex(keyPair.npub);
      const npubFromHex = hexToNpub(hexFromNpub);
      
      expect(nsecFromHex).toBe(keyPair.nsec);
      expect(npubFromHex).toBe(keyPair.npub);
      expect(hexFromNsec).toBe(keyPair.hexPrivateKey);
      expect(hexFromNpub).toBe(keyPair.hexPublicKey);
    });

    it('should derive the same public key from private key in different formats', () => {
      const keyPair = generateNostrKeyPair();
      
      const derivedFromNsec = derivePublicKey(keyPair.nsec);
      const derivedFromHex = derivePublicKey(keyPair.hexPrivateKey);
      
      expect(derivedFromNsec.npub).toBe(derivedFromHex.npub);
      expect(derivedFromNsec.hexPublicKey).toBe(derivedFromHex.hexPublicKey);
      expect(derivedFromNsec.npub).toBe(keyPair.npub);
      expect(derivedFromNsec.hexPublicKey).toBe(keyPair.hexPublicKey);
    });
  });
}); 