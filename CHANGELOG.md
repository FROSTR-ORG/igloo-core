# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-01-08

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