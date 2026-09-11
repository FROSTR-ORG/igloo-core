// Mock implementation of @frostr/bifrost/lib for testing

export const generate_dealer_pkg = jest.fn().mockImplementation((threshold: number, totalMembers: number, secretKeys: string[]) => {
  const secretKey = secretKeys[0]; // Use first secret key as identifier
  const keysetId = secretKey.substring(0, 8); // Use first 8 chars as keyset identifier
  
  const shares = Array.from({ length: totalMembers }, (_, idx) => ({ 
    idx,
    keysetId, // Include keyset identifier in share
    data: `share-${idx}-data`
  }));
  
  return {
    group: { 
      threshold, 
      total_members: totalMembers,
      keysetId, // Include keyset identifier in group
      data: `group-${threshold}-${totalMembers}`
    },
    shares
  };
});

export const recover_secret_key = jest.fn().mockReturnValue('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'); 
/**
 * QRST's §4 P4 check delegates to bifrost's own `is_group_member`, which
 * derives the share's public key from its scalar and looks for a commitment at
 * the same index carrying that key. The mock does the same comparison over the
 * fixture packages, without the curve arithmetic.
 */
export const is_group_member = jest.fn().mockImplementation((group: any, share: any) => {
  const members = group?.commits ?? group?.members ?? [];
  return members.some(
    (member: any) => member.idx === share.idx && member.pubkey === share.pubkey
  );
});
