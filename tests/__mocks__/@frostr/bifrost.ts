// Mock implementation of @frostr/bifrost for testing
export const PackageEncoder = {
  group: {
    encode: jest.fn().mockImplementation((group: any) => 
      `group-credential-${group.threshold}-${group.total_members}-${group.keysetId || 'unknown'}`
    ),
    decode: jest.fn().mockImplementation((credential: string) => {
      if (credential === 'invalid' || credential === 'invalid-group') {
        throw new Error('Invalid group credential');
      }
      // Extract threshold, total_members, and keysetId from the mock credential format
      const parts = credential.split('-');
      if (parts.length >= 5) {
        return {
          threshold: parseInt(parts[2]) || 2,
          total_members: parseInt(parts[3]) || 3,
          keysetId: parts[4]
        };
      }
      return { threshold: 2, total_members: 3, keysetId: 'unknown' };
    })
  },
  share: {
    encode: jest.fn().mockImplementation((share: any) => 
      `share-credential-${share.idx}-${share.keysetId || 'unknown'}`
    ),
    decode: jest.fn().mockImplementation((credential: string) => {
      if (credential === 'invalid' || credential === '' || credential.includes('invalid-share')) {
        throw new Error('Invalid share credential');
      }
      // Extract idx and keysetId from the mock credential format
      const parts = credential.split('-');
      if (parts.length >= 4) {
        return {
          idx: parseInt(parts[2]) || 0,
          keysetId: parts[3]
        };
      }
      return { idx: 0, keysetId: 'unknown' };
    })
  }
};

export default {
  PackageEncoder
}; 
/**
 * Fixture registry for credential strings that look like the real thing.
 *
 * The mock's own `share-credential-…` / `group-credential-…` shapes cannot
 * carry a share index alongside a member list, which the QRST P4 and P5 checks
 * both need. Tests register a `bfshare1…` / `bfgroup1…` string here and the
 * decoders below return the package it maps to.
 */
export const __fixtures = {
  shares: new Map<string, any>(),
  groups: new Map<string, any>(),
  reset() {
    __fixtures.shares.clear();
    __fixtures.groups.clear();
  }
};

const realShareDecode = PackageEncoder.share.decode;
PackageEncoder.share.decode = jest.fn().mockImplementation((credential: string) => {
  const fixture = __fixtures.shares.get(credential);
  if (fixture) return fixture;
  if (typeof credential === 'string' && credential.startsWith('bfshare1')) {
    throw new Error('Invalid share credential');
  }
  return (realShareDecode as any)(credential);
});

const realGroupDecode = PackageEncoder.group.decode;
PackageEncoder.group.decode = jest.fn().mockImplementation((credential: string) => {
  const fixture = __fixtures.groups.get(credential);
  if (fixture) return fixture;
  if (typeof credential === 'string' && credential.startsWith('bfgroup1')) {
    throw new Error('Invalid group credential');
  }
  return (realGroupDecode as any)(credential);
});
