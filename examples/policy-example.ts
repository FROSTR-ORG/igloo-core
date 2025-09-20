import {
  IglooCore,
  setNodePolicies,
  getNodePolicies,
  summarizeNodePolicyMatrix
} from '../dist/index.js';

async function main() {
  // Placeholder credentials for demonstration.
  const groupCredential = 'bfgroup1example...';
  const shareCredential = 'bfshare1example...';

  const igloo = new IglooCore(['wss://relay.example.com']);

  // Create a node with initial policy definitions.
  const { node } = await igloo.createEnhancedNode(groupCredential, shareCredential, {
    policies: [
      { pubkey: '02' + 'a'.repeat(64), allowSend: false, allowReceive: true }
    ]
  });

  // Merge additional policy updates later in the lifecycle.
  await setNodePolicies(node, [
    { pubkey: 'npub1example...', allowSend: true, allowReceive: false }
  ], { merge: true });

  // Snapshot the summarized policy matrix for dashboards or logs.
  const policies = await getNodePolicies(node);
  const matrix = await summarizeNodePolicyMatrix(node);

  console.table(policies.map(({ pubkey, allowSend, allowReceive, status }) => ({ pubkey, allowSend, allowReceive, status })));
  console.log('Policy matrix:', matrix);
}

main().catch((error) => {
  console.error('Policy example failed:', error);
});
