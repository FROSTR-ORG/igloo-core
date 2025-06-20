import { IglooCore, igloo, NodeError } from '../src/index';
import { generateNostrKeyPair, nsecToHex, hexToNsec } from '../src/nostr';

describe('IglooCore Convenience Class', () => {
  const testSecretKey = 'a'.repeat(64); // Valid 64-char hex string

  describe('Constructor and default instance', () => {
    it('should create instance with default relays', () => {
      const core = new IglooCore();
      
      expect(core).toBeInstanceOf(IglooCore);
      expect(core.defaultRelays).toEqual([
        'wss://relay.damus.io',
        'wss://relay.primal.net'
      ]);
    });

    it('should create instance with custom relays', () => {
      const customRelays = ['wss://custom.relay.com', 'wss://another.relay.com'];
      const core = new IglooCore(customRelays);
      
      expect(core.defaultRelays).toEqual(customRelays);
    });

    it('should have default igloo instance available', () => {
      expect(igloo).toBeInstanceOf(IglooCore);
      expect(igloo.defaultRelays).toEqual([
        'wss://relay.damus.io',
        'wss://relay.primal.net'
      ]);
    });
  });

  describe('generateKeyset method', () => {
    it('should generate a keyset using the convenience method', async () => {
      const core = new IglooCore();
      const keyset = await core.generateKeyset(2, 3, testSecretKey);
      
      expect(keyset).toHaveProperty('groupCredential');
      expect(keyset).toHaveProperty('shareCredentials');
      expect(keyset.shareCredentials).toHaveLength(3);
    });

    it('should handle errors from keyset generation', async () => {
      const core = new IglooCore();
      
      await expect(core.generateKeyset(5, 3, testSecretKey)).rejects.toThrow();
    });
  });

  describe('recoverSecret method', () => {
    it('should recover secret using the convenience method', async () => {
      const core = new IglooCore();
      const keyset = await core.generateKeyset(2, 3, testSecretKey);
      
      const recovered = await core.recoverSecret(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 2)
      );
      
      expect(typeof recovered).toBe('string');
      expect(recovered).toMatch(/^nsec1[a-z0-9]+$/);
    });
  });

  describe('getShareInfo method', () => {
    it('should get share information using the convenience method', async () => {
      const core = new IglooCore();
      const keyset = await core.generateKeyset(2, 3, testSecretKey);
      
      const shareInfo = await core.getShareInfo(keyset.shareCredentials[0]);
      
      expect(shareInfo).toHaveProperty('idx');
      expect(typeof shareInfo.idx).toBe('number');
      expect(shareInfo.idx).toBeGreaterThanOrEqual(0);
      expect(shareInfo.idx).toBeLessThan(3);
    });
  });

  describe('generateKeys method', () => {
    it('should generate nostr keys using the convenience method', async () => {
      const core = new IglooCore();
      const keys = await core.generateKeys();
      
      expect(keys).toHaveProperty('nsec');
      expect(keys).toHaveProperty('npub');
      expect(keys).toHaveProperty('hexPrivateKey');
      expect(keys).toHaveProperty('hexPublicKey');
      
      expect(keys.nsec).toMatch(/^nsec1[a-z0-9]+$/);
      expect(keys.npub).toMatch(/^npub1[a-z0-9]+$/);
      expect(keys.hexPrivateKey).toMatch(/^[a-f0-9]{64}$/);
      expect(keys.hexPublicKey).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('convertKey method', () => {
    it('should convert nsec to hex', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const hexKey = await core.convertKey(keyPair.nsec, 'hex');
      
      expect(hexKey).toBe(keyPair.hexPrivateKey);
      expect(hexKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should convert hex to nsec', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const nsecKey = await core.convertKey(keyPair.hexPrivateKey, 'nsec');
      
      expect(nsecKey).toBe(keyPair.nsec);
      expect(nsecKey).toMatch(/^nsec1[a-z0-9]+$/);
    });

    it('should convert npub to hex', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const hexKey = await core.convertKey(keyPair.npub, 'hex');
      
      expect(hexKey).toBe(keyPair.hexPublicKey);
      expect(hexKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should convert hex to npub', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const npubKey = await core.convertKey(keyPair.hexPublicKey, 'npub');
      
      expect(npubKey).toBe(keyPair.npub);
      expect(npubKey).toMatch(/^npub1[a-z0-9]+$/);
    });

    it('should throw error for invalid conversion', async () => {
      const core = new IglooCore();
      
      await expect(core.convertKey('invalid', 'hex')).rejects.toThrow();
      await expect(core.convertKey('nsec123', 'invalid' as any)).rejects.toThrow();
    });
  });

  describe('derivePublicKey method', () => {
    it('should derive public key from nsec', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const derived = await core.derivePublicKey(keyPair.nsec);
      
      expect(derived.npub).toBe(keyPair.npub);
      expect(derived.hexPublicKey).toBe(keyPair.hexPublicKey);
    });

    it('should derive public key from hex private key', async () => {
      const core = new IglooCore();
      const keyPair = generateNostrKeyPair();
      
      const derived = await core.derivePublicKey(keyPair.hexPrivateKey);
      
      expect(derived.npub).toBe(keyPair.npub);
      expect(derived.hexPublicKey).toBe(keyPair.hexPublicKey);
    });

    it('should throw error for invalid private key', async () => {
      const core = new IglooCore();
      
      await expect(core.derivePublicKey('invalid')).rejects.toThrow();
      await expect(core.derivePublicKey(generateNostrKeyPair().npub)).rejects.toThrow();
    });
  });

  describe('Pubkey utility methods', () => {
    it('should normalize pubkey by removing 02/03 prefix', async () => {
      const core = new IglooCore();
      const compressed = '02abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const expected = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      
      const result = await core.normalizePubkey(compressed);
      expect(result).toBe(expected);
    });

    it('should add prefix to pubkey if missing', async () => {
      const core = new IglooCore();
      const uncompressed = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const expected = '02abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      
      const result = await core.addPubkeyPrefix(uncompressed);
      expect(result).toBe(expected);
    });

    it('should add custom prefix to pubkey', async () => {
      const core = new IglooCore();
      const uncompressed = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const expected = '03abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      
      const result = await core.addPubkeyPrefix(uncompressed, '03');
      expect(result).toBe(expected);
    });

    it('should compare pubkeys after normalization', async () => {
      const core = new IglooCore();
      const compressed = '02abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const uncompressed = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      
      const result = await core.comparePubkeys(compressed, uncompressed);
      expect(result).toBe(true);
    });

    it('should return false for different pubkeys', async () => {
      const core = new IglooCore();
      const pubkey1 = '02abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const pubkey2 = '03efgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678';
      
      const result = await core.comparePubkeys(pubkey1, pubkey2);
      expect(result).toBe(false);
    });

    it('should extract self pubkey from credentials with warnings', async () => {
      const core = new IglooCore();
      
      const result = await core.extractSelfPubkey('', '', { suppressWarnings: false });
      
      expect(result).toHaveProperty('pubkey');
      expect(result).toHaveProperty('warnings');
      expect(result.pubkey).toBeNull();
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should extract self pubkey with suppressed warnings', async () => {
      const core = new IglooCore();
      
      const result = await core.extractSelfPubkey('', '', { suppressWarnings: true });
      
      expect(result).toHaveProperty('pubkey');
      expect(result).toHaveProperty('warnings');
      expect(result.pubkey).toBeNull();
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings.length).toBe(0); // Warnings should be suppressed
    });
  });

  describe('Method chaining and integration', () => {
    it('should work with method chaining patterns', async () => {
      const core = new IglooCore();
      
      // Test a complete workflow
      const keyset = await core.generateKeyset(2, 3, testSecretKey);
      const shareInfo = await core.getShareInfo(keyset.shareCredentials[0]);
      const recovered = await core.recoverSecret(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 2)
      );
      const nostrKeys = await core.generateKeys();
      const convertedHex = await core.convertKey(nostrKeys.nsec, 'hex');
      const derivedPublic = await core.derivePublicKey(nostrKeys.nsec);
      
      expect(shareInfo.idx).toBeGreaterThanOrEqual(0);
      expect(recovered).toMatch(/^nsec1[a-z0-9]+$/);
      expect(convertedHex).toBe(nostrKeys.hexPrivateKey);
      expect(derivedPublic.npub).toBe(nostrKeys.npub);
    });

    it('should work with pubkey utilities in integration workflow', async () => {
      const core = new IglooCore();
      
      // Test pubkey utilities integration
      const testPubkey = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
      const compressed = await core.addPubkeyPrefix(testPubkey);
      const normalized = await core.normalizePubkey(compressed);
      const isMatch = await core.comparePubkeys(compressed, normalized);
      
      expect(compressed).toBe('02' + testPubkey);
      expect(normalized).toBe(testPubkey);
      expect(isMatch).toBe(true);
    });

    it('should maintain consistent state across calls', async () => {
      const core = new IglooCore(['wss://test.relay.com']);
      
      // Relays should stay consistent
      expect(core.defaultRelays).toEqual(['wss://test.relay.com']);
      
      // Multiple calls should work consistently
      const keys1 = await core.generateKeys();
      const keys2 = await core.generateKeys();
      
      expect(keys1.nsec).not.toBe(keys2.nsec); // Should be different
      expect(keys1.npub).not.toBe(keys2.npub); // Should be different
      
      // But conversion should work for both
      const hex1 = await core.convertKey(keys1.nsec, 'hex');
      const hex2 = await core.convertKey(keys2.nsec, 'hex');
      
      expect(hex1).toBe(keys1.hexPrivateKey);
      expect(hex2).toBe(keys2.hexPrivateKey);
    });
  });

  describe('Error handling', () => {
    it('should handle and propagate errors appropriately', async () => {
      const core = new IglooCore();
      
      // Test error propagation from underlying functions
      await expect(core.generateKeyset(0, 3, testSecretKey)).rejects.toThrow();
      await expect(core.generateKeyset(2, 3, '')).rejects.toThrow();
      await expect(core.getShareInfo('invalid')).rejects.toThrow();
      await expect(core.recoverSecret('invalid', ['invalid'])).rejects.toThrow();
      await expect(core.convertKey('invalid', 'hex')).rejects.toThrow();
      await expect(core.derivePublicKey('invalid')).rejects.toThrow();
    });
  });

  describe('peer management integration', () => {
    let mockNode: any;

    beforeEach(() => {
      // Mock BifrostNode
      mockNode = {
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        removeAllListeners: jest.fn(),
        client: { connected: true },
        req: {
          ping: jest.fn().mockResolvedValue({
            ok: true,
            data: ['peer1_pubkey']
          })
        }
      };
    });

    it('should create peer manager through IglooCore', async () => {
      const core = new IglooCore();
      
      // With invalid credentials, the new implementation throws errors
      await expect(
        core.createPeerManager(mockNode, 'group_cred', 'share_cred')
      ).rejects.toThrow(NodeError);
    });

    it('should extract peers through IglooCore', async () => {
      const core = new IglooCore();
      
      // With invalid credentials, the new implementation throws errors
      await expect(
        core.extractPeers('group_cred', 'share_cred')
      ).rejects.toThrow(NodeError);
    });

    it('should ping peers through IglooCore', async () => {
      const core = new IglooCore();
      const onlinePeers = await core.pingPeers(mockNode);
      
      expect(Array.isArray(onlinePeers)).toBe(true);
    });

    it('should check peer status through IglooCore', async () => {
      const core = new IglooCore();
      
      // With invalid credentials, the new implementation throws errors
      await expect(
        core.checkPeerStatus(mockNode, 'group_cred', 'share_cred')
      ).rejects.toThrow(NodeError);
    });

    it('should handle peer management errors gracefully', async () => {
      const core = new IglooCore();
      
      // The new implementation throws NodeError for invalid credentials
      await expect(
        core.extractPeers('group_cred', 'share_cred')
      ).rejects.toThrow(NodeError);
      
      // Test that error handling works by checking the method exists
      expect(typeof core.extractPeers).toBe('function');
    });

    it('should work with created nodes', async () => {
      const core = new IglooCore(['wss://relay.test.com']);
      
      // This would normally work with real credentials
      // Here we're just testing the method exists and returns expected types
      expect(typeof core.createPeerManager).toBe('function');
      expect(typeof core.extractPeers).toBe('function');
      expect(typeof core.pingPeers).toBe('function');
      expect(typeof core.checkPeerStatus).toBe('function');
    });
  });
}); 