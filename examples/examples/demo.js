import { igloo, generateKeysetWithSecret, awaitShareEcho, startListeningForAllEchoes, recoverSecretKeyFromCredentials, getShareDetails, getShareDetailsWithGroup, KeysetError, EchoError, NodeError } from '../src/index.js';
// Demo function showing basic usage
async function demoBasicUsage() {
    console.log('🔑 IGLOO CORE DEMO - Basic Usage\n');
    try {
        // 1. Generate a keyset (2-of-3 threshold)
        console.log('1. Generating 2-of-3 keyset...');
        const secretKey = 'your-hex-secret-key-here'; // This would be your actual secret
        const keyset = generateKeysetWithSecret(2, 3, secretKey);
        console.log('✅ Keyset generated successfully');
        console.log(`   Group credential: ${keyset.groupCredential.substring(0, 20)}...`);
        console.log(`   Generated ${keyset.shareCredentials.length} shares\n`);
        // 2. Get details about each share
        console.log('2. Share details:');
        keyset.shareCredentials.forEach((share, index) => {
            const details = getShareDetailsWithGroup(share, keyset.groupCredential);
            console.log(`   Share ${index}: idx=${details.idx}, threshold=${details.threshold}/${details.totalMembers}`);
        });
        console.log();
        // 3. Demonstrate secret recovery
        console.log('3. Recovering secret key using 2 shares...');
        const recoveredSecret = recoverSecretKeyFromCredentials(keyset.groupCredential, keyset.shareCredentials.slice(0, 2) // Use first 2 shares
        );
        console.log(`✅ Secret recovered: ${recoveredSecret.substring(0, 10)}...\n`);
        return keyset;
    }
    catch (error) {
        if (error instanceof KeysetError) {
            console.error('❌ Keyset error:', error.message);
            console.error('   Details:', error.details);
        }
        else {
            console.error('❌ Unexpected error:', error);
        }
    }
}
// Demo function showing echo functionality
async function demoEchoFunctionality(keyset) {
    console.log('📡 IGLOO CORE DEMO - Echo Functionality\n');
    try {
        // 1. Set up echo listeners for all shares
        console.log('1. Starting echo listeners for all shares...');
        const echoListener = startListeningForAllEchoes(keyset.groupCredential, keyset.shareCredentials, (shareIndex, shareCredential) => {
            console.log(`🔔 Echo received for share ${shareIndex}!`);
        }, {
            relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
            eventConfig: {
                enableLogging: true,
                logLevel: 'info'
            }
        });
        console.log('✅ Echo listeners started');
        console.log(`   Listening on ${keyset.shareCredentials.length} shares`);
        console.log('   Active:', echoListener.isActive);
        console.log();
        // 2. Wait for echo on specific share (with timeout)
        console.log('2. Waiting for echo on first share (5 second timeout)...');
        try {
            await awaitShareEcho(keyset.groupCredential, keyset.shareCredentials[0], {
                timeout: 5000,
                relays: ['wss://relay.damus.io'],
                eventConfig: { enableLogging: true, logLevel: 'info' }
            });
            console.log('✅ Echo received!');
        }
        catch (error) {
            if (error instanceof EchoError) {
                console.log('⏰ Echo timeout (expected for demo)');
            }
            else {
                throw error;
            }
        }
        console.log();
        // 3. Cleanup
        console.log('3. Cleaning up echo listeners...');
        echoListener.cleanup();
        console.log('✅ Cleanup complete\n');
    }
    catch (error) {
        if (error instanceof EchoError) {
            console.error('❌ Echo error:', error.message);
            console.error('   Details:', error.details);
        }
        else {
            console.error('❌ Unexpected error:', error);
        }
    }
}
// Demo function showing node management
async function demoNodeManagement(keyset) {
    console.log('🌐 IGLOO CORE DEMO - Node Management\n');
    try {
        // 1. Create and connect a node using the convenience class
        console.log('1. Creating and connecting BifrostNode...');
        const node = await igloo.createNode(keyset.groupCredential, keyset.shareCredentials[0], ['wss://relay.damus.io', 'wss://relay.primal.net']);
        console.log('✅ Node created and connected');
        console.log('   Node type:', node.constructor.name);
        console.log();
        // 2. Get share info using convenience method
        console.log('2. Getting share information...');
        const shareInfo = await igloo.getShareInfo(keyset.shareCredentials[0]);
        console.log('✅ Share info retrieved:');
        console.log(`   Index: ${shareInfo.idx}`);
        console.log();
        // 3. Cleanup
        console.log('3. Closing node connection...');
        node.close();
        console.log('✅ Node closed\n');
    }
    catch (error) {
        if (error instanceof NodeError) {
            console.error('❌ Node error:', error.message);
            console.error('   Details:', error.details);
        }
        else {
            console.error('❌ Unexpected error:', error);
        }
    }
}
// Demo function showing error handling
async function demoErrorHandling() {
    console.log('⚠️  IGLOO CORE DEMO - Error Handling\n');
    // 1. Invalid keyset parameters
    console.log('1. Testing invalid keyset parameters...');
    try {
        generateKeysetWithSecret(5, 3, 'some-key'); // threshold > total
    }
    catch (error) {
        if (error instanceof KeysetError) {
            console.log('✅ Caught KeysetError:', error.message);
        }
    }
    // 2. Invalid secret key
    console.log('2. Testing invalid secret key...');
    try {
        generateKeysetWithSecret(2, 3, ''); // empty secret
    }
    catch (error) {
        if (error instanceof KeysetError) {
            console.log('✅ Caught KeysetError:', error.message);
        }
    }
    // 3. Invalid share credential
    console.log('3. Testing invalid share credential...');
    try {
        getShareDetails('invalid-share-credential');
    }
    catch (error) {
        if (error instanceof KeysetError) {
            console.log('✅ Caught KeysetError:', error.message);
        }
    }
    console.log();
}
// Main demo function
async function runDemo() {
    console.log('🎮 STARTING IGLOO-CORE DEMO\n');
    console.log('This demo shows how to use the igloo-core library for');
    console.log('FROSTR/Bifrost functionality with strong types.\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    // Note: This demo uses a placeholder secret key
    // In a real application, you would generate or import a proper secret
    const demoSecretKey = 'a'.repeat(64); // 64-char hex string for demo
    try {
        // Run basic usage demo
        const keyset = await demoBasicUsage();
        if (!keyset)
            return;
        // Run echo functionality demo
        await demoEchoFunctionality(keyset);
        // Run node management demo
        await demoNodeManagement(keyset);
        // Run error handling demo
        await demoErrorHandling();
        console.log('🎉 DEMO COMPLETED SUCCESSFULLY!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    catch (error) {
        console.error('💥 Demo failed with error:', error);
    }
}
// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runDemo().catch(console.error);
}
export { runDemo };
