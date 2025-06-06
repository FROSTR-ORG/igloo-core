# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-06-06

### 🚀 Added

#### Enhanced Node Management
- **`createConnectedNode()`**: New function that returns both node and state information
- **`isNodeReady()`**: Synchronous function to check node ready state, avoiding race conditions
- **`cleanupBifrostNode()`**: Comprehensive cleanup utility for safe node disconnection
- **Enhanced configuration**: `EnhancedNodeConfig` interface with timeout and auto-reconnect options

#### New Type Definitions
- `EnhancedNodeConfig`: Extended node configuration with advanced options
- `NodeState`: Detailed connection state information
- `NodeCreationResult`: Combined node and state result type

#### IglooCore Class Enhancements
- `createEnhancedNode()`: Create nodes with state information
- `isNodeReady()`: Check node ready state
- `cleanupNode()`: Safe node cleanup

### 📚 Documentation Improvements

#### New "Best Practices" Section
- **Node Lifecycle & Events**: Explains timing and race conditions with `createAndConnectNode()`
- **React Integration Patterns**: Proper `useEffect` usage, cleanup patterns, and `useImperativeHandle`
- **Property Access Guidelines**: Documents read-only properties and safe access patterns
- **Error Handling**: Comprehensive error handling strategies
- **Validation Best Practices**: Deep validation techniques with examples
- **Complete React Signer Example**: Full working component demonstrating all best practices

#### API Reference Updates
- Added new function signatures and type definitions
- Clear warnings about race conditions and timing issues
- Enhanced examples with real-world usage patterns

### 🔧 Improved

#### Race Condition Prevention
- Clear documentation that nodes are ready immediately when `createAndConnectNode()` resolves
- Warning about `ready` event timing and potential race conditions
- Synchronous state checking to avoid event timing issues

#### Error Handling
- Graceful handling of cleanup errors
- Better error messages for invalid configurations
- Comprehensive error handling in all new utilities

#### Developer Experience
- Clear guidance on React integration patterns
- Prevention of common pitfalls like cleanup loops
- Better separation of concerns between connection and state management

### 🧪 Testing

#### New Test Coverage
- **Node Management Tests**: Comprehensive testing for all new node functions
- **Race Condition Tests**: Verification of timing and state management
- **React Integration Tests**: Simulation of React patterns and edge cases
- **Error Handling Tests**: Coverage of failure scenarios and cleanup
- **State Management Tests**: Testing of synchronous state checking

### 🏗️ Infrastructure
- Added comprehensive test suite for new functionality
- Updated TypeScript exports for all new features
- Enhanced error handling throughout the codebase

### 📋 Documentation
- **IMPROVEMENTS.md**: Detailed analysis of changes based on client feedback
- Enhanced README with practical examples and warnings
- Clear migration path for existing users

---

## [0.1.0] - 2025-06-05

### 🎉 Initial Release

#### Core Features
- **Keyset Management**: Generate, decode, and manage threshold signature keysets
- **Node Management**: Create and manage BifrostNodes with comprehensive event handling
- **Echo Functionality**: QR code transfers and share confirmation with visual feedback
- **Nostr Integration**: Complete nostr key management and format conversion utilities
- **Strong Types**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Structured error types with detailed context
- **Secret Recovery**: Secure threshold-based secret key reconstruction
- **Validation**: Built-in validation for all inputs using Zod schemas

#### API Functions
- Keyset generation and recovery functions
- Node creation and connection utilities
- Echo and event listening capabilities
- Nostr key format conversion utilities
- Comprehensive validation functions

#### Developer Experience
- TypeScript-first design with full type safety
- Comprehensive error handling with structured error types
- Clean, intuitive API design
- Extensive documentation and examples

---

## Breaking Changes Notice

### 0.1.0 → 0.2.0
- **No Breaking Changes**: All existing APIs remain fully compatible
- New features are additive and don't affect existing usage
- Enhanced documentation provides clearer guidance for optimal usage patterns 