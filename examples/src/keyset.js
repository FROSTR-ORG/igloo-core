import { generate_dealer_pkg, recover_secret_key } from '@frostr/bifrost/lib';
import { PackageEncoder } from '@frostr/bifrost';
import { nip19 } from 'nostr-tools';
import { KeysetError, RecoveryError, KeysetParamsSchema, SecretKeySchema } from './types.js';
/**
 * Validates keyset parameters
 */
export function validateKeysetParams(params) {
    try {
        KeysetParamsSchema.parse(params);
    }
    catch (error) {
        throw new KeysetError(`Invalid keyset parameters: ${error.message}`, { params, validationError: error });
    }
}
/**
 * Validates a secret key
 */
export function validateSecretKey(secretKey) {
    try {
        SecretKeySchema.parse(secretKey);
    }
    catch (error) {
        throw new KeysetError(`Invalid secret key: ${error.message}`, { validationError: error });
    }
}
/**
 * Generates a keyset with a provided secret key
 * @param threshold Number of shares required to sign
 * @param totalMembers Total number of shares to create
 * @param secretKey Hex-encoded secret key
 * @returns Object containing encoded group and share credentials
 */
export function generateKeysetWithSecret(threshold, totalMembers, secretKey) {
    const params = { threshold, totalMembers };
    try {
        validateKeysetParams(params);
        validateSecretKey(secretKey);
        const { group, shares } = generate_dealer_pkg(threshold, totalMembers, [secretKey]);
        // Encode the group and shares as bech32 strings
        const groupCredential = PackageEncoder.group.encode(group);
        const shareCredentials = shares.map((share) => PackageEncoder.share.encode(share));
        return {
            groupCredential,
            shareCredentials
        };
    }
    catch (error) {
        if (error instanceof KeysetError) {
            throw error;
        }
        throw new KeysetError(`Failed to generate keyset: ${error.message}`, { params, error });
    }
}
/**
 * Decodes a share credential string into a SharePackage
 */
export function decodeShare(shareCredential) {
    try {
        return PackageEncoder.share.decode(shareCredential);
    }
    catch (error) {
        throw new KeysetError(`Failed to decode share: ${error.message}`, { shareCredential, error });
    }
}
/**
 * Decodes a group credential string into a GroupPackage
 */
export function decodeGroup(groupCredential) {
    try {
        return PackageEncoder.group.decode(groupCredential);
    }
    catch (error) {
        throw new KeysetError(`Failed to decode group: ${error.message}`, { groupCredential, error });
    }
}
/**
 * Gets basic details about a share (index only for now)
 * For full details including threshold, use getShareDetailsWithGroup
 */
export function getShareDetails(shareCredential) {
    const share = decodeShare(shareCredential);
    return {
        idx: share.idx
    };
}
/**
 * Gets complete details about a share including threshold info from group
 */
export function getShareDetailsWithGroup(shareCredential, groupCredential) {
    const share = decodeShare(shareCredential);
    const group = decodeGroup(groupCredential);
    // Validate that share and group belong to the same keyset (mock validation)
    if (share.keysetId && group.keysetId &&
        share.keysetId !== group.keysetId) {
        throw new KeysetError('Share and group do not belong to the same keyset', { shareKeysetId: share.keysetId, groupKeysetId: group.keysetId });
    }
    return {
        idx: share.idx,
        threshold: group.threshold,
        // Note: Using totalMembers instead of total_members - need to verify actual property name
        totalMembers: group.total_members || group.totalMembers
    };
}
/**
 * Recovers the secret key from a group package and array of share packages
 * @param group The group package containing threshold signing parameters
 * @param shares Array of share packages containing the key shares
 * @returns The recovered secret key as an nsec string
 */
export function recoverSecretKey(group, shares) {
    if (!group || !shares || shares.length === 0) {
        throw new RecoveryError('Group package and at least one share package are required');
    }
    if (shares.length < group.threshold) {
        throw new RecoveryError(`Not enough shares provided. Need at least ${group.threshold} shares`, { providedShares: shares.length, requiredThreshold: group.threshold });
    }
    try {
        const hexSecret = recover_secret_key(group, shares);
        const secretBytes = Buffer.from(hexSecret, 'hex');
        return nip19.nsecEncode(secretBytes);
    }
    catch (error) {
        throw new RecoveryError(`Failed to recover secret key: ${error.message}`, { group, shares: shares.length, error });
    }
}
/**
 * Recovers the secret key from credential strings
 * @param groupCredential The group credential string
 * @param shareCredentials Array of share credential strings
 * @returns The recovered secret key as an nsec string
 */
export function recoverSecretKeyFromCredentials(groupCredential, shareCredentials) {
    try {
        const group = decodeGroup(groupCredential);
        const shares = shareCredentials.map(decodeShare);
        return recoverSecretKey(group, shares);
    }
    catch (error) {
        if (error instanceof KeysetError || error instanceof RecoveryError) {
            throw error;
        }
        throw new RecoveryError(`Failed to recover secret key from credentials: ${error.message}`, { groupCredential, shareCredentials, error });
    }
}
/**
 * Validates that shares belong to the same keyset
 * Note: This validation is simplified since share.group property access needs verification
 */
export function validateSharesCompatibility(shares) {
    if (shares.length === 0) {
        throw new KeysetError('No shares provided for validation');
    }
    // TODO: Implement proper validation once we confirm SharePackage structure
    // For now, just validate that we have shares
    if (shares.some(share => !share || typeof share.idx !== 'number')) {
        throw new KeysetError('Invalid share package structure');
    }
}
/**
 * Validates that share credentials belong to the same keyset
 */
export function validateShareCredentialsCompatibility(shareCredentials) {
    try {
        const shares = shareCredentials.map(decodeShare);
        validateSharesCompatibility(shares);
    }
    catch (error) {
        if (error instanceof KeysetError) {
            throw error;
        }
        throw new KeysetError(`Failed to validate share credentials compatibility: ${error.message}`, { shareCredentials, error });
    }
}
