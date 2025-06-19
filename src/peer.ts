import { BifrostNode } from '@frostr/bifrost';
import { 
  NodeError,
  type GroupPackage,
  type SharePackage
} from './types.js';
import { decodeGroup, decodeShare } from './keyset.js';
import { 
  pingPeer, 
  pingPeers as pingPeersInternal,
  createPingMonitor,
  type PingResult,
  type PingMonitorConfig,
  type PingMonitor,
  DEFAULT_PING_TIMEOUT,
  DEFAULT_PING_INTERVAL
} from './ping.js';

/**
 * Represents a peer in the FROSTR network
 */
export interface Peer {
  /** The peer's public key (hex format) */
  pubkey: string;
  /** Current online status */
  status: 'online' | 'offline' | 'unknown';
  /** Last seen timestamp */
  lastSeen?: Date;
  /** Last measured latency in milliseconds */
  latency?: number;
  /** Whether this peer can send messages */
  allowSend: boolean;
  /** Whether this peer can receive messages */
  allowReceive: boolean;
  /** Peer policy from last ping response */
  policy?: {
    send: boolean;
    recv: boolean;
  };
}

/**
 * Configuration for peer monitoring
 */
export interface PeerMonitorConfig {
  /** How often to ping peers (in milliseconds) */
  pingInterval: number;
  /** Timeout for ping responses (in milliseconds) */
  pingTimeout: number;
  /** Whether to enable automatic monitoring */
  autoMonitor: boolean;
  /** Custom callback for peer status changes */
  onPeerStatusChange?: (peer: Peer) => void;
  /** Custom error handler */
  onError?: (error: Error, context: string) => void;
  /** Enable logging */
  enableLogging?: boolean;
}

/**
 * Default peer monitoring configuration
 */
export const DEFAULT_PEER_MONITOR_CONFIG: PeerMonitorConfig = {
  pingInterval: DEFAULT_PING_INTERVAL,
  pingTimeout: DEFAULT_PING_TIMEOUT,
  autoMonitor: true,
  enableLogging: false,
  onPeerStatusChange: undefined
};

/**
 * Peer monitoring result
 */
export interface PeerMonitorResult {
  /** All peers in the group */
  peers: Peer[];
  /** Peers that are currently online */
  onlinePeers: Peer[];
  /** Peers that are currently offline */
  offlinePeers: Peer[];
  /** Total number of peers */
  totalPeers: number;
  /** Number of online peers */
  onlineCount: number;
  /** Timestamp of the last check */
  lastChecked: Date;
  /** Average latency of online peers */
  averageLatency?: number;
}

/**
 * Result of peer credential validation
 */
export interface PeerValidationResult {
  isValid: boolean;
  peerCount: number;
  peers: string[];
  selfPubkey?: string;
  warnings: string[];
  error?: string;
}

/**
 * Result of peer manager creation with enhanced error handling
 */
export interface PeerManagerResult {
  success: boolean;
  peerManager?: PeerManager | StaticPeerManager;
  mode: 'full' | 'static' | 'failed';
  warnings?: string[];
  error?: string;
}

/**
 * Enhanced peer manager configuration with fallback options
 */
export interface EnhancedPeerMonitorConfig extends PeerMonitorConfig {
  fallbackMode?: 'static' | 'disabled';
}

/**
 * Static peer manager for fallback scenarios when live monitoring fails
 */
export class StaticPeerManager {
  private peers: Peer[];
  private warnings: string[];

  constructor(peerPubkeys: string[], warnings: string[] = []) {
    this.peers = peerPubkeys.map(pubkey => ({
      pubkey,
      status: 'unknown' as const,
      lastSeen: undefined,
      allowSend: true,
      allowReceive: true
    }));
    this.warnings = warnings;
  }

  getPeerStatus(): PeerMonitorResult {
    return {
      peers: this.peers,
      onlinePeers: [],
      offlinePeers: this.peers,
      totalPeers: this.peers.length,
      onlineCount: 0,
      lastChecked: new Date()
    };
  }

  getAllPeers(): Peer[] {
    return [...this.peers];
  }

  getOnlinePeers(): Peer[] {
    return [];
  }

  getOfflinePeers(): Peer[] {
    return [...this.peers];
  }

  getOnlineCount(): number {
    return 0;
  }

  isPeerOnline(pubkey: string): boolean {
    return false;
  }

  getPeer(pubkey: string): Peer | undefined {
    return this.peers.find(p => p.pubkey === pubkey);
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  async pingPeers(): Promise<PeerMonitorResult> {
    this.log('warn', 'Ping not supported in static peer manager mode');
    return this.getPeerStatus();
  }

  startMonitoring(): void {
    this.log('warn', 'Live monitoring not available in static peer manager mode');
  }

  stopMonitoring(): void {
    this.log('warn', 'No monitoring to stop in static peer manager mode');
  }

  updateConfig(config: Partial<PeerMonitorConfig>): void {
    this.log('warn', 'Configuration updates not supported in static peer manager mode');
  }

  cleanup(): void {
    this.peers = [];
    this.warnings = [];
  }

  private log(level: string, message: string): void {
    const logMethod = (console as any)[level];
    if (typeof logMethod === 'function') {
      logMethod(`[StaticPeerManager] ${message}`);
    }
  }
}

/**
 * Enhanced peer manager class leveraging the new ping functionality
 */
export class PeerManager {
  private peers: Map<string, Peer> = new Map();
  private pingMonitor?: PingMonitor;
  private config: PeerMonitorConfig;
  private node: BifrostNode;
  private selfPubkey: string;
  private messageHandler: (msg: any) => void;
  private pingResponseHandler: (msg: any) => void;

  constructor(
    node: BifrostNode,
    selfPubkey: string,
    config: Partial<PeerMonitorConfig> = {}
  ) {
    this.node = node;
    this.selfPubkey = selfPubkey;
    this.config = { ...DEFAULT_PEER_MONITOR_CONFIG, ...config };
    
    // Create bound event handler functions
    this.messageHandler = this.handleMessage.bind(this);
    this.pingResponseHandler = this.handlePingResponse.bind(this);
    
    // Set up event listeners for backward compatibility
    this.setupEventListeners();
  }

  /**
   * Handle incoming messages to mark peers as online
   */
  private handleMessage(msg: any): void {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    const peerPubkey = msg.pub || msg.pubkey;
    if (peerPubkey && this.peers.has(peerPubkey)) {
      this.updatePeerStatus(peerPubkey, 'online');
    }
  }

  /**
   * Handle ping responses to mark peers as online
   */
  private handlePingResponse(msg: any): void {
    const peerPubkey = msg.pub || msg.pubkey;
    if (peerPubkey && this.peers.has(peerPubkey)) {
      this.updatePeerStatus(peerPubkey, 'online');
    }
  }

  /**
   * Set up event listeners for backward compatibility
   */
  private setupEventListeners(): void {
    // Listen for any incoming messages to mark peers as online
    this.node.on('message', this.messageHandler);

    // Listen for ping responses
    this.node.on('/ping/sender/res', this.pingResponseHandler);
  }

  /**
   * Initialize peer list from group configuration
   */
  public initializePeers(groupCredential: string, shareCredential: string): void {
    try {
      const peers = extractPeersFromCredentials(groupCredential, shareCredential);
      this.initializePeersFromList(peers);
      
      // Start monitoring if enabled
      if (this.config.autoMonitor) {
        this.startMonitoring();
      }
    } catch (error: any) {
      throw new NodeError(
        `Failed to initialize peers: ${error.message}`,
        { groupCredential, shareCredential, error }
      );
    }
  }

  /**
   * Initialize peers from a pre-validated list
   */
  public initializePeersFromList(peerPubkeys: string[]): void {
    this.peers.clear();
    
    peerPubkeys.forEach(pubkey => {
      this.peers.set(pubkey, {
        pubkey,
        status: 'unknown',
        lastSeen: undefined,
        allowSend: true,
        allowReceive: true
      });
    });

    this.log('info', `Initialized ${peerPubkeys.length} peers`);
  }

  /**
   * Update the status of a specific peer (public for backward compatibility)
   */
  public updatePeerStatus(pubkey: string, status: 'online' | 'offline' | 'unknown'): void {
    const peer = this.peers.get(pubkey);
    if (!peer) return;

    const oldStatus = peer.status;
    peer.status = status;
    peer.lastSeen = status === 'online' ? new Date() : peer.lastSeen;

    // Notify callback if status changed
    if (oldStatus !== peer.status && this.config.onPeerStatusChange) {
      this.config.onPeerStatusChange(peer);
    }
  }

  /**
   * Update the status of a specific peer from ping result
   */
  private updatePeerFromPingResult(result: PingResult): void {
    const peer = this.peers.get(result.pubkey);
    if (!peer) return;

    const oldStatus = peer.status;
    peer.status = result.success ? 'online' : 'offline';
    peer.lastSeen = result.success ? result.timestamp : peer.lastSeen;
    peer.latency = result.latency;
    peer.policy = result.policy;

    // Notify callback if status changed
    if (oldStatus !== peer.status && this.config.onPeerStatusChange) {
      this.config.onPeerStatusChange(peer);
    }
  }

  /**
   * Ping all peers using the new ping functionality
   */
  public async pingPeers(): Promise<PeerMonitorResult> {
    try {
      const peerPubkeys = Array.from(this.peers.keys());
      if (peerPubkeys.length === 0) {
        this.log('warn', 'No peers to ping');
        return this.getPeerStatus();
      }

      this.log('debug', `Pinging ${peerPubkeys.length} peers`);
      
      const results = await pingPeersInternal(this.node, peerPubkeys, {
        timeout: this.config.pingTimeout,
        eventConfig: { enableLogging: this.config.enableLogging }
      });

      // Update peer statuses based on results
      results.forEach(result => this.updatePeerFromPingResult(result));

      const status = this.getPeerStatus();
      this.log('info', `Ping complete: ${status.onlineCount}/${status.totalPeers} peers online`);
      
      return status;
    } catch (error: any) {
      this.handleError(error, 'pingPeers');
      // Mark all peers as unknown on error
      for (const peer of this.peers.values()) {
        peer.status = 'unknown';
      }
      return this.getPeerStatus();
    }
  }

  /**
   * Get current peer status with enhanced information
   */
  public getPeerStatus(): PeerMonitorResult {
    const peers = Array.from(this.peers.values());
    const onlinePeers = peers.filter(p => p.status === 'online');
    const offlinePeers = peers.filter(p => p.status === 'offline');

    // Calculate average latency for online peers
    const latencies = onlinePeers
      .map(p => p.latency)
      .filter((latency): latency is number => latency !== undefined);
    
    const averageLatency = latencies.length > 0 
      ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
      : undefined;

    return {
      peers,
      onlinePeers,
      offlinePeers,
      totalPeers: peers.length,
      onlineCount: onlinePeers.length,
      lastChecked: new Date(),
      averageLatency
    };
  }

  /**
   * Start automatic peer monitoring using the ping monitor
   */
  public startMonitoring(): void {
    if (this.pingMonitor) {
      this.pingMonitor.stop();
    }

    const peerPubkeys = Array.from(this.peers.keys());
    if (peerPubkeys.length === 0) {
      this.log('warn', 'No peers to monitor');
      return;
    }

    try {
      this.pingMonitor = createPingMonitor(this.node, peerPubkeys, {
        interval: this.config.pingInterval,
        timeout: this.config.pingTimeout,
        onPingResult: (result) => {
          this.updatePeerFromPingResult(result);
        },
        onError: (error, context) => {
          this.handleError(error, `monitor:${context}`);
        },
        eventConfig: { enableLogging: this.config.enableLogging }
      });

      this.pingMonitor.start();
      this.log('info', `Started monitoring ${peerPubkeys.length} peers (interval: ${this.config.pingInterval}ms)`);
    } catch (error: any) {
      this.handleError(error, 'startMonitoring');
      throw new NodeError(`Failed to start peer monitoring: ${error.message}`, { error });
    }
  }

  /**
   * Stop automatic peer monitoring
   */
  public stopMonitoring(): void {
    if (this.pingMonitor) {
      this.pingMonitor.stop();
      this.log('info', 'Stopped peer monitoring');
    }
  }

  /**
   * Update monitoring configuration
   */
  public updateConfig(config: Partial<PeerMonitorConfig>): void {
    const wasMonitoring = this.pingMonitor?.isRunning;
    
    this.config = { ...this.config, ...config };
    
    // Restart monitoring if it was active and relevant config changed
    if (wasMonitoring && (config.pingInterval || config.pingTimeout)) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Ping a specific peer
   */
  public async pingPeer(pubkey: string): Promise<PingResult> {
    if (!this.peers.has(pubkey)) {
      throw new NodeError(`Peer not found: ${pubkey}`, { pubkey });
    }

    try {
      const result = await pingPeer(this.node, pubkey, {
        timeout: this.config.pingTimeout,
        eventConfig: { enableLogging: this.config.enableLogging }
      });

      this.updatePeerFromPingResult(result);
      return result;
    } catch (error: any) {
      this.handleError(error, 'pingPeer');
      throw error;
    }
  }

  /**
   * Get a specific peer by public key
   */
  public getPeer(pubkey: string): Peer | undefined {
    return this.peers.get(pubkey);
  }

  /**
   * Get all peers
   */
  public getAllPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get online peers only
   */
  public getOnlinePeers(): Peer[] {
    return Array.from(this.peers.values()).filter(p => p.status === 'online');
  }

  /**
   * Get offline peers only
   */
  public getOfflinePeers(): Peer[] {
    return Array.from(this.peers.values()).filter(p => p.status === 'offline');
  }

  /**
   * Check if a specific peer is online
   */
  public isPeerOnline(pubkey: string): boolean {
    const peer = this.peers.get(pubkey);
    return peer?.status === 'online' || false;
  }

  /**
   * Get the count of online peers
   */
  public getOnlineCount(): number {
    return Array.from(this.peers.values()).filter(p => p.status === 'online').length;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Remove event listeners to prevent memory leaks
    // Use different methods depending on what's available on the node
    const nodeAny = this.node as any;
    
    if (typeof nodeAny.off === 'function') {
      nodeAny.off('message', this.messageHandler);
      nodeAny.off('/ping/sender/res', this.pingResponseHandler);
    } else if (typeof nodeAny.removeListener === 'function') {
      nodeAny.removeListener('message', this.messageHandler);
      nodeAny.removeListener('/ping/sender/res', this.pingResponseHandler);
    } else if (typeof nodeAny.removeAllListeners === 'function') {
      // Fallback: remove all listeners (less precise but prevents leaks)
      nodeAny.removeAllListeners('message');
      nodeAny.removeAllListeners('/ping/sender/res');
    }
    
    this.stopMonitoring();
    if (this.pingMonitor) {
      this.pingMonitor.cleanup();
      this.pingMonitor = undefined;
    }
    this.peers.clear();
    this.log('info', 'Peer manager cleaned up');
  }

  /**
   * Handle errors with optional callback
   */
  private handleError(error: Error, context: string): void {
    if (this.config.onError) {
      this.config.onError(error, context);
    } else {
      this.log('error', `Error in ${context}: ${error.message}`);
    }
  }

  /**
   * Internal logging
   */
  private log(level: string, message: string): void {
    if (this.config.enableLogging) {
      const logMethod = (console as any)[level];
      if (typeof logMethod === 'function') {
        logMethod(`[PeerManager] ${message}`);
      }
    }
  }
}

/**
 * Extract peers from group credentials using improved error handling
 */
export function extractPeersFromCredentials(
  groupCredential: string,
  shareCredential: string
): string[] {
  try {
    const group = decodeGroup(groupCredential);
    const share = decodeShare(shareCredential);
    
    // Get self public key from share
    const selfPubkey = extractSelfPubkey(share);
    
    // Extract peers from group
    const peers = extractPeersFromGroup(group, selfPubkey);
    
    return peers;
  } catch (error: any) {
    throw new NodeError(
      `Failed to extract peers from credentials: ${error.message}`,
      { groupCredential, shareCredential, error }
    );
  }
}

/**
 * Extract self public key from share with multiple strategies
 */
function extractSelfPubkey(share: SharePackage): string {
  const shareAny = share as any;
  
  // Strategy 1: Direct pubkey field
  if (shareAny.pubkey && typeof shareAny.pubkey === 'string') {
    return shareAny.pubkey;
  }

  // Strategy 2: Alternative pub field
  if (shareAny.pub && typeof shareAny.pub === 'string') {
    return shareAny.pub;
  }

  // Strategy 3: Look for public key in other common fields
  if (shareAny.public_key && typeof shareAny.public_key === 'string') {
    return shareAny.public_key;
  }

  throw new NodeError(
    'Could not extract self public key from share credential',
    { availableFields: Object.keys(shareAny) }
  );
}

/**
 * Extract peers from group package
 */
function extractPeersFromGroup(group: GroupPackage, selfPubkey: string): string[] {
  const groupAny = group as any;
  let allPubkeys: string[] = [];

  // Strategy 1: commits array with pubkey field
  if (group.commits && Array.isArray(group.commits)) {
    const commitPubkeys = group.commits
      .map((commit: any) => commit?.pubkey)
      .filter((pubkey: any) => pubkey && typeof pubkey === 'string' && pubkey.length > 0);
    allPubkeys.push(...commitPubkeys);
  }

  // Strategy 2: participants array (alternative field name)
  if (allPubkeys.length === 0 && groupAny.participants && Array.isArray(groupAny.participants)) {
    const participantPubkeys = groupAny.participants
      .filter((pubkey: any) => pubkey && typeof pubkey === 'string' && pubkey.length > 0);
    allPubkeys.push(...participantPubkeys);
  }

  // Strategy 3: members array (another alternative)
  if (allPubkeys.length === 0 && groupAny.members && Array.isArray(groupAny.members)) {
    const memberPubkeys = groupAny.members
      .map((member: any) => {
        if (typeof member === 'string') return member;
        if (member?.pubkey) return member.pubkey;
        if (member?.pub) return member.pub;
        return null;
      })
      .filter((pubkey: any) => pubkey && typeof pubkey === 'string' && pubkey.length > 0);
    allPubkeys.push(...memberPubkeys);
  }

  if (allPubkeys.length === 0) {
    throw new NodeError(
      'No peer public keys found in group',
      { 
        checkedFields: ['commits', 'participants', 'members'],
        groupStructure: Object.keys(groupAny)
      }
    );
  }

  // Remove duplicates and self
  const uniquePubkeys = [...new Set(allPubkeys)];
  const peerPubkeys = uniquePubkeys.filter(pubkey => pubkey !== selfPubkey);

  return peerPubkeys;
}

/**
 * Simple function to ping peers and get online peer pubkeys (legacy compatibility)
 * @deprecated Use PeerManager.pingPeers() or pingPeersInternal() instead
 */
export async function pingPeers(node: BifrostNode, timeout = DEFAULT_PING_TIMEOUT): Promise<string[]> {
  try {
    // Use Bifrost's native ping functionality for backward compatibility
    const result = await (node.req as any).ping();
    if (result && result.ok) {
      // Handle different possible result formats
      if (Array.isArray(result.data)) {
        return result.data;
      } else if (result.data && typeof result.data === 'object') {
        return Object.keys(result.data);
      }
    }
    return [];
  } catch (error) {
    console.warn('Ping operation failed:', error);
    return [];
  }
}

/**
 * Create a PeerManager instance with a connected BifrostNode
 */
export async function createPeerManager(
  node: BifrostNode,
  groupCredential: string,
  shareCredential: string,
  config: Partial<PeerMonitorConfig> = {}
): Promise<PeerManager> {
  try {
    // Validate credentials first
    const validation = await validatePeerCredentials(groupCredential, shareCredential);
    if (!validation.isValid) {
      throw new NodeError(`Invalid credentials: ${validation.error}`, { validation });
    }

    // Create peer manager
    const peerManager = new PeerManager(node, validation.selfPubkey!, config);
    
    // Initialize with validated peer list
    peerManager.initializePeersFromList(validation.peers);
    
    return peerManager;
  } catch (error: any) {
    throw new NodeError(
      `Failed to create peer manager: ${error.message}`,
      { groupCredential, shareCredential, error }
    );
  }
}

/**
 * Simple peer status check function using ping functionality
 */
export async function checkPeerStatus(
  node: BifrostNode,
  groupCredential: string,
  shareCredential: string
): Promise<{ pubkey: string; status: 'online' | 'offline' }[]> {
  try {
    const peers = extractPeersFromCredentials(groupCredential, shareCredential);
    const results = await pingPeersInternal(node, peers, {
      timeout: DEFAULT_PING_TIMEOUT,
      eventConfig: { enableLogging: false }
    });
    
    return results.map(result => ({
      pubkey: result.pubkey,
      status: result.success ? 'online' : 'offline'
    }));
  } catch (error: any) {
    throw new NodeError(
      `Failed to check peer status: ${error.message}`,
      { groupCredential, shareCredential, error }
    );
  }
}

/**
 * Validate peer credentials before creating peer manager
 */
export async function validatePeerCredentials(
  groupCredential: string,
  shareCredential: string
): Promise<PeerValidationResult> {
  const warnings: string[] = [];
  
  try {
    // Validate group credential
    let group: GroupPackage;
    try {
      group = decodeGroup(groupCredential);
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid group credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
        peerCount: 0,
        peers: [],
        warnings
      };
    }

    // Validate share credential
    let share: SharePackage;
    try {
      share = decodeShare(shareCredential);
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid share credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
        peerCount: 0,
        peers: [],
        warnings
      };
    }

    // Extract self public key
    let selfPubkey: string;
    try {
      selfPubkey = extractSelfPubkey(share);
    } catch (error) {
      return {
        isValid: false,
        error: `Could not extract self public key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        peerCount: 0,
        peers: [],
        warnings
      };
    }

    // Extract peers
    let peers: string[];
    try {
      peers = extractPeersFromGroup(group, selfPubkey);
    } catch (error) {
      return {
        isValid: false,
        error: `Peer extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        peerCount: 0,
        peers: [],
        warnings
      };
    }

    // Add warnings for edge cases
    if (peers.length === 0) {
      warnings.push('No other peers found in group - this might be a single-member group');
    } else if (peers.length === 1) {
      warnings.push('Only one other peer found in group');
    }

    return {
      isValid: true,
      peerCount: peers.length,
      peers,
      selfPubkey,
      warnings
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      peerCount: 0,
      peers: [],
      warnings
    };
  }
}

/**
 * Enhanced peer manager creation with robust error handling and fallback options
 */
export async function createPeerManagerRobust(
  node: BifrostNode,
  groupCredential: string,
  shareCredential: string,
  config?: Partial<EnhancedPeerMonitorConfig>
): Promise<PeerManagerResult> {
  const enhancedConfig = { ...DEFAULT_PEER_MONITOR_CONFIG, ...config };

  try {
    // Step 1: Validate credentials
    const validation = await validatePeerCredentials(groupCredential, shareCredential);

    if (!validation.isValid) {
      if (enhancedConfig.fallbackMode === 'static') {
        // Try basic peer extraction as fallback
        try {
          const basicPeers = extractBasicPeers(groupCredential, shareCredential);
          const staticManager = new StaticPeerManager(basicPeers, [
            `Live monitoring disabled: ${validation.error}`,
            'Using static peer list as fallback'
          ]);
          
          return {
            success: true,
            peerManager: staticManager,
            mode: 'static',
            warnings: [
              `Peer monitoring disabled: ${validation.error}`,
              'Fallback to static peer list enabled'
            ]
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: `Primary and fallback failed: ${validation.error}`,
            mode: 'failed'
          };
        }
      } else {
        return {
          success: false,
          error: validation.error,
          mode: 'failed'
        };
      }
    }

    // Step 2: Create full peer manager
    try {
      const peerManager = new PeerManager(node, validation.selfPubkey!, {
        ...enhancedConfig,
        autoMonitor: false // Disable auto-monitor initially for safer initialization
      });

      // Initialize peers manually
      peerManager.initializePeersFromList(validation.peers);

      // Start monitoring if requested (after initialization)
      if (enhancedConfig.autoMonitor) {
        try {
          peerManager.startMonitoring();
        } catch (monitorError) {
          if (enhancedConfig.onError) {
            enhancedConfig.onError(monitorError as Error, 'startMonitoring');
          }
          
          if (enhancedConfig.fallbackMode === 'static') {
            // Fall back to static mode if monitoring fails
            const staticManager = new StaticPeerManager(validation.peers, [
              `Live monitoring failed: ${monitorError instanceof Error ? monitorError.message : 'Unknown error'}`,
              'Switched to static peer list mode'
            ]);
            
            return {
              success: true,
              peerManager: staticManager,
              mode: 'static',
              warnings: [
                `Monitoring initialization failed, using static mode`,
                ...(validation.warnings || [])
              ]
            };
          } else {
            throw monitorError;
          }
        }
      }

      return {
        success: true,
        peerManager,
        mode: 'full',
        warnings: validation.warnings
      };

    } catch (managerError) {
      if (enhancedConfig.onError) {
        enhancedConfig.onError(managerError as Error, 'createPeerManager');
      }

      if (enhancedConfig.fallbackMode === 'static') {
        // Fall back to static manager
        const staticManager = new StaticPeerManager(validation.peers, [
          `PeerManager creation failed: ${managerError instanceof Error ? managerError.message : 'Unknown error'}`,
          'Using static peer list as fallback'
        ]);
        
        return {
          success: true,
          peerManager: staticManager,
          mode: 'static',
          warnings: [
            `Full peer manager creation failed, using static mode`,
            ...(validation.warnings || [])
          ]
        };
      } else {
        throw managerError;
      }
    }

  } catch (error) {
    if (enhancedConfig.onError) {
      enhancedConfig.onError(error as Error, 'createPeerManagerRobust');
    }

    return {
      success: false,
      error: `Peer manager creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      mode: 'failed'
    };
  }
}

/**
 * Basic peer extraction for fallback scenarios
 */
function extractBasicPeers(groupCredential: string, shareCredential: string): string[] {
  try {
    return extractPeersFromCredentials(groupCredential, shareCredential);
  } catch (error) {
    // Try even more basic extraction
    try {
      const group = decodeGroup(groupCredential);
      const groupAny = group as any;
      
      // Strategy 1: participants array
      if (groupAny.participants && Array.isArray(groupAny.participants)) {
        return groupAny.participants.filter((p: any) => p && typeof p === 'string');
      }
      
      // Strategy 2: commits array with pubkey field
      if (group.commits && Array.isArray(group.commits)) {
        return group.commits
          .map((c: any) => c?.pubkey)
          .filter((p: any) => p && typeof p === 'string');
      }
      
      return [];
    } catch {
      return [];
    }
  }
} 