// Export all types
export * from './types.js';
// Export keyset management
export { generateKeysetWithSecret, decodeShare, decodeGroup, getShareDetails, getShareDetailsWithGroup, recoverSecretKey, recoverSecretKeyFromCredentials, validateKeysetParams, validateSecretKey, validateSharesCompatibility, validateShareCredentialsCompatibility } from './keyset.js';
// Export node management
export { createBifrostNode, setupNodeEvents, connectNode, closeNode, createAndConnectNode } from './node.js';
// Export echo functionality
export { awaitShareEcho, startListeningForAllEchoes, sendEcho, DEFAULT_ECHO_RELAYS } from './echo.js';
// Export nostr utilities
export { nsecToHex, hexToNsec, hexToNpub, npubToHex, generateNostrKeyPair, derivePublicKey, validateHexKey, validateNostrKey } from './nostr.js';
// Export validation functions
export { validateNsec, validateHexPrivkey, validateShare, validateGroup, validateRelay, validateBfcred, validateCredentialFormat, validateRelayList, validateCredentialSet, validateMinimumShares, validateWithOptions, VALIDATION_CONSTANTS } from './validation.js';
// Export a convenience class for easier usage
export class IglooCore {
    constructor(defaultRelays = [
        "wss://relay.damus.io",
        "wss://relay.primal.net"
    ]) {
        this.defaultRelays = defaultRelays;
    }
    /**
     * Generate a new keyset from a secret key
     */
    async generateKeyset(threshold, totalMembers, secretKey) {
        const { generateKeysetWithSecret } = await import('./keyset.js');
        return generateKeysetWithSecret(threshold, totalMembers, secretKey);
    }
    /**
     * Create and connect a BifrostNode
     */
    async createNode(groupCredential, shareCredential, relays) {
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
    async waitForEcho(groupCredential, shareCredential, timeout = 30000) {
        const { awaitShareEcho } = await import('./echo.js');
        return awaitShareEcho(groupCredential, shareCredential, {
            relays: this.defaultRelays,
            timeout
        });
    }
    /**
     * Start listening for echoes on all shares
     */
    async startEchoListeners(groupCredential, shareCredentials, onEchoReceived) {
        const { startListeningForAllEchoes } = await import('./echo.js');
        return startListeningForAllEchoes(groupCredential, shareCredentials, onEchoReceived, { relays: this.defaultRelays });
    }
    /**
     * Recover secret key from shares
     */
    async recoverSecret(groupCredential, shareCredentials) {
        const { recoverSecretKeyFromCredentials } = await import('./keyset.js');
        return recoverSecretKeyFromCredentials(groupCredential, shareCredentials);
    }
    /**
     * Get details about a share
     */
    async getShareInfo(shareCredential) {
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
    async convertKey(key, targetFormat) {
        const { nsecToHex, hexToNsec, hexToNpub, npubToHex, validateHexKey, validateNostrKey } = await import('./nostr.js');
        if (key.startsWith('nsec')) {
            validateNostrKey(key); // Validate before conversion
            switch (targetFormat) {
                case 'hex': return nsecToHex(key);
                case 'nsec': return key;
                case 'npub': throw new Error('Cannot convert private key to public key format directly');
            }
        }
        else if (key.startsWith('npub')) {
            validateNostrKey(key); // Validate before conversion
            switch (targetFormat) {
                case 'hex': return npubToHex(key);
                case 'npub': return key;
                case 'nsec': throw new Error('Cannot convert public key to private key');
            }
        }
        else {
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
    async derivePublicKey(privateKey) {
        const { derivePublicKey, validateHexKey, validateNostrKey } = await import('./nostr.js');
        // Validate input before deriving
        if (privateKey.startsWith('nsec')) {
            validateNostrKey(privateKey);
        }
        else {
            validateHexKey(privateKey);
        }
        return derivePublicKey(privateKey);
    }
    /**
     * Validate a credential set (group, shares, relays)
     */
    async validateCredentials(credentials) {
        const { validateCredentialSet } = await import('./validation.js');
        return validateCredentialSet(credentials);
    }
    /**
     * Validate and normalize relay URLs
     */
    async validateRelays(relays) {
        const { validateRelayList } = await import('./validation.js');
        return validateRelayList(relays);
    }
    /**
     * Validate a single credential by type
     */
    async validateCredential(credential, type) {
        const { validateCredentialFormat } = await import('./validation.js');
        return validateCredentialFormat(credential, type);
    }
    /**
     * Validate credentials with advanced options
     */
    async validateWithOptions(credentials, options = {}) {
        const { validateWithOptions } = await import('./validation.js');
        return validateWithOptions(credentials, options);
    }
}
// Create a default instance
export const igloo = new IglooCore();
