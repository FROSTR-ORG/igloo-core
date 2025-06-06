// Export all types
export * from './types.js';

// Export keyset management
export {
  generateKeysetWithSecret,
  decodeShare,
  decodeGroup,
  getShareDetails,
  getShareDetailsWithGroup,
  recoverSecretKey,
  recoverSecretKeyFromCredentials,
  validateKeysetParams,
  validateSecretKey,
  validateSharesCompatibility,
  validateShareCredentialsCompatibility
} from './keyset.js';

// Export node management
export {
  createBifrostNode,
  setupNodeEvents,
  connectNode,
  closeNode,
  createAndConnectNode,
  createConnectedNode,
  isNodeReady,
  cleanupBifrostNode,
  type NodeEventConfig
} from './node.js';

// Export echo functionality
export {
  awaitShareEcho,
  startListeningForAllEchoes,
  sendEcho,
  DEFAULT_ECHO_RELAYS
} from './echo.js';

// Export nostr utilities
export {
  nsecToHex,
  hexToNsec,
  hexToNpub,
  npubToHex,
  generateNostrKeyPair,
  derivePublicKey,
  validateHexKey,
  validateNostrKey
} from './nostr.js';

// Export validation functions
export {
  validateNsec,
  validateHexPrivkey,
  validateShare,
  validateGroup,
  validateRelay,
  validateBfcred,
  validateCredentialFormat,
  validateRelayList,
  validateCredentialSet,
  validateMinimumShares,
  validateWithOptions,
  VALIDATION_CONSTANTS,
  type ValidationOptions
} from './validation.js';

// Export a convenience class for easier usage
export class IglooCore {
  constructor(
    public readonly defaultRelays: string[] = [
      "wss://relay.damus.io", 
      "wss://relay.primal.net"
    ]
  ) {}

  /**
   * Generate a new keyset from a secret key
   */
  async generateKeyset(
    threshold: number, 
    totalMembers: number, 
    secretKey: string
  ) {
    const { generateKeysetWithSecret } = await import('./keyset.js');
    return generateKeysetWithSecret(threshold, totalMembers, secretKey);
  }

  /**
   * Create and connect a BifrostNode
   */
  async createNode(
    groupCredential: string,
    shareCredential: string,
    relays?: string[]
  ) {
    const { createAndConnectNode } = await import('./node.js');
    return createAndConnectNode({
      group: groupCredential,
      share: shareCredential,
      relays: relays || this.defaultRelays
    });
  }

  /**
   * Create and connect a BifrostNode with enhanced state information
   */
  async createEnhancedNode(
    groupCredential: string,
    shareCredential: string,
    relays?: string[],
    options?: { connectionTimeout?: number; autoReconnect?: boolean }
  ) {
    const { createConnectedNode } = await import('./node.js');
    return createConnectedNode({
      group: groupCredential,
      share: shareCredential,
      relays: relays || this.defaultRelays,
      ...options
    });
  }

  /**
   * Check if a BifrostNode is ready
   */
  async isNodeReady(node: any) {
    const { isNodeReady } = await import('./node.js');
    return isNodeReady(node);
  }

  /**
   * Clean up a BifrostNode completely
   */
  async cleanupNode(node: any) {
    const { cleanupBifrostNode } = await import('./node.js');
    return cleanupBifrostNode(node);
  }

  /**
   * Wait for an echo on a specific share
   */
  async waitForEcho(
    groupCredential: string,
    shareCredential: string,
    timeout = 30000
  ) {
    const { awaitShareEcho } = await import('./echo.js');
    return awaitShareEcho(groupCredential, shareCredential, {
      relays: this.defaultRelays,
      timeout
    });
  }

  /**
   * Start listening for echoes on all shares
   */
  async startEchoListeners(
    groupCredential: string,
    shareCredentials: string[],
    onEchoReceived: (shareIndex: number, shareCredential: string) => void
  ) {
    const { startListeningForAllEchoes } = await import('./echo.js');
    return startListeningForAllEchoes(
      groupCredential,
      shareCredentials,
      onEchoReceived,
      { relays: this.defaultRelays }
    );
  }

  /**
   * Recover secret key from shares
   */
  async recoverSecret(
    groupCredential: string,
    shareCredentials: string[]
  ) {
    const { recoverSecretKeyFromCredentials } = await import('./keyset.js');
    return recoverSecretKeyFromCredentials(groupCredential, shareCredentials);
  }

  /**
   * Get details about a share
   */
  async getShareInfo(shareCredential: string) {
    const { getShareDetails } = await import('./keyset.js');
    return getShareDetails(shareCredential);
  }

  /**
   * Generate a new nostr key pair
   */
  async generateKeys() {
    const { generateNostrKeyPair } = await import('./nostr.js');
    return generateNostrKeyPair();
  }

  /**
   * Convert between nostr key formats
   */
  async convertKey(key: string, targetFormat: 'hex' | 'nsec' | 'npub') {
    const { nsecToHex, hexToNsec, hexToNpub, npubToHex, validateHexKey, validateNostrKey } = await import('./nostr.js');
    
    if (key.startsWith('nsec')) {
      validateNostrKey(key); // Validate before conversion
      switch (targetFormat) {
        case 'hex': return nsecToHex(key);
        case 'nsec': return key;
        case 'npub': throw new Error('Cannot convert private key to public key format directly');
      }
    } else if (key.startsWith('npub')) {
      validateNostrKey(key); // Validate before conversion
      switch (targetFormat) {
        case 'hex': return npubToHex(key);
        case 'npub': return key;
        case 'nsec': throw new Error('Cannot convert public key to private key');
      }
    } else {
      // Assume hex format - validate it
      validateHexKey(key);
      switch (targetFormat) {
        case 'hex': return key;
        case 'nsec': return hexToNsec(key);
        case 'npub': return hexToNpub(key);
      }
    }
  }

  /**
   * Derive public key from private key
   */
  async derivePublicKey(privateKey: string) {
    const { derivePublicKey, validateHexKey, validateNostrKey } = await import('./nostr.js');
    
    // Validate input before deriving
    if (privateKey.startsWith('nsec')) {
      validateNostrKey(privateKey);
    } else {
      validateHexKey(privateKey);
    }
    
    return derivePublicKey(privateKey);
  }

  /**
   * Validate a credential set (group, shares, relays)
   */
  async validateCredentials(credentials: {
    group: string;
    shares: string[];
    relays: string[];
  }) {
    const { validateCredentialSet } = await import('./validation.js');
    return validateCredentialSet(credentials);
  }

  /**
   * Validate and normalize relay URLs
   */
  async validateRelays(relays: string[]) {
    const { validateRelayList } = await import('./validation.js');
    return validateRelayList(relays);
  }

  /**
   * Validate a single credential by type
   */
  async validateCredential(credential: string, type: 'share' | 'group' | 'cred') {
    const { validateCredentialFormat } = await import('./validation.js');
    return validateCredentialFormat(credential, type);
  }

  /**
   * Validate credentials with advanced options
   */
  async validateWithOptions(
    credentials: { group: string; shares: string[]; relays: string[] },
    options: { strict?: boolean; normalizeRelays?: boolean; requireMinShares?: number } = {}
  ) {
    const { validateWithOptions } = await import('./validation.js');
    return validateWithOptions(credentials, options);
  }
}

// Create a default instance
export const igloo = new IglooCore(); 