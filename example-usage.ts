/**
 * Example showing how the main Igloo Desktop app could use @igloo/core
 * This demonstrates the migration path from the current bifrost.ts to the new library
 */

import { 
    igloo, 
    generateKeysetWithSecret,
    awaitShareEcho,
    startListeningForAllEchoes,
    recoverSecretKeyFromCredentials,
    getShareDetails,
    createAndConnectNode,
    KeysetError,
    EchoError,
    NodeError
  } from './src/index.js';
  
  // Example: Migrating the current generateKeysetWithSecret function
  export function migratedGenerateKeyset(threshold: number, totalMembers: number, secretKey: string) {
    try {
      // Old way (from src/lib/bifrost.ts):
      // const { group, shares } = generate_dealer_pkg(threshold, totalMembers, [secretKey])
      // return {
      //   groupCredential: PackageEncoder.group.encode(group),
      //   shareCredentials: shares.map((share: SharePackage) => PackageEncoder.share.encode(share))
      // }
  
      // New way (using igloo-core):
      return generateKeysetWithSecret(threshold, totalMembers, secretKey);
    } catch (error) {
      if (error instanceof KeysetError) {
        console.error('Keyset generation failed:', error.message, error.details);
        throw error;
      }
      throw error;
    }
  }
  
  // Example: Migrating the current get_node function
  export async function migratedCreateNode(group: string, share: string, relays: string[]) {
    try {
      // Old way (from src/lib/bifrost.ts):
      // const decodedGroup = PackageEncoder.group.decode(group)
      // const decodedShare = PackageEncoder.share.decode(share)
      // const node = new BifrostNode(decodedGroup, decodedShare, relays)
      // // ... setup event handlers manually
      // return node
  
      // New way (using igloo-core):
      return await createAndConnectNode(
        { group, share, relays },
        { 
          enableLogging: true, 
          logLevel: 'info',
          customLogger: (level, message, data) => {
            // Integrate with your existing logging system
            console.log(`[Igloo:${level}] ${message}`, data);
          }
        }
      );
    } catch (error) {
      if (error instanceof NodeError) {
        console.error('Node creation failed:', error.message, error.details);
        throw error;
      }
      throw error;
    }
  }
  
  // Example: Migrating the current awaitShareEcho function
  export async function migratedAwaitEcho(
    groupCredential: string, 
    shareCredential: string, 
    relays: string[] = ["wss://relay.damus.io", "wss://relay.primal.net"], 
    timeout = 30000
  ) {
    try {
      // Old way (from src/lib/bifrost.ts):
      // return new Promise(async (resolve, reject) => {
      //   let node: BifrostNode | null = null;
      //   // ... lots of manual setup and cleanup
      // });
  
      // New way (using igloo-core):
      return await awaitShareEcho(groupCredential, shareCredential, {
        relays,
        timeout,
        eventConfig: { enableLogging: true, logLevel: 'info' }
      });
    } catch (error) {
      if (error instanceof EchoError) {
        console.error('Echo failed:', error.message, error.details);
        throw error;
      }
      throw error;
    }
  }
  
  // Example: Migrating the current startListeningForAllEchoes function
  export function migratedStartEchoListeners(
    groupCredential: string,
    shareCredentials: string[],
    onEchoReceived: (shareIndex: number, shareCredential: string) => void,
    relays: string[] = ["wss://relay.damus.io", "wss://relay.primal.net"]
  ) {
    // Old way (from src/lib/bifrost.ts):
    // const nodes: BifrostNode[] = [];
    // const cleanupFunctions: (() => void)[] = [];
    // // ... lots of manual node management
    // return () => { /* manual cleanup */ };
  
    // New way (using igloo-core):
    return startListeningForAllEchoes(
      groupCredential,
      shareCredentials,
      onEchoReceived,
      {
        relays,
        eventConfig: { enableLogging: true, logLevel: 'info' }
      }
    );
  }
  
  // Example: Migrating the current recover_nsec function
  export function migratedRecoverSecret(groupCredential: string, shareCredentials: string[]) {
    try {
      // Old way (from src/lib/bifrost.ts):
      // const group = PackageEncoder.group.decode(groupCredential);
      // const shares = shareCredentials.map(cred => PackageEncoder.share.decode(cred));
      // const hex_secret = recover_secret_key(group, shares);
      // const secretBytes = Buffer.from(hex_secret, 'hex');
      // return nip19.nsecEncode(secretBytes);
  
      // New way (using igloo-core):
      return recoverSecretKeyFromCredentials(groupCredential, shareCredentials);
    } catch (error) {
      console.error('Secret recovery failed:', error);
      throw error;
    }
  }
  
  // Example: Using the convenience class for simpler API
  export class IglooDesktopService {
    private igloo = igloo; // Use the default instance
  
    async generateKeyset(threshold: number, totalMembers: number, secretKey: string) {
      return await this.igloo.generateKeyset(threshold, totalMembers, secretKey);
    }
  
    async createNode(groupCredential: string, shareCredential: string) {
      return await this.igloo.createNode(groupCredential, shareCredential);
    }
  
    async waitForEcho(groupCredential: string, shareCredential: string, timeout = 30000) {
      return await this.igloo.waitForEcho(groupCredential, shareCredential, timeout);
    }
  
    startEchoListeners(
      groupCredential: string, 
      shareCredentials: string[], 
      callback: (shareIndex: number, shareCredential: string) => void
    ) {
      return startListeningForAllEchoes(groupCredential, shareCredentials, callback, {
        relays: this.igloo.defaultRelays,
        eventConfig: { enableLogging: true, logLevel: 'info' }
      });
    }
  
    async recoverSecret(groupCredential: string, shareCredentials: string[]) {
      return await this.igloo.recoverSecret(groupCredential, shareCredentials);
    }
  
    async getShareInfo(shareCredential: string) {
      return await this.igloo.getShareInfo(shareCredential);
    }
  }
  
  // Example usage in a React component or main process
  export async function exampleUsage() {
    const service = new IglooDesktopService();
  
    try {
      // Generate a 2-of-3 keyset
      const keyset = await service.generateKeyset(2, 3, 'your-secret-key-here');
      console.log('Generated keyset with', keyset.shareCredentials.length, 'shares');
  
      // Start listening for echoes
      const echoListener = service.startEchoListeners(
        keyset.groupCredential,
        keyset.shareCredentials,
        (shareIndex, shareCredential) => {
          console.log(`Share ${shareIndex} was imported on another device!`);
          // Update UI to show share status
        }
      );
  
      // Wait for a specific share to be imported
      try {
        await service.waitForEcho(keyset.groupCredential, keyset.shareCredentials[0], 30000);
        console.log('First share was successfully imported!');
      } catch (error) {
        console.log('No echo received within timeout period');
      }
  
      // Later, recover the secret using threshold shares
      const recoveredSecret = await service.recoverSecret(
        keyset.groupCredential,
        keyset.shareCredentials.slice(0, 2) // Use first 2 shares
      );
      console.log('Secret recovered:', recoveredSecret);
  
      // Cleanup
      echoListener.cleanup();
  
    } catch (error) {
      console.error('Example failed:', error);
    }
  }
  
  // Migration checklist for the main Igloo project:
  /*
  1. Install @igloo/core as a dependency
  2. Replace imports from './lib/bifrost' with '@igloo/core'
  3. Update function calls to use the new API
  4. Replace manual error handling with structured error types
  5. Update event handling to use the new NodeEventConfig system
  6. Test all functionality to ensure compatibility
  7. Remove the old src/lib/bifrost.ts file
  8. Update any UI components that depend on the old API
  
  Benefits of migration:
  - Cleaner, more maintainable code
  - Better error handling with structured error types
  - Comprehensive TypeScript support
  - Easier testing and mocking
  - Reusable across multiple client applications
  - Better separation of concerns
  */ 