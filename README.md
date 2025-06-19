# @frostr/igloo-core

[![npm version](https://badge.fury.io/js/@frostr%2Figloo-core.svg)](https://badge.fury.io/js/@frostr%2Figloo-core)
[![npm downloads](https://img.shields.io/npm/dm/@frostr/igloo-core.svg)](https://www.npmjs.com/package/@frostr/igloo-core)
[![GitHub stars](https://img.shields.io/github/stars/FROSTR-ORG/igloo-core.svg)](https://github.com/FROSTR-ORG/igloo-core)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/FROSTR-ORG/igloo-core/blob/main/LICENSE)

A TypeScript library providing core functionality for FROSTR/Bifrost distributed key management and remote signing. This library abstracts the complexity of threshold signatures and provides a clean, strongly-typed API for building secure distributed applications.

## Features

- 🔑 **Keyset Management**: Generate, decode, and manage threshold signature keysets
- 🌐 **Node Management**: Create and manage BifrostNodes with comprehensive event handling
- 👥 **Peer Management**: Discover, monitor, and track peer status in real-time
- 📡 **Echo Functionality**: QR code transfers and share confirmation with visual feedback
- 🔐 **Nostr Integration**: Complete nostr key management and format conversion utilities
- 🛡️ **Strong Types**: Full TypeScript support with comprehensive type definitions
- ⚡ **Error Handling**: Structured error types with detailed context
- 🔄 **Secret Recovery**: Secure threshold-based secret key reconstruction
- 🎯 **Validation**: Built-in validation for all inputs using Zod schemas
- 🔍 **Comprehensive Validation**: Advanced validation for Bifrost credentials, nostr keys, and relay URLs

## Installation

```bash
npm install @frostr/igloo-core
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install @frostr/bifrost nostr-tools
```

Or install everything at once:

```bash
npm install @frostr/igloo-core @frostr/bifrost nostr-tools
```

## Quick Start

### Basic Usage

```typescript
import { igloo, generateKeysetWithSecret, recoverSecretKeyFromCredentials } from '@frostr/igloo-core';

// Generate a 2-of-3 keyset
const keyset = generateKeysetWithSecret(2, 3, 'your-hex-secret-key');

console.log('Generated keyset:', {
  group: keyset.groupCredential,
  shares: keyset.shareCredentials.length
});

// Recover the secret using threshold shares
const recoveredSecret = recoverSecretKeyFromCredentials(
  keyset.groupCredential,
  keyset.shareCredentials.slice(0, 2) // Use any 2 shares
);

console.log('Recovered secret:', recoveredSecret);
```

### Using the Convenience Class

```typescript
import { IglooCore } from '@frostr/igloo-core';

const igloo = new IglooCore([
  'wss://relay.damus.io',
  'wss://relay.primal.net'
]);

// Generate keyset
const keyset = await igloo.generateKeyset(2, 3, secretKey);

// Create and connect a node
const node = await igloo.createNode(
  keyset.groupCredential,
  keyset.shareCredentials[0]
);

// Wait for echo confirmation
const confirmed = await igloo.waitForEcho(
  keyset.groupCredential,
  keyset.shareCredentials[0],
  30000 // 30 second timeout
);

// Get share information
const shareInfo = await igloo.getShareInfo(keyset.shareCredentials[0]);
console.log(`Share ${shareInfo.idx}: ${shareInfo.threshold}/${shareInfo.totalMembers}`);

// Generate nostr keys
const nostrKeys = await igloo.generateKeys();
console.log('Generated keys:', {
  nsec: nostrKeys.nsec,
  npub: nostrKeys.npub
});

// Convert key formats
const hexKey = await igloo.convertKey(nostrKeys.nsec, 'hex');
const npubFromHex = await igloo.convertKey(hexKey, 'npub');

// Validate credentials
const validationResult = await igloo.validateCredentials({
  group: keyset.groupCredential,
  shares: keyset.shareCredentials,
  relays: igloo.defaultRelays
});
console.log('Credentials valid:', validationResult.isValid);
```

## Core Functions

### Keyset Management

#### `generateKeysetWithSecret(threshold, totalMembers, secretKey)`

Generates a new keyset from a secret key using Shamir's Secret Sharing.

```typescript
import { generateKeysetWithSecret } from '@frostr/igloo-core';

const keyset = generateKeysetWithSecret(2, 3, 'your-hex-secret-key');
// Returns: { groupCredential: string, shareCredentials: string[] }
```

#### `recoverSecretKeyFromCredentials(groupCredential, shareCredentials)`

Recovers the original secret key from threshold shares.

```typescript
import { recoverSecretKeyFromCredentials } from '@frostr/igloo-core';

const nsec = recoverSecretKeyFromCredentials(
  groupCredential,
  shareCredentials.slice(0, threshold)
);
```

#### `getShareDetails(shareCredential)`

Gets information about a share including index and threshold parameters.

```typescript
import { getShareDetails } from '@frostr/igloo-core';

const details = getShareDetails(shareCredential);
console.log(`Share ${details.idx}: ${details.threshold}/${details.totalMembers}`);
```

### Nostr Utilities

#### `generateNostrKeyPair()`

Generates a new nostr key pair with both nsec/npub and hex formats.

```typescript
import { generateNostrKeyPair } from '@frostr/igloo-core';

const keyPair = generateNostrKeyPair();
console.log({
  nsec: keyPair.nsec,           // nostr secret key
  npub: keyPair.npub,           // nostr public key
  hexPrivateKey: keyPair.hexPrivateKey,  // hex private key
  hexPublicKey: keyPair.hexPublicKey     // hex public key
});
```

#### `nsecToHex(nsec)` / `hexToNsec(hex)`

Convert between nsec and hex formats for private keys.

```typescript
import { nsecToHex, hexToNsec } from '@frostr/igloo-core';

const nsec = 'nsec1...';
const hexPrivateKey = nsecToHex(nsec);
const backToNsec = hexToNsec(hexPrivateKey);
```

#### `npubToHex(npub)` / `hexToNpub(hex)`

Convert between npub and hex formats for public keys.

```typescript
import { npubToHex, hexToNpub } from '@frostr/igloo-core';

const npub = 'npub1...';
const hexPublicKey = npubToHex(npub);
const backToNpub = hexToNpub(hexPublicKey);
```

#### `derivePublicKey(privateKey)`

Derive the public key from a private key (supports both hex and nsec formats).

```typescript
import { derivePublicKey } from '@frostr/igloo-core';

const publicKeyInfo = derivePublicKey('nsec1...' /* or hex */);
console.log({
  npub: publicKeyInfo.npub,
  hexPublicKey: publicKeyInfo.hexPublicKey
});
```

### Node Management

#### `createAndConnectNode(config, eventConfig?)`

Creates and connects a BifrostNode with optional event configuration.

```typescript
import { createAndConnectNode } from '@frostr/igloo-core';

const node = await createAndConnectNode({
  group: groupCredential,
  share: shareCredential,
  relays: ['wss://relay.damus.io']
}, {
  enableLogging: true,
  logLevel: 'info',
  customLogger: (level, message, data) => {
    console.log(`[${level}] ${message}`, data);
  }
});
```

### Echo Functionality

#### `awaitShareEcho(groupCredential, shareCredential, options?)`

Waits for an echo event on a specific share, useful for QR code transfers.

```typescript
import { awaitShareEcho } from '@frostr/igloo-core';

try {
  const received = await awaitShareEcho(
    groupCredential,
    shareCredential,
    {
      relays: ['wss://relay.damus.io'],
      timeout: 30000,
      eventConfig: { enableLogging: true }
    }
  );
  console.log('Echo received!', received);
} catch (error) {
  console.log('Echo timeout or error:', error.message);
}
```

#### `startListeningForAllEchoes(groupCredential, shareCredentials, callback, options?)`

Starts listening for echo events on all shares in a keyset.

```typescript
import { startListeningForAllEchoes } from '@frostr/igloo-core';

const listener = startListeningForAllEchoes(
  groupCredential,
  shareCredentials,
  (shareIndex, shareCredential) => {
    console.log(`Echo received for share ${shareIndex}!`);
  },
  {
    relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
    eventConfig: { enableLogging: true }
  }
);

// Cleanup when done
listener.cleanup();
```

## Error Handling

The library provides structured error types for better error handling:

```typescript
import { 
  KeysetError, 
  NodeError, 
  EchoError, 
  RecoveryError,
  NostrError 
} from '@frostr/igloo-core';

try {
  const keyset = generateKeysetWithSecret(5, 3, 'key'); // Invalid: threshold > total
} catch (error) {
  if (error instanceof KeysetError) {
    console.error('Keyset error:', error.message);
    console.error('Details:', error.details);
    console.error('Error code:', error.code);
  }
}
```

## Type Definitions

### Core Types

```typescript
interface KeysetCredentials {
  groupCredential: string;
  shareCredentials: string[];
}

interface ShareDetails {
  idx: number;
  threshold: number;
  totalMembers: number;
}

interface NostrKeyPair {
  nsec: string;
  npub: string;
  hexPrivateKey: string;
  hexPublicKey: string;
}

interface NodeConfig {
  group: string;
  share: string;
  relays: string[];
}

interface EchoListener {
  cleanup: () => void;
  isActive: boolean;
}
```

### Event Configuration

```typescript
interface NodeEventConfig {
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  customLogger?: (level: string, message: string, data?: any) => void;
}
```

## Validation

The library provides comprehensive validation for all FROSTR/Bifrost components:

### Individual Validation Functions

```typescript
import { 
  validateNsec, 
  validateHexPrivkey, 
  validateShare, 
  validateGroup, 
  validateRelay,
  validateBfcred,
  VALIDATION_CONSTANTS
} from '@frostr/igloo-core';

// Validate nostr keys
const nsecResult = validateNsec('nsec1...');
console.log('Valid nsec:', nsecResult.isValid);

const hexResult = validateHexPrivkey('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
console.log('Valid hex:', hexResult.isValid);

// Validate Bifrost credentials
const shareResult = validateShare('bfshare1...');
const groupResult = validateGroup('bfgroup1...');
const credResult = validateBfcred('bfcred1...');

// Validate and normalize relay URLs
const relayResult = validateRelay('relay.damus.io');
console.log('Normalized:', relayResult.normalized); // 'wss://relay.damus.io'
```

### Batch Validation

```typescript
import { validateCredentialSet, validateRelayList } from '@frostr/igloo-core';

// Validate complete credential sets
const result = validateCredentialSet({
  group: 'bfgroup1...',
  shares: ['bfshare1...', 'bfshare1...'],
  relays: ['wss://relay.damus.io', 'relay.primal.net']
});

console.log('All valid:', result.isValid);
console.log('Errors:', result.errors);

// Validate and normalize relay lists
const relayListResult = validateRelayList([
  'relay.damus.io',
  'https://relay.primal.net/',
  'wss://relay.snort.social'
]);
console.log('Normalized relays:', relayListResult.normalizedRelays);
```

### Advanced Validation Options

```typescript
import { validateWithOptions } from '@frostr/igloo-core';

const validatedCreds = validateWithOptions(
  {
    group: 'bfgroup1...',
    shares: ['bfshare1...'],
    relays: ['relay.damus.io', 'https://relay.primal.net/']
  },
  {
    normalizeRelays: true,      // Auto-normalize relay URLs
    requireMinShares: 2,        // Enforce minimum share count
    strict: true                // Strict format validation
  }
);

console.log('Valid:', validatedCreds.isValid);
console.log('Normalized relays:', validatedCreds.relays);
```

### Using IglooCore Validation Methods

```typescript
import { IglooCore } from '@frostr/igloo-core';

const igloo = new IglooCore();

// Validate individual credentials
const shareValid = await igloo.validateCredential('bfshare1...', 'share');

// Validate relay lists with normalization
const relayResult = await igloo.validateRelays(['relay.damus.io']);

// Validate complete credential sets
const fullValidation = await igloo.validateCredentials({
  group: 'bfgroup1...',
  shares: ['bfshare1...'],
  relays: ['relay.damus.io']
});

// Advanced validation with options
const advanced = await igloo.validateWithOptions(credentials, {
  normalizeRelays: true,
  requireMinShares: 2
});
```

### Validation Constants

Access validation constants for custom validation logic:

```typescript
import { VALIDATION_CONSTANTS } from '@frostr/igloo-core';

console.log('Share data size:', VALIDATION_CONSTANTS.SHARE_DATA_SIZE);
console.log('Bifrost prefixes:', {
  share: VALIDATION_CONSTANTS.BFSHARE_HRP,
  group: VALIDATION_CONSTANTS.BFGROUP_HRP,
  cred: VALIDATION_CONSTANTS.BFCRED_HRP
});
```

## Ping Functionality

The library provides comprehensive ping capabilities for monitoring peer connectivity, measuring network latency, and diagnosing network issues in your FROSTR signing group. The ping system leverages Bifrost's native ping protocol and provides both individual and batch operations with real-time monitoring capabilities.

### Quick Start - Ping Operations

```typescript
import { pingPeer, pingPeersAdvanced, createPingMonitor } from '@frostr/igloo-core';

// Ping a single peer
const result = await pingPeer(node, peerPubkey, {
  timeout: 5000
});

if (result.success) {
  console.log(`✅ Peer responded in ${result.latency}ms`);
  console.log(`Peer policy: send=${result.policy?.send}, receive=${result.policy?.recv}`);
} else {
  console.log(`❌ Ping failed: ${result.error}`);
}

// Batch ping multiple peers
const batchResults = await pingPeersAdvanced(node, [peer1, peer2, peer3], {
  timeout: 5000
});

const successCount = batchResults.filter(r => r.success).length;
console.log(`${successCount}/${batchResults.length} peers responded`);

// Calculate fastest/slowest from results
const successful = batchResults.filter(r => r.success && r.latency);
const fastest = successful.reduce((min, r) => r.latency! < min.latency! ? r : min);
const slowest = successful.reduce((max, r) => r.latency! > max.latency! ? r : max);
console.log(`Fastest: ${fastest?.latency}ms, Slowest: ${slowest?.latency}ms`);

// Real-time monitoring
const monitor = createPingMonitor(node, [peer1, peer2], {
  interval: 30000, // Ping every 30 seconds
  onPingResult: (result) => {
    console.log(`Peer ${result.pubkey}: ${result.success ? `${result.latency}ms` : 'offline'}`);
  },
  onError: (error, context) => console.warn('Monitor error:', error.message)
});

// Start monitoring
monitor.start();

// Stop when done (important for cleanup!)
monitor.stop();
```

### Advanced Ping Features

#### 🎯 Individual Peer Ping

The `pingPeer` function provides detailed information about a single peer's connectivity:

```typescript
import { pingPeer } from '@frostr/igloo-core';

const pingResult = await pingPeer(node, peerPubkey, {
  timeout: 5000,
  relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  logger: console // Optional custom logger
});

if (pingResult.success) {
  console.log('🟢 Peer is online!');
  console.log(`Latency: ${pingResult.latency}ms`);
  console.log(`Timestamp: ${pingResult.timestamp}`);
  
  // Peer policy information from Bifrost
  if (pingResult.policy) {
    console.log(`Can send to peer: ${pingResult.policy.send}`);
    console.log(`Can receive from peer: ${pingResult.policy.recv}`);
  }
} else {
  console.log('🔴 Peer is offline or unreachable');
  console.log(`Error: ${pingResult.error}`);
  console.log(`Timestamp: ${pingResult.timestamp}`);
}
```

#### 🚀 Batch Ping Operations

The `pingPeersAdvanced` function efficiently pings multiple peers with comprehensive results:

```typescript
import { pingPeersAdvanced } from '@frostr/igloo-core';

// Batch ping
const results = await pingPeersAdvanced(node, peerPubkeys, {
  timeout: 5000,
  eventConfig: { enableLogging: true }
});

console.log('📊 Batch Ping Results:');
const successCount = results.filter(r => r.success).length;
console.log(`Success rate: ${successCount}/${results.length} (${((successCount / results.length) * 100).toFixed(1)}%)`);

const successful = results.filter(r => r.success && r.latency);
if (successful.length > 0) {
  const avgLatency = successful.reduce((sum, r) => sum + r.latency!, 0) / successful.length;
  console.log(`Average latency: ${avgLatency.toFixed(1)}ms`);
  
  const fastest = successful.reduce((min, r) => r.latency! < min.latency! ? r : min);
  const slowest = successful.reduce((max, r) => r.latency! > max.latency! ? r : max);
  console.log(`🏆 Fastest peer: ${fastest.pubkey} (${fastest.latency}ms)`);
  console.log(`🐌 Slowest peer: ${slowest.pubkey} (${slowest.latency}ms)`);
}

// Individual results
results.forEach(result => {
  const status = result.success ? `${result.latency}ms` : `Failed: ${result.error}`;
  console.log(`${result.pubkey.slice(0, 8)}...: ${status}`);
});

// Note: Our implementation always pings concurrently for efficiency
```

#### 📡 Real-Time Ping Monitoring

The `createPingMonitor` function provides continuous monitoring with customizable callbacks:

```typescript
import { createPingMonitor } from '@frostr/igloo-core';

const monitor = createPingMonitor(node, peerPubkeys, {
  interval: 15000,    // Ping every 15 seconds
  timeout: 5000,      // 5 second timeout per ping
  
  // Real-time result callback
  onPingResult: (result) => {
    const timestamp = new Date(result.timestamp).toLocaleTimeString();
    
    if (result.success) {
      console.log(`🟢 [${timestamp}] ${result.pubkey.slice(0, 8)}...: ${result.latency}ms`);
      
      // Update UI, send notifications, etc.
      updatePeerStatus(result.pubkey, 'online', result.latency);
    } else {
      console.log(`🔴 [${timestamp}] ${result.pubkey.slice(0, 8)}...: ${result.error}`);
      updatePeerStatus(result.pubkey, 'offline');
    }
  },
  
  // Error handling
  onError: (error, context) => {
    console.warn('⚠️ Monitor error:', error.message);
    // Could implement retry logic, fallback mechanisms, etc.
  },
  
  relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
  eventConfig: { enableLogging: true }
});

// Start monitoring
monitor.start();
console.log('🎯 Ping monitoring started');

// Monitor provides status information
console.log(`Running: ${monitor.isRunning}`);

// Stop monitoring (important for cleanup!)
setTimeout(() => {
  monitor.stop();
  console.log('🛑 Ping monitoring stopped');
}, 300000); // Stop after 5 minutes
```

#### 🔬 Network Diagnostics

The `runPingDiagnostics` function performs comprehensive network analysis:

```typescript
import { runPingDiagnostics } from '@frostr/igloo-core';

const diagnostics = await runPingDiagnostics(node, peerPubkeys, {
  rounds: 3,          // Run 3 rounds of pings
  interval: 2000,     // 2 second delay between rounds
  timeout: 5000,
  eventConfig: { enableLogging: true }
});

console.log('🔬 Network Diagnostics Report:');
console.log(`Rounds completed: ${diagnostics.summary.totalRounds}`);
console.log(`Overall success rate: ${diagnostics.summary.successRate.toFixed(1)}%`);
console.log(`Average latency: ${diagnostics.summary.averageLatency.toFixed(1)}ms`);

// Per-peer statistics
Object.entries(diagnostics.peerStats).forEach(([pubkey, stats]) => {
  console.log(`\n📊 Peer ${pubkey.slice(0, 8)}...:`);
  console.log(`  Success rate: ${stats.successRate.toFixed(1)}% (${stats.successCount}/${stats.totalAttempts})`);
  
  if (stats.averageLatency > 0) {
    console.log(`  Average latency: ${stats.averageLatency.toFixed(1)}ms`);
    console.log(`  Min/Max latency: ${stats.minLatency}ms / ${stats.maxLatency}ms`);
  }
});

// Network health assessment
if (diagnostics.summary.successRate > 90) {
  console.log('🟢 Network health: Excellent');
} else if (diagnostics.summary.successRate > 70) {
  console.log('🟡 Network health: Good');
} else {
  console.log('🔴 Network health: Poor - investigate connectivity issues');
}
```

#### 🎯 Credential-Based Ping

The `pingPeersFromCredentials` function extracts peers from credentials and pings them:

```typescript
import { pingPeersFromCredentials } from '@frostr/igloo-core';

// Automatically extract peers from group credential and ping them
const results = await pingPeersFromCredentials(
  groupCredential, 
  shareCredential,
  {
    timeout: 5000,
    relays: ['wss://relay.damus.io']
  }
);

const successCount = results.filter(r => r.success).length;
console.log(`Pinged ${results.length} peers from credential set`);
console.log(`${successCount} peers are currently online`);

// Filter for online peers only
const onlinePeers = results
  .filter(r => r.success)
  .map(r => r.pubkey);

console.log('Online peers:', onlinePeers.map(p => p.slice(0, 8) + '...'));
```

### 🎯 Integrated with IglooCore

The convenience class provides seamless ping integration:

```typescript
const igloo = new IglooCore();

// Individual ping
const result = await igloo.pingPeer(node, peerPubkey, { timeout: 5000 });

// Batch ping (note: uses 'pingPeersAdvanced' to avoid conflicts)
const batchResults = await igloo.pingPeersAdvanced(node, peerPubkeys, {
  timeout: 5000
});

// Create ping monitor
const monitor = igloo.createPingMonitor(node, peerPubkeys, {
  interval: 30000,
  onPingResult: (result) => console.log(`Ping result:`, result)
});

// Run network diagnostics
const diagnostics = await igloo.runPingDiagnostics(node, peerPubkeys, {
  rounds: 3,
  interval: 2000
});

// Ping from credentials
const credentialResults = await igloo.pingPeersFromCredentials(
  groupCredential, 
  shareCredential
);
```

### 📊 Ping Type Definitions

```typescript
interface PingResult {
  success: boolean;                // Whether ping succeeded
  pubkey: string;                  // Peer public key
  latency?: number;                // Response time in milliseconds
  policy?: {                       // Peer permissions from Bifrost
    send: boolean;
    recv: boolean;
  };
  error?: string;                  // Error message if failed
  timestamp: Date;                 // Timestamp as Date object
}

// Note: Our ping functions return PingResult[] directly, not a batch result object

interface PingMonitorConfig {
  interval: number;                // Ping interval in milliseconds
  timeout: number;                 // Ping timeout in milliseconds
  onPingResult?: (result: PingResult) => void; // Individual result callback
  onError?: (error: Error, context: string) => void; // Error callback
  relays?: string[];               // Relay URLs to use
  eventConfig?: NodeEventConfig;   // Event configuration
}

interface PingMonitor {
  start: () => void;               // Start monitoring
  stop: () => void;                // Stop monitoring
  isRunning: boolean;              // Check if monitoring is active
  ping: () => Promise<PingResult[]>; // Manual ping function
  cleanup: () => void;             // Cleanup resources
}

// Ping diagnostics return a complex object with summary and detailed stats
interface PingDiagnosticsResult {
  summary: {
    totalRounds: number;           // Total diagnostic rounds requested
    totalPeers: number;            // Total peers tested
    averageLatency: number;        // Average latency across all successful pings
    successRate: number;           // Overall success rate across all rounds
    fastestPeer?: string;          // Fastest responding peer pubkey
    slowestPeer?: string;          // Slowest responding peer pubkey
  };
  rounds: PingResult[][];          // Results for each round
  peerStats: {                     // Per-peer statistics
    [pubkey: string]: {
      successCount: number;        // Successful ping count
      totalAttempts: number;       // Total ping attempts
      averageLatency: number;      // Average latency for successful pings
      minLatency: number;          // Minimum latency observed
      maxLatency: number;          // Maximum latency observed
      successRate: number;         // Success rate as percentage
    };
  };
}
```

### 🔧 Configuration Constants

```typescript
// Default configuration values
export const DEFAULT_PING_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.snort.social'
];

export const DEFAULT_PING_TIMEOUT = 5000;      // 5 seconds
export const DEFAULT_PING_INTERVAL = 30000;    // 30 seconds
```

### 🛡️ Production Best Practices

#### Error Handling and Resilience

```typescript
import { pingPeersAdvanced, createPingMonitor } from '@frostr/igloo-core';

// Robust ping with comprehensive error handling
async function robustPing(node: any, peers: string[]) {
  try {
    const results = await pingPeersAdvanced(node, peers, {
      timeout: 5000,
      concurrent: true,
      relays: ['wss://relay.damus.io', 'wss://relay.primal.net']
    });
    
    // Handle partial failures gracefully
    const successCount = results.filter(r => r.success).length;
    if (successCount === 0) {
      console.warn('⚠️ No peers responded - possible network issues');
      return { allOffline: true, results };
    }
    
    if (successCount < results.length) {
      console.warn(`⚠️ ${results.length - successCount} peers did not respond`);
    }
    
    return { success: true, results };
    
  } catch (error) {
    console.error('❌ Ping operation failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Production monitoring with proper cleanup
class PingMonitorManager {
  private monitors: Map<string, any> = new Map();
  
  createMonitor(id: string, node: any, peers: string[]) {
    // Cleanup existing monitor if present
    if (this.monitors.has(id)) {
      this.monitors.get(id).stop();
    }
    
    const monitor = createPingMonitor(node, peers, {
      interval: 30000,
      timeout: 5000,
      onPingResult: (result) => this.handlePingResult(id, result),
      onError: (error, context) => this.handlePingError(id, error)
    });
    
    this.monitors.set(id, monitor);
    monitor.start();
    
    return monitor;
  }
  
  private handlePingResult(monitorId: string, result: PingResult) {
    // Send to monitoring service, update UI, etc.
    console.log(`[${monitorId}] Ping result:`, result);
  }
  
  private handlePingError(monitorId: string, error: Error) {
    console.warn(`[${monitorId}] Ping error:`, error.message);
    // Could implement retry logic, alerting, etc.
  }
  
  stopAll() {
    for (const [id, monitor] of this.monitors) {
      monitor.stop();
      console.log(`Stopped monitor: ${id}`);
    }
    this.monitors.clear();
  }
}

// Usage with proper cleanup
const monitorManager = new PingMonitorManager();

// Create monitor
const monitor = monitorManager.createMonitor('main', node, peerPubkeys);

// Cleanup on application shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down ping monitors...');
  monitorManager.stopAll();
  process.exit(0);
});
```

#### Performance Optimization

```typescript
// Optimize for large peer lists
const largePeerList = [...Array(50)].map(() => generateRandomPubkey());

// Use concurrent pinging for speed
const results = await pingPeersAdvanced(node, largePeerList, {
  concurrent: true,    // Ping all peers simultaneously
  timeout: 3000,       // Shorter timeout for faster results
  relays: ['wss://relay.damus.io'] // Use fewer relays to reduce overhead
});

// For rate-limited scenarios, use sequential pings
const sequentialResults = await pingPeersAdvanced(node, largePeerList, {
  concurrent: false,   // Ping one at a time
  timeout: 5000
});

// Adaptive monitoring intervals based on network conditions
let monitorInterval = 30000; // Start with 30 seconds

const adaptiveMonitor = createPingMonitor(node, peers, {
  interval: monitorInterval,
  onBatchComplete: (results) => {
    const successRate = results.filter(r => r.success).length / results.length;
    
    if (successRate > 0.9) {
      // Network is healthy, can reduce frequency
      monitorInterval = Math.min(60000, monitorInterval * 1.2);
    } else if (successRate < 0.5) {
      // Network issues, increase frequency
      monitorInterval = Math.max(10000, monitorInterval * 0.8);
    }
    
    // Update monitor interval (would need to restart monitor in practice)
    console.log(`Adjusting monitor interval to ${monitorInterval}ms based on ${(successRate * 100).toFixed(1)}% success rate`);
  }
});
```

## Peer Management

The library provides comprehensive peer management capabilities for monitoring and tracking other participants in your FROSTR signing group in real-time. The system includes robust error handling, fallback mechanisms, and production-ready reliability features.

### Quick Start - Peer Management

```typescript
import { createPeerManagerRobust } from '@frostr/igloo-core';

// Production-ready peer management with automatic fallbacks
const result = await createPeerManagerRobust(node, groupCredential, shareCredential, {
  fallbackMode: 'static',  // Always provide peer list even if monitoring fails
  autoMonitor: true,       // Start monitoring automatically
  onError: (error, context) => {
    console.warn(`Peer issue in ${context}:`, error.message);
  }
});

if (result.success) {
  const status = result.peerManager.getPeerStatus();
  console.log(`✅ ${result.mode} mode: ${status.totalPeers} peers found`);
  
  if (result.mode === 'full') {
    console.log(`🟢 ${status.onlineCount} peers online`);
  }
} else {
  console.error('❌ Peer management failed:', result.error);
}
```

### Enhanced Peer Management Features

#### 🛡️ Robust Peer Manager Creation

The `createPeerManagerRobust` function provides production-ready peer management with automatic error handling and fallback modes:

```typescript
import { createPeerManagerRobust } from '@frostr/igloo-core';

const result = await createPeerManagerRobust(node, groupCredential, shareCredential, {
  fallbackMode: 'static',
  autoMonitor: true,
  onError: (error, context) => {
    console.warn(`Peer management error in ${context}:`, error.message);
  }
});

if (result.success) {
  console.log(`Peer manager created in ${result.mode} mode`);
  
  // Handle warnings (non-fatal issues)
  if (result.warnings) {
    result.warnings.forEach(warning => console.warn('⚠️', warning));
  }
  
  const status = result.peerManager.getPeerStatus();
  console.log(`Found ${status.totalPeers} peers`);
  
  switch (result.mode) {
    case 'full':
      // Full monitoring with live status updates
      console.log(`${status.onlineCount} peers currently online`);
      break;
    case 'static':
      // Static peer list (monitoring unavailable but peers still discoverable)
      console.log('Live monitoring unavailable, showing static peer list');
      break;
  }
} else {
  console.error('Peer management failed:', result.error);
  // Handle complete failure (invalid credentials, etc.)
}
```

#### ✅ Peer Credential Validation

Validate credentials upfront to provide better user feedback:

```typescript
import { validatePeerCredentials } from '@frostr/igloo-core';

const validation = await validatePeerCredentials(groupCredential, shareCredential);

if (validation.isValid) {
  console.log(`✅ Found ${validation.peerCount} peers`);
  console.log(`Self pubkey: ${validation.selfPubkey}`);
  
  // Handle non-fatal warnings
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(warning => console.warn('⚠️', warning));
  }
} else {
  console.error('❌ Invalid credentials:', validation.error);
  // Show user-friendly error message instead of crashing
}
```

#### 📊 Static Peer Manager Fallback

When live monitoring fails, the system automatically falls back to a static peer manager:

```typescript
import { StaticPeerManager } from '@frostr/igloo-core';

// Usually created automatically by createPeerManagerRobust, but can be manual
const staticManager = new StaticPeerManager(
  ['peer1_pubkey', 'peer2_pubkey'], 
  ['Live monitoring unavailable due to network issues']
);

const status = staticManager.getPeerStatus();
console.log(`Static peer list: ${status.totalPeers} peers found`);
console.log('Warnings:', staticManager.getWarnings());

// Static manager provides peer discovery but no live status
console.log('All peers:', status.peers.map(p => p.pubkey));
console.log('Online count:', status.onlineCount); // Always 0 for static
```

#### ⚙️ Configuration Options

```typescript
interface EnhancedPeerMonitorConfig {
  pingInterval: number;           // How often to ping (default: 30000ms)
  pingTimeout: number;            // Ping timeout (default: 5000ms)
  autoMonitor: boolean;           // Auto-start monitoring (default: true)
  fallbackMode?: 'static' | 'disabled'; // Fallback behavior
  onPeerStatusChange?: (peer: Peer) => void;  // Status change callback
  onError?: (error: Error, context: string) => void; // Error callback
}

// Production configuration - always provides peer list
const productionConfig = {
  fallbackMode: 'static',
  onError: (error, context) => {
    logToMonitoringService(`Peer ${context}`, error);
  }
};

// Development configuration - fail fast for debugging
const strictConfig = {
  fallbackMode: 'disabled',
  autoMonitor: false
};

// High-frequency monitoring
const quickConfig = {
  pingInterval: 10000,    // Ping every 10 seconds
  pingTimeout: 2000,      // 2 second timeout
  fallbackMode: 'static'
};
```

### 🔧 Advanced PeerManager Usage

For applications that need direct control over peer management, use the `PeerManager` class:

```typescript
import { PeerManager, createPeerManager } from '@frostr/igloo-core';

// Create a peer manager with custom configuration
const peerManager = await createPeerManager(
  node,
  groupCredential,
  shareCredential,
  {
    pingInterval: 30000,    // Ping every 30 seconds
    pingTimeout: 5000,      // 5 second timeout
    autoMonitor: true,      // Start monitoring automatically
    onPeerStatusChange: (peer) => {
      console.log(`Peer ${peer.pubkey} is now ${peer.status}`);
      
      // Custom logic for peer status changes
      if (peer.status === 'online') {
        console.log(`🟢 ${peer.pubkey} came online`);
      } else if (peer.status === 'offline') {
        console.log(`🔴 ${peer.pubkey} went offline`);
      }
    }
  }
);

// Get comprehensive peer status
const status = peerManager.getPeerStatus();
console.log(`${status.onlineCount}/${status.totalPeers} peers online`);
console.log('Last checked:', status.lastChecked);

// Get filtered peer lists
const onlinePeers = peerManager.getOnlinePeers();
const offlinePeers = peerManager.getOfflinePeers();
console.log('Online peers:', onlinePeers.map(p => p.pubkey));

// Check specific peer status
const isOnline = peerManager.isPeerOnline(peerPubkey);
const specificPeer = peerManager.getPeer(peerPubkey);

// Manual operations
const pingResult = await peerManager.pingPeers();
console.log('Ping results:', pingResult);

// Update monitoring configuration
peerManager.updateConfig({ pingInterval: 15000 });

// Cleanup when done (important!)
peerManager.cleanup();
```

### 🚀 Simple Standalone Functions

For lightweight peer operations without full management, use the standalone functions:

```typescript
import { 
  extractPeersFromCredentials, 
  pingPeers, 
  checkPeerStatus 
} from '@frostr/igloo-core';

// Extract peer list from group credentials
const peers = extractPeersFromCredentials(groupCredential, shareCredential);
console.log('Peers in group:', peers);

// Quick ping to check who's currently online
const onlinePeers = await pingPeers(node);
console.log('Online peers:', onlinePeers);

// Get detailed peer status with online/offline information
const peerStatus = await checkPeerStatus(node, groupCredential, shareCredential);
peerStatus.forEach(peer => {
  const statusIcon = peer.status === 'online' ? '🟢' : '🔴';
  console.log(`${statusIcon} ${peer.pubkey}: ${peer.status}`);
});
```

### 🎯 Integrated with IglooCore

The convenience class provides seamless peer management integration:

```typescript
const igloo = new IglooCore();

// Create node and robust peer manager in one workflow
const node = await igloo.createNode(groupCredential, shareCredential);

// Validate credentials upfront for better UX
const validation = await igloo.validatePeerCredentials(groupCredential, shareCredential);
if (!validation.isValid) {
  throw new Error(`Invalid credentials: ${validation.error}`);
}

// Create robust peer manager with automatic fallbacks
const result = await igloo.createPeerManagerRobust(node, groupCredential, shareCredential, {
  fallbackMode: 'static',
  onError: (error, context) => console.warn(`Peer ${context}:`, error.message)
});

if (result.success) {
  console.log(`Peer management active in ${result.mode} mode`);
  
  // Use the peer manager
  const status = result.peerManager.getPeerStatus();
  console.log(`Managing ${status.totalPeers} peers`);
}

// Alternative: Use standalone functions for simple operations
const peers = await igloo.extractPeers(groupCredential, shareCredential);
const onlinePeers = await igloo.pingPeers(node);
const detailedStatus = await igloo.checkPeerStatus(node, groupCredential, shareCredential);
```

### 📊 Real-Time Status Monitoring

The peer management system provides comprehensive real-time status tracking:

```typescript
// Set up real-time monitoring with status change callbacks
const peerManager = await createPeerManager(node, groupCredential, shareCredential, {
  onPeerStatusChange: (peer) => {
    const timestamp = new Date().toISOString();
    
    switch (peer.status) {
      case 'online':
        console.log(`🟢 [${timestamp}] ${peer.pubkey} came online`);
        // Trigger UI update, send notification, etc.
        break;
      case 'offline':
        console.log(`🔴 [${timestamp}] ${peer.pubkey} went offline`);
        // Handle offline peer logic
        break;
      case 'unknown':
        console.log(`⚪ [${timestamp}] ${peer.pubkey} status unknown`);
        break;
    }
  }
});

// Get comprehensive status dashboard
const status = peerManager.getPeerStatus();
console.log('📊 Peer Status Dashboard:');
console.log({
  totalPeers: status.totalPeers,
  onlineCount: status.onlineCount,
  offlineCount: status.totalPeers - status.onlineCount,
  lastChecked: status.lastChecked,
  onlinePeers: status.onlinePeers.map(p => ({
    pubkey: p.pubkey,
    lastSeen: p.lastSeen
  })),
  offlinePeers: status.offlinePeers.map(p => p.pubkey)
});

// Monitor specific peer
const importantPeer = 'peer1_pubkey';
if (peerManager.isPeerOnline(importantPeer)) {
  console.log(`✅ Critical peer ${importantPeer} is online`);
} else {
  console.warn(`⚠️ Critical peer ${importantPeer} is offline`);
}
```

### 🛡️ Production Error Handling

Production applications should implement comprehensive error handling and graceful degradation:

```typescript
import { createPeerManagerRobust, validatePeerCredentials } from '@frostr/igloo-core';

async function setupPeerManagement(node, groupCredential, shareCredential) {
  try {
    // Step 1: Validate credentials upfront
    const validation = await validatePeerCredentials(groupCredential, shareCredential);
    if (!validation.isValid) {
      console.error('❌ Invalid peer credentials:', validation.error);
      return { success: false, error: validation.error };
    }

    console.log(`✅ Credentials valid: ${validation.peerCount} peers found`);

    // Step 2: Create robust peer manager with comprehensive error handling
    const result = await createPeerManagerRobust(node, groupCredential, shareCredential, {
      fallbackMode: 'static',  // Always provide peer list
      autoMonitor: true,
      onError: (error, context) => {
        // Log error but don't crash the app
        console.error(`Peer management error in ${context}:`, error.message);
        
        // Send to monitoring service
        sendToMonitoringService('peer_management_error', {
          context,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Step 3: Handle different operational modes
    switch (result.mode) {
      case 'full':
        console.log('🟢 Full peer monitoring active');
        // Enable all peer-dependent features
        enableRealtimeFeatures();
        break;
        
      case 'static':
        console.log('🟡 Static peer list mode (live monitoring unavailable)');
        // Disable real-time features, show static peer list
        showStaticPeerList(result.peerManager.getAllPeers());
        break;
        
      case 'failed':
        console.error('🔴 Peer management completely failed');
        // Fallback to single-user mode or show error to user
        return { success: false, error: result.error };
    }

    return { success: true, peerManager: result.peerManager, mode: result.mode };

  } catch (error) {
    console.error('❌ Unexpected error setting up peer management:', error);
    return { success: false, error: error.message };
  }
}

// Usage with proper cleanup
const peerSetup = await setupPeerManagement(node, groupCredential, shareCredential);

if (peerSetup.success) {
  // Use peer manager...
  const status = peerSetup.peerManager.getPeerStatus();
  console.log(`Managing ${status.totalPeers} peers in ${peerSetup.mode} mode`);
  
  // Always cleanup when done (e.g., component unmount, app shutdown)
  process.on('SIGTERM', () => {
    if (peerSetup.peerManager) {
      peerSetup.peerManager.cleanup();
    }
  });
} else {
  // Handle failure gracefully
  showUserFriendlyError('Peer management unavailable. Operating in single-user mode.');
}
```

### 📋 Type Definitions

```typescript
interface Peer {
  pubkey: string;                          // Peer's public key
  status: 'online' | 'offline' | 'unknown'; // Current status
  lastSeen?: Date;                         // Last seen timestamp
  allowSend: boolean;                      // Can send to this peer
  allowReceive: boolean;                   // Can receive from this peer
}

interface PeerValidationResult {
  isValid: boolean;                        // Whether credentials are valid
  peerCount: number;                       // Number of peers found
  peers: string[];                         // Array of peer public keys
  selfPubkey?: string;                     // Self public key
  warnings: string[];                      // Any warnings
  error?: string;                          // Error message if invalid
}

interface PeerManagerResult {
  success: boolean;                        // Whether creation succeeded
  peerManager?: PeerManager | StaticPeerManager; // The created manager
  mode: 'full' | 'static' | 'failed';     // Operation mode
  warnings?: string[];                     // Any warnings
  error?: string;                          // Error message if failed
}

interface EnhancedPeerMonitorConfig {
  pingInterval: number;                    // Ping frequency (default: 30000ms)
  pingTimeout: number;                     // Ping timeout (default: 5000ms)
  autoMonitor: boolean;                    // Auto-start monitoring (default: true)
  fallbackMode?: 'static' | 'disabled';   // Fallback behavior
  onPeerStatusChange?: (peer: Peer) => void; // Status change callback
  onError?: (error: Error, context: string) => void; // Error callback
}
```

## Best Practices

### ✅ Node Lifecycle & Events

When using `createAndConnectNode()`, the Promise resolves when the node is ready and connected. The node is immediately ready for use:

```typescript
// ✅ Correct - Node is ready immediately after Promise resolves
const node = await createAndConnectNode({ group, share, relays });
setNodeReady(true); // Safe to set state immediately

// Set up event listeners for future state changes
node.on('closed', () => setNodeReady(false));
node.on('error', () => setNodeReady(false));
```

**⚠️ Race Condition Warning**: The `'ready'` event may fire before your event listeners are attached. Always assume the node is ready when `createAndConnectNode()` resolves.

```typescript
// ❌ Avoid - May miss the ready event due to race condition
const node = await createAndConnectNode({ group, share, relays });
node.on('ready', () => setNodeReady(true)); // This may never fire!
```

### 🔧 React Integration Patterns

#### Proper useEffect Usage

```typescript
// ✅ Correct - Only cleanup on unmount
useEffect(() => {
  return () => {
    if (nodeRef.current) {
      cleanupNode();
    }
  };
}, []); // Empty dependency array prevents cleanup loops
```

```typescript
// ❌ Wrong - Causes cleanup on every state change
useEffect(() => {
  return () => cleanupNode();
}, [isRunning, isConnecting]); // Triggers cleanup unnecessarily
```

#### Complete Node Cleanup

```typescript
const cleanupNode = () => {
  if (nodeRef.current) {
    try {
      // Remove all event listeners before disconnecting
      nodeRef.current.off('ready');
      nodeRef.current.off('closed');
      nodeRef.current.off('error');
      // ... remove other listeners
      
      // Disconnect the node
      nodeRef.current.close();
      nodeRef.current = null;
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
};
```

#### Forwarding Controls with useImperativeHandle

```typescript
export interface SignerHandle {
  stopSigner: () => Promise<void>;
}

const Signer = forwardRef<SignerHandle, SignerProps>(({ }, ref) => {
  useImperativeHandle(ref, () => ({
    stopSigner: async () => {
      if (isSignerRunning) {
        await handleStopSigner();
      }
    }
  }));
  
  // ... component implementation
});
```

### 🔍 Property Access Guidelines

- **`node.client`**: Read-only property - do not attempt to modify
- **Event Handlers**: Always remove event listeners before disconnecting
- **State Management**: Set ready state immediately after `createAndConnectNode()` resolves

### 🛠️ Error Handling Best Practices

```typescript
try {
  const node = await createAndConnectNode({ group, share, relays });
  
  // Handle successful connection
  setIsConnected(true);
  
  // Set up error handlers for runtime issues
  node.on('error', (error) => {
    console.error('Node error:', error);
    setIsConnected(false);
  });
  
} catch (error) {
  // Handle connection failures
  console.error('Failed to connect:', error);
  setIsConnected(false);
}
```

### 🎯 Comprehensive Event Handling

The library now provides complete coverage of all Bifrost node events, including:

- **Base Events**: `ready`, `closed`, `message`, `bounced`, `error`, `info`, `debug`, and wildcard `*`
- **ECDH Events**: All sender and handler events including return and error cases
- **Signature Events**: Complete signing workflow event coverage
- **Ping Events**: Full ping protocol including return and error handling
- **Echo Events**: Complete echo functionality with return and error events

```typescript
// All events are automatically handled with proper logging
const node = await createAndConnectNode({ group, share, relays }, {
  enableLogging: true,
  logLevel: 'debug', // See all events
  customLogger: (level, message, data) => {
    console.log(`[${level}] ${message}`, data);
  }
});

// Or handle specific events manually
node.on('/echo/sender/ret', (reason: string) => {
  console.log('Echo operation completed:', reason);
});

node.on('/ping/sender/err', (reason: string, msg: any) => {
  console.error('Ping failed:', reason, msg);
});
```

### 📋 Validation Best Practices

Use comprehensive validation before creating nodes:

```typescript
import { validateShare, validateGroup, decodeShare, decodeGroup } from '@frostr/igloo-core';

// Basic validation
const shareValidation = validateShare(shareCredential);
const groupValidation = validateGroup(groupCredential);

if (!shareValidation.isValid || !groupValidation.isValid) {
  throw new Error('Invalid credentials');
}

// Deep validation with decoding
try {
  const decodedShare = decodeShare(shareCredential);
  const decodedGroup = decodeGroup(groupCredential);
  
  // Additional structure validation
  if (typeof decodedShare.idx !== 'number' || 
      typeof decodedGroup.threshold !== 'number') {
    throw new Error('Invalid credential structure');
  }
} catch (error) {
  throw new Error(`Credential validation failed: ${error.message}`);
}
```

### 🎯 Complete React Signer Example

Here's a complete example implementing all the best practices:

```typescript
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { 
  createAndConnectNode, 
  cleanupBifrostNode, 
  isNodeReady,
  validateShare, 
  validateGroup 
} from '@frostr/igloo-core';

export interface SignerHandle {
  stopSigner: () => Promise<void>;
}

interface SignerProps {
  groupCredential: string;
  shareCredential: string;
  relays: string[];
}

const Signer = forwardRef<SignerHandle, SignerProps>(({ 
  groupCredential, 
  shareCredential, 
  relays 
}, ref) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const nodeRef = useRef<any>(null);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (nodeRef.current) {
        cleanupBifrostNode(nodeRef.current);
      }
    };
  }, []); // Empty dependency array is crucial

  // Expose stop method to parent
  useImperativeHandle(ref, () => ({
    stopSigner: async () => {
      if (isRunning) {
        await handleStop();
      }
    }
  }));

  const handleStart = async () => {
    try {
      // Validate inputs first
      const shareValid = validateShare(shareCredential);
      const groupValid = validateGroup(groupCredential);
      
      if (!shareValid.isValid || !groupValid.isValid) {
        throw new Error('Invalid credentials');
      }

      setIsConnecting(true);
      setError(undefined);

      // Create and connect node
      const node = await createAndConnectNode({
        group: groupCredential,
        share: shareCredential,
        relays
      });

      nodeRef.current = node;

      // Node is ready immediately after Promise resolves
      setIsRunning(true);
      setIsConnecting(false);

      // Set up listeners for future state changes
      node.on('closed', () => {
        setIsRunning(false);
        setIsConnecting(false);
      });

      node.on('error', (error: any) => {
        setError(error.message);
        setIsRunning(false);
        setIsConnecting(false);
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnecting(false);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    try {
      if (nodeRef.current) {
        cleanupBifrostNode(nodeRef.current);
        nodeRef.current = null;
      }
      setIsRunning(false);
      setIsConnecting(false);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup error');
    }
  };

  return (
    <div>
      <div>Status: {isRunning ? 'Running' : isConnecting ? 'Connecting...' : 'Stopped'}</div>
      {error && <div>Error: {error}</div>}
      <button 
        onClick={isRunning ? handleStop : handleStart}
        disabled={isConnecting}
      >
        {isRunning ? 'Stop' : isConnecting ? 'Connecting...' : 'Start'} Signer
      </button>
    </div>
  );
});

export default Signer;
```

## Demo

Run the included demo to see all functionality in action:

```bash
# Clone the repository to run the demo
git clone https://github.com/FROSTR-ORG/igloo-core.git
cd igloo-core
npm install
npm run demo
```

Or try it directly in your project:

```bash
npm install @frostr/igloo-core
```

The demo showcases:
- Keyset generation and recovery
- Echo functionality and timeouts
- Node management and connections
- Peer management and monitoring
- Comprehensive ping functionality
- Error handling scenarios

### Additional Examples

The `examples/` directory contains comprehensive demonstrations:

```bash
# Run the ping functionality example
npx ts-node --esm examples/ping-example.ts

# Run the peer management example  
npx ts-node --esm examples/peer-management.ts
```

These examples demonstrate real-world usage patterns with:
- Generated credentials for immediate testing
- Complete error handling and graceful degradation
- Production-ready patterns and best practices

## Complete Example - Peer Management

Here's a comprehensive example showing peer management in a real application:

```typescript
import { 
  IglooCore, 
  createPeerManagerRobust, 
  validatePeerCredentials 
} from '@frostr/igloo-core';

class SigningApplication {
  private igloo: IglooCore;
  private node: any;
  private peerManager: any;
  
  constructor() {
    this.igloo = new IglooCore();
  }
  
  async initialize(groupCredential: string, shareCredential: string) {
    try {
      // Step 1: Validate credentials
      console.log('🔍 Validating credentials...');
      const validation = await validatePeerCredentials(groupCredential, shareCredential);
      
      if (!validation.isValid) {
        throw new Error(`Invalid credentials: ${validation.error}`);
      }
      
      console.log(`✅ Found ${validation.peerCount} peers in signing group`);
      
      // Step 2: Create node
      console.log('🌐 Creating node...');
      this.node = await this.igloo.createNode(groupCredential, shareCredential);
      
      // Step 3: Set up robust peer management
      console.log('👥 Setting up peer management...');
      const peerResult = await createPeerManagerRobust(this.node, groupCredential, shareCredential, {
        fallbackMode: 'static',
        autoMonitor: true,
        pingInterval: 15000, // Check every 15 seconds
        onPeerStatusChange: (peer) => this.handlePeerStatusChange(peer),
        onError: (error, context) => this.handlePeerError(error, context)
      });
      
      if (peerResult.success) {
        this.peerManager = peerResult.peerManager;
        console.log(`🟢 Peer management active in ${peerResult.mode} mode`);
        
        // Show initial peer status
        this.displayPeerStatus();
      } else {
        console.warn('⚠️ Peer management failed, continuing without peer monitoring');
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  private handlePeerStatusChange(peer: any) {
    const timestamp = new Date().toLocaleTimeString();
    
    switch (peer.status) {
      case 'online':
        console.log(`🟢 [${timestamp}] Peer came online: ${peer.pubkey.slice(0, 8)}...`);
        this.notifyUI('peer_online', peer);
        break;
      case 'offline':
        console.log(`🔴 [${timestamp}] Peer went offline: ${peer.pubkey.slice(0, 8)}...`);
        this.notifyUI('peer_offline', peer);
        break;
    }
  }
  
  private handlePeerError(error: Error, context: string) {
    console.warn(`⚠️ Peer management error in ${context}:`, error.message);
    // Could send to monitoring service here
  }
  
  private displayPeerStatus() {
    if (!this.peerManager) return;
    
    const status = this.peerManager.getPeerStatus();
    console.log('\n📊 Peer Status Dashboard:');
    console.log(`Total peers: ${status.totalPeers}`);
    console.log(`Online: ${status.onlineCount}`);
    console.log(`Offline: ${status.totalPeers - status.onlineCount}`);
    console.log(`Last checked: ${status.lastChecked?.toLocaleTimeString() || 'Never'}`);
    
    if (status.onlinePeers.length > 0) {
      console.log('\n🟢 Online peers:');
      status.onlinePeers.forEach(peer => {
        console.log(`  • ${peer.pubkey.slice(0, 8)}... (last seen: ${peer.lastSeen?.toLocaleTimeString()})`);
      });
    }
    
    if (status.offlinePeers.length > 0) {
      console.log('\n🔴 Offline peers:');
      status.offlinePeers.forEach(peer => {
        console.log(`  • ${peer.pubkey.slice(0, 8)}...`);
      });
    }
  }
  
  private notifyUI(event: string, data: any) {
    // Emit events to UI components
    console.log(`UI Event: ${event}`, data);
  }
  
  async getSigningReadiness() {
    if (!this.peerManager) {
      return { ready: false, reason: 'Peer management not available' };
    }
    
    const status = this.peerManager.getPeerStatus();
    const requiredPeers = 2; // Example: need at least 2 peers online
    
    if (status.onlineCount >= requiredPeers) {
      return { 
        ready: true, 
        onlinePeers: status.onlineCount,
        totalPeers: status.totalPeers 
      };
    } else {
      return { 
        ready: false, 
        reason: `Need ${requiredPeers} peers online, only ${status.onlineCount} available`,
        onlinePeers: status.onlineCount,
        totalPeers: status.totalPeers
      };
    }
  }
  
  async shutdown() {
    console.log('🔄 Shutting down...');
    
    if (this.peerManager) {
      this.peerManager.cleanup();
      console.log('✅ Peer manager cleaned up');
    }
    
    if (this.node) {
      this.node.close();
      console.log('✅ Node disconnected');
    }
  }
}

// Usage
const app = new SigningApplication();

async function main() {
  const result = await app.initialize(groupCredential, shareCredential);
  
  if (result.success) {
    console.log('🚀 Application ready!');
    
    // Check signing readiness
    const readiness = await app.getSigningReadiness();
    if (readiness.ready) {
      console.log('✅ Ready for signing operations');
    } else {
      console.log('⏳ Waiting for peers:', readiness.reason);
    }
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received shutdown signal');
      app.shutdown().then(() => process.exit(0));
    });
    
  } else {
    console.error('❌ Failed to start application:', result.error);
    process.exit(1);
  }
}

main().catch(console.error);
```

## API Reference

### Exports

```typescript
// Main convenience class
export class IglooCore
export const igloo: IglooCore

// Keyset functions
export function generateKeysetWithSecret(threshold: number, totalMembers: number, secretKey: string): KeysetCredentials
export function recoverSecretKeyFromCredentials(groupCredential: string, shareCredentials: string[]): string
export function getShareDetails(shareCredential: string): ShareDetails
export function decodeShare(shareCredential: string): SharePackage
export function decodeGroup(groupCredential: string): GroupPackage

// Node functions
export function createBifrostNode(config: NodeConfig, eventConfig?: NodeEventConfig): BifrostNode
export function createAndConnectNode(config: NodeConfig, eventConfig?: NodeEventConfig): Promise<BifrostNode>
export function createConnectedNode(config: EnhancedNodeConfig, eventConfig?: NodeEventConfig): Promise<NodeCreationResult>
export function connectNode(node: BifrostNode): Promise<void>
export function closeNode(node: BifrostNode): void
export function isNodeReady(node: BifrostNode): boolean
export function cleanupBifrostNode(node: BifrostNode): void

// Echo functions
export function awaitShareEcho(groupCredential: string, shareCredential: string, options?: EchoOptions): Promise<boolean>
export function startListeningForAllEchoes(groupCredential: string, shareCredentials: string[], callback: EchoReceivedCallback, options?: EchoOptions): EchoListener

// Nostr functions
export function generateNostrKeyPair(): NostrKeyPair
export function nsecToHex(nsec: string): string
export function hexToNsec(hex: string): string
export function npubToHex(npub: string): string
export function hexToNpub(hex: string): string
export function derivePublicKey(privateKey: string): { npub: string; hexPublicKey: string }
export function validateHexKey(hex: string, keyType?: 'private' | 'public'): void
export function validateNostrKey(key: string, expectedType?: 'nsec' | 'npub'): void

// Ping functions
export function pingPeer(node: BifrostNode, peerPubkey: string, options?: { timeout?: number; eventConfig?: NodeEventConfig }): Promise<PingResult>
export function pingPeers(node: BifrostNode, peerPubkeys: string[], options?: { timeout?: number; eventConfig?: NodeEventConfig }): Promise<PingResult[]>
export function pingPeersAdvanced(node: BifrostNode, peerPubkeys: string[], options?: { timeout?: number; eventConfig?: NodeEventConfig }): Promise<PingResult[]>
export function createPingMonitor(node: BifrostNode, peerPubkeys: string[], config?: Partial<PingMonitorConfig>): PingMonitor
export function runPingDiagnostics(node: BifrostNode, peerPubkeys: string[], options?: { rounds?: number; timeout?: number; interval?: number; eventConfig?: NodeEventConfig }): Promise<{ summary: object; rounds: PingResult[][]; peerStats: object }>
export function pingPeersFromCredentials(groupCredential: string, shareCredential: string, options?: { relays?: string[]; timeout?: number; eventConfig?: NodeEventConfig }): Promise<PingResult[]>
export const DEFAULT_PING_RELAYS: string[]
export const DEFAULT_PING_TIMEOUT: number
export const DEFAULT_PING_INTERVAL: number

// Peer management functions
export class PeerManager
export class StaticPeerManager
export function createPeerManager(node: BifrostNode, groupCredential: string, shareCredential: string, config?: Partial<PeerMonitorConfig>): Promise<PeerManager>
export function createPeerManagerRobust(node: BifrostNode, groupCredential: string, shareCredential: string, config?: Partial<EnhancedPeerMonitorConfig>): Promise<PeerManagerResult>
export function validatePeerCredentials(groupCredential: string, shareCredential: string): Promise<PeerValidationResult>
export function extractPeersFromCredentials(groupCredential: string, shareCredential: string): string[]
export function pingPeers(node: BifrostNode, timeout?: number): Promise<string[]> // Legacy compatibility function
export function checkPeerStatus(node: BifrostNode, groupCredential: string, shareCredential: string): Promise<{ pubkey: string; status: 'online' | 'offline' }[]>
export const DEFAULT_PEER_MONITOR_CONFIG: PeerMonitorConfig

// Validation functions
export function validateKeysetParams(params: KeysetParams): void
export function validateSecretKey(secretKey: string): void
export function validateSharesCompatibility(shares: SharePackage[]): void

// Comprehensive validation functions
export function validateNsec(nsec: string): ValidationResult
export function validateHexPrivkey(hexPrivkey: string): ValidationResult
export function validateShare(share: string): ValidationResult
export function validateGroup(group: string): ValidationResult
export function validateRelay(relay: string): ValidationResult
export function validateBfcred(cred: string): ValidationResult
export function validateCredentialFormat(credential: string, type: 'share' | 'group' | 'cred'): ValidationResult
export function validateRelayList(relays: string[]): RelayValidationResult
export function validateCredentialSet(credentials: CredentialSet): CredentialSetValidationResult
export function validateMinimumShares(shares: string[], requiredThreshold: number): ValidationResult
export function validateWithOptions(credentials: BifrostCredentials, options?: ValidationOptions): ValidatedCredentials
export const VALIDATION_CONSTANTS: ValidationConstants

// Error classes
export class IglooError extends Error
export class KeysetError extends IglooError
export class NodeError extends IglooError
export class EchoError extends IglooError
export class RecoveryError extends IglooError
export class NostrError extends IglooError
export class BifrostValidationError extends IglooError
export class NostrValidationError extends IglooError

// All types and interfaces
export * from './types'

// Ping types
export type {
  PingResult,
  PingMonitorConfig,
  PingMonitor
} from './ping'

// Peer management types
export type {
  Peer,
  PeerMonitorConfig,
  PeerMonitorResult,
  PeerValidationResult,
  PeerManagerResult,
  EnhancedPeerMonitorConfig
} from './peer'
```

## Contributing

We welcome contributions to `@frostr/igloo-core`! This library is actively maintained as part of the FROSTR ecosystem.

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/FROSTR-ORG/igloo-core.git
   cd igloo-core
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

### Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

For questions or discussions, please [open an issue](https://github.com/FROSTR-ORG/igloo-core/issues) or reach out to the FROSTR team.

## License

MIT 