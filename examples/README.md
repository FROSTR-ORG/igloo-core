# Examples

This directory contains examples and demonstrations of the @frostr/igloo-core library functionality.

## Files

### `demo.ts`
A comprehensive demonstration showing all major features of the library:
- Keyset generation and recovery
- Echo functionality for QR code transfers
- Node management and connections
- Error handling examples

Run the demo:
```bash
npm run build
node examples/demo.js
```

### `example-usage.ts`
Migration examples showing how to update code from the current Igloo Desktop app to use @frostr/igloo-core:
- Before/after code comparisons
- Migration patterns and best practices
- Example service class implementation

### `validation-example.ts`
Comprehensive validation examples demonstrating all validation functions:
- Nostr key validation (nsec, hex private keys)
- Bifrost credential validation (shares, groups, bfcred)
- Relay URL validation and normalization
- Batch validation and advanced options
- IglooCore convenience validation methods

## Running Examples

1. First build the library:
```bash
npm run build
```

2. Then run any example:
```bash
node examples/demo.js
node examples/example-usage.js
node examples/validation-example.js
```

Note: The examples use placeholder secret keys and may timeout when trying to connect to real relays. This is expected behavior for demonstration purposes. 