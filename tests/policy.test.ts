import {
  prepareNodePolicies,
  setNodePolicies,
  updateNodePolicy,
  getNodePolicies,
  getNodePolicy,
  canSendToPeer,
  canReceiveFromPeer,
  summarizeNodePolicyMatrix
} from '../src/policy.js';
import { hexToNpub } from '../src/nostr.js';

describe('Node policy utilities', () => {
  const basePubkeyA = 'a'.repeat(64);
  const basePubkeyB = 'b'.repeat(64);
  const prefixedPubkeyA = `02${basePubkeyA}`;
  const npubB = hexToNpub(basePubkeyB);

  function createMockNode() {
    const now = Date.now();
    return {
      config: { policies: [] as any[] },
      peers: [
        {
          pubkey: basePubkeyA,
          policy: { send: true, recv: true },
          status: 'offline',
          updated: now
        },
        {
          pubkey: basePubkeyB,
          policy: { send: true, recv: true },
          status: 'unknown',
          updated: now
        }
      ]
    } as any;
  }

  it('normalizes and deduplicates policy inputs', () => {
    const { peerConfigs, normalizedPolicies } = prepareNodePolicies([
      { pubkey: prefixedPubkeyA, allowSend: false, allowReceive: true },
      { pubkey: npubB, allowReceive: false },
      { pubkey: prefixedPubkeyA, allowSend: true, allowReceive: false }
    ]);

    expect(normalizedPolicies).toHaveLength(2);
    expect(normalizedPolicies[0].pubkey).toBe(basePubkeyA);
    expect(normalizedPolicies[0].allowSend).toBe(true);
    expect(normalizedPolicies[0].allowReceive).toBe(false);

    expect(normalizedPolicies[1].pubkey).toBe(basePubkeyB);
    expect(normalizedPolicies[1].allowSend).toBe(true);
    expect(normalizedPolicies[1].allowReceive).toBe(false);

    expect(peerConfigs).toEqual([
      { pubkey: basePubkeyA, policy: { send: true, recv: false } },
      { pubkey: basePubkeyB, policy: { send: true, recv: false } }
    ]);
  });

  it('applies policies to node config and peers', () => {
    const node = createMockNode();

    const summaries = setNodePolicies(node, [
      {
        pubkey: prefixedPubkeyA,
        allowSend: false,
        allowReceive: true,
        label: 'Signer A',
        metadata: { region: 'us-east' }
      }
    ]);

    expect(node.config.policies).toEqual([
      {
        pubkey: basePubkeyA,
        policy: { send: false, recv: true }
      }
    ]);

    expect(node.peers[0].policy).toEqual({ send: false, recv: true });
    expect(node.peers[1].policy).toEqual({ send: true, recv: true });

    expect(summaries.find(p => p.pubkey === basePubkeyA)).toMatchObject({
      allowSend: false,
      allowReceive: true,
      label: 'Signer A',
      metadata: { region: 'us-east' },
      status: 'offline'
    });

    const matrix = summarizeNodePolicyMatrix(node);
    expect(matrix[basePubkeyA]).toEqual({ send: false, recv: true, status: 'offline' });
    expect(matrix[basePubkeyB]).toEqual({ send: true, recv: true, status: 'unknown' });
  });

  it('merges policy updates without losing metadata', () => {
    const node = createMockNode();
    setNodePolicies(node, [
      { pubkey: prefixedPubkeyA, allowSend: false, allowReceive: true, label: 'Signer A' }
    ]);

    const updated = updateNodePolicy(node, {
      pubkey: prefixedPubkeyA,
      allowSend: false,
      allowReceive: false
    });

    expect(updated).toBeDefined();
    expect(updated?.allowReceive).toBe(false);

    const policy = getNodePolicy(node, basePubkeyA);
    expect(policy).toMatchObject({ allowReceive: false, label: 'Signer A' });

    expect(canSendToPeer(node, basePubkeyA)).toBe(false);
    expect(canReceiveFromPeer(node, basePubkeyA)).toBe(false);
  });

  it('supports npub lookups for policy checks', () => {
    const node = createMockNode();
    setNodePolicies(node, [
      { pubkey: npubB, allowSend: true, allowReceive: false }
    ]);

    expect(canSendToPeer(node, npubB)).toBe(true);
    expect(canReceiveFromPeer(node, npubB)).toBe(false);

    const policy = getNodePolicy(node, npubB);
    expect(policy?.pubkey).toBe(basePubkeyB);
  });
});
