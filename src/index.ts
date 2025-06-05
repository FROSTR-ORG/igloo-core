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
    const { nsecToHex, hexToNsec, hexToNpub, npubToHex } = await import('./nostr.js');
    
    if (key.startsWith('nsec')) {
      switch (targetFormat) {
        case 'hex': return nsecToHex(key);
        case 'nsec': return key;
        case 'npub': throw new Error('Cannot convert private key to public key format directly');
      }
    } else if (key.startsWith('npub')) {
      switch (targetFormat) {
        case 'hex': return npubToHex(key);
        case 'npub': return key;
        case 'nsec': throw new Error('Cannot convert public key to private key');
      }
    } else {
      // Assume hex format
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
    const { derivePublicKey } = await import('./nostr.js');
    return derivePublicKey(privateKey);
  }
}

// Create a default instance
export const igloo = new IglooCore(); 