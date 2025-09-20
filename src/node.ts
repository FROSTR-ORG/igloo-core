import { BifrostNode, PackageEncoder } from '@frostr/bifrost';
import {
  NodeConfig,
  NodeError,
  NodeConfigSchema,
  type BifrostNodeEvents,
  type GroupPackage,
  type SharePackage,
  type SignatureEntry,
  type ECDHPackage,
  type SignSessionPackage,
  type EnhancedNodeConfig,
  type NodeCreationResult,
  type NodeState
} from './types.js';
import { prepareNodePolicies, registerNodePolicyMetadata } from './policy.js';

/**
 * Configuration for BifrostNode event logging
 */
export interface NodeEventConfig {
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  customLogger?: (level: string, message: string, data?: any) => void;
}

/**
 * Creates a BifrostNode with proper validation and event handling
 */
export function createBifrostNode(
  config: NodeConfig, 
  eventConfig: NodeEventConfig = {}
): BifrostNode {
  try {
    const validatedConfig = NodeConfigSchema.parse(config);

    const decodedGroup = PackageEncoder.group.decode(validatedConfig.group);
    const decodedShare = PackageEncoder.share.decode(validatedConfig.share);

    const { peerConfigs, normalizedPolicies } = prepareNodePolicies(validatedConfig.policies);
    const nodeOptions = peerConfigs.length ? { policies: peerConfigs } : undefined;

    const node = nodeOptions
      ? new BifrostNode(decodedGroup, decodedShare, validatedConfig.relays, nodeOptions)
      : new BifrostNode(decodedGroup, decodedShare, validatedConfig.relays);

    // Set up event handlers with optional logging
    setupNodeEvents(node, eventConfig);

    if (normalizedPolicies.length) {
      registerNodePolicyMetadata(node, normalizedPolicies);
    }

    return node;
  } catch (error: any) {
    throw new NodeError(
      `Failed to create BifrostNode: ${error.message}`,
      { config, error }
    );
  }
}

/**
 * Sets up comprehensive event handlers for a BifrostNode
 */
export function setupNodeEvents(
  node: BifrostNode, 
  config: NodeEventConfig = {}
): void {
  const { enableLogging = true, logLevel = 'info', customLogger } = config;

  const log = (level: string, message: string, data?: any) => {
    if (!enableLogging) return;
    
    if (customLogger) {
      customLogger(level, message, data);
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  // Wildcard event handler
  node.on('*', (eventName: string, data: unknown) => {
    log('debug', `Event emitted: ${eventName}`, data);
  });

  // Base logging events
  node.on('info', (data: unknown) => {
    log('info', 'Bifrost info', data);
  });

  node.on('debug', (data: unknown) => {
    log('debug', 'Bifrost debug', data);
  });

  // Base events
  node.on('ready', (node: BifrostNode) => {
    log('info', 'Bifrost node is ready', { nodeId: node.constructor.name });
  });

  node.on('closed', (node: BifrostNode) => {
    log('info', 'Bifrost node connection closed', { nodeId: node.constructor.name });
  });

  node.on('message', (msg: any) => {
    log('debug', 'Received message', msg);
  });

  node.on('bounced', (reason: string, msg: any) => {
    log('warn', 'Message bounced', { reason, message: msg });
  });

  node.on('error', (error: unknown) => {
    log('error', 'Node error occurred', error);
  });

  // ECDH events
  node.on('/ecdh/sender/req', (msg: any) => {
    log('debug', 'ECDH request sent', msg);
  });

  node.on('/ecdh/sender/res', (...msgs: any[]) => {
    log('debug', 'ECDH responses received', msgs);
  });

  node.on('/ecdh/sender/rej', (reason: string, pkg: any) => {
    log('warn', 'ECDH request rejected', { reason, package: pkg });
  });

  node.on('/ecdh/sender/ret', (reason: string, pkgs: string) => {
    log('info', 'ECDH shares aggregated', { reason, packages: pkgs });
  });

  node.on('/ecdh/sender/err', (reason: string, msgs: any[]) => {
    log('error', 'ECDH share aggregation failed', { reason, messages: msgs });
  });

  node.on('/ecdh/handler/req', (msg: any) => {
    log('debug', 'ECDH request received', msg);
  });

  node.on('/ecdh/handler/res', (msg: any) => {
    log('debug', 'ECDH response sent', msg);
  });

  node.on('/ecdh/handler/rej', (reason: string, msg: any) => {
    log('warn', 'ECDH rejection sent', { reason, message: msg });
  });

  // Signature events
  node.on('/sign/sender/req', (msg: any) => {
    log('debug', 'Signature request sent', msg);
  });

  node.on('/sign/sender/res', (...msgs: any[]) => {
    log('debug', 'Signature responses received', msgs);
  });

  node.on('/sign/sender/rej', (reason: string, pkg: any) => {
    log('warn', 'Signature request rejected', { reason, package: pkg });
  });

  node.on('/sign/sender/ret', (reason: string, msgs: any[]) => {
    log('info', 'Signature shares aggregated', { reason, signatures: msgs });
  });

  node.on('/sign/sender/err', (reason: string, msgs: any[]) => {
    log('error', 'Signature share aggregation failed', { reason, messages: msgs });
  });

  node.on('/sign/handler/req', (msg: any) => {
    log('debug', 'Signature request received', msg);
  });

  node.on('/sign/handler/res', (msg: any) => {
    log('debug', 'Signature response sent', msg);
  });

  node.on('/sign/handler/rej', (reason: string, msg: any) => {
    log('warn', 'Signature rejection sent', { reason, message: msg });
  });

  // Ping events
  node.on('/ping/handler/req', (msg: any) => {
    log('debug', 'Ping request received', msg);
  });

  node.on('/ping/handler/res', (msg: any) => {
    log('debug', 'Ping response sent', msg);
  });

  node.on('/ping/handler/rej', (reason: string, msg: any) => {
    log('warn', 'Ping rejection sent', { reason, message: msg });
  });

  node.on('/ping/handler/ret', (reason: string, data: string) => {
    log('info', 'Ping handler returned', { reason, data });
  });

  node.on('/ping/sender/req', (msg: any) => {
    log('debug', 'Ping request sent', msg);
  });

  node.on('/ping/sender/res', (msg: any) => {
    log('debug', 'Ping response received', msg);
  });

  node.on('/ping/sender/rej', (reason: string, msg: any) => {
    log('warn', 'Ping request rejected', { reason, message: msg });
  });

  node.on('/ping/sender/ret', (config: any) => {
    log('info', 'Ping sender returned peer config', config);
  });

  node.on('/ping/sender/err', (reason: string, msg: any) => {
    log('error', 'Ping sender error', { reason, message: msg });
  });

  // Echo events
  node.on('/echo/handler/req', (msg: any) => {
    log('debug', 'Echo request received', msg);
  });

  node.on('/echo/handler/res', (msg: any) => {
    log('debug', 'Echo response sent', msg);
  });

  node.on('/echo/handler/rej', (reason: string, msg: any) => {
    log('warn', 'Echo rejection sent', { reason, message: msg });
  });

  node.on('/echo/sender/req', (msg: any) => {
    log('debug', 'Echo request sent', msg);
  });

  node.on('/echo/sender/res', (msg: any) => {
    log('debug', 'Echo response received', msg);
  });

  node.on('/echo/sender/rej', (reason: string, msg: any) => {
    log('warn', 'Echo request rejected', { reason, message: msg });
  });

  node.on('/echo/sender/ret', (reason: string) => {
    log('info', 'Echo sender returned', { reason });
  });

  node.on('/echo/sender/err', (reason: string, msg: any) => {
    log('error', 'Echo sender error', { reason, message: msg });
  });
}

/**
 * Safely connects a BifrostNode with error handling
 */
export async function connectNode(node: BifrostNode): Promise<void> {
  try {
    await node.connect();
  } catch (error: any) {
    throw new NodeError(
      `Failed to connect BifrostNode: ${error.message}`,
      { error }
    );
  }
}

/**
 * Safely closes a BifrostNode with cleanup
 */
export function closeNode(node: BifrostNode): void {
  try {
    node.close();
  } catch (error: any) {
    throw new NodeError(
      `Failed to close BifrostNode: ${error.message}`,
      { error }
    );
  }
}

/**
 * Creates a BifrostNode and connects it
 */
export async function createAndConnectNode(
  config: NodeConfig, 
  eventConfig?: NodeEventConfig
): Promise<BifrostNode> {
  const node = createBifrostNode(config, eventConfig);
  await connectNode(node);
  return node;
}

/**
 * Enhanced node creation with state information
 * Returns both the node and its current state for better control
 * 
 * @param config - Enhanced configuration including timeout and auto-reconnect options
 * @param eventConfig - Optional event configuration for logging and custom handlers
 * @returns Promise resolving to both the connected node and its state information
 * 
 * @example
 * ```typescript
 * const { node, state } = await createConnectedNode({
 *   group: 'bfgroup1...',
 *   share: 'bfshare1...',
 *   relays: ['wss://relay.damus.io'],
 *   connectionTimeout: 5000,
 *   autoReconnect: true
 * });
 * 
 * console.log('Node ready:', state.isReady);
 * console.log('Connected relays:', state.connectedRelays);
 * ```
 */
export async function createConnectedNode(
  config: EnhancedNodeConfig,
  eventConfig?: NodeEventConfig
): Promise<NodeCreationResult> {
  const node = createBifrostNode(config, eventConfig);
  
  const state: NodeState = {
    isReady: false,
    isConnected: false,
    isConnecting: true,
    connectedRelays: []
  };

  try {
    await connectNode(node);
    
    // Node is ready immediately after successful connection
    state.isReady = true;
    state.isConnected = true;
    state.isConnecting = false;
    state.connectedRelays = [...config.relays];
    
    return { node, state };
  } catch (error) {
    state.isConnecting = false;
    state.lastError = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}

/**
 * Check if a BifrostNode is ready synchronously
 * This helper works around the race condition with ready events
 * 
 * @param node - The BifrostNode to check
 * @returns true if the node is ready and connected, false otherwise
 * 
 * @example
 * ```typescript
 * const node = await createAndConnectNode(config);
 * 
 * // Safe synchronous check - no race conditions
 * if (isNodeReady(node)) {
 *   console.log('Node is ready for operations');
 * }
 * ```
 */
export function isNodeReady(node: BifrostNode): boolean {
  try {
    // Check if the node has a client and if it's connected
    return !!(node as any).client && !!(node as any).client.connected;
  } catch {
    return false;
  }
}

/**
 * Comprehensive cleanup for BifrostNode
 * Removes all event listeners and safely disconnects the node
 * 
 * Note: Since we don't have access to the original listener functions,
 * this function uses removeAllListeners to clear all event handlers.
 * For more precise cleanup, store listener references when setting them up.
 */
export function cleanupBifrostNode(node: BifrostNode): void {
  if (!node) return;

  try {
    // Use removeAllListeners if available (common in EventEmitter implementations)
    const nodeAsAny = node as any;
    if (typeof nodeAsAny.removeAllListeners === 'function') {
      nodeAsAny.removeAllListeners();
    } else {
      // If removeAllListeners is not available, try to clear listeners individually
      // This is a fallback that may not work with all implementations
      console.warn('removeAllListeners not available - manual cleanup may be incomplete');
    }

    // Safely close the connection
    try {
      node.close();
    } catch (closeError) {
      console.warn('Warning: Error during node.close():', closeError);
    }

  } catch (error) {
    console.warn('Warning: Error during node cleanup:', error);
  }
} 
