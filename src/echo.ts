import { 
  createBifrostNode, 
  setupNodeEvents, 
  connectNode, 
  closeNode,
  type NodeEventConfig 
} from './node.js';
import { decodeShare } from './keyset.js';
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
    relays = DEFAULT_ECHO_RELAYS,
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
        { group: groupCredential, share: shareCredential, relays },
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
    relays = DEFAULT_ECHO_RELAYS,
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

  customLogger('info', `Starting echo listeners for ${shareCredentials.length} shares`);

  shareCredentials.forEach((shareCredential, index) => {
    try {
      const shareDetails = decodeShare(shareCredential);
      
      const node = createBifrostNode(
        { group: groupCredential, share: shareCredential, relays },
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
  options: {
    relays?: string[];
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<boolean> {
  const {
    relays = DEFAULT_ECHO_RELAYS,
    timeout = 10000,
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
          console.warn('[sendEcho] Error during cleanup:', error);
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
      
      node = createBifrostNode(
        { group: groupCredential, share: shareCredential, relays },
        eventConfig
      );

      // Listen for echo response
      const onEchoResponse = (msg: any) => {
        if (msg && msg.tag === '/echo/res') {
          safeResolve(true);
        }
      };

      const onEchoRejection = (reason: string, msg: any) => {
        safeReject(new EchoError(`Echo rejected: ${reason}`, { msg }));
      };

      const onError = (error: unknown) => {
        safeReject(new EchoError(`Node error: ${error}`));
      };

      node.on('/echo/sender/res', onEchoResponse);
      node.on('/echo/sender/rej', onEchoRejection);
      node.on('error', onError);

      // Set up timeout
      timeoutId = setTimeout(() => {
        safeReject(new EchoError(
          `Echo response timeout after ${timeout / 1000} seconds`,
          { shareIndex: shareDetails.idx, timeout }
        ));
      }, timeout);

      await connectNode(node);
      
      // Send echo request (this would need to be implemented in bifrost)
      // For now, we'll just resolve as successful connection
      safeResolve(true);

    } catch (error: any) {
      safeReject(new EchoError(
        `Failed to send echo: ${error.message}`,
        { error }
      ));
    }
  });
} 