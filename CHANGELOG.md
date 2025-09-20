# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-09-20

### 🚀 Added - Policy-Driven Signer Controls
- **`src/policy.ts`**: New policy utility layer for normalizing Bifrost peer configs, syncing runtime metadata, and answering send/receive permission checks.
- **`src/node.ts`**: `createBifrostNode` now accepts normalized policy definitions and registers metadata for downstream helpers.
- **Exports & Types**: `NodePolicyInput`, `NodePolicySummary`, and `PolicyError` provide strongly-typed ergonomics for policy-aware tooling.

### ✨ Improved
- **IglooCore Convenience**: `createNode`/`createEnhancedNode` accept policy-aware options; new helpers (`setNodePolicies`, `canNodeSendTo`, etc.) simplify runtime governance.
- **Documentation**: README details policy workflows, and AGENTS guide references the new controls.

### 🧪 Tests
- **`tests/policy.test.ts`** validates normalization, runtime merges, and permission guards.
- **`tests/node.test.ts`** ensures policies flow to the Bifrost constructor.

## [0.1.3] - 2025-06-19

### 🚀 Added - Peer Management & Ping Functionality

#### Advanced Peer Management
- **`src/peer.ts`**: New comprehensive peer management module
  - Real-time peer status tracking and monitoring
  - Automatic fallback modes for enhanced reliability
  - Credential validation and pubkey normalization utilities
  - Professional logging with configurable warning suppression
  - `PeerManager` class for live peer monitoring
  - `StaticPeerManager` as fallback for static peer lists
  - Robust peer extraction from credentials with error handling

#### Comprehensive Ping Operations
- **`src/ping.ts`**: New ping functionality module
  - Single and batch ping operations with timeout support
  - Continuous ping monitoring with configurable intervals
  - Advanced ping diagnostics and health checking
  - Credential-based pinging with automatic peer resolution
  - Ping statistics tracking and reporting
  - Professional error handling and retry mechanisms

#### Enhanced Core API Integration
- **Updated `src/index.ts`**: Added peer and ping exports
  - Complete peer management function exports
  - Full ping functionality API surface
  - Type definitions for all new interfaces
  - Integration with existing IglooCore convenience class

#### IglooCore Class Enhancements
- **New Peer Management Methods**: 
  - `extractPeers()`: Extract peer information from credentials
  - `createPeerManager()`: Create peer monitoring instances
  - `checkPeerStatus()`: Check individual peer connectivity
- **New Ping Methods**:
  - `pingPeer()`: Single peer ping operations
  - `pingPeers()`: Batch ping operations
  - `startPingMonitoring()`: Continuous ping monitoring
  - `pingDiagnostics()`: Advanced ping diagnostics

### 📚 Documentation & Examples

#### New Example Scripts
- **`examples/peer-management.ts`**: Comprehensive peer management examples
  - Peer extraction and status monitoring
  - Fallback mode demonstrations
  - Error handling and recovery patterns
  - Advanced peer management scenarios
- **`examples/ping-example.ts`**: Complete ping functionality showcase
  - Single and batch ping operations
  - Continuous monitoring examples
  - Diagnostics and health checking
  - Integration with IglooCore convenience methods

#### Enhanced README Documentation
- **Peer Management Section**: Detailed usage examples and API reference
- **Ping Functionality Section**: Complete ping operation documentation
- **Configuration Options**: Advanced configuration and customization guides
- **Best Practices**: Production-ready patterns and error handling strategies
- **Integration Examples**: Real-world usage scenarios and patterns

### 🧪 Comprehensive Test Coverage

#### New Test Suites
- **`tests/peer.test.ts`**: Extensive peer management testing
  - Peer extraction and validation tests
  - Status checking and monitoring tests
  - Error handling and edge case coverage
  - Fallback mechanism verification
- **`tests/ping.test.ts`**: Complete ping functionality testing
  - Single and batch ping operation tests
  - Monitoring lifecycle and cleanup tests
  - Diagnostics and error handling tests
  - Performance and reliability tests

#### Enhanced Existing Tests
- **`tests/igloocore.test.ts`**: Updated with peer and ping integration tests
  - New method integration verification
  - Error handling consistency tests
  - API surface completeness validation

### 🔧 Enhanced Developer Experience

#### Professional Error Handling
- **Structured Error Types**: Comprehensive error classification for peer and ping operations
- **Graceful Degradation**: Automatic fallback to static modes when monitoring fails
- **Configurable Logging**: Professional logging with customizable warning levels
- **Memory Management**: Proper cleanup and resource management for monitoring operations

#### Type Safety & Validation
- **Complete TypeScript Support**: Full type definitions for all new functionality
- **Input Validation**: Comprehensive validation for all peer and ping parameters
- **Configuration Validation**: Proper validation of monitoring and ping configurations
- **Error Prevention**: Type-safe operations preventing common runtime errors

#### Performance & Reliability
- **Optimized Operations**: Efficient peer discovery and ping operations
- **Resource Management**: Proper cleanup of monitoring resources and event listeners
- **Configurable Timeouts**: Flexible timeout configuration for all operations
- **Robust Error Recovery**: Automatic recovery from transient network issues

### 🏗️ Infrastructure

#### Enhanced Build System
- **Updated Dependencies**: Latest compatible versions for peer and ping functionality
- **Type Exports**: Proper TypeScript type exports for all new interfaces
- **Module Organization**: Clean separation of peer and ping concerns

#### Test Infrastructure
- **Comprehensive Mocking**: Enhanced mocking for peer and ping operations
- **Integration Testing**: End-to-end testing of peer and ping workflows
- **Performance Testing**: Validation of monitoring and ping performance
- **Memory Leak Prevention**: Tests ensuring proper resource cleanup

---

## [0.1.2] - 2025-06-16

### 🎯 Complete Bifrost Event Handling

#### Fixed Missing Events
- **Added 8 Missing Events**: Previously missing events now properly handled
  - `'*'` - Wildcard event for catching all events
  - `'info'` - Information logging events
  - `'debug'` - Debug logging events
  - `/echo/sender/ret` - Echo sender return event
  - `/echo/sender/err` - Echo sender error event
  - `/ping/handler/ret` - Ping handler return event
  - `/ping/sender/ret` - Ping sender return event
  - `/ping/sender/err` - Ping sender error event

#### Corrected Event Signatures
- **Fixed Parameter Types**: Updated event signatures to match official Bifrost interface
  - `'closed'` event now correctly receives `BifrostNode` parameter
  - `'bounced'` event now has correct parameter structure
  - Array parameter handling fixed for `/ecdh/sender/res` and `/sign/sender/res`
  - Proper type imports for `SignedMessage` and `PeerConfig`

#### Enhanced Type Definitions
- **Updated `BifrostNodeEvents` Interface**: Complete coverage of all Bifrost events
- **Proper Type Imports**: Added imports for `SignedMessage` and `PeerConfig` types
- **Accurate Parameter Signatures**: All events now have correct TypeScript signatures

### 🧪 Comprehensive Test Coverage

#### New Test Suite
- **`tests/events.test.ts`**: 24 comprehensive tests for event handling
  - Event registration verification for all categories
  - Event handler functionality testing
  - Configuration and logging tests
  - Integration and regression tests

#### Enhanced Existing Tests
- **`tests/node.test.ts`**: 4 additional tests for event integration
  - Enhanced event handling verification
  - Event handler error resilience testing
  - Integration with existing node functions

#### Complete Event Coverage
- **All 41 Bifrost Events**: Tests verify complete event coverage
- **Missing Events Verified**: Specific tests for previously missing events
- **Parameter Signature Testing**: Ensures correct parameter handling
- **Regression Prevention**: Guards against future event coverage gaps

### 📚 Documentation Updates

#### Enhanced README
- **Comprehensive Event Handling Section**: Documentation for all supported events
- **Event Categories**: Clear breakdown of base, ECDH, signature, ping, and echo events
- **Manual Event Handling Examples**: Code examples for custom event handling
- **Best Practices**: Guidelines for event monitoring and debugging

#### API Documentation
- **Complete Event List**: Documentation of all 41 supported events
- **Event Configuration**: Examples of logging and custom event handling
- **Integration Examples**: Practical usage patterns

### 🔧 Improved Developer Experience

#### Better Event Monitoring
- **Comprehensive Logging**: All events now logged with appropriate levels
- **Custom Logger Support**: Full support for custom logging implementations
- **Debug Visibility**: Enhanced debugging capabilities with wildcard event support

#### Error Prevention
- **Type Safety**: Correct TypeScript types prevent runtime errors
- **Complete Coverage**: No missing events means no silent failures
- **Regression Tests**: Automated tests prevent future coverage gaps

### 🏗️ Infrastructure

#### Test Infrastructure
- **179 Total Tests**: All tests passing with new event coverage
- **Mock Improvements**: Enhanced mocking for better test reliability
- **Coverage Verification**: Automated verification of complete event coverage

---

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

### 0.1.0 → 0.1.1
- **No Breaking Changes**: All existing APIs remain fully compatible
- New features are additive and don't affect existing usage
- Enhanced documentation provides clearer guidance for optimal usage patterns 
