import {
  IglooCore,
  pingPeer,
  pingPeersAdvanced,
  createPingMonitor,
  runPingDiagnostics,
  pingPeersFromCredentials,
  generateKeysetWithSecret,
  generateNostrKeyPair,
  type PingResult,
  type PingMonitor
} from '../src/index.js';

/**
 * Comprehensive Ping Functionality Example
 * 
 * This example demonstrates all the ping features available in igloo-core,
 * including individual peer pings, batch pings, monitoring, and diagnostics.
 */

class PingExampleApp {
  private igloo: IglooCore;
  private node: any = null;
  private pingMonitor: PingMonitor | null = null;
  private groupCredential: string = '';
  private shareCredential: string = '';

  constructor() {
    this.igloo = new IglooCore([
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ]);
  }

  async initialize() {
    console.log('🚀 Initializing Ping Example App...\n');
    
    try {
      // Generate valid credentials for demo
      console.log('🔑 Generating demo credentials...');
      const keyPair = generateNostrKeyPair();
      const keyset = generateKeysetWithSecret(2, 3, keyPair.hexPrivateKey);
      
      this.groupCredential = keyset.groupCredential;
      this.shareCredential = keyset.shareCredentials[0];
      
      console.log('✅ Demo credentials generated');
      console.log(`   Group: ${this.groupCredential.substring(0, 30)}...`);
      console.log(`   Share: ${this.shareCredential.substring(0, 30)}...`);

      // Create and connect node
      console.log('📡 Creating and connecting node...');
      this.node = await this.igloo.createNode(this.groupCredential, this.shareCredential);
      console.log('✅ Node connected successfully\n');
      
      return true;
    } catch (error: any) {
      console.error('❌ Failed to initialize:', error.message);
      return false;
    }
  }

  /**
   * Demonstration 1: Basic Peer Ping
   */
  async demonstrateBasicPing() {
    console.log('=== 🏓 Basic Peer Ping Demonstration ===\n');
    
    try {
      // Extract peers from credentials
      const peers = await this.igloo.extractPeers(this.groupCredential, this.shareCredential);
      console.log(`Found ${peers.length} peers in group:`, peers.map(p => p.slice(0, 8) + '...'));

      if (peers.length === 0) {
        console.log('⚠️ No peers found to ping\n');
        return;
      }

      // Ping the first peer
      const targetPeer = peers[0];
      console.log(`\n🎯 Pinging peer: ${targetPeer.slice(0, 8)}...`);
      
      const result = await pingPeer(this.node, targetPeer, {
        timeout: 5000,
        eventConfig: { enableLogging: true }
      });

      this.displayPingResult(result);

    } catch (error: any) {
      console.error('❌ Basic ping failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Demonstration 2: Batch Peer Ping
   */
  async demonstrateBatchPing() {
    console.log('=== 🎯 Batch Peer Ping Demonstration ===\n');
    
    try {
      // Extract peers from credentials
      const peers = await this.igloo.extractPeers(this.groupCredential, this.shareCredential);
      
      if (peers.length === 0) {
        console.log('⚠️ No peers found to ping\n');
        return;
      }

      console.log(`🚀 Pinging ${peers.length} peers concurrently...`);
      
      const results = await pingPeersAdvanced(this.node, peers, {
        timeout: 5000,
        eventConfig: { enableLogging: false }
      });

      // Display results summary
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      console.log(`\n📊 Ping Results Summary:`);
      console.log(`✅ Successful: ${successful.length}/${results.length}`);
      console.log(`❌ Failed: ${failed.length}/${results.length}`);
      
      if (successful.length > 0) {
        const avgLatency = successful.reduce((sum, r) => sum + (r.latency || 0), 0) / successful.length;
        console.log(`⚡ Average latency: ${avgLatency.toFixed(2)}ms`);
      }

      // Display individual results
      console.log('\n📋 Individual Results:');
      results.forEach(result => this.displayPingResult(result, false));

    } catch (error: any) {
      console.error('❌ Batch ping failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Demonstration 3: Ping Monitor
   */
  async demonstratePingMonitor() {
    console.log('=== 📡 Ping Monitor Demonstration ===\n');
    
    try {
      // Extract peers from credentials
      const peers = await this.igloo.extractPeers(this.groupCredential, this.shareCredential);
      
      if (peers.length === 0) {
        console.log('⚠️ No peers found to monitor\n');
        return;
      }

      console.log(`🔄 Starting ping monitor for ${peers.length} peers...`);
      console.log('📊 Monitor will ping every 10 seconds for 30 seconds\n');

      // Create ping monitor
      this.pingMonitor = createPingMonitor(this.node, peers, {
        interval: 10000, // 10 seconds
        timeout: 5000,   // 5 second timeout
        onPingResult: (result: PingResult) => {
          const timestamp = new Date().toLocaleTimeString();
          const status = result.success ? '🟢' : '🔴';
          const latency = result.latency ? ` (${result.latency}ms)` : '';
          console.log(`[${timestamp}] ${status} ${result.pubkey.slice(0, 8)}...${latency}`);
        },
        onError: (error: Error, context: string) => {
          console.error(`⚠️ Monitor error in ${context}:`, error.message);
        },
        eventConfig: { enableLogging: false }
      });

      // Start monitoring
      this.pingMonitor.start();
      console.log('✅ Ping monitor started\n');

      // Run for 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Stop monitoring
      this.pingMonitor.stop();
      console.log('\n⏹️ Ping monitor stopped');

    } catch (error: any) {
      console.error('❌ Ping monitor failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Demonstration 4: Ping Diagnostics
   */
  async demonstratePingDiagnostics() {
    console.log('=== 🔬 Ping Diagnostics Demonstration ===\n');
    
    try {
      // Extract peers from credentials
      const peers = await this.igloo.extractPeers(this.groupCredential, this.shareCredential);
      
      if (peers.length === 0) {
        console.log('⚠️ No peers found for diagnostics\n');
        return;
      }

      console.log(`🧪 Running comprehensive ping diagnostics...`);
      console.log(`📊 Testing ${peers.length} peers over 3 rounds\n`);

      const diagnostics = await runPingDiagnostics(this.node, peers, {
        rounds: 3,
        timeout: 5000,
        interval: 2000, // 2 seconds between rounds
        eventConfig: { enableLogging: false }
      });

      // Display comprehensive results
      console.log('📈 Diagnostics Summary:');
      console.log(`🎯 Total Rounds: ${diagnostics.summary.totalRounds}`);
      console.log(`👥 Total Peers: ${diagnostics.summary.totalPeers}`);
      console.log(`📊 Success Rate: ${diagnostics.summary.successRate}%`);
      console.log(`⚡ Average Latency: ${diagnostics.summary.averageLatency}ms`);
      
      if (diagnostics.summary.fastestPeer) {
        console.log(`🏃 Fastest Peer: ${diagnostics.summary.fastestPeer.slice(0, 8)}...`);
      }
      
      if (diagnostics.summary.slowestPeer) {
        console.log(`🐌 Slowest Peer: ${diagnostics.summary.slowestPeer.slice(0, 8)}...`);
      }

      // Display per-peer statistics
      console.log('\n👥 Per-Peer Statistics:');
      Object.entries(diagnostics.peerStats).forEach(([pubkey, stats]) => {
        console.log(`  ${pubkey.slice(0, 8)}...:`);
        console.log(`    Success Rate: ${stats.successRate.toFixed(1)}%`);
        console.log(`    Average Latency: ${stats.averageLatency.toFixed(2)}ms`);
        console.log(`    Min/Max Latency: ${stats.minLatency}ms / ${stats.maxLatency}ms`);
      });

    } catch (error: any) {
      console.error('❌ Ping diagnostics failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Demonstration 5: Convenience Method
   */
  async demonstrateConvenienceMethod() {
    console.log('=== 🛠️ Convenience Method Demonstration ===\n');
    
    try {
      console.log('🎯 Using pingPeersFromCredentials convenience method...');
      
      const results = await pingPeersFromCredentials(
        this.groupCredential,
        this.shareCredential,
        {
          timeout: 5000,
          eventConfig: { enableLogging: false }
        }
      );

      console.log(`📊 Pinged ${results.length} peers using convenience method:`);
      results.forEach(result => this.displayPingResult(result, false));

    } catch (error: any) {
      console.error('❌ Convenience method failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Demonstration 6: IglooCore Integration
   */
  async demonstrateIglooCoreIntegration() {
    console.log('=== 🎯 IglooCore Integration Demonstration ===\n');
    
    try {
      // Extract peers using IglooCore
      const peers = await this.igloo.extractPeers(this.groupCredential, this.shareCredential);
      
      if (peers.length === 0) {
        console.log('⚠️ No peers found\n');
        return;
      }

      const targetPeer = peers[0];
      
      // Use IglooCore ping methods
      console.log('🏓 Using IglooCore.pingPeer...');
      const singleResult = await this.igloo.pingPeer(this.node, targetPeer, {
        timeout: 5000
      });
      this.displayPingResult(singleResult);

      console.log('\n🎯 Using IglooCore.pingPeersAdvanced...');
      const batchResults = await this.igloo.pingPeersAdvanced(this.node, peers, {
        timeout: 5000
      });
      
      const successful = batchResults.filter(r => r.success).length;
      console.log(`✅ ${successful}/${batchResults.length} peers responded`);

      console.log('\n🛠️ Using IglooCore.pingPeersFromCredentials...');
      const convenienceResults = await this.igloo.pingPeersFromCredentials(
        this.groupCredential,
        this.shareCredential,
        { timeout: 3000 }
      );
      
      const convenienceSuccessful = convenienceResults.filter(r => r.success).length;
      console.log(`✅ ${convenienceSuccessful}/${convenienceResults.length} peers responded via convenience method`);

    } catch (error: any) {
      console.error('❌ IglooCore integration failed:', error.message);
    }
    
    console.log('\n');
  }

  /**
   * Helper method to display ping results
   */
  private displayPingResult(result: PingResult, showDetails = true) {
    const status = result.success ? '✅' : '❌';
    const peer = result.pubkey.slice(0, 8) + '...';
    
    if (result.success) {
      const latency = result.latency ? `${result.latency}ms` : 'N/A';
      const policy = result.policy ? 
        `send:${result.policy.send}, recv:${result.policy.recv}` : 
        'N/A';
      
      if (showDetails) {
        console.log(`${status} ${peer}`);
        console.log(`   Latency: ${latency}`);
        console.log(`   Policy: ${policy}`);
        console.log(`   Timestamp: ${result.timestamp.toLocaleTimeString()}`);
      } else {
        console.log(`  ${status} ${peer} - ${latency}`);
      }
    } else {
      if (showDetails) {
        console.log(`${status} ${peer}`);
        console.log(`   Error: ${result.error}`);
        console.log(`   Timestamp: ${result.timestamp.toLocaleTimeString()}`);
      } else {
        console.log(`  ${status} ${peer} - ${result.error}`);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up resources...');
    
    if (this.pingMonitor) {
      this.pingMonitor.cleanup();
      this.pingMonitor = null;
    }
    
    if (this.node) {
      await this.igloo.cleanupNode(this.node);
      this.node = null;
    }
    
    console.log('✅ Cleanup completed');
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🎯 Igloo-Core Ping Functionality Example\n');
  console.log('This example demonstrates comprehensive ping capabilities including:');
  console.log('• Individual peer pings with latency measurement');
  console.log('• Batch peer pings with concurrent execution');
  console.log('• Real-time ping monitoring');
  console.log('• Comprehensive network diagnostics');
  console.log('• Convenience methods for easy integration');
  console.log('• Full IglooCore integration\n');

  const app = new PingExampleApp();
  
  try {
    const initialized = await app.initialize();
    if (!initialized) {
      console.error('❌ Failed to initialize application');
      process.exit(1);
    }

    // Run all demonstrations
    await app.demonstrateBasicPing();
    await app.demonstrateBatchPing();
    await app.demonstratePingMonitor();
    await app.demonstratePingDiagnostics();
    await app.demonstrateConvenienceMethod();
    await app.demonstrateIglooCoreIntegration();

    console.log('🎉 All ping demonstrations completed successfully!');
    
  } catch (error: any) {
    console.error('💥 Application error:', error.message);
  } finally {
    await app.cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received shutdown signal');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received termination signal');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { PingExampleApp }; 