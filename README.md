# @frostr/igloo-core

[![npm version](https://badge.fury.io/js/@frostr%2Figloo-core.svg)](https://badge.fury.io/js/@frostr%2Figloo-core)
[![npm downloads](https://img.shields.io/npm/dm/@frostr/igloo-core.svg)](https://www.npmjs.com/package/@frostr/igloo-core)
[![GitHub stars](https://img.shields.io/github/stars/FROSTR-ORG/igloo-core.svg)](https://github.com/FROSTR-ORG/igloo-core)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/FROSTR-ORG/igloo-core/blob/main/LICENSE)

A TypeScript library providing core functionality for FROSTR/Bifrost distributed key management and remote signing. This library abstracts the complexity of threshold signatures and provides a clean, strongly-typed API for building secure distributed applications.

## Features

- 🔑 **Keyset Management**: Generate, decode, and manage threshold signature keysets
- 🌐 **Node Management**: Create and manage BifrostNodes with comprehensive event handling
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

// Nostr functions
export function generateNostrKeyPair(): NostrKeyPair
export function nsecToHex(nsec: string): string
export function hexToNsec(hex: string): string
export function npubToHex(npub: string): string
export function hexToNpub(hex: string): string
export function derivePublicKey(privateKey: string): { npub: string; hexPublicKey: string }
export function validateHexKey(hex: string, keyType?: 'private' | 'public'): void
export function validateNostrKey(key: string, expectedType?: 'nsec' | 'npub'): void

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
```

## Changelog

### 0.1.0 (2024-06-05)

- 🎉 **Initial Release**: First stable version of `@frostr/igloo-core`
- ✨ **Core Features**: Complete keyset management, node operations, and echo functionality
- 🔐 **Nostr Integration**: Full nostr key management and format conversion utilities
- 🛡️ **Comprehensive Validation**: Advanced validation for all FROSTR/Bifrost components
- 📚 **TypeScript Support**: Full type definitions and strong typing throughout
- 📖 **Documentation**: Comprehensive README with examples and API reference

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

### Roadmap

Future improvements include:
- Comprehensive test suite expansion
- CI/CD pipeline setup
- Documentation website
- Additional example applications
- Performance benchmarks
- Browser compatibility testing

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