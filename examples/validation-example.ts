import {
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
  IglooCore
} from '../dist/index.js';

console.log('🔍 Igloo-Core Validation Examples\n');

// Example 1: Nostr Key Validation
console.log('1. Nostr Key Validation');
console.log('======================');

const validNsec = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5f';
const invalidNsec = 'invalid_nsec_format';
const validHex = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';
const invalidHex = 'invalid_hex_too_short';

console.log(`Valid nsec: ${validateNsec(validNsec).isValid}`);
console.log(`Invalid nsec: ${validateNsec(invalidNsec).isValid} - ${validateNsec(invalidNsec).message}`);
console.log(`Valid hex: ${validateHexPrivkey(validHex).isValid}`);
console.log(`Invalid hex: ${validateHexPrivkey(invalidHex).isValid} - ${validateHexPrivkey(invalidHex).message}\n`);

// Example 2: Bifrost Credential Validation
console.log('2. Bifrost Credential Validation');
console.log('================================');

// Mock valid Bifrost credentials (in real usage, these would come from actual Bifrost operations)
const validShare = 'bfshare1' + 'a'.repeat(167);
const validGroup = 'bfgroup1' + 'b'.repeat(250);
const validBfcred = 'bfcred1' + 'c'.repeat(450);

console.log(`Valid share: ${validateShare(validShare).isValid}`);
console.log(`Valid group: ${validateGroup(validGroup).isValid}`);
console.log(`Valid bfcred: ${validateBfcred(validBfcred).isValid}`);

// Test invalid formats
const invalidShare = 'wrongprefix1abc';
const tooShortGroup = 'bfgroup1abc';

console.log(`Invalid share: ${validateShare(invalidShare).isValid} - ${validateShare(invalidShare).message}`);
console.log(`Too short group: ${validateGroup(tooShortGroup).isValid} - ${validateGroup(tooShortGroup).message}\n`);

// Example 3: Relay URL Validation and Normalization
console.log('3. Relay URL Validation and Normalization');
console.log('=========================================');

const relayExamples = [
  'wss://relay.damus.io',
  'relay.primal.net',  // Will be normalized to wss://
  'https://relay.snort.social/',  // Will be normalized
  'http://localhost:8080',  // Will be normalized
  'invalid-url'  // Invalid
];

relayExamples.forEach(relay => {
  const result = validateRelay(relay);
  console.log(`"${relay}" -> Valid: ${result.isValid}, Normalized: ${result.normalized || 'N/A'}`);
  if (!result.isValid) {
    console.log(`  Error: ${result.message}`);
  }
});
console.log();

// Example 4: Relay List Validation
console.log('4. Relay List Validation');
console.log('========================');

const relayList = [
  'relay.damus.io',
  'https://relay.primal.net/',
  'wss://relay.snort.social',
  'invalid-url'
];

const relayListResult = validateRelayList(relayList);
console.log(`Relay list valid: ${relayListResult.isValid}`);
console.log(`Valid relays: ${relayListResult.validRelays?.length || 0}/${relayList.length}`);
console.log(`Normalized relays:`, relayListResult.normalizedRelays);
if (relayListResult.errors && relayListResult.errors.length > 0) {
  console.log('Errors:', relayListResult.errors);
}
console.log();

// Example 5: Complete Credential Set Validation
console.log('5. Complete Credential Set Validation');
console.log('=====================================');

const credentialSet = {
  group: validGroup,
  shares: [validShare, 'bfshare1' + 'd'.repeat(167)],
  relays: ['wss://relay.damus.io', 'relay.primal.net']
};

const setResult = validateCredentialSet(credentialSet);
console.log(`Credential set valid: ${setResult.isValid}`);
console.log(`Group valid: ${setResult.groupValid}`);
console.log(`Valid shares: ${setResult.shareResults.filter(r => r.isValid).length}/${setResult.shareResults.length}`);
console.log(`Valid relays: ${setResult.relayResults.filter(r => r.isValid).length}/${setResult.relayResults.length}`);
if (setResult.errors.length > 0) {
  console.log('Errors:', setResult.errors);
}
console.log();

// Example 6: Minimum Shares Validation
console.log('6. Minimum Shares Validation');
console.log('============================');

const shares = [validShare, 'bfshare1' + 'e'.repeat(167)];
const minSharesResult = validateMinimumShares(shares, 2);
console.log(`2 shares for threshold 2: ${minSharesResult.isValid}`);

const insufficientResult = validateMinimumShares(shares, 3);
console.log(`2 shares for threshold 3: ${insufficientResult.isValid} - ${insufficientResult.message}`);
console.log();

// Example 7: Advanced Validation with Options
console.log('7. Advanced Validation with Options');
console.log('===================================');

const mixedCredentials = {
  group: validGroup,
  shares: [validShare],
  relays: ['relay.damus.io', 'https://relay.primal.net/']
};

// Validate with relay normalization
const normalizedResult = validateWithOptions(mixedCredentials, { 
  normalizeRelays: true 
});
console.log(`With normalization - Valid: ${normalizedResult.isValid}`);
console.log(`Original relays:`, mixedCredentials.relays);
console.log(`Normalized relays:`, normalizedResult.relays);

// Validate with minimum shares requirement
const minSharesValidation = validateWithOptions(mixedCredentials, { 
  requireMinShares: 2 
});
console.log(`Requiring 2 shares (have 1): ${minSharesValidation.isValid}`);
if (!minSharesValidation.isValid) {
  console.log('Errors:', minSharesValidation.errors);
}
console.log();

// Example 8: Using Generic Credential Format Validation
console.log('8. Generic Credential Format Validation');
console.log('=======================================');

const credentials = [
  { value: validShare, type: 'share' as const },
  { value: validGroup, type: 'group' as const },
  { value: validBfcred, type: 'cred' as const },
  { value: 'invalid', type: 'share' as const }
];

credentials.forEach(({ value, type }) => {
  const result = validateCredentialFormat(value, type);
  console.log(`${type}: ${result.isValid ? '✅' : '❌'} ${result.message || 'Valid'}`);
});
console.log();

// Example 9: Using IglooCore Convenience Methods
console.log('9. IglooCore Convenience Methods');
console.log('================================');

async function demonstrateIglooValidation() {
  const igloo = new IglooCore();

  try {
    // Validate a single credential
    const shareValidation = await igloo.validateCredential(validShare, 'share');
    console.log(`IglooCore share validation: ${shareValidation.isValid}`);

    // Validate relays using convenience method
    const relayValidation = await igloo.validateRelays(['relay.damus.io', 'wss://relay.primal.net']);
    console.log(`IglooCore relay validation: ${relayValidation.isValid}`);
    console.log(`Normalized relays:`, relayValidation.normalizedRelays);

    // Validate complete credential set
    const fullValidation = await igloo.validateCredentials({
      group: validGroup,
      shares: [validShare],
      relays: ['relay.damus.io']
    });
    console.log(`IglooCore full validation: ${fullValidation.isValid}`);

    // Validate with options
    const advancedValidation = await igloo.validateWithOptions(
      {
        group: validGroup,
        shares: [validShare],
        relays: ['relay.damus.io']
      },
      { normalizeRelays: true, requireMinShares: 1 }
    );
    console.log(`IglooCore advanced validation: ${advancedValidation.isValid}`);
    
  } catch (error) {
    console.error('Validation error:', error);
  }
}

// Example 10: Validation Constants
console.log('10. Validation Constants');
console.log('========================');

console.log('Available validation constants:');
console.log(`Share data size: ${VALIDATION_CONSTANTS.SHARE_DATA_SIZE} bytes`);
console.log(`Group data size: ${VALIDATION_CONSTANTS.GROUP_DATA_SIZE} bytes`);
console.log(`Max commits: ${VALIDATION_CONSTANTS.MAX_COMMITS}`);
console.log(`Bifrost share HRP: ${VALIDATION_CONSTANTS.BFSHARE_HRP}`);
console.log(`Bifrost group HRP: ${VALIDATION_CONSTANTS.BFGROUP_HRP}`);
console.log(`Bifrost cred HRP: ${VALIDATION_CONSTANTS.BFCRED_HRP}`);
console.log();

// Example 11: Error Handling and Type Checking
console.log('11. Error Handling Patterns');
console.log('===========================');

function validateUserInput(input: any) {
  // Type-safe validation with proper error handling
  if (typeof input.nsec === 'string') {
    const nsecResult = validateNsec(input.nsec);
    if (!nsecResult.isValid) {
      console.log(`❌ Invalid nsec: ${nsecResult.message}`);
      return false;
    }
  }

  if (typeof input.share === 'string') {
    const shareResult = validateShare(input.share);
    if (!shareResult.isValid) {
      console.log(`❌ Invalid share: ${shareResult.message}`);
      return false;
    }
  }

  if (Array.isArray(input.relays)) {
    const relayResult = validateRelayList(input.relays);
    if (!relayResult.isValid) {
      console.log(`❌ Invalid relays: ${relayResult.message}`);
      console.log('Relay errors:', relayResult.errors);
      return false;
    }
  }

  console.log('✅ All validations passed');
  return true;
}

// Test with valid input
console.log('Testing valid input:');
validateUserInput({
  nsec: validNsec,
  share: validShare,
  relays: ['wss://relay.damus.io']
});

// Test with invalid input
console.log('\nTesting invalid input:');
validateUserInput({
  nsec: 'invalid-nsec',
  share: 'invalid-share',
  relays: ['not-a-url']
});

// Run the async demonstration
demonstrateIglooValidation().then(() => {
  console.log('\n🎉 Validation examples completed!');
  console.log('\nKey takeaways:');
  console.log('- All validation functions return { isValid: boolean, message?: string }');
  console.log('- Relay validation includes automatic normalization');
  console.log('- Validation can be done individually or in batch');
  console.log('- IglooCore provides convenient validation methods');
  console.log('- Constants are available for custom validation logic');
}).catch(console.error); 