import type { BifrostNode } from '@frostr/bifrost';
import type { PeerConfig, PeerData, PeerPolicy } from '@frostr/bifrost';
import { NodePolicyInputSchema, PolicyError } from './types.js';
import type { NodePolicyInput, NodePolicy, NodePolicySummary, NodePolicyStatus } from './types.js';
import { npubToHex } from './nostr.js';

const COMPRESSED_PUBKEY_REGEX = /^(02|03)[0-9a-fA-F]{64}$/;
const STRIPPED_PUBKEY_REGEX = /^[0-9a-fA-F]{64}$/;

interface PolicyExtras {
  label?: string;
  roles?: string[];
  metadata?: Record<string, unknown>;
  note?: string;
  source?: 'config' | 'runtime';
}

interface PreparePoliciesResult {
  peerConfigs: PeerConfig[];
  normalizedPolicies: NodePolicy[];
}

const policyMetadataStore = new WeakMap<BifrostNode, Map<string, PolicyExtras>>();

function normalizePolicyPubkey(pubkey: string): string {
  if (!pubkey) {
    throw new PolicyError('Peer pubkey is required');
  }

  let normalized = pubkey.trim();

  if (normalized.startsWith('npub')) {
    try {
      normalized = npubToHex(normalized);
    } catch (error: any) {
      throw new PolicyError('Failed to convert npub to hex', { pubkey, error });
    }
  }

  if (COMPRESSED_PUBKEY_REGEX.test(normalized)) {
    normalized = normalized.slice(2);
  }

  if (STRIPPED_PUBKEY_REGEX.test(normalized)) {
    return normalized.toLowerCase();
  }

  throw new PolicyError('Peer pubkey must be a 64-character hex string', { pubkey });
}

function normalizePeerPubkeyLoose(pubkey: string): string {
  if (!pubkey) return '';
  const trimmed = pubkey.trim();
  if (STRIPPED_PUBKEY_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (COMPRESSED_PUBKEY_REGEX.test(trimmed)) {
    return trimmed.slice(2).toLowerCase();
  }
  return trimmed.toLowerCase();
}

function extractPolicyExtras(policy: NodePolicy): PolicyExtras | undefined {
  const { label, roles, metadata, note, source } = policy;
  const extras: PolicyExtras = {};
  if (label) extras.label = label;
  if (roles && roles.length) extras.roles = [...roles];
  if (metadata && Object.keys(metadata).length) extras.metadata = metadata;
  if (note) extras.note = note;
  if (source) extras.source = source;

  return Object.keys(extras).length ? extras : undefined;
}

function getPolicyMetadataMap(node: BifrostNode): Map<string, PolicyExtras> {
  let map = policyMetadataStore.get(node);
  if (!map) {
    map = new Map<string, PolicyExtras>();
    policyMetadataStore.set(node, map);
  }
  return map;
}

function normalizeNodePolicyInputInternal(policy: NodePolicyInput): NodePolicy {
  const parsed = NodePolicyInputSchema.parse(policy);
  const pubkey = normalizePolicyPubkey(parsed.pubkey);
  const allowSend = parsed.allowSend ?? parsed.send ?? parsed.policy?.send ?? true;
  const allowReceive = parsed.allowReceive ?? parsed.recv ?? parsed.policy?.recv ?? true;

  return {
    pubkey,
    allowSend,
    allowReceive,
    label: parsed.label,
    roles: parsed.roles,
    metadata: parsed.metadata,
    note: parsed.note,
    source: parsed.source ?? 'config'
  };
}

export function normalizeNodePolicyInput(policy: NodePolicyInput): NodePolicy {
  return normalizeNodePolicyInputInternal(policy);
}

export function normalizeNodePolicies(policies: NodePolicyInput[] | undefined): NodePolicy[] {
  if (!policies || policies.length === 0) {
    return [];
  }

  const dedup = new Map<string, NodePolicy>();
  for (const policy of policies) {
    const normalized = normalizeNodePolicyInputInternal(policy);
    dedup.set(normalized.pubkey, normalized);
  }

  return Array.from(dedup.values());
}

function toPeerConfig(policy: NodePolicy): PeerConfig {
  return {
    pubkey: policy.pubkey,
    policy: {
      send: policy.allowSend,
      recv: policy.allowReceive
    }
  } satisfies PeerConfig;
}

export function prepareNodePolicies(policies: NodePolicyInput[] | undefined): PreparePoliciesResult {
  const normalizedPolicies = normalizeNodePolicies(policies);
  const peerConfigs = normalizedPolicies.map(toPeerConfig);
  return { peerConfigs, normalizedPolicies };
}

function syncPolicyMetadata(
  node: BifrostNode,
  policies: NodePolicy[],
  merge: boolean
): void {
  const map = getPolicyMetadataMap(node);

  if (!merge) {
    map.clear();
  }

  for (const policy of policies) {
    const extras = extractPolicyExtras(policy);
    if (extras) {
      if (merge && map.has(policy.pubkey)) {
        map.set(policy.pubkey, {
          ...map.get(policy.pubkey)!,
          ...extras
        });
      } else {
        map.set(policy.pubkey, extras);
      }
    } else if (!merge) {
      map.delete(policy.pubkey);
    }
  }
}

function syncPeersWithPolicies(
  node: BifrostNode,
  policyMap: Map<string, PeerPolicy>,
  merge: boolean
): void {
  const peers = (node as any).peers as PeerData[] | undefined;
  if (!peers) return;

  for (const peer of peers) {
    const key = normalizePeerPubkeyLoose(peer.pubkey);
    const policy = policyMap.get(key);
    if (policy) {
      peer.policy = { send: policy.send, recv: policy.recv };
    } else if (!merge) {
      peer.policy = { send: true, recv: true };
    }
  }
}

function collectPolicyMapFromConfig(node: BifrostNode): Map<string, PeerPolicy> {
  const map = new Map<string, PeerPolicy>();
  const configPolicies = (node as any).config?.policies as PeerConfig[] | undefined;
  if (!configPolicies) return map;

  for (const peerConfig of configPolicies) {
    const key = normalizePeerPubkeyLoose(peerConfig.pubkey);
    const send = peerConfig.policy?.send ?? true;
    const recv = peerConfig.policy?.recv ?? true;
    map.set(key, { send, recv });
  }

  return map;
}

function buildNodePolicySummary(
  pubkey: string,
  policy: PeerPolicy,
  peer: PeerData | undefined,
  extras: PolicyExtras | undefined,
  defaultSource: 'config' | 'runtime'
): NodePolicySummary {
  const status: NodePolicyStatus = peer?.status === 'online' || peer?.status === 'offline'
    ? peer.status
    : 'unknown';

  const lastUpdated = typeof peer?.updated === 'number' && !Number.isNaN(peer.updated)
    ? new Date(peer.updated)
    : undefined;

  return {
    pubkey,
    allowSend: policy.send,
    allowReceive: policy.recv,
    label: extras?.label,
    roles: extras?.roles,
    metadata: extras?.metadata,
    note: extras?.note,
    source: extras?.source ?? defaultSource,
    status,
    lastUpdated
  };
}

export function registerNodePolicyMetadata(node: BifrostNode, policies: NodePolicy[]): void {
  if (!policies.length) return;
  syncPolicyMetadata(node, policies, false);
}

export function setNodePolicies(
  node: BifrostNode,
  policies: NodePolicyInput[],
  options: { merge?: boolean } = {}
): NodePolicySummary[] {
  const { merge = false } = options;
  const { normalizedPolicies } = prepareNodePolicies(policies);

  const policyMap = merge
    ? collectPolicyMapFromConfig(node)
    : new Map<string, PeerPolicy>();

  for (const policy of normalizedPolicies) {
    policyMap.set(policy.pubkey, {
      send: policy.allowSend,
      recv: policy.allowReceive
    });
  }

  const config = (node as any).config;
  if (!config) {
    throw new PolicyError('Bifrost node config is not available');
  }

  const newConfigPolicies: PeerConfig[] = Array.from(policyMap.entries()).map(([pubkey, policy]) => ({
    pubkey,
    policy
  }));

  config.policies = newConfigPolicies;

  syncPeersWithPolicies(node, policyMap, merge);
  syncPolicyMetadata(node, normalizedPolicies, merge);

  return getNodePolicies(node);
}

export function updateNodePolicy(
  node: BifrostNode,
  policy: NodePolicyInput
): NodePolicySummary | undefined {
  const summaries = setNodePolicies(node, [policy], { merge: true });
  const targetPubkey = normalizePolicyPubkey(policy.pubkey);
  return summaries.find(summary => summary.pubkey === targetPubkey);
}

export function getNodePolicies(node: BifrostNode): NodePolicySummary[] {
  const peers = (node as any).peers as PeerData[] | undefined;
  const configMap = collectPolicyMapFromConfig(node);
  const metadataMap = getPolicyMetadataMap(node);
  const summaries: NodePolicySummary[] = [];
  const seen = new Set<string>();

  if (peers) {
    for (const peer of peers) {
      const key = normalizePeerPubkeyLoose(peer.pubkey);
      const policy = configMap.get(key) ?? peer.policy ?? { send: true, recv: true };
      const extras = metadataMap.get(key);
      summaries.push(buildNodePolicySummary(key, policy, peer, extras, 'runtime'));
      seen.add(key);
    }
  }

  for (const [pubkey, policy] of configMap.entries()) {
    if (seen.has(pubkey)) continue;
    const extras = metadataMap.get(pubkey);
    summaries.push(buildNodePolicySummary(pubkey, policy, undefined, extras, 'config'));
  }

  return summaries.sort((a, b) => a.pubkey.localeCompare(b.pubkey));
}

export function getNodePolicy(
  node: BifrostNode,
  pubkey: string
): NodePolicySummary | undefined {
  const normalized = normalizePolicyPubkey(pubkey);
  return getNodePolicies(node).find(policy => policy.pubkey === normalized);
}

export function canSendToPeer(node: BifrostNode, pubkey: string): boolean {
  const normalized = normalizePolicyPubkey(pubkey);
  const configMap = collectPolicyMapFromConfig(node);
  if (configMap.has(normalized)) {
    return configMap.get(normalized)!.send !== false;
  }

  const peers = (node as any).peers as PeerData[] | undefined;
  const peer = peers?.find(p => normalizePeerPubkeyLoose(p.pubkey) === normalized);
  return peer?.policy?.send ?? true;
}

export function canReceiveFromPeer(node: BifrostNode, pubkey: string): boolean {
  const normalized = normalizePolicyPubkey(pubkey);
  const configMap = collectPolicyMapFromConfig(node);
  if (configMap.has(normalized)) {
    return configMap.get(normalized)!.recv !== false;
  }

  const peers = (node as any).peers as PeerData[] | undefined;
  const peer = peers?.find(p => normalizePeerPubkeyLoose(p.pubkey) === normalized);
  return peer?.policy?.recv ?? true;
}

export function summarizeNodePolicyMatrix(node: BifrostNode): Record<string, {
  send: boolean;
  recv: boolean;
  status: NodePolicyStatus;
}> {
  const summaries = getNodePolicies(node);
  return summaries.reduce<Record<string, { send: boolean; recv: boolean; status: NodePolicyStatus }>>((acc, summary) => {
    acc[summary.pubkey] = {
      send: summary.allowSend,
      recv: summary.allowReceive,
      status: summary.status
    };
    return acc;
  }, {});
}
