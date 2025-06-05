import { 
  generateKeysetWithSecret,
  recoverSecretKeyFromCredentials,
  getShareDetails,
  getShareDetailsWithGroup,
  decodeShare,
  decodeGroup,
  validateKeysetParams,
  validateSecretKey,
  validateSharesCompatibility
} from '../src/keyset';
import { KeysetError, RecoveryError } from '../src/types';

describe('Keyset Management', () => {
  const testSecretKey = 'a'.repeat(64); // Valid 64-char hex string

  describe('generateKeysetWithSecret', () => {
    it('should generate a valid 2-of-3 keyset', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);

      expect(keyset).toHaveProperty('groupCredential');
      expect(keyset).toHaveProperty('shareCredentials');
      expect(typeof keyset.groupCredential).toBe('string');
      expect(Array.isArray(keyset.shareCredentials)).toBe(true);
      expect(keyset.shareCredentials).toHaveLength(3);
      expect(keyset.groupCredential.length).toBeGreaterThan(0);
      keyset.shareCredentials.forEach(share => {
        expect(typeof share).toBe('string');
        expect(share.length).toBeGreaterThan(0);
      });
    });

    it('should generate different keysets for different thresholds', () => {
      const keyset2of3 = generateKeysetWithSecret(2, 3, testSecretKey);
      const keyset3of5 = generateKeysetWithSecret(3, 5, testSecretKey);

      expect(keyset2of3.shareCredentials).toHaveLength(3);
      expect(keyset3of5.shareCredentials).toHaveLength(5);
      expect(keyset2of3.groupCredential).not.toBe(keyset3of5.groupCredential);
    });

    it('should throw error for invalid threshold (threshold > total)', () => {
      expect(() => generateKeysetWithSecret(5, 3, testSecretKey)).toThrow(KeysetError);
    });

    it('should throw error for threshold of 0', () => {
      expect(() => generateKeysetWithSecret(0, 3, testSecretKey)).toThrow(KeysetError);
    });

    it('should throw error for empty secret key', () => {
      expect(() => generateKeysetWithSecret(2, 3, '')).toThrow(KeysetError);
    });

    it('should throw error for invalid secret key format', () => {
      expect(() => generateKeysetWithSecret(2, 3, 'invalid')).toThrow(KeysetError);
      expect(() => generateKeysetWithSecret(2, 3, 'x'.repeat(64))).toThrow(KeysetError);
    });
  });

  describe('recoverSecretKeyFromCredentials', () => {
    it('should recover the original secret from threshold shares', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      // Test with minimum threshold (2 shares)
      const recovered = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 2)
      );

      expect(typeof recovered).toBe('string');
      expect(recovered).toMatch(/^nsec1[a-z0-9]+$/);
    });

    it('should recover the same secret with different share combinations', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      const recovered1 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        [keyset.shareCredentials[0], keyset.shareCredentials[1]]
      );
      
      const recovered2 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        [keyset.shareCredentials[0], keyset.shareCredentials[2]]
      );
      
      const recovered3 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        [keyset.shareCredentials[1], keyset.shareCredentials[2]]
      );

      expect(recovered1).toBe(recovered2);
      expect(recovered2).toBe(recovered3);
    });

    it('should work with more shares than threshold', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      const recovered = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials // All 3 shares
      );

      expect(typeof recovered).toBe('string');
      expect(recovered).toMatch(/^nsec1[a-z0-9]+$/);
    });

    it('should throw error with insufficient shares', () => {
      const keyset = generateKeysetWithSecret(3, 5, testSecretKey);
      
      expect(() => recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 2) // Only 2 shares for 3-of-5
      )).toThrow(RecoveryError);
    });

    it('should throw error with invalid group credential', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      expect(() => recoverSecretKeyFromCredentials(
        'invalid-group',
        keyset.shareCredentials.slice(0, 2)
      )).toThrow(KeysetError);
    });

    it('should throw error with invalid share credentials', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      expect(() => recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        ['invalid-share1', 'invalid-share2']
      )).toThrow(KeysetError);
    });

    it('should throw error with empty shares array', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      expect(() => recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        []
      )).toThrow(RecoveryError);
    });
  });

  describe('getShareDetails', () => {
    it('should return correct details for each share', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      keyset.shareCredentials.forEach((share, index) => {
        const details = getShareDetails(share);
        
        expect(details).toHaveProperty('idx');
        expect(typeof details.idx).toBe('number');
        expect(details.idx).toBeGreaterThanOrEqual(0);
        expect(details.idx).toBeLessThan(3);
        
        // Test full details with group
        const fullDetails = getShareDetailsWithGroup(share, keyset.groupCredential);
        expect(fullDetails).toHaveProperty('idx');
        expect(fullDetails).toHaveProperty('threshold');
        expect(fullDetails).toHaveProperty('totalMembers');
        expect(fullDetails.threshold).toBe(2);
        expect(fullDetails.totalMembers).toBe(3);
      });
    });

    it('should have unique indices for all shares', () => {
      const keyset = generateKeysetWithSecret(3, 5, testSecretKey);
      
      const indices = keyset.shareCredentials.map(share => 
        getShareDetails(share).idx
      );
      
      const uniqueIndices = new Set(indices);
      expect(uniqueIndices.size).toBe(5); // All indices should be unique
    });

    it('should throw error for invalid share credential', () => {
      expect(() => getShareDetails('invalid')).toThrow(KeysetError);
      expect(() => getShareDetails('')).toThrow(KeysetError);
    });
  });

  describe('getShareDetailsWithGroup', () => {
    it('should return correct details with group info', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      const details = getShareDetailsWithGroup(
        keyset.shareCredentials[0],
        keyset.groupCredential
      );
      
      expect(details).toHaveProperty('idx');
      expect(details).toHaveProperty('threshold');
      expect(details).toHaveProperty('totalMembers');
      expect(details.threshold).toBe(2);
      expect(details.totalMembers).toBe(3);
    });

    it('should throw error for mismatched group and share', () => {
      const keyset1 = generateKeysetWithSecret(2, 3, testSecretKey);
      const keyset2 = generateKeysetWithSecret(2, 3, 'b'.repeat(64));
      
      expect(() => getShareDetailsWithGroup(
        keyset1.shareCredentials[0],
        keyset2.groupCredential
      )).toThrow(KeysetError);
    });
  });

  describe('decodeShare and decodeGroup', () => {
    it('should decode share credentials', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      keyset.shareCredentials.forEach(share => {
        const decoded = decodeShare(share);
        expect(decoded).toBeDefined();
        expect(typeof decoded).toBe('object');
      });
    });

    it('should decode group credentials', () => {
      const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
      
      const decoded = decodeGroup(keyset.groupCredential);
      expect(decoded).toBeDefined();
      expect(typeof decoded).toBe('object');
    });

    it('should throw error for invalid credentials', () => {
      expect(() => decodeShare('invalid')).toThrow(KeysetError);
      expect(() => decodeGroup('invalid')).toThrow(KeysetError);
    });
  });

  describe('Validation functions', () => {
    describe('validateKeysetParams', () => {
      it('should validate correct parameters', () => {
        expect(() => validateKeysetParams({ threshold: 2, totalMembers: 3 })).not.toThrow();
        expect(() => validateKeysetParams({ threshold: 3, totalMembers: 5 })).not.toThrow();
        expect(() => validateKeysetParams({ threshold: 1, totalMembers: 1 })).not.toThrow();
      });

      it('should throw error for invalid parameters', () => {
        expect(() => validateKeysetParams({ threshold: 5, totalMembers: 3 })).toThrow(KeysetError);
        expect(() => validateKeysetParams({ threshold: 0, totalMembers: 3 })).toThrow(KeysetError);
        expect(() => validateKeysetParams({ threshold: -1, totalMembers: 3 })).toThrow(KeysetError);
        expect(() => validateKeysetParams({ threshold: 2, totalMembers: 0 })).toThrow(KeysetError);
      });
    });

    describe('validateSecretKey', () => {
      it('should validate correct secret keys', () => {
        expect(() => validateSecretKey(testSecretKey)).not.toThrow();
        expect(() => validateSecretKey('f'.repeat(64))).not.toThrow();
      });

      it('should throw error for invalid secret keys', () => {
        expect(() => validateSecretKey('')).toThrow(KeysetError);
        expect(() => validateSecretKey('invalid')).toThrow(KeysetError);
        expect(() => validateSecretKey('x'.repeat(64))).toThrow(KeysetError);
        expect(() => validateSecretKey('a'.repeat(63))).toThrow(KeysetError);
      });
    });

    describe('validateSharesCompatibility', () => {
      it('should validate compatible shares', () => {
        const keyset = generateKeysetWithSecret(2, 3, testSecretKey);
        const shares = keyset.shareCredentials.map(share => decodeShare(share));
        
        expect(() => validateSharesCompatibility(shares)).not.toThrow();
      });

      it('should throw error for empty shares array', () => {
        expect(() => validateSharesCompatibility([])).toThrow(KeysetError);
      });
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end for multiple keyset sizes', () => {
      const testCases = [
        { threshold: 1, total: 1 },
        { threshold: 2, total: 3 },
        { threshold: 3, total: 5 },
        { threshold: 5, total: 7 }
      ];

      testCases.forEach(({ threshold, total }) => {
        const keyset = generateKeysetWithSecret(threshold, total, testSecretKey);
        
        expect(keyset.shareCredentials).toHaveLength(total);
        
        // Test recovery with exact threshold
        const recovered = recoverSecretKeyFromCredentials(
          keyset.groupCredential,
          keyset.shareCredentials.slice(0, threshold)
        );
        
        expect(recovered).toMatch(/^nsec1[a-z0-9]+$/);
        
        // Test share details
        keyset.shareCredentials.forEach(share => {
          const details = getShareDetailsWithGroup(share, keyset.groupCredential);
          expect(details.threshold).toBe(threshold);
          expect(details.totalMembers).toBe(total);
        });
      });
    });

    it('should maintain consistency across multiple operations', () => {
      const keyset = generateKeysetWithSecret(3, 5, testSecretKey);
      
      // Test multiple recoveries
      const recovered1 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 3)
      );
      
      const recovered2 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials.slice(1, 4)
      );
      
      const recovered3 = recoverSecretKeyFromCredentials(
        keyset.groupCredential,
        keyset.shareCredentials.slice(2, 5)
      );
      
      expect(recovered1).toBe(recovered2);
      expect(recovered2).toBe(recovered3);
      
      // Test share consistency
      const details = keyset.shareCredentials.map(share => getShareDetailsWithGroup(share, keyset.groupCredential));
      details.forEach(detail => {
        expect(detail.threshold).toBe(3);
        expect(detail.totalMembers).toBe(5);
      });
      
      // Test unique indices
      const indices = details.map(d => d.idx);
      const uniqueIndices = new Set(indices);
      expect(uniqueIndices.size).toBe(5);
    });
  });
}); 