import {
  validateNsec,
  validateHexPrivkey,
  validateShare,
  validateGroup,
  validateRelay,
  validateBfcred,
  validateCredentialFormat,
  validateRelayList,
  validateCredentialSet,
  validateMinimumShares,
  validateWithOptions,
  VALIDATION_CONSTANTS,
  BifrostValidationError,
  NostrValidationError
} from '../src';

describe('Validation Functions', () => {
  describe('validateNsec', () => {
    it('should validate valid nsec keys', () => {
      const validNsec = 'nsec14jlf7xm0gg7neglzfd0hu64k855954atu3zw3sande0drs48g4cq42dcrl';
      const result = validateNsec(validNsec);
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should reject empty nsec', () => {
      const result = validateNsec('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Nsec is required');
    });

    it('should reject invalid nsec format', () => {
      const result = validateNsec('invalid_nsec');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid nsec format');
    });

    it('should reject npub when expecting nsec', () => {
      const npub = 'npub1w0rthyjyp2f5gful0gm2500pwyxfrx93a85289f2qnyqnofdnffqllp8wj';
      const result = validateNsec(npub);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid nsec format');
    });

    it('should handle whitespace', () => {
      const result = validateNsec('   ');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Nsec is required');
    });
  });

  describe('validateHexPrivkey', () => {
    it('should validate valid hex private keys', () => {
      const validHex = 'a'.repeat(64);
      const result = validateHexPrivkey(validHex);
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should validate mixed case hex', () => {
      const mixedCaseHex = 'aAbBcCdDeEfF0123456789abcdef0123456789ABCDEF0123456789abcdef0123';
      const result = validateHexPrivkey(mixedCaseHex);
      expect(result.isValid).toBe(true);
    });

    it('should reject empty hex key', () => {
      const result = validateHexPrivkey('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Private key is required');
    });

    it('should reject short hex keys', () => {
      const shortHex = 'a'.repeat(32);
      const result = validateHexPrivkey(shortHex);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid hex private key format (should be 64 hex characters)');
    });

    it('should reject long hex keys', () => {
      const longHex = 'a'.repeat(128);
      const result = validateHexPrivkey(longHex);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid hex private key format (should be 64 hex characters)');
    });

    it('should reject invalid hex characters', () => {
      const invalidHex = 'g'.repeat(64);
      const result = validateHexPrivkey(invalidHex);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid hex private key format (should be 64 hex characters)');
    });
  });

  describe('validateShare', () => {
    it('should validate valid bfshare format', () => {
      // Generate a mock bfshare with proper length and format (175 chars total)
      const validShare = 'bfshare1' + 'a'.repeat(167);
      const result = validateShare(validShare);
      expect(result.isValid).toBe(true);
    });

    it('should reject empty share', () => {
      const result = validateShare('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Share is required');
    });

    it('should reject wrong prefix', () => {
      const wrongPrefix = 'wrongprefix1' + 'a'.repeat(180);
      const result = validateShare(wrongPrefix);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid share format (should start with bfshare)');
    });

    it('should reject shares that are too short', () => {
      const shortShare = 'bfshare1abc';
      const result = validateShare(shortShare);
      expect(result.isValid).toBe(false);
      expect(result.message?.includes('Invalid share length')).toBe(true);
    });

    it('should reject invalid bech32m characters', () => {
      const invalidChars = 'bfshare1' + 'a'.repeat(170) + 'XYZ'; // Contains invalid uppercase chars
      const result = validateShare(invalidChars);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid share format - must be in bech32m format');
    });
  });

  describe('validateGroup', () => {
    it('should validate valid bfgroup format', () => {
      const validGroup = 'bfgroup1' + 'a'.repeat(250);
      const result = validateGroup(validGroup);
      expect(result.isValid).toBe(true);
    });

    it('should reject empty group', () => {
      const result = validateGroup('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Group is required');
    });

    it('should reject wrong prefix', () => {
      const wrongPrefix = 'wrongprefix1' + 'a'.repeat(250);
      const result = validateGroup(wrongPrefix);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid group format (should start with bfgroup)');
    });

    it('should reject groups that are too short', () => {
      const shortGroup = 'bfgroup1abc';
      const result = validateGroup(shortGroup);
      expect(result.isValid).toBe(false);
      expect(result.message?.includes('Invalid group length')).toBe(true);
    });

    it('should reject groups that are too long', () => {
      const longGroup = 'bfgroup1' + 'a'.repeat(3000);
      const result = validateGroup(longGroup);
      expect(result.isValid).toBe(false);
      expect(result.message?.includes('Group credential too long')).toBe(true);
    });
  });

  describe('validateRelay', () => {
    it('should validate and normalize wss URLs', () => {
      const result = validateRelay('wss://relay.damus.io');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('wss://relay.damus.io');
    });

    it('should normalize http to wss', () => {
      const result = validateRelay('http://relay.damus.io');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('wss://relay.damus.io');
    });

    it('should normalize https to wss', () => {
      const result = validateRelay('https://relay.damus.io');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('wss://relay.damus.io');
    });

    it('should add wss protocol when missing', () => {
      const result = validateRelay('relay.damus.io');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('wss://relay.damus.io');
    });

    it('should remove trailing slash', () => {
      const result = validateRelay('wss://relay.damus.io/');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('wss://relay.damus.io');
    });

    it('should accept ws protocol', () => {
      const result = validateRelay('ws://localhost:8080');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('ws://localhost:8080');
    });

    it('should reject empty relay', () => {
      const result = validateRelay('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Relay URL is required');
    });

    it('should reject invalid URLs', () => {
      const result = validateRelay('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid relay URL format');
    });
  });

  describe('validateBfcred', () => {
    it('should validate valid bfcred format', () => {
      const validCred = 'bfcred1' + 'a'.repeat(450);
      const result = validateBfcred(validCred);
      expect(result.isValid).toBe(true);
    });

    it('should reject empty credential', () => {
      const result = validateBfcred('');
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Credential string is required');
    });

    it('should reject wrong prefix', () => {
      const wrongPrefix = 'wrongprefix1' + 'a'.repeat(400);
      const result = validateBfcred(wrongPrefix);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid credential format (should start with bfcred)');
    });

    it('should reject credentials that are too short', () => {
      const shortCred = 'bfcred1abc';
      const result = validateBfcred(shortCred);
      expect(result.isValid).toBe(false);
      expect(result.message?.includes('Invalid credential length')).toBe(true);
    });

    it('should reject credentials that are too long', () => {
      const longCred = 'bfcred1' + 'a'.repeat(5000);
      const result = validateBfcred(longCred);
      expect(result.isValid).toBe(false);
      expect(result.message?.includes('Credential string too long')).toBe(true);
    });
  });

  describe('validateCredentialFormat', () => {
    it('should route to correct validator for share', () => {
      const result = validateCredentialFormat('bfshare1' + 'a'.repeat(167), 'share');
      expect(result.isValid).toBe(true);
    });

    it('should route to correct validator for group', () => {
      const result = validateCredentialFormat('bfgroup1' + 'a'.repeat(250), 'group');
      expect(result.isValid).toBe(true);
    });

    it('should route to correct validator for cred', () => {
      const result = validateCredentialFormat('bfcred1' + 'a'.repeat(450), 'cred');
      expect(result.isValid).toBe(true);
    });

    it('should reject unknown credential type', () => {
      const result = validateCredentialFormat('test', 'unknown' as any);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Unknown credential type');
    });
  });

  describe('validateRelayList', () => {
    it('should validate list of valid relays', () => {
      const relays = ['wss://relay.damus.io', 'wss://relay.primal.net'];
      const result = validateRelayList(relays);
      expect(result.isValid).toBe(true);
      expect(result.validRelays).toEqual(relays);
      expect(result.normalizedRelays).toEqual(relays);
    });

    it('should normalize mixed relay formats', () => {
      const relays = ['relay.damus.io', 'https://relay.primal.net/'];
      const result = validateRelayList(relays);
      expect(result.isValid).toBe(true);
      expect(result.normalizedRelays).toEqual([
        'wss://relay.damus.io',
        'wss://relay.primal.net'
      ]);
    });

    it('should handle mixed valid and invalid relays', () => {
      const relays = ['wss://relay.damus.io', 'not-a-url'];
      const result = validateRelayList(relays);
      expect(result.isValid).toBe(true); // At least one valid relay
      expect(result.validRelays).toEqual(['wss://relay.damus.io']);
      expect(result.errors).toHaveLength(1);
    });

    it('should reject empty relay list', () => {
      const result = validateRelayList([]);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('At least one relay URL is required');
    });

    it('should reject all invalid relays', () => {
      const relays = ['not-a-url', 'also-not-a-url'];
      const result = validateRelayList(relays);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('No valid relay URLs provided');
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('validateCredentialSet', () => {
    const validCredentials = {
      group: 'bfgroup1' + 'a'.repeat(250),
      shares: ['bfshare1' + 'a'.repeat(167), 'bfshare1' + 'b'.repeat(167)],
      relays: ['wss://relay.damus.io', 'wss://relay.primal.net']
    };

    it('should validate complete valid credential set', () => {
      const result = validateCredentialSet(validCredentials);
      expect(result.isValid).toBe(true);
      expect(result.groupValid).toBe(true);
      expect(result.shareResults.every(r => r.isValid)).toBe(true);
      expect(result.relayResults.every(r => r.isValid)).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid group', () => {
      const invalidCredentials = {
        ...validCredentials,
        group: 'invalid-group'
      };
      const result = validateCredentialSet(invalidCredentials);
      expect(result.isValid).toBe(false);
      expect(result.groupValid).toBe(false);
      expect(result.errors.some(e => e.includes('Group:'))).toBe(true);
    });

    it('should detect invalid shares', () => {
      const invalidCredentials = {
        ...validCredentials,
        shares: ['invalid-share']
      };
      const result = validateCredentialSet(invalidCredentials);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Share 1:'))).toBe(true);
    });

    it('should detect invalid relays', () => {
      const invalidCredentials = {
        ...validCredentials,
        relays: ['not-a-url']
      };
      const result = validateCredentialSet(invalidCredentials);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Relay 1:'))).toBe(true);
    });

    it('should require at least one share', () => {
      const noSharesCredentials = {
        ...validCredentials,
        shares: []
      };
      const result = validateCredentialSet(noSharesCredentials);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateMinimumShares', () => {
    const validShares = ['bfshare1' + 'a'.repeat(167), 'bfshare1' + 'b'.repeat(167)];

    it('should validate sufficient valid shares', () => {
      const result = validateMinimumShares(validShares, 2);
      expect(result.isValid).toBe(true);
    });

    it('should allow more shares than required', () => {
      const result = validateMinimumShares(validShares, 1);
      expect(result.isValid).toBe(true);
    });

    it('should reject insufficient shares', () => {
      const result = validateMinimumShares(validShares, 3);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Not enough shares provided. Need at least 3 shares, got 2');
    });

    it('should reject empty shares array', () => {
      const result = validateMinimumShares([], 1);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('No shares provided');
    });

    it('should detect invalid share format', () => {
      const invalidShares = ['invalid-share'];
      const result = validateMinimumShares(invalidShares, 1);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Share 1 is invalid: Invalid share format (should start with bfshare)');
    });
  });

  describe('validateWithOptions', () => {
    const validCredentials = {
      group: 'bfgroup1' + 'a'.repeat(250),
      shares: ['bfshare1' + 'a'.repeat(167), 'bfshare1' + 'b'.repeat(167)],
      relays: ['relay.damus.io', 'https://relay.primal.net/']
    };

    it('should validate with default options', () => {
      const result = validateWithOptions(validCredentials);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should normalize relays when option is enabled', () => {
      const result = validateWithOptions(validCredentials, { normalizeRelays: true });
      expect(result.isValid).toBe(true);
      expect(result.relays).toEqual([
        'wss://relay.damus.io',
        'wss://relay.primal.net'
      ]);
    });

    it('should enforce minimum shares requirement', () => {
      const result = validateWithOptions(validCredentials, { requireMinShares: 3 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Not enough shares provided'))).toBe(true);
    });

    it('should accumulate multiple validation errors', () => {
      const invalidCredentials = {
        group: 'invalid-group',
        shares: ['invalid-share'],
        relays: ['not-a-url']
      };
      const result = validateWithOptions(invalidCredentials);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('VALIDATION_CONSTANTS', () => {
    it('should export validation constants', () => {
      expect(VALIDATION_CONSTANTS.SHARE_DATA_SIZE).toBe(100);
      expect(VALIDATION_CONSTANTS.BFSHARE_HRP).toBe('bfshare');
      expect(VALIDATION_CONSTANTS.BFGROUP_HRP).toBe('bfgroup');
      expect(VALIDATION_CONSTANTS.BFCRED_HRP).toBe('bfcred');
    });
  });

  describe('Error Classes', () => {
    it('should create BifrostValidationError', () => {
      const error = new BifrostValidationError('Test error', 'testField');
      expect(error.name).toBe('BifrostValidationError');
      expect(error.message).toBe('Test error');
      expect(error.field).toBe('testField');
      expect(error.code).toBe('BIFROST_VALIDATION_ERROR');
    });

    it('should create NostrValidationError', () => {
      const error = new NostrValidationError('Test nostr error');
      expect(error.name).toBe('NostrValidationError');
      expect(error.message).toBe('Test nostr error');
      expect(error.code).toBe('NOSTR_VALIDATION_ERROR');
    });
  });
}); 