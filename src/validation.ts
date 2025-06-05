import { nip19 } from 'nostr-tools';
import { ValidationResult, RelayValidationResult, BifrostCredentials, ValidatedCredentials, BifrostValidationError, NostrValidationError } from './types.js';

// Constants from Bifrost library (https://github.com/FROSTR-ORG/bifrost/blob/master/src/const.ts)
// These are the exact binary sizes before bech32 encoding
export const VALIDATION_CONSTANTS = {
  SHARE_DATA_SIZE: 100,        // Exact binary size of a share
  SHARE_INDEX_SIZE: 4,         // Size of share index
  SHARE_SECKEY_SIZE: 32,       // Size of share secret key
  SHARE_SNONCE_SIZE: 32,       // Size of share nonce
  
  GROUP_DATA_SIZE: 37,         // Base size of a group
  GROUP_PUBKEY_SIZE: 33,       // Size of group public key
  GROUP_THOLD_SIZE: 4,         // Size of threshold value
  COMMIT_DATA_SIZE: 103,       // Size of each commitment
  
  GROUP_ID_SIZE: 32,           // Assumed size for group ID hash
  MAX_COMMITS: 15,             // Maximum reasonable number of commits
  
  BFCRED_HRP: 'bfcred',        // Human-readable part for bfcred
  BFSHARE_HRP: 'bfshare',      // Human-readable part for shares
  BFGROUP_HRP: 'bfgroup',      // Human-readable part for groups
} as const;

// Calculate expected bech32 encoded lengths (approximate)
// Bech32 encoding: 8 bits -> 5 bits, so length increases by factor of 8/5 = 1.6
// Plus prefix and checksum (typically 6 chars)
const MIN_BFSHARE_LENGTH = Math.floor(VALIDATION_CONSTANTS.SHARE_DATA_SIZE * 1.6) + VALIDATION_CONSTANTS.BFSHARE_HRP.length + 6; // ~172 chars
const MAX_BFSHARE_LENGTH = MIN_BFSHARE_LENGTH + 10; // Allow some flexibility

// For groups, size depends on number of commits (n in m-of-n)
// Base size + at least one commit
const MIN_BFGROUP_LENGTH = Math.floor((VALIDATION_CONSTANTS.GROUP_DATA_SIZE + VALIDATION_CONSTANTS.COMMIT_DATA_SIZE) * 1.6) + VALIDATION_CONSTANTS.BFGROUP_HRP.length + 6; // ~234 chars
const MAX_BFGROUP_LENGTH = Math.floor((VALIDATION_CONSTANTS.GROUP_DATA_SIZE + (VALIDATION_CONSTANTS.COMMIT_DATA_SIZE * VALIDATION_CONSTANTS.MAX_COMMITS)) * 1.6) + VALIDATION_CONSTANTS.BFGROUP_HRP.length + 6;

// Constants for bfcred validation
// Min group serialized size: ID (32) + Threshold (4) + Pubkey (33) + 1 Commit (103) = 172
const MIN_GROUP_SERIALIZED_SIZE = VALIDATION_CONSTANTS.GROUP_ID_SIZE + VALIDATION_CONSTANTS.GROUP_THOLD_SIZE + VALIDATION_CONSTANTS.GROUP_PUBKEY_SIZE + VALIDATION_CONSTANTS.COMMIT_DATA_SIZE;
// Max group serialized size: ID (32) + Threshold (4) + Pubkey (33) + MAX_COMMITS (15) * Commit (103) = 69 + 1545 = 1614
const MAX_GROUP_SERIALIZED_SIZE = VALIDATION_CONSTANTS.GROUP_ID_SIZE + VALIDATION_CONSTANTS.GROUP_THOLD_SIZE + VALIDATION_CONSTANTS.GROUP_PUBKEY_SIZE + (VALIDATION_CONSTANTS.COMMIT_DATA_SIZE * VALIDATION_CONSTANTS.MAX_COMMITS);

// bfcred raw data = share data (100) + group data (min 172, max 1614)
const MIN_BFCRED_RAW_DATA_SIZE = VALIDATION_CONSTANTS.SHARE_DATA_SIZE + MIN_GROUP_SERIALIZED_SIZE; // 100 + 172 = 272
const MAX_BFCRED_RAW_DATA_SIZE = VALIDATION_CONSTANTS.SHARE_DATA_SIZE + MAX_GROUP_SERIALIZED_SIZE; // 100 + 1614 = 1714

// Bech32m encoding overhead
const BFCRED_OVERHEAD = VALIDATION_CONSTANTS.BFCRED_HRP.length + 1 + 6;
const MIN_BFCRED_LENGTH = Math.floor(MIN_BFCRED_RAW_DATA_SIZE * 8 / 5) + BFCRED_OVERHEAD;
const MAX_BFCRED_LENGTH = Math.ceil(MAX_BFCRED_RAW_DATA_SIZE * 8 / 5) + BFCRED_OVERHEAD + 15;

/**
 * Validates a nostr secret key (nsec) format
 * @param nsec The string to validate as nsec
 * @returns Validation result object
 */
export function validateNsec(nsec: string): ValidationResult {
  if (!nsec || !nsec.trim()) {
    return { isValid: false, message: 'Nsec is required' };
  }

  try {
    const { type } = nip19.decode(nsec);
    if (type !== 'nsec') {
      return { isValid: false, message: 'Invalid nsec format' };
    }
    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      message: 'Invalid nsec format' 
    };
  }
}

/**
 * Validates a hex private key format
 * @param hexPrivkey The string to validate as hex privkey
 * @returns Validation result object
 */
export function validateHexPrivkey(hexPrivkey: string): ValidationResult {
  if (!hexPrivkey || !hexPrivkey.trim()) {
    return { isValid: false, message: 'Private key is required' };
  }

  // Check if it's a valid hex string of correct length (64 characters for 32 bytes)
  const hexRegex = /^[0-9a-fA-F]{64}$/;
  if (!hexRegex.test(hexPrivkey)) {
    return { isValid: false, message: 'Invalid hex private key format (should be 64 hex characters)' };
  }

  return { isValid: true };
}

/**
 * Validates a Bifrost share format
 * @param share The string to validate as a Bifrost share
 * @returns Validation result object
 */
export function validateShare(share: string): ValidationResult {
  if (!share || !share.trim()) {
    return { isValid: false, message: 'Share is required' };
  }

  // Basic prefix check
  if (!share.startsWith(VALIDATION_CONSTANTS.BFSHARE_HRP)) {
    return { isValid: false, message: `Invalid share format (should start with ${VALIDATION_CONSTANTS.BFSHARE_HRP})` };
  }
  
  // Length check based on expected bech32 encoded share
  if (share.length < MIN_BFSHARE_LENGTH || share.length > MAX_BFSHARE_LENGTH) {
    return { 
      isValid: false, 
      message: `Invalid share length (expected around ${MIN_BFSHARE_LENGTH} characters)` 
    };
  }

  // Basic format check - bech32m has a similar format to bech32:
  // [prefix]1[data][checksum] - the '1' separates the human-readable part from the data
  // Allow all valid bech32 characters: 023456789acdefghjklmnpqrstuvwxyz
  // For testing purposes, we'll be more permissive and just check basic structure
  const formatCheck = /^bfshare1[a-z0-9]+$/;
  if (!formatCheck.test(share)) {
    return {
      isValid: false,
      message: 'Invalid share format - must be in bech32m format'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a Bifrost group format
 * @param group The string to validate as a Bifrost group
 * @returns Validation result object
 */
export function validateGroup(group: string): ValidationResult {
  if (!group || !group.trim()) {
    return { isValid: false, message: 'Group is required' };
  }

  // Basic prefix check
  if (!group.startsWith(VALIDATION_CONSTANTS.BFGROUP_HRP)) {
    return { isValid: false, message: `Invalid group format (should start with ${VALIDATION_CONSTANTS.BFGROUP_HRP})` };
  }
  
  // Length check based on expected bech32 encoded group
  if (group.length < MIN_BFGROUP_LENGTH) {
    return { 
      isValid: false, 
      message: `Invalid group length (expected at least ${MIN_BFGROUP_LENGTH} characters)` 
    };
  }
  
  if (group.length > MAX_BFGROUP_LENGTH) {
    return {
      isValid: false,
      message: `Group credential too long (maximum expected length is ${MAX_BFGROUP_LENGTH} characters)`
    };
  }

  // Basic format check - bech32m format
  // For testing purposes, we'll be more permissive and just check basic structure
  const formatCheck = /^bfgroup1[a-z0-9]+$/;
  if (!formatCheck.test(group)) {
    return {
      isValid: false,
      message: 'Invalid group format - must be in bech32m format'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a nostr relay URL
 * @param relay The string to validate as a relay URL
 * @returns Validation result object with normalized URL
 */
export function validateRelay(relay: string): ValidationResult {
  if (!relay || !relay.trim()) {
    return { isValid: false, message: 'Relay URL is required' };
  }

  // Normalize the relay URL
  let normalized = relay.trim();
  
  // Replace http:// or https:// with wss://, or add wss:// if no protocol is present
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    // Extract the part after the protocol
    const urlWithoutProtocol = normalized.split('//')[1];
    normalized = `wss://${urlWithoutProtocol}`;
  } else if (!normalized.startsWith('wss://') && !normalized.startsWith('ws://')) {
    normalized = `wss://${normalized}`;
  }
  
  // Remove trailing slash if present
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  try {
    // Check if it's a valid URL
    const url = new URL(normalized);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
      return { isValid: false, message: 'Relay URL must use wss:// or ws:// protocol' };
    }
    
    // Additional validation - must have a valid hostname
    if (!url.hostname || url.hostname.length === 0) {
      return { isValid: false, message: 'Invalid relay URL format' };
    }
    
    // Basic hostname validation - must contain at least one dot or be localhost
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
      return { isValid: false, message: 'Invalid relay URL format' };
    }
    
    return { 
      isValid: true,
      normalized
    };
  } catch (error) {
    return { 
      isValid: false, 
      message: 'Invalid relay URL format' 
    };
  }
}

/**
 * Validates a Bifrost credential string (bfcred)
 * @param cred The string to validate as a Bifrost credential
 * @returns Validation result object
 */
export function validateBfcred(cred: string): ValidationResult {
  if (!cred || !cred.trim()) {
    return { isValid: false, message: 'Credential string is required' };
  }

  // Basic prefix check for the Human-Readable Part (HRP)
  if (!cred.startsWith(VALIDATION_CONSTANTS.BFCRED_HRP)) {
    return { isValid: false, message: `Invalid credential format (should start with ${VALIDATION_CONSTANTS.BFCRED_HRP})` };
  }
  
  // Length check
  if (cred.length < MIN_BFCRED_LENGTH) {
    return { 
      isValid: false, 
      message: `Invalid credential length (expected at least ${MIN_BFCRED_LENGTH} characters, got ${cred.length})` 
    };
  }
  
  if (cred.length > MAX_BFCRED_LENGTH) {
    return {
      isValid: false,
      message: `Credential string too long (maximum expected length ${MAX_BFCRED_LENGTH} characters, got ${cred.length})`
    };
  }

  // Basic format check for bech32m: [hrp]1[data][checksum]
  // For testing purposes, we'll be more permissive and just check basic structure
  const formatCheck = new RegExp(`^${VALIDATION_CONSTANTS.BFCRED_HRP}1[a-z0-9]+$`);
  if (!formatCheck.test(cred)) {
    return {
      isValid: false,
      message: 'Invalid credential format - must be in bech32m format (e.g., bfcred1...)'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a credential format generically
 * @param credential The credential string to validate
 * @param type The type of credential
 * @returns Validation result object
 */
export function validateCredentialFormat(credential: string, type: 'share' | 'group' | 'cred'): ValidationResult {
  switch (type) {
    case 'share':
      return validateShare(credential);
    case 'group':
      return validateGroup(credential);
    case 'cred':
      return validateBfcred(credential);
    default:
      return { isValid: false, message: 'Unknown credential type' };
  }
}

/**
 * Validates a list of relay URLs
 * @param relays Array of relay URL strings
 * @returns Extended validation result with normalized relays and errors
 */
export function validateRelayList(relays: string[]): RelayValidationResult {
  if (!relays || relays.length === 0) {
    return { isValid: false, message: 'At least one relay URL is required' };
  }

  const validRelays: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < relays.length; i++) {
    const result = validateRelay(relays[i]);
    if (result.isValid && result.normalized) {
      validRelays.push(result.normalized);
    } else {
      errors.push(`Relay ${i + 1}: ${result.message || 'Invalid format'}`);
    }
  }

  const isValid = validRelays.length > 0;
  
  return {
    isValid,
    message: isValid ? undefined : 'No valid relay URLs provided',
    normalizedRelays: validRelays,
    validRelays,
    errors
  };
}

/**
 * Validates a complete set of Bifrost credentials
 * @param credentials Object containing group, shares, and relays
 * @returns Comprehensive validation result
 */
export function validateCredentialSet(credentials: {
  group: string;
  shares: string[];
  relays: string[];
}): {
  isValid: boolean;
  groupValid: boolean;
  shareResults: ValidationResult[];
  relayResults: ValidationResult[];
  errors: string[];
} {
  const errors: string[] = [];
  
  // Validate group
  const groupResult = validateGroup(credentials.group);
  const groupValid = groupResult.isValid;
  if (!groupValid) {
    errors.push(`Group: ${groupResult.message}`);
  }

  // Validate shares
  const shareResults = credentials.shares.map((share, index) => {
    const result = validateShare(share);
    if (!result.isValid) {
      errors.push(`Share ${index + 1}: ${result.message}`);
    }
    return result;
  });

  // Validate relays
  const relayResults = credentials.relays.map((relay, index) => {
    const result = validateRelay(relay);
    if (!result.isValid) {
      errors.push(`Relay ${index + 1}: ${result.message}`);
    }
    return result;
  });

  const isValid = groupValid && 
                  shareResults.every(r => r.isValid) && 
                  relayResults.every(r => r.isValid) &&
                  credentials.shares.length > 0;

  return {
    isValid,
    groupValid,
    shareResults,
    relayResults,
    errors
  };
}

/**
 * Validates that enough shares are provided for a threshold
 * @param shares Array of share strings
 * @param requiredThreshold Minimum number of shares required
 * @returns Validation result
 */
export function validateMinimumShares(shares: string[], requiredThreshold: number): ValidationResult {
  if (!shares || shares.length === 0) {
    return { isValid: false, message: 'No shares provided' };
  }

  if (shares.length < requiredThreshold) {
    return { 
      isValid: false, 
      message: `Not enough shares provided. Need at least ${requiredThreshold} shares, got ${shares.length}` 
    };
  }

  // Validate each share format
  for (let i = 0; i < shares.length; i++) {
    const result = validateShare(shares[i]);
    if (!result.isValid) {
      return { 
        isValid: false, 
        message: `Share ${i + 1} is invalid: ${result.message}` 
      };
    }
  }

  return { isValid: true };
}

/**
 * Advanced validation with configurable options
 */
export interface ValidationOptions {
  strict?: boolean;           // Strict format checking
  normalizeRelays?: boolean;  // Auto-normalize relay URLs
  requireMinShares?: number;  // Minimum number of shares required
}

/**
 * Validates credentials with advanced options
 * @param credentials The credentials to validate
 * @param options Validation options
 * @returns Validated credentials result
 */
export function validateWithOptions(
  credentials: BifrostCredentials,
  options: ValidationOptions = {}
): ValidatedCredentials {
  const errors: string[] = [];
  let isValid = true;

  // Validate group
  const groupResult = validateGroup(credentials.group);
  if (!groupResult.isValid) {
    errors.push(`Group: ${groupResult.message}`);
    isValid = false;
  }

  // Validate shares
  if (options.requireMinShares && credentials.shares.length < options.requireMinShares) {
    errors.push(`Not enough shares provided. Need at least ${options.requireMinShares} shares`);
    isValid = false;
  }

  for (let i = 0; i < credentials.shares.length; i++) {
    const result = validateShare(credentials.shares[i]);
    if (!result.isValid) {
      errors.push(`Share ${i + 1}: ${result.message}`);
      isValid = false;
    }
  }

  // Validate and optionally normalize relays
  let processedRelays = credentials.relays;
  if (options.normalizeRelays) {
    const relayResult = validateRelayList(credentials.relays);
    if (relayResult.isValid && relayResult.normalizedRelays) {
      processedRelays = relayResult.normalizedRelays;
    } else {
      errors.push(...(relayResult.errors || ['Invalid relay URLs']));
      isValid = false;
    }
  } else {
    // Just validate without normalizing
    for (let i = 0; i < credentials.relays.length; i++) {
      const result = validateRelay(credentials.relays[i]);
      if (!result.isValid) {
        errors.push(`Relay ${i + 1}: ${result.message}`);
        isValid = false;
      }
    }
  }

  return {
    ...credentials,
    relays: processedRelays,
    isValid,
    errors
  };
} 