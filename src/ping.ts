import { 
  createBifrostNode, 
  setupNodeEvents, 
  connectNode, 
  closeNode,
  type NodeEventConfig 
} from './node.js';
import { decodeShare } from './keyset.js';
import { 
  NodeError, 
  type BifrostNode
} from './types.js';

/**
 * Default relay URLs for ping functionality
 */
export const DEFAULT_PING_RELAYS = [
  "wss://relay.damus.io", 
  "wss://relay.primal.net"
];

/**
 * Default ping timeout in milliseconds
 */
export const DEFAULT_PING_TIMEOUT = 5000;

/**
 * Default ping interval for monitoring in milliseconds
 */
export const DEFAULT_PING_INTERVAL = 30000;

/**
 * Ping result interface
 */
export interface PingResult {
  success: boolean;
  pubkey: string;
  latency?: number;
  policy?: {
    send: boolean;
    recv: boolean;
  };
  error?: string;
  timestamp: Date;
}

/**
 * Ping monitoring configuration
 */
export interface PingMonitorConfig {
  interval: number;           // How often to ping (default: 30000ms)
  timeout: number;            // Ping timeout (default: 5000ms)
  onPingResult?: (result: PingResult) => void;
  onError?: (error: Error, context: string) => void;
  relays?: string[];
  eventConfig?: NodeEventConfig;
}

/**
 * Ping monitor interface
 */
export interface PingMonitor {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
  ping: () => Promise<PingResult[]>;
  cleanup: () => void;
}

/**
 * Ping a specific peer using bifrost ping protocol
 */
export async function pingPeer(
  node: BifrostNode,
  peerPubkey: string,
  options: {
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<PingResult> {
  const {
    timeout = DEFAULT_PING_TIMEOUT,
    eventConfig = { enableLogging: false }
  } = options;

  return new Promise((resolve) => {
    let isResolved = false;
    let timeoutId: NodeJS.Timeout | null = null;
    const startTime = Date.now();

    const safeResolve = (result: PingResult) => {
      if (!isResolved) {
        isResolved = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(result);
      }
    };

    const customLogger = (level: string, message: string, data?: any) => {
      const prefix = `[pingPeer:${peerPubkey.slice(0, 8)}]`;
      if (eventConfig.customLogger) {
        eventConfig.customLogger(level, `${prefix} ${message}`, data);
      } else if (eventConfig.enableLogging) {
        console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
      }
    };

    // Set up timeout
    timeoutId = setTimeout(() => {
      safeResolve({
        success: false,
        pubkey: peerPubkey,
        error: `Ping timeout after ${timeout}ms`,
        timestamp: new Date()
      });
    }, timeout);

    try {
      // Set up event listeners for ping response
      const onPingResponse = (peerData: any) => {
        if (peerData && peerData.pubkey === peerPubkey) {
          const latency = Date.now() - startTime;
          customLogger('info', `Ping successful, latency: ${latency}ms`);
          
          safeResolve({
            success: true,
            pubkey: peerPubkey,
            latency,
            policy: peerData.policy,
            timestamp: new Date()
          });
        }
      };

      const onPingError = (reason: string, msg: any) => {
        customLogger('error', `Ping failed: ${reason}`);
        safeResolve({
          success: false,
          pubkey: peerPubkey,
          error: reason,
          timestamp: new Date()
        });
      };

      // Attach event listeners
      node.on('/ping/sender/ret', onPingResponse);
      node.on('/ping/sender/err', onPingError);

      // Send ping request
      node.req.ping(peerPubkey).then(result => {
        if (result.ok) {
          // Success is handled by the event listener
          customLogger('debug', 'Ping request sent successfully');
        } else {
          safeResolve({
            success: false,
            pubkey: peerPubkey,
            error: result.err,
            timestamp: new Date()
          });
        }
      }).catch(error => {
        customLogger('error', `Ping request failed: ${error.message}`);
        safeResolve({
          success: false,
          pubkey: peerPubkey,
          error: error.message,
          timestamp: new Date()
        });
      });

    } catch (error: any) {
      customLogger('error', `Ping setup failed: ${error.message}`);
      safeResolve({
        success: false,
        pubkey: peerPubkey,
        error: error.message,
        timestamp: new Date()
      });
    }
  });
}

/**
 * Ping multiple peers concurrently
 */
export async function pingPeers(
  node: BifrostNode,
  peerPubkeys: string[],
  options: {
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<PingResult[]> {
  const {
    timeout = DEFAULT_PING_TIMEOUT,
    eventConfig = { enableLogging: false }
  } = options;

  const customLogger = (level: string, message: string, data?: any) => {
    const prefix = '[pingPeers]';
    if (eventConfig.customLogger) {
      eventConfig.customLogger(level, `${prefix} ${message}`, data);
    } else if (eventConfig.enableLogging) {
      console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  customLogger('info', `Pinging ${peerPubkeys.length} peers`);

  try {
    // Ping all peers concurrently
    const pingPromises = peerPubkeys.map(pubkey => 
      pingPeer(node, pubkey, { timeout, eventConfig })
    );

    const results = await Promise.all(pingPromises);
    
    const successCount = results.filter(r => r.success).length;
    customLogger('info', `Ping completed: ${successCount}/${results.length} peers responded`);
    
    return results;
  } catch (error: any) {
    customLogger('error', `Ping operation failed: ${error.message}`);
    // Return failed results for all peers
    return peerPubkeys.map(pubkey => ({
      success: false,
      pubkey,
      error: error.message,
      timestamp: new Date()
    }));
  }
}

/**
 * Create a ping monitor for continuous peer monitoring
 */
export function createPingMonitor(
  node: BifrostNode,
  peerPubkeys: string[],
  config: Partial<PingMonitorConfig> = {}
): PingMonitor {
  const {
    interval = DEFAULT_PING_INTERVAL,
    timeout = DEFAULT_PING_TIMEOUT,
    onPingResult,
    onError,
    relays = DEFAULT_PING_RELAYS,
    eventConfig = { enableLogging: false }
  } = config;

  let intervalId: NodeJS.Timeout | null = null;
  let isRunning = false;

  const customLogger = (level: string, message: string, data?: any) => {
    const prefix = '[PingMonitor]';
    if (eventConfig.customLogger) {
      eventConfig.customLogger(level, `${prefix} ${message}`, data);
    } else if (eventConfig.enableLogging) {
      console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  const ping = async (): Promise<PingResult[]> => {
    try {
      customLogger('debug', `Pinging ${peerPubkeys.length} peers`);
      
      const results = await pingPeers(node, peerPubkeys, {
        timeout,
        eventConfig
      });

      // Call result callback for each peer
      if (onPingResult) {
        results.forEach(result => {
          try {
            onPingResult(result);
          } catch (error: any) {
            customLogger('error', `Error in ping result callback: ${error.message}`);
          }
        });
      }

      return results;
    } catch (error: any) {
      customLogger('error', `Ping monitor error: ${error.message}`);
      if (onError) {
        onError(error, 'ping');
      }
      return [];
    }
  };

  const start = () => {
    if (isRunning) {
      customLogger('warn', 'Ping monitor is already running');
      return;
    }

    customLogger('info', `Starting ping monitor (interval: ${interval}ms, timeout: ${timeout}ms)`);
    isRunning = true;

    // Initial ping
    ping().catch(error => {
      customLogger('error', `Initial ping failed: ${error.message}`);
    });

    // Set up interval
    intervalId = setInterval(() => {
      if (isRunning) {
        ping().catch(error => {
          customLogger('error', `Scheduled ping failed: ${error.message}`);
        });
      }
    }, interval);
  };

  const stop = () => {
    if (!isRunning) {
      customLogger('warn', 'Ping monitor is not running');
      return;
    }

    customLogger('info', 'Stopping ping monitor');
    isRunning = false;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const cleanup = () => {
    stop();
    customLogger('debug', 'Ping monitor cleaned up');
  };

  return {
    start,
    stop,
    get isRunning() { return isRunning; },
    ping,
    cleanup
  };
}

/**
 * Ping peers from credentials (convenience function)
 */
export async function pingPeersFromCredentials(
  groupCredential: string,
  shareCredential: string,
  options: {
    relays?: string[];
    timeout?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<PingResult[]> {
  const {
    relays = DEFAULT_PING_RELAYS,
    timeout = DEFAULT_PING_TIMEOUT,
    eventConfig = { enableLogging: false }
  } = options;

  let node: BifrostNode | null = null;

  try {
    // Create temporary node for pinging
    node = createBifrostNode(
      { group: groupCredential, share: shareCredential, relays },
      eventConfig
    );

    await connectNode(node);

    // Extract peer pubkeys from the group
    const { extractPeersFromCredentials } = await import('./peer.js');
    const peerPubkeys = extractPeersFromCredentials(groupCredential, shareCredential);

    // Ping all peers
    const results = await pingPeers(node, peerPubkeys, { timeout, eventConfig });

    return results;

  } catch (error: any) {
    throw new NodeError(`Failed to ping peers: ${error.message}`, { error });
  } finally {
    if (node) {
      try {
        closeNode(node);
      } catch (error) {
        console.warn('[pingPeersFromCredentials] Error during cleanup:', error);
      }
    }
  }
}

/**
 * Create a comprehensive ping test for network diagnostics
 */
export async function runPingDiagnostics(
  node: BifrostNode,
  peerPubkeys: string[],
  options: {
    rounds?: number;
    timeout?: number;
    interval?: number;
    eventConfig?: NodeEventConfig;
  } = {}
): Promise<{
  summary: {
    totalRounds: number;
    totalPeers: number;
    averageLatency: number;
    successRate: number;
    fastestPeer?: string;
    slowestPeer?: string;
  };
  rounds: PingResult[][];
  peerStats: {
    [pubkey: string]: {
      successCount: number;
      totalAttempts: number;
      averageLatency: number;
      minLatency: number;
      maxLatency: number;
      successRate: number;
    };
  };
}> {
  const {
    rounds = 3,
    timeout = DEFAULT_PING_TIMEOUT,
    interval = 1000,
    eventConfig = { enableLogging: false }
  } = options;

  const customLogger = (level: string, message: string, data?: any) => {
    const prefix = '[PingDiagnostics]';
    if (eventConfig.customLogger) {
      eventConfig.customLogger(level, `${prefix} ${message}`, data);
    } else if (eventConfig.enableLogging) {
      console.log(`${prefix} [${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  customLogger('info', `Starting ping diagnostics: ${rounds} rounds, ${peerPubkeys.length} peers`);

  const allRounds: PingResult[][] = [];
  const peerStats: { [pubkey: string]: any } = {};

  // Initialize peer stats
  peerPubkeys.forEach(pubkey => {
    peerStats[pubkey] = {
      successCount: 0,
      totalAttempts: 0,
      latencies: [],
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      successRate: 0
    };
  });

  // Run ping rounds
  for (let round = 0; round < rounds; round++) {
    customLogger('info', `Running ping round ${round + 1}/${rounds}`);
    
    const results = await pingPeers(node, peerPubkeys, { timeout, eventConfig });
    allRounds.push(results);

    // Update peer stats
    results.forEach(result => {
      const stats = peerStats[result.pubkey];
      stats.totalAttempts++;
      
      if (result.success && result.latency !== undefined) {
        stats.successCount++;
        stats.latencies.push(result.latency);
        stats.minLatency = Math.min(stats.minLatency, result.latency);
        stats.maxLatency = Math.max(stats.maxLatency, result.latency);
      }
    });

    // Wait between rounds (except for the last round)
    if (round < rounds - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  // Calculate final statistics
  let totalLatencies: number[] = [];
  let totalSuccesses = 0;
  let totalAttempts = 0;

  Object.keys(peerStats).forEach(pubkey => {
    const stats = peerStats[pubkey];
    stats.averageLatency = stats.latencies.length > 0 
      ? stats.latencies.reduce((a: number, b: number) => a + b, 0) / stats.latencies.length 
      : 0;
    stats.successRate = stats.totalAttempts > 0 
      ? (stats.successCount / stats.totalAttempts) * 100 
      : 0;
    
    if (stats.minLatency === Infinity) stats.minLatency = 0;
    
    totalLatencies.push(...stats.latencies);
    totalSuccesses += stats.successCount;
    totalAttempts += stats.totalAttempts;
    
    // Remove internal latencies array from final output
    delete stats.latencies;
  });

  const averageLatency = totalLatencies.length > 0 
    ? totalLatencies.reduce((a: number, b: number) => a + b, 0) / totalLatencies.length 
    : 0;

  const successRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;

  // Find fastest and slowest peers
  const peerLatencies = Object.entries(peerStats)
    .filter(([_, stats]) => stats.averageLatency > 0)
    .map(([pubkey, stats]) => ({ pubkey, latency: stats.averageLatency }));

  const fastestPeer = peerLatencies.length > 0 
    ? peerLatencies.reduce((min: {pubkey: string, latency: number}, peer: {pubkey: string, latency: number}) => peer.latency < min.latency ? peer : min).pubkey 
    : undefined;

  const slowestPeer = peerLatencies.length > 0 
    ? peerLatencies.reduce((max: {pubkey: string, latency: number}, peer: {pubkey: string, latency: number}) => peer.latency > max.latency ? peer : max).pubkey 
    : undefined;

  const summary = {
    totalRounds: rounds,
    totalPeers: peerPubkeys.length,
    averageLatency: Math.round(averageLatency * 100) / 100,
    successRate: Math.round(successRate * 100) / 100,
    fastestPeer,
    slowestPeer
  };

  customLogger('info', `Ping diagnostics completed`, summary);

  return {
    summary,
    rounds: allRounds,
    peerStats
  };
} 