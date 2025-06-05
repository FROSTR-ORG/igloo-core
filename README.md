# @igloo/core

A TypeScript library providing core functionality for FROSTR/Bifrost distributed key management and remote signing. This library abstracts the complexity of threshold signatures and provides a clean, strongly-typed API for building secure distributed applications.

## Features

- 🔑 **Keyset Management**: Generate, decode, and manage threshold signature keysets
- 🌐 **Node Management**: Create and manage BifrostNodes with comprehensive event handling
- 📡 **Echo Functionality**: QR code transfers and share confirmation with visual feedback
- 🛡️ **Strong Types**: Full TypeScript support with comprehensive type definitions
- ⚡ **Error Handling**: Structured error types with detailed context
- 🔄 **Secret Recovery**: Secure threshold-based secret key reconstruction
- 🎯 **Validation**: Built-in validation for all inputs using Zod schemas

## Installation

```bash
npm install @igloo/core
```

### Peer Dependencies

```bash
npm install @frostr/bifrost nostr-tools
```

## Quick Start

### Basic Usage

```typescript
import { igloo, generateKeysetWithSecret, recoverSecretKeyFromCredentials } from '@igloo/core';

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
import { IglooCore } from '@igloo/core';

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
```

## Core Functions

### Keyset Management

#### `generateKeysetWithSecret(threshold, totalMembers, secretKey)`

Generates a new keyset from a secret key using Shamir's Secret Sharing.

```typescript
import { generateKeysetWithSecret } from '@igloo/core';

const keyset = generateKeysetWithSecret(2, 3, 'your-hex-secret-key');
// Returns: { groupCredential: string, shareCredentials: string[] }
```

#### `recoverSecretKeyFromCredentials(groupCredential, shareCredentials)`

Recovers the original secret key from threshold shares.

```typescript
import { recoverSecretKeyFromCredentials } from '@igloo/core';

const nsec = recoverSecretKeyFromCredentials(
  groupCredential,
  shareCredentials.slice(0, threshold)
);
```

#### `getShareDetails(shareCredential)`

Gets information about a share including index and threshold parameters.

```typescript
import { getShareDetails } from '@igloo/core';

const details = getShareDetails(shareCredential);
console.log(`Share ${details.idx}: ${details.threshold}/${details.totalMembers}`);
```

### Node Management

#### `createAndConnectNode(config, eventConfig?)`

Creates and connects a BifrostNode with optional event configuration.

```typescript
import { createAndConnectNode } from '@igloo/core';

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
import { awaitShareEcho } from '@igloo/core';

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
import { startListeningForAllEchoes } from '@igloo/core';

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
  RecoveryError 
} from '@igloo/core';

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

All inputs are validated using Zod schemas:

- **KeysetParams**: Validates threshold and totalMembers
- **RelayUrl**: Validates WebSocket URLs (must start with 'ws')
- **SecretKey**: Validates non-empty secret keys
- **NodeConfig**: Validates complete node configuration

## Demo

Run the included demo to see all functionality in action:

```bash
cd packages/igloo-core
npm run build
node demo.js
```

The demo showcases:
- Keyset generation and recovery
- Echo functionality and timeouts
- Node management and connections
- Error handling scenarios

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
export function connectNode(node: BifrostNode): Promise<void>
export function closeNode(node: BifrostNode): void

// Echo functions
export function awaitShareEcho(groupCredential: string, shareCredential: string, options?: EchoOptions): Promise<boolean>
export function startListeningForAllEchoes(groupCredential: string, shareCredentials: string[], callback: EchoReceivedCallback, options?: EchoOptions): EchoListener

// Validation functions
export function validateKeysetParams(params: KeysetParams): void
export function validateSecretKey(secretKey: string): void
export function validateSharesCompatibility(shares: SharePackage[]): void

// Error classes
export class IglooError extends Error
export class KeysetError extends IglooError
export class NodeError extends IglooError
export class EchoError extends IglooError
export class RecoveryError extends IglooError

// All types and interfaces
export * from './types'
```

## Contributing

This is a demo package showing how bifrost functionality can be extracted into a reusable library. When split out into its own repository, it should include:

- Comprehensive test suite
- CI/CD pipeline
- Documentation website
- Example applications
- Performance benchmarks

## License

MIT 