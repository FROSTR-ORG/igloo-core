import { 
  generateKeysetWithSecret,
  recoverSecretKeyFromCredentials,
  getShareDetails,
  generateNostrKeyPair,
  KeysetError
} from '../dist/index.js';

// Simple demo showing basic functionality
async function runDemo() {
  console.log('🎮 IGLOO-CORE DEMO\n');
  console.log('This demo shows basic functionality of @frostr/igloo-core\n');

  try {
    // 1. Generate a nostr key pair
    console.log('1. Generating nostr key pair...');
    const keyPair = generateNostrKeyPair();
    console.log('✅ Key pair generated:');
    console.log(`   nsec: ${keyPair.nsec.substring(0, 20)}...`);
    console.log(`   npub: ${keyPair.npub.substring(0, 20)}...`);
    console.log();

    // 2. Generate a keyset (2-of-3 threshold)
    console.log('2. Generating 2-of-3 keyset...');
    const keyset = generateKeysetWithSecret(2, 3, keyPair.hexPrivateKey);
    
    console.log('✅ Keyset generated successfully');
    console.log(`   Group credential: ${keyset.groupCredential.substring(0, 30)}...`);
    console.log(`   Generated ${keyset.shareCredentials.length} shares`);
    console.log();

    // 3. Get details about each share
    console.log('3. Share details:');
    keyset.shareCredentials.forEach((share, index) => {
      const details = getShareDetails(share);
      console.log(`   Share ${index}: idx=${details.idx}, threshold=${details.threshold}/${details.totalMembers}`);
    });
    console.log();

    // 4. Demonstrate secret recovery
    console.log('4. Recovering secret key using 2 shares...');
    const recoveredSecret = recoverSecretKeyFromCredentials(
      keyset.groupCredential,
      keyset.shareCredentials.slice(0, 2) // Use first 2 shares
    );
    
    const isRecoverySuccessful = recoveredSecret === keyPair.hexPrivateKey;
    console.log(`✅ Secret recovered: ${recoveredSecret.substring(0, 16)}...`);
    console.log(`✅ Recovery successful: ${isRecoverySuccessful}`);
    console.log();

    // 5. Test error handling
    console.log('5. Testing error handling...');
    try {
      generateKeysetWithSecret(5, 3, 'some-key'); // threshold > total
    } catch (error) {
      if (error instanceof KeysetError) {
        console.log('✅ Caught expected KeysetError:', error.message);
      }
    }
    console.log();

    console.log('🎉 Demo completed successfully!');
    console.log('\nTo use this library in your project:');
    console.log('npm install @frostr/igloo-core @frostr/bifrost nostr-tools');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the demo
runDemo().catch(console.error); 