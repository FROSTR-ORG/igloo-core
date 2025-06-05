import { BifrostNode, PackageEncoder } from '@frostr/bifrost';
import { NodeError, NodeConfigSchema } from './types.js';
/**
 * Creates a BifrostNode with proper validation and event handling
 */
export function createBifrostNode(config, eventConfig = {}) {
    try {
        // Validate configuration
        NodeConfigSchema.parse(config);
        const decodedGroup = PackageEncoder.group.decode(config.group);
        const decodedShare = PackageEncoder.share.decode(config.share);
        const node = new BifrostNode(decodedGroup, decodedShare, config.relays);
        // Set up event handlers with optional logging
        setupNodeEvents(node, eventConfig);
        return node;
    }
    catch (error) {
        throw new NodeError(`Failed to create BifrostNode: ${error.message}`, { config, error });
    }
}
/**
 * Sets up comprehensive event handlers for a BifrostNode
 */
export function setupNodeEvents(node, config = {}) {
    const { enableLogging = true, logLevel = 'info', customLogger } = config;
    const log = (level, message, data) => {
        if (!enableLogging)
            return;
        if (customLogger) {
            customLogger(level, message, data);
        }
        else {
            console.log(`[${level.toUpperCase()}] ${message}`, data || '');
        }
    };
    // Base events
    node.on('ready', (node) => {
        log('info', 'Bifrost node is ready', { nodeId: node.constructor.name });
    });
    node.on('closed', () => {
        log('info', 'Bifrost node connection closed');
    });
    node.on('message', (msg) => {
        log('debug', 'Received message', msg);
    });
    node.on('bounced', (reason, msg) => {
        log('warn', 'Message bounced', { reason, message: msg });
    });
    node.on('error', (error) => {
        log('error', 'Node error occurred', error);
    });
    // ECDH events
    node.on('/ecdh/sender/req', (msg) => {
        log('debug', 'ECDH request sent', msg);
    });
    node.on('/ecdh/sender/res', (...msgs) => {
        log('debug', 'ECDH responses received', msgs);
    });
    node.on('/ecdh/sender/rej', (reason, pkg) => {
        log('warn', 'ECDH request rejected', { reason, package: pkg });
    });
    node.on('/ecdh/sender/ret', (reason, pkgs) => {
        log('info', 'ECDH shares aggregated', { reason, packages: pkgs });
    });
    node.on('/ecdh/sender/err', (reason, msgs) => {
        log('error', 'ECDH share aggregation failed', { reason, messages: msgs });
    });
    node.on('/ecdh/handler/req', (msg) => {
        log('debug', 'ECDH request received', msg);
    });
    node.on('/ecdh/handler/res', (msg) => {
        log('debug', 'ECDH response sent', msg);
    });
    node.on('/ecdh/handler/rej', (reason, msg) => {
        log('warn', 'ECDH rejection sent', { reason, message: msg });
    });
    // Signature events
    node.on('/sign/sender/req', (msg) => {
        log('debug', 'Signature request sent', msg);
    });
    node.on('/sign/sender/res', (...msgs) => {
        log('debug', 'Signature responses received', msgs);
    });
    node.on('/sign/sender/rej', (reason, pkg) => {
        log('warn', 'Signature request rejected', { reason, package: pkg });
    });
    node.on('/sign/sender/ret', (reason, msgs) => {
        log('info', 'Signature shares aggregated', { reason, signatures: msgs });
    });
    node.on('/sign/sender/err', (reason, msgs) => {
        log('error', 'Signature share aggregation failed', { reason, messages: msgs });
    });
    node.on('/sign/handler/req', (msg) => {
        log('debug', 'Signature request received', msg);
    });
    node.on('/sign/handler/res', (msg) => {
        log('debug', 'Signature response sent', msg);
    });
    node.on('/sign/handler/rej', (reason, msg) => {
        log('warn', 'Signature rejection sent', { reason, message: msg });
    });
    // Ping events
    node.on('/ping/handler/req', (msg) => {
        log('debug', 'Ping request received', msg);
    });
    node.on('/ping/handler/res', (msg) => {
        log('debug', 'Ping response sent', msg);
    });
    node.on('/ping/handler/rej', (reason, msg) => {
        log('warn', 'Ping rejection sent', { reason, message: msg });
    });
    node.on('/ping/sender/req', (msg) => {
        log('debug', 'Ping request sent', msg);
    });
    node.on('/ping/sender/res', (msg) => {
        log('debug', 'Ping response received', msg);
    });
    node.on('/ping/sender/rej', (reason, msg) => {
        log('warn', 'Ping request rejected', { reason, message: msg });
    });
    // Echo events
    node.on('/echo/handler/req', (msg) => {
        log('debug', 'Echo request received', msg);
    });
    node.on('/echo/handler/res', (msg) => {
        log('debug', 'Echo response sent', msg);
    });
    node.on('/echo/handler/rej', (reason, msg) => {
        log('warn', 'Echo rejection sent', { reason, message: msg });
    });
    node.on('/echo/sender/req', (msg) => {
        log('debug', 'Echo request sent', msg);
    });
    node.on('/echo/sender/res', (msg) => {
        log('debug', 'Echo response received', msg);
    });
    node.on('/echo/sender/rej', (reason, msg) => {
        log('warn', 'Echo request rejected', { reason, message: msg });
    });
}
/**
 * Safely connects a BifrostNode with error handling
 */
export async function connectNode(node) {
    try {
        await node.connect();
    }
    catch (error) {
        throw new NodeError(`Failed to connect BifrostNode: ${error.message}`, { error });
    }
}
/**
 * Safely closes a BifrostNode with cleanup
 */
export function closeNode(node) {
    try {
        node.close();
    }
    catch (error) {
        throw new NodeError(`Failed to close BifrostNode: ${error.message}`, { error });
    }
}
/**
 * Creates a BifrostNode and connects it
 */
export async function createAndConnectNode(config, eventConfig) {
    const node = createBifrostNode(config, eventConfig);
    await connectNode(node);
    return node;
}
