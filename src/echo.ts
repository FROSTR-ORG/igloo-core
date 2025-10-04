import { 
  createBifrostNode, 
  setupNodeEvents, 
  connectNode, 
  closeNode,
  type NodeEventConfig 
} from './node.js';
import { decodeShare, decodeGroup } from './keyset.js';
import { 
  EchoError, 
  type EchoListener,
  type EchoReceivedCallback,
  type BifrostNode
} from './types.js';

/**
 * Default relay URLs for echo functionality
 */
export const DEFAULT_ECHO_RELAYS = [
  "wss://relay.damus.io", 
  "wss://relay.primal.net"
];

function resolveEchoRelays(
  groupCredential: string,
  explicitRelays?: string[]
): string[] {
  if (explicitRelays && explicitRelays.length > 0) {
    return explicitRelays;
  }

  try {
    const group = decodeGroup(groupCredential) as unknown;
    const relays = (group as { relays?: unknown }).relays;
    if (Array.isArray(relays) && relays.length > 0) {
      return relays as string[];
    }
  } catch {
    // If group decoding fails we fall back to defaults; createBifrostNode will surface errors later.
  }

  return DEFAULT_ECHO_RELAYS;
}

/**
 * Waits for an echo event on a specific share.
 * This function sets up a Bifrost node to listen for an incoming echo request,
 * which signals that another device has successfully imported and is interacting with the share.
 */
export function awaitShareEcho(
  groupCredential: string, 
  shareCredential: string, 
  options: {
    relays?: string[];
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<boolean> {
  const {
    relays: relayOverrides,
    timeout = 30000,
    eventConfig = { enableLogging: true, logLevel: 'info' }
  } = options;

  return new Promise(async (resolve, reject) => {
    let node: BifrostNode | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (node) {
        try {
          closeNode(node);
        } catch (error) {
          console.warn('[awaitShareEcho] Error during cleanup:', error);
        }
        node = null;
      }
    };

    const safeResolve = (value: boolean) => {
      if (!isResolved) {
        isResolved = true;
        resolve(value);
        cleanup();
      }
    };

    const safeReject = (error: Error) => {
      if (!isResolved) {
        isResolved = true;
        reject(error);
        cleanup();
      }
    };

    try {
      const shareDetails = decodeShare(shareCredential);
      const resolvedRelays = resolveEchoRelays(groupCredential, relayOverrides);

      // Create custom event config that includes our echo handler
      const customEventConfig: NodeEventConfig = {
        ...eventConfig,
        customLogger: (level, message, data) => {
          const prefix = `[awaitShareEcho:${shareDetails.idx}]`;
          if (eventConfig.customLogger) {
            eventConfig.customLogger(level, `${prefix} ${message}`, data);
          } else {
            console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
          }
        }
      };

      node = createBifrostNode(
        { group: groupCredential, share: shareCredential, relays: resolvedRelays },
        customEventConfig
      );

      // Set up echo-specific message handler
      const onMessageHandler = (messagePayload: any) => {
        if (messagePayload && 
            messagePayload.data === 'echo' && 
            messagePayload.tag === '/echo/req') {
          
          customEventConfig.customLogger?.('info', 
            `Echo request received for share ${shareDetails.idx}`, 
            messagePayload
          );
          safeResolve(true);
        }
      };

      const onErrorHandler = (error: unknown) => {
        customEventConfig.customLogger?.('error',
          `Node error for share ${shareDetails.idx}`,
          error
        );
        safeReject(new EchoError(`Node error: ${error}`));
      };

      const onClosedHandler = () => {
        customEventConfig.customLogger?.('warn',
          `Connection closed for share ${shareDetails.idx}`
        );
        if (!isResolved) {
          safeReject(new EchoError('Connection closed before echo was received'));
        }
      };

      // Attach event handlers
      node.on('message', onMessageHandler);
      node.on('error', onErrorHandler);
      node.on('closed', onClosedHandler);

      // Set up timeout
      timeoutId = setTimeout(() => {
        safeReject(new EchoError(
          `No echo received within ${timeout / 1000} seconds`,
          { shareIndex: shareDetails.idx, timeout }
        ));
      }, timeout);

      // Connect the node
      await connectNode(node);
      
      customEventConfig.customLogger?.('info', 
        `Listening for echo on share ${shareDetails.idx}`
      );

    } catch (error: any) {
      safeReject(new EchoError(
        `Failed to set up echo listener: ${error.message}`,
        { error }
      ));
    }
  });
}

/**
 * Starts listening for echo events on all shares in a keyset.
 * Creates one BifrostNode per share to listen for incoming echo requests.
 * This is useful for detecting when shares have been imported on other devices.
 */
export function startListeningForAllEchoes(
  groupCredential: string,
  shareCredentials: string[],
  onEchoReceived: EchoReceivedCallback,
  options: {
    relays?: string[];
    eventConfig?: NodeEventConfig;
  } = {}
): EchoListener {
  const {
    relays: relayOverrides,
    eventConfig = { enableLogging: true, logLevel: 'info' }
  } = options;

  const nodes: BifrostNode[] = [];
  const cleanupFunctions: (() => void)[] = [];
  let isActive = true;

  const customLogger = (level: string, message: string, data?: any) => {
    const prefix = '[startListeningForAllEchoes]';
    if (eventConfig.customLogger) {
      eventConfig.customLogger(level, `${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  const resolvedRelays = resolveEchoRelays(groupCredential, relayOverrides);

  customLogger('info', `Starting echo listeners for ${shareCredentials.length} shares`);

  shareCredentials.forEach((shareCredential, index) => {
    try {
      const shareDetails = decodeShare(shareCredential);
      
      const node = createBifrostNode(
        { group: groupCredential, share: shareCredential, relays: resolvedRelays },
        { ...eventConfig, customLogger }
      );
      
      nodes.push(node);

      // Create message handler for this specific share
      const onMessageHandler = (messagePayload: any) => {
        if (messagePayload && 
            messagePayload.data === 'echo' && 
            messagePayload.tag === '/echo/req') {
          
          customLogger('info', 
            `Echo received for share ${index} (idx: ${shareDetails.idx})`
          );
          onEchoReceived(index, shareCredential);
        }
      };

      const onErrorHandler = (error: unknown) => {
        customLogger('error', 
          `Error on share ${index} (idx: ${shareDetails.idx})`,
          error
        );
      };

      const onClosedHandler = () => {
        customLogger('warn', 
          `Connection closed for share ${index} (idx: ${shareDetails.idx})`
        );
      };

      // Attach listeners
      node.on('message', onMessageHandler);
      node.on('error', onErrorHandler);
      node.on('closed', onClosedHandler);

      // Connect the node
      connectNode(node).catch(error => {
        customLogger('error', 
          `Failed to connect node for share ${index}`,
          error
        );
      });

      // Create cleanup function for this node
      const cleanup = () => {
        try {
          node.off('message', onMessageHandler);
          node.off('error', onErrorHandler);
          node.off('closed', onClosedHandler);
          closeNode(node);
        } catch (error) {
          customLogger('error', 
            `Error cleaning up node for share ${index}`,
            error
          );
        }
      };

      cleanupFunctions.push(cleanup);

    } catch (error: any) {
      customLogger('error', 
        `Failed to create node for share ${index}`,
        error
      );
    }
  });

  // Return EchoListener object
  return {
    cleanup: () => {
      if (!isActive) return;
      
      customLogger('info', 'Cleaning up all echo listeners');
      isActive = false;
      cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          customLogger('error', 'Error during cleanup', error);
        }
      });
    },
    isActive
  };
}

/**
 * Sends an echo message to test connectivity with a share
 */
export async function sendEcho(
  groupCredential: string,
  shareCredential: string,
  challenge: string,
  options: {
    relays?: string[];
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<boolean> {
  const {
    relays: relayOverrides,
    timeout = 10000,
    eventConfig = { enableLogging: true, logLevel: 'info' }
  } = options;

  if (typeof challenge !== 'string') {
    throw new TypeError('Echo challenge must be provided as a hexadecimal string.');
  }

  const normalizedChallenge = challenge.trim();

  if (normalizedChallenge.length === 0) {
    throw new TypeError('Echo challenge must be provided as a non-empty hexadecimal string.');
  }

  if (normalizedChallenge.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalizedChallenge)) {
    throw new TypeError('Echo challenge must be an even-length hexadecimal string.');
  }

  return new Promise(async (resolve, reject) => {
    let node: BifrostNode | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isResolved = false;

    let onEchoResponse: ((msg: any) => void) | null = null;
    let onEchoRejection: ((reason: string, msg: any) => void) | null = null;
    let onError: ((error: unknown) => void) | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (node) {
        try {
          if (onEchoResponse) {
            node.off('/echo/sender/res', onEchoResponse);
            onEchoResponse = null;
          }
          if (onEchoRejection) {
            node.off('/echo/sender/rej', onEchoRejection);
            onEchoRejection = null;
          }
          if (onError) {
            node.off('error', onError);
            onError = null;
          }
          closeNode(node);
        } catch (error) {
          console.warn('[sendEcho] Error during cleanup:', error);
        }
        node = null;
      }
    };

    const safeResolve = (value: boolean) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(value);
      }
    };

    const safeReject = (error: Error) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(error);
      }
    };

    try {
      const shareDetails = decodeShare(shareCredential);
      const resolvedRelays = resolveEchoRelays(groupCredential, relayOverrides);

      const log = (level: string, message: string, data?: any) => {
        const prefix = `[sendEcho:${shareDetails.idx}]`;
        if (eventConfig.customLogger) {
          eventConfig.customLogger(level, `${prefix} ${message}`, data);
        } else if (eventConfig.enableLogging) {
          console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
        }
      };

      node = createBifrostNode(
        { group: groupCredential, share: shareCredential, relays: resolvedRelays },
        {
          ...eventConfig,
          customLogger: (level, message, data) => {
            log(level, message, data);
          }
        }
      );

      // Listen for echo response
      onEchoResponse = (msg: any) => {
        if (msg && msg.tag === '/echo/res') {
          log('debug', 'Echo response event received', msg);
          safeResolve(true);
        }
      };

      onEchoRejection = (reason: string, msg: any) => {
        log('warn', `Echo rejected: ${reason}`, msg);
        safeReject(new EchoError(`Echo rejected: ${reason}`, { msg }));
      };

      onError = (error: unknown) => {
        log('error', `Node error: ${error}`);
        safeReject(new EchoError(`Node error: ${error}`));
      };

      node.on('/echo/sender/res', onEchoResponse);
      node.on('/echo/sender/rej', onEchoRejection);
      node.on('error', onError);

      // Set up timeout
      timeoutId = setTimeout(() => {
        log('warn', `Echo response timeout after ${timeout}ms`);
        safeReject(new EchoError(
          `Echo response timeout after ${timeout / 1000} seconds`,
          { shareIndex: shareDetails.idx, timeout }
        ));
      }, timeout);

      await connectNode(node);

      log('debug', 'Sending echo challenge');
      const response = await node.req.echo(normalizedChallenge);

      if (!response?.ok) {
        const reason = response?.err || 'Unknown error';
        throw new EchoError(
          `Echo request failed: ${reason}`,
          { error: reason, shareIndex: shareDetails.idx }
        );
      }

      log('info', 'Echo request completed successfully');
      safeResolve(true);

    } catch (error: any) {
      if (error instanceof EchoError) {
        safeReject(error);
      } else {
        safeReject(new EchoError(
          `Failed to send echo: ${error.message}`,
          { error }
        ));
      }
    }
  });
}
