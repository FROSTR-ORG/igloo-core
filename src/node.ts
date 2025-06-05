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
  type SignSessionPackage
} from './types.js';

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
    // Validate configuration
    NodeConfigSchema.parse(config);

    const decodedGroup = PackageEncoder.group.decode(config.group);
    const decodedShare = PackageEncoder.share.decode(config.share);

    const node = new BifrostNode(decodedGroup, decodedShare, config.relays);

    // Set up event handlers with optional logging
    setupNodeEvents(node, eventConfig);

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

  // Base events
  node.on('ready', (node: BifrostNode) => {
    log('info', 'Bifrost node is ready', { nodeId: node.constructor.name });
  });

  node.on('closed', () => {
    log('info', 'Bifrost node connection closed');
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

  node.on('/ecdh/sender/rej', (reason: string, pkg: ECDHPackage) => {
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

  node.on('/sign/sender/rej', (reason: string, pkg: SignSessionPackage) => {
    log('warn', 'Signature request rejected', { reason, package: pkg });
  });

  node.on('/sign/sender/ret', (reason: string, msgs: SignatureEntry[]) => {
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

  node.on('/ping/sender/req', (msg: any) => {
    log('debug', 'Ping request sent', msg);
  });

  node.on('/ping/sender/res', (msg: any) => {
    log('debug', 'Ping response received', msg);
  });

  node.on('/ping/sender/rej', (reason: string, msg: any) => {
    log('warn', 'Ping request rejected', { reason, message: msg });
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