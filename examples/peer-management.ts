import { 
  IglooCore,
  createAndConnectNode,
  createPeerManager,
  createPeerManagerRobust,
  validatePeerCredentials,
  extractPeersFromCredentials,
  pingPeers,
  checkPeerStatus,
  StaticPeerManager,
  DEFAULT_PEER_MONITOR_CONFIG,
  // New ping functionality imports
  pingPeer,
  pingPeersAdvanced,
  createPingMonitor,
  runPingDiagnostics,
  pingPeersFromCredentials,
  DEFAULT_PING_RELAYS,
  DEFAULT_PING_TIMEOUT,
  DEFAULT_PING_INTERVAL,
  // Key generation imports
  generateKeysetWithSecret,
  generateNostrKeyPair,
  type PeerMonitorConfig,
  type Peer,
  type PeerMonitorResult,
  type PeerManagerResult,
  type PeerValidationResult,
  // New ping types
  type PingResult,
  type PingMonitor
} from '../src/index.js';

// Example demonstrating peer management functionality
async function demonstratePeerManagement() {
  console.log('🎯 FROSTR Peer Management Demo\n');

  // Initialize igloo-core with reliable relays
  const igloo = new IglooCore([
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.snort.social'
  ]);

  // Example credentials (in real use, these would come from your setup)
  const secretKey = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';
  const threshold = 2;
  const totalMembers = 3;

  let node: any = null;
  let peerManager: any = null;

  try {
    // 1. Generate a keyset for demonstration
    console.log('📝 Generating 2-of-3 keyset...');
    const keyset = await igloo.generateKeyset(threshold, totalMembers, secretKey);
    console.log(`✅ Generated keyset with ${keyset.shareCredentials.length} shares\n`);

    // 2. Create and connect a node (using first share)
    console.log('🔗 Creating and connecting Bifrost node...');
    node = await igloo.createNode(
      keyset.groupCredential,
      keyset.shareCredentials[0]
    );
    console.log('✅ Node connected successfully\n');

    // 3. Extract peers from credentials
    console.log('👥 Extracting peers from group credentials...');
    const peers = await igloo.extractPeers(
      keyset.groupCredential,
      keyset.shareCredentials[0]
    );
    console.log(`📋 Found ${peers.length} peers in group:`);
    peers.forEach((peer, index) => {
      console.log(`   ${index + 1}. ${peer.substring(0, 16)}...`);
    });
    console.log();

    // 4. Create a peer manager with custom configuration
    console.log('⚡ Creating peer manager with custom configuration...');
    console.log(`📋 Default config: ${JSON.stringify(DEFAULT_PEER_MONITOR_CONFIG, null, 2)}\n`);
    
    const peerConfig: Partial<PeerMonitorConfig> = {
      pingInterval: 15000,  // Ping every 15 seconds (faster than default)
      pingTimeout: 3000,    // 3 second timeout (faster than default)
      autoMonitor: true,    // Auto-start monitoring
      onPeerStatusChange: (peer: Peer) => {
        const timestamp = new Date().toLocaleTimeString();
        const statusIcon = peer.status === 'online' ? '🟢' : peer.status === 'offline' ? '🔴' : '🟡';
        const lastSeenText = peer.lastSeen ? ` (last seen: ${peer.lastSeen.toLocaleTimeString()})` : '';
        console.log(`[${timestamp}] ${statusIcon} Peer ${peer.pubkey.substring(0, 16)}... is now ${peer.status}${lastSeenText}`);
      }
    };

    peerManager = await igloo.createPeerManager(
      node,
      keyset.groupCredential,
      keyset.shareCredentials[0],
      peerConfig
    );
    console.log('✅ Peer manager created and monitoring started\n');

    // 5. Get initial peer status
    console.log('📊 Getting initial peer status...');
    let status = peerManager.getPeerStatus();
    console.log(`📈 Peer Status Summary:`);
    console.log(`   Total peers: ${status.totalPeers}`);
    console.log(`   Online: ${status.onlineCount}`);
    console.log(`   Offline: ${status.totalPeers - status.onlineCount}`);
    console.log(`   Last checked: ${status.lastChecked.toLocaleTimeString()}\n`);

    // 6. Enhanced ping demonstrations with new functionality
    console.log('🏓 Enhanced Ping Demonstrations...');
    
    // 6a. Advanced batch ping with detailed results
    console.log('📡 Advanced batch ping:');
    const batchPingResults = await igloo.pingPeersAdvanced(node, peers, {
      timeout: 5000
    });
    
    // Calculate statistics from the results array
    const successCount = batchPingResults.filter(r => r.success).length;
    const totalCount = batchPingResults.length;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    
    console.log(`   Success rate: ${successCount}/${totalCount} (${successRate.toFixed(1)}%)`);
    
    // Calculate average latency for successful pings
    const successfulPings = batchPingResults.filter(r => r.success && r.latency);
    if (successfulPings.length > 0) {
      const avgLatency = successfulPings.reduce((sum, r) => sum + (r.latency || 0), 0) / successfulPings.length;
      console.log(`   Average latency: ${avgLatency.toFixed(1)}ms`);
      
      // Find fastest and slowest peers
      const sortedByLatency = successfulPings.sort((a, b) => (a.latency || 0) - (b.latency || 0));
      const fastest = sortedByLatency[0];
      const slowest = sortedByLatency[sortedByLatency.length - 1];
      
      console.log(`   🏆 Fastest peer: ${fastest.pubkey.substring(0, 12)}... (${fastest.latency}ms)`);
      if (slowest !== fastest) {
        console.log(`   🐌 Slowest peer: ${slowest.pubkey.substring(0, 12)}... (${slowest.latency}ms)`);
      }
    }
    
    // 6b. Individual peer ping with detailed information
    if (peers.length > 0) {
      console.log(`\n🎯 Individual peer ping (${peers[0].substring(0, 12)}...):`);
      const individualResult = await igloo.pingPeer(node, peers[0], {
        timeout: 3000
      });
      
      if (individualResult.success) {
        console.log(`   ✅ Peer responded in ${individualResult.latency}ms`);
        if (individualResult.policy) {
          console.log(`   📋 Peer policy: send=${individualResult.policy.send}, receive=${individualResult.policy.recv}`);
        }
      } else {
        console.log(`   ❌ Ping failed: ${individualResult.error}`);
      }
    }
    
    // 6c. Credential-based ping (convenience function)
    console.log('\n🔗 Credential-based ping:');
    const credentialPingResults = await igloo.pingPeersFromCredentials(
      keyset.groupCredential,
      keyset.shareCredentials[0],
      { timeout: 4000 }
    );
    const credSuccessCount = credentialPingResults.filter(r => r.success).length;
    console.log(`   📊 Results: ${credSuccessCount}/${credentialPingResults.length} peers responded`);
    
    // 6d. Legacy ping for backward compatibility
    console.log('\n🔄 Legacy ping (backward compatibility):');
    const legacyOnlinePeers = await igloo.pingPeers(node);
    console.log(`   📡 Legacy ping results: ${legacyOnlinePeers.length} peers responded`);
    console.log();

    // 7. Check detailed peer status
    console.log('🔍 Checking detailed peer status...');
    const detailedStatus = await igloo.checkPeerStatus(
      node,
      keyset.groupCredential,
      keyset.shareCredentials[0]
    );
    console.log('📋 Detailed peer status:');
    detailedStatus.forEach((peer, index) => {
      const statusIcon = peer.status === 'online' ? '🟢' : '🔴';
      console.log(`   ${index + 1}. ${statusIcon} ${peer.pubkey.substring(0, 16)}... (${peer.status})`);
    });
    console.log();

    // 8. Demonstrate additional PeerManager methods
    console.log('🔧 Demonstrating additional PeerManager methods...');
    
    // Get individual peer info
    const allPeers = peerManager.getAllPeers();
    if (allPeers.length > 0) {
      const firstPeer = allPeers[0];
      console.log(`📱 First peer details:`, {
        pubkey: firstPeer.pubkey.substring(0, 16) + '...',
        status: firstPeer.status,
        allowSend: firstPeer.allowSend,
        allowReceive: firstPeer.allowReceive,
        lastSeen: firstPeer.lastSeen?.toLocaleString()
      });
      
      // Check specific peer
      const isOnline = peerManager.isPeerOnline(firstPeer.pubkey);
      console.log(`🔍 Is peer online: ${isOnline}`);
    }
    
    // Get online/offline peer lists
    const onlinePeersList = peerManager.getOnlinePeers();
    const offlinePeersList = peerManager.getOfflinePeers();
    console.log(`📊 Online peers: ${onlinePeersList.length}, Offline peers: ${offlinePeersList.length}\n`);

    // 9. Enhanced ping monitoring demonstration
    console.log('⏱️  Enhanced Ping Monitoring Demo...');
    
    // 9a. Create a ping monitor for real-time peer monitoring
    console.log('📡 Creating ping monitor for real-time peer monitoring...');
    const pingMonitor = await igloo.createPingMonitor(node, peers, {
      interval: 8000,  // Ping every 8 seconds
      timeout: 3000,   // 3 second timeout per ping
      onPingResult: (result: PingResult) => {
        const timestamp = new Date().toLocaleTimeString();
        const statusIcon = result.success ? '🟢' : '🔴';
        const latencyText = result.latency ? ` (${result.latency}ms)` : '';
        console.log(`   [${timestamp}] ${statusIcon} ${result.pubkey.substring(0, 12)}...${latencyText}`);
      },
      onError: (error: Error, context: string) => {
        console.log(`   ⚠️  Ping monitor error in ${context}: ${error.message}`);
      }
    });
    
    console.log('▶️  Starting ping monitor for 12 seconds...');
    pingMonitor.start();
    
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    console.log('⏸️  Stopping ping monitor...');
    pingMonitor.stop();
    pingMonitor.cleanup();
    
    // 9b. Run network diagnostics
    console.log('\n🔬 Running network diagnostics...');
    const diagnostics = await igloo.runPingDiagnostics(node, peers, {
      rounds: 3,
      timeout: 2000,
      interval: 1000
    });
    
    console.log('📊 Network Diagnostics Results:');
    console.log(`   Total rounds: ${diagnostics.summary.totalRounds}`);
    console.log(`   Total peers: ${diagnostics.summary.totalPeers}`);
    console.log(`   Success rate: ${(diagnostics.summary.successRate * 100).toFixed(1)}%`);
    console.log(`   Average latency: ${diagnostics.summary.averageLatency.toFixed(1)}ms`);
    
    if (diagnostics.summary.fastestPeer) {
      console.log(`   🏆 Fastest peer: ${diagnostics.summary.fastestPeer.substring(0, 12)}...`);
    }
    if (diagnostics.summary.slowestPeer) {
      console.log(`   🐌 Slowest peer: ${diagnostics.summary.slowestPeer.substring(0, 12)}...`);
    }
    
    // Show per-peer statistics
    console.log('\n📈 Per-peer statistics:');
    Object.entries(diagnostics.peerStats).forEach(([pubkey, stats], index) => {
      console.log(`   ${index + 1}. ${pubkey.substring(0, 12)}...:`);
      console.log(`      Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
      console.log(`      Avg latency: ${stats.averageLatency.toFixed(1)}ms`);
      console.log(`      Range: ${stats.minLatency}ms - ${stats.maxLatency}ms`);
    });
    console.log();

    // 10. Get final status with detailed information
    console.log('📊 Final peer status:');
    status = peerManager.getPeerStatus();
    console.log(`   Online peers: ${status.onlineCount}/${status.totalPeers}`);
    console.log(`   Last checked: ${status.lastChecked.toLocaleTimeString()}`);
    console.log(`   Online peer pubkeys: ${status.onlinePeers.map((p: any) => p.pubkey.substring(0, 16) + '...').join(', ')}`);
    console.log(`   Offline peer pubkeys: ${status.offlinePeers.map((p: any) => p.pubkey.substring(0, 16) + '...').join(', ')}\n`);

    // 11. Demonstrate config updates
    console.log('⚙️  Demonstrating config updates...');
    peerManager.updateConfig({
      pingInterval: 5000,  // Change to 5 seconds
      pingTimeout: 2000    // Change to 2 seconds
    });
    console.log('✅ Configuration updated to faster intervals\n');

    // 12. Manual monitoring control
    console.log('🎮 Demonstrating manual monitoring control...');
    peerManager.stopMonitoring();
    console.log('⏸️  Monitoring stopped');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    peerManager.startMonitoring();
    console.log('▶️  Monitoring restarted\n');

    // 13. Cleanup
    console.log('🧹 Cleaning up...');
    if (peerManager) {
      peerManager.cleanup();
      console.log('   Peer manager cleaned up');
    }
    if (node) {
      await igloo.cleanupNode(node);
      console.log('   Node cleaned up');
    }
    console.log('✅ Cleanup completed\n');

    console.log('🎉 Peer management demonstration completed successfully!');

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
    
    // Ensure cleanup even on error
    try {
      if (peerManager) {
        peerManager.cleanup();
        console.log('🧹 Emergency peer manager cleanup completed');
      }
      if (node) {
        await igloo.cleanupNode(node);
        console.log('🧹 Emergency node cleanup completed');
      }
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Additional utility functions for demonstration

async function demonstrateStandaloneFunctions() {
  console.log('\n🔧 Demonstrating standalone peer functions\n');

  let node: any = null;

  try {
    const igloo = new IglooCore([
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ]);
    const secretKey = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';
    
    // Generate test keyset
    console.log('📝 Generating test keyset for standalone functions...');
    const keyset = await igloo.generateKeyset(2, 3, secretKey);
    console.log(`✅ Generated ${keyset.shareCredentials.length}-share keyset\n`);
    
    node = await igloo.createNode(keyset.groupCredential, keyset.shareCredentials[0]);
    console.log('✅ Node connected for standalone function testing\n');

    // Demonstrate standalone functions
    console.log('1. 📋 Extract peers (standalone function):');
    const peers = extractPeersFromCredentials(
      keyset.groupCredential,
      keyset.shareCredentials[0]
    );
    console.log(`   Found ${peers.length} peers in group:`);
    peers.forEach((peer, index) => {
      console.log(`     ${index + 1}. ${peer.substring(0, 20)}...`);
    });
    console.log();

    console.log('2. 🏓 Ping peers (standalone function):');
    console.log('   Performing ping operation...');
    const startTime = Date.now();
    const onlinePeers = await pingPeers(node, 3000); // 3 second timeout
    const endTime = Date.now();
    console.log(`   ⏱️  Ping completed in ${endTime - startTime}ms`);
    console.log(`   📡 ${onlinePeers.length} peers responded:`);
    if (onlinePeers.length > 0) {
      onlinePeers.forEach((peer, index) => {
        console.log(`     ${index + 1}. ${peer.substring(0, 20)}... (online)`);
      });
    } else {
      console.log('     No peers are currently online');
    }
    console.log();

    console.log('3. 🔍 Check peer status (standalone function):');
    console.log('   Checking detailed peer status...');
    const status = await checkPeerStatus(
      node,
      keyset.groupCredential,
      keyset.shareCredentials[0]
    );
    console.log(`   📊 Status for ${status.length} peers:`);
    status.forEach((peer, index) => {
      const statusIcon = peer.status === 'online' ? '🟢' : peer.status === 'offline' ? '🔴' : '🟡';
      console.log(`     ${index + 1}. ${statusIcon} ${peer.pubkey.substring(0, 20)}... (${peer.status})`);
    });
    console.log();

    // 4. Demonstrate error handling
    console.log('4. 🚨 Demonstrating error handling:');
    try {
      console.log('   Testing with invalid credentials...');
      extractPeersFromCredentials('invalid_group', 'invalid_share');
    } catch (error) {
      console.log(`   ✅ Caught expected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      console.log('   Testing ping with very short timeout...');
      await pingPeers(node, 1); // 1ms timeout - should fail
    } catch (error) {
      console.log(`   ✅ Handled timeout gracefully: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    console.log();

    // 5. Performance demonstration
    console.log('5. ⚡ Performance demonstration:');
    console.log('   Running multiple operations...');
    const perfStart = Date.now();
    
    const operations = await Promise.all([
      extractPeersFromCredentials(keyset.groupCredential, keyset.shareCredentials[0]),
      pingPeers(node, 2000),
      checkPeerStatus(node, keyset.groupCredential, keyset.shareCredentials[0])
    ]);
    
    const perfEnd = Date.now();
    console.log(`   ⏱️  All operations completed in ${perfEnd - perfStart}ms`);
    console.log(`   📋 Extract: ${operations[0].length} peers`);
    console.log(`   🏓 Ping: ${operations[1].length} online`);
    console.log(`   🔍 Status: ${operations[2].length} checked\n`);

    // Cleanup
    await igloo.cleanupNode(node);
    console.log('🧹 Node cleanup completed');
    console.log('✅ Standalone functions demonstration completed');

  } catch (error) {
    console.error('❌ Error in standalone demonstration:', error);
    
    // Ensure cleanup
    if (node) {
      try {
        const igloo = new IglooCore();
        await igloo.cleanupNode(node);
        console.log('🧹 Emergency cleanup completed');
      } catch (cleanupError) {
        console.error('❌ Error during emergency cleanup:', cleanupError);
      }
    }
  }
}

// Advanced peer management scenarios
async function demonstrateAdvancedScenarios() {
  console.log('\n🎓 Advanced Peer Management Scenarios\n');

  let node: any = null;
  let peerManager: any = null;

  try {
    const igloo = new IglooCore([
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ]);
    const secretKey = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';
    
    // Generate a larger keyset for more interesting scenarios
    console.log('📝 Generating 3-of-5 keyset for advanced scenarios...');
    const keyset = await igloo.generateKeyset(3, 5, secretKey);
    console.log(`✅ Generated ${keyset.shareCredentials.length}-share keyset\n`);
    
    node = await igloo.createNode(keyset.groupCredential, keyset.shareCredentials[0]);
    console.log('✅ Node connected\n');

    // 1. Create peer manager without auto-monitoring
    console.log('1. 🎮 Manual monitoring control:');
    peerManager = await createPeerManager(node, keyset.groupCredential, keyset.shareCredentials[0], {
      autoMonitor: false,  // Don't start automatically
      pingInterval: 10000,
      pingTimeout: 2000,
      onPeerStatusChange: (peer: Peer) => {
        console.log(`   📡 Status change: ${peer.pubkey.substring(0, 12)}... → ${peer.status}`);
      }
    });
    
    console.log('   ✅ Peer manager created (monitoring disabled)');
    console.log(`   📊 Initial state: ${peerManager.getAllPeers().length} peers discovered\n`);

    // 2. Manual ping and status checking
    console.log('2. 🔍 Manual operations:');
    const manualPingResult = await peerManager.pingPeers();
    console.log(`   🏓 Manual ping: ${manualPingResult.onlineCount}/${manualPingResult.totalPeers} online`);
    
    const currentStatus = peerManager.getPeerStatus();
    console.log(`   📈 Current status: ${currentStatus.onlineCount} online, ${currentStatus.totalPeers - currentStatus.onlineCount} offline\n`);

    // 3. Start monitoring and demonstrate config changes
    console.log('3. ⚙️  Dynamic configuration:');
    peerManager.startMonitoring();
    console.log('   ▶️  Monitoring started');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    peerManager.updateConfig({
      pingInterval: 5000,  // Faster interval
      pingTimeout: 1500    // Shorter timeout
    });
    console.log('   🔧 Configuration updated to faster settings');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    peerManager.stopMonitoring();
    console.log('   ⏸️  Monitoring stopped\n');

    // 4. Demonstrate peer filtering and queries
    console.log('4. 🔎 Peer filtering and queries:');
    const allPeers = peerManager.getAllPeers();
    const onlinePeers = peerManager.getOnlinePeers();
    const offlinePeers = peerManager.getOfflinePeers();
    
    console.log(`   📊 Total peers: ${allPeers.length}`);
    console.log(`   🟢 Online: ${onlinePeers.length} peers`);
    console.log(`   🔴 Offline: ${offlinePeers.length} peers`);
    
    if (allPeers.length > 0) {
      const samplePeer = allPeers[0];
      const isOnline = peerManager.isPeerOnline(samplePeer.pubkey);
      const peerDetails = peerManager.getPeer(samplePeer.pubkey);
      
      console.log(`   🔍 Sample peer ${samplePeer.pubkey.substring(0, 12)}...:`);
      console.log(`       Online: ${isOnline}`);
      console.log(`       Allow send: ${peerDetails?.allowSend}`);
      console.log(`       Allow receive: ${peerDetails?.allowReceive}`);
      console.log(`       Last seen: ${peerDetails?.lastSeen?.toLocaleString() || 'Never'}`);
    }
    console.log();

    // 5. Stress test with rapid operations
    console.log('5. ⚡ Performance stress test:');
    const stressStart = Date.now();
    
    const stressOperations = await Promise.allSettled([
      peerManager.pingPeers(),
      peerManager.pingPeers(),
      peerManager.pingPeers(),
      Promise.resolve(peerManager.getPeerStatus()),
      Promise.resolve(peerManager.getAllPeers()),
      Promise.resolve(peerManager.getOnlinePeers())
    ]);
    
    const stressEnd = Date.now();
    const successCount = stressOperations.filter(op => op.status === 'fulfilled').length;
    
    console.log(`   ⏱️  Completed ${successCount}/${stressOperations.length} operations in ${stressEnd - stressStart}ms`);
    console.log(`   ✅ All operations handled gracefully\n`);

    // Cleanup
    console.log('🧹 Cleaning up advanced scenarios...');
    if (peerManager) {
      peerManager.cleanup();
      console.log('   Peer manager cleaned up');
    }
    if (node) {
      await igloo.cleanupNode(node);
      console.log('   Node cleaned up');
    }
    console.log('✅ Advanced scenarios demonstration completed');

  } catch (error) {
    console.error('❌ Error in advanced scenarios:', error);
    
    // Emergency cleanup
    try {
      if (peerManager) {
        peerManager.cleanup();
        console.log('🧹 Emergency peer manager cleanup completed');
      }
      if (node) {
        const igloo = new IglooCore();
        await igloo.cleanupNode(node);
        console.log('🧹 Emergency node cleanup completed');
      }
    } catch (cleanupError) {
      console.error('❌ Error during emergency cleanup:', cleanupError);
    }
  }
}

// Enhanced peer management example showcasing robust error handling and fallback mechanisms
async function demonstrateEnhancedPeerManagement() {
  console.log('\n🚀 Enhanced Peer Management Demo\n');

  // Generate demo credentials for testing
  console.log('🔑 Generating demo credentials...');
  const keyPair = generateNostrKeyPair();
  const keyset = generateKeysetWithSecret(2, 3, keyPair.hexPrivateKey);
  const groupCredential = keyset.groupCredential;
  const shareCredential = keyset.shareCredentials[0];
  console.log(`✅ Demo credentials generated`);
  console.log(`   Group: ${groupCredential.substring(0, 30)}...`);
  console.log(`   Share: ${shareCredential.substring(0, 30)}...`);
  const relays = ['wss://relay.damus.io', 'wss://relay.primal.net'];

  try {
    console.log('📋 Step 1: Validating peer credentials...');
    
    // First, validate credentials to provide better user feedback
    const validation: PeerValidationResult = await validatePeerCredentials(
      groupCredential, 
      shareCredential
    );

    if (validation.isValid) {
      console.log(`✅ Credentials valid! Found ${validation.peerCount} peers`);
      console.log(`🔑 Self pubkey: ${validation.selfPubkey?.substring(0, 16)}...`);
      
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => 
          console.log(`⚠️  Warning: ${warning}`)
        );
      }
      
      console.log(`👥 Peer list: ${validation.peers.map(p => p.substring(0, 8) + '...').join(', ')}`);
    } else {
      console.log(`❌ Credential validation failed: ${validation.error}`);
      console.log('🔄 Proceeding with demo using mock credentials...');
    }

    console.log('\n🌐 Step 2: Creating node connection...');
    
    // Create and connect node (this would succeed in a real environment)
    let node;
    try {
      node = await createAndConnectNode({
        group: groupCredential,
        share: shareCredential,
        relays
      });
      console.log('✅ Node connected successfully');
    } catch (error) {
      console.log(`⚠️  Node connection failed (expected in demo): ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log('🔄 Continuing with mock node for demonstration...');
      
      // Create a mock node for demo purposes
      node = {
        req: {
          ping: async () => ({ ok: false, data: [] })
        },
        on: () => {},
        off: () => {},
        close: () => {}
      } as any;
    }

    console.log('\n🛡️  Step 3: Robust peer manager creation...');
    
    // Use robust peer manager creation with fallback
    const result: PeerManagerResult = await createPeerManagerRobust(
      node,
      groupCredential,
      shareCredential,
      {
        fallbackMode: 'static',
        autoMonitor: false, // Disable auto-monitoring for demo
        pingInterval: 30000,
        pingTimeout: 5000,
        onError: (error, context) => {
          console.log(`🔧 Error handler called - Context: ${context}, Error: ${error.message}`);
        },
        onPeerStatusChange: (peer) => {
          console.log(`📡 Peer status changed: ${peer.pubkey.substring(0, 8)}... is now ${peer.status}`);
        }
      }
    );

    console.log(`\n📊 Peer Manager Creation Result:`);
    console.log(`├─ Success: ${result.success}`);
    console.log(`├─ Mode: ${result.mode}`);
    
    if (result.warnings) {
      console.log(`├─ Warnings: ${result.warnings.length}`);
      result.warnings.forEach((warning, i) => 
        console.log(`│  ${i + 1}. ${warning}`)
      );
    }

    if (result.success && result.peerManager) {
      console.log('\n🎯 Step 4: Using the peer manager...');
      
      const status = result.peerManager.getPeerStatus();
      console.log(`📈 Peer Status Summary:`);
      console.log(`├─ Total peers: ${status.totalPeers}`);
      console.log(`├─ Online peers: ${status.onlineCount}`);
      console.log(`├─ Last checked: ${status.lastChecked.toISOString()}`);
      
      if (status.totalPeers > 0) {
        console.log(`└─ Peer details:`);
        status.peers.forEach((peer, i) => {
          const isLast = i === status.peers.length - 1;
          const prefix = isLast ? '   └─' : '   ├─';
          console.log(`${prefix} ${peer.pubkey.substring(0, 12)}... (${peer.status})`);
        });
      }

      // Demonstrate different manager types
      if (result.mode === 'full') {
        console.log('\n🔴 Full monitoring mode - attempting ping...');
        try {
          const pingResult = await result.peerManager.pingPeers();
          console.log(`📡 Ping completed: ${pingResult.onlineCount}/${pingResult.totalPeers} peers responded`);
        } catch (error) {
          console.log(`⚠️  Ping failed (expected in demo): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (result.mode === 'static') {
        console.log('\n📋 Static mode - showing peer list without live monitoring');
        if ('getWarnings' in result.peerManager) {
          const warnings = (result.peerManager as StaticPeerManager).getWarnings();
          warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
        }
      }

      // Cleanup
      console.log('\n🧹 Step 5: Cleanup...');
      result.peerManager.cleanup();
      console.log('✅ Peer manager cleaned up');
    } else {
      console.log(`❌ Peer manager creation failed: ${result.error}`);
    }

    // Demonstrate standalone functions
    console.log('\n🔧 Step 6: Standalone function demonstrations...');
    
    try {
      const peers = extractPeersFromCredentials(groupCredential, shareCredential);
      console.log(`📋 Extracted ${peers.length} peers using standalone function`);
    } catch (error) {
      console.log(`⚠️  Peer extraction failed (expected in demo): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      const onlinePeers = await pingPeers(node, 2000);
      console.log(`📡 Ping result: ${onlinePeers.length} peers online`);
    } catch (error) {
      console.log(`⚠️  Ping failed (expected in demo): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      const peerStatus = await checkPeerStatus(node, groupCredential, shareCredential);
      console.log(`📊 Status check: ${peerStatus.length} peer statuses retrieved`);
    } catch (error) {
      console.log(`⚠️  Status check failed (expected in demo): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('💥 Demo failed with error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function demonstrateErrorHandlingScenarios() {
  console.log('\n🛡️  Error Handling Scenarios Demo\n');

  const invalidGroup = 'invalid-group-credential';
  const invalidShare = 'invalid-share-credential';

  console.log('📋 Scenario 1: Invalid credentials with fallback disabled');
  try {
    const result = await createPeerManagerRobust(
      {} as any, // Mock node
      invalidGroup,
      invalidShare,
      {
        fallbackMode: 'disabled',
        onError: (error, context) => {
          console.log(`🔧 Error callback: ${context} - ${error.message}`);
        }
      }
    );
    
    console.log(`Result: success=${result.success}, mode=${result.mode}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.log(`Exception caught: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n📋 Scenario 2: Invalid credentials with static fallback');
  try {
    const result = await createPeerManagerRobust(
      {} as any, // Mock node
      invalidGroup,
      invalidShare,
      {
        fallbackMode: 'static',
        onError: (error, context) => {
          console.log(`🔧 Error callback: ${context} - ${error.message}`);
        }
      }
    );
    
    console.log(`Result: success=${result.success}, mode=${result.mode}`);
    if (result.warnings) {
      console.log(`Warnings: ${result.warnings.join(', ')}`);
    }
  } catch (error) {
    console.log(`Exception caught: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n📋 Scenario 3: Static peer manager demonstration');
  const staticManager = new StaticPeerManager(
    ['peer1_pubkey', 'peer2_pubkey', 'peer3_pubkey'],
    ['Demo warning: Live monitoring unavailable']
  );

  const status = staticManager.getPeerStatus();
  console.log(`Static manager status:`);
  console.log(`├─ Total peers: ${status.totalPeers}`);
  console.log(`├─ Online count: ${status.onlineCount} (always 0 in static mode)`);
  console.log(`└─ Warnings: ${staticManager.getWarnings().join(', ')}`);

  staticManager.cleanup();
}

async function demonstrateConfigurationOptions() {
  console.log('\n⚙️  Configuration Options Demo\n');

  console.log('📋 Default configuration:');
  console.log(JSON.stringify(DEFAULT_PEER_MONITOR_CONFIG, null, 2));

  console.log('\n📋 Production configuration example:');
  const productionConfig = {
    fallbackMode: 'static' as const,
    pingInterval: 60000, // 1 minute
    pingTimeout: 10000,  // 10 seconds
    autoMonitor: true,
    onError: (error: Error, context: string) => {
      // In production, send to monitoring service
      console.log(`🚨 Production error handler: ${context} - ${error.message}`);
    },
    onPeerStatusChange: (peer: any) => {
      console.log(`📡 Production status change: ${peer.pubkey.substring(0, 8)}... -> ${peer.status}`);
    }
  };
  console.log(JSON.stringify(productionConfig, null, 2));

  console.log('\n📋 Development configuration example:');
  const devConfig = {
    fallbackMode: 'disabled' as const,
    pingInterval: 10000, // 10 seconds
    pingTimeout: 3000,   // 3 seconds
    autoMonitor: false,  // Manual control for debugging
  };
  console.log(JSON.stringify(devConfig, null, 2));
}

// Run the demonstrations
async function main() {
  console.log('🚀 Starting FROSTR Peer Management Examples\n');
  console.log('This demonstration showcases the peer management capabilities of igloo-core');
  console.log('including real-time monitoring, status tracking, and network operations.\n');
  
  try {
    await demonstratePeerManagement();
    await demonstrateStandaloneFunctions();
    await demonstrateAdvancedScenarios();
    await demonstrateEnhancedPeerManagement();
    await demonstrateErrorHandlingScenarios();
    await demonstrateConfigurationOptions();
    
    console.log('\n🎉 All demonstrations completed successfully!');
    console.log('\n📝 Key Takeaways:');
    console.log('• PeerManager provides real-time peer monitoring with enhanced ping integration');
    console.log('• New ping functions offer detailed connectivity and latency information');
    console.log('• pingPeer() provides individual peer diagnostics with policy information');
    console.log('• pingPeersAdvanced() enables batch operations with statistical analysis');
    console.log('• createPingMonitor() provides real-time continuous monitoring');
    console.log('• runPingDiagnostics() offers comprehensive network analysis');
    console.log('• pingPeersFromCredentials() provides convenient credential-based pinging');
    console.log('• Standalone functions offer simple peer operations for basic use cases');
    console.log('• Configuration can be updated dynamically for both peer and ping monitoring');
    console.log('• All operations include proper error handling and graceful degradation');
    console.log('• Resource cleanup is essential for proper operation (monitors, managers)');
    console.log('• Use createPeerManagerRobust() for production applications');
    console.log('• Always set fallbackMode to "static" for better UX');
    console.log('• Validate credentials first with validatePeerCredentials()');
    console.log('• Handle errors gracefully with onError callbacks');
    console.log('• StaticPeerManager provides peer lists even when monitoring fails');
    console.log('• Ping monitoring provides latency tracking and peer policy information');
    console.log('• Network diagnostics help identify performance bottlenecks');
    console.log('• Always cleanup peer managers and ping monitors when done');
    
  } catch (error) {
    console.error('\n❌ Demonstration failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  demonstratePeerManagement,
  demonstrateStandaloneFunctions,
  demonstrateAdvancedScenarios,
  demonstrateEnhancedPeerManagement,
  demonstrateErrorHandlingScenarios,
  demonstrateConfigurationOptions
}; 