import { z } from 'zod';
import { nip19 } from 'nostr-tools';
// Validation schemas
export const KeysetParamsSchema = z.object({
    threshold: z.number().int().positive(),
    totalMembers: z.number().int().positive()
}).refine(data => data.threshold <= data.totalMembers, {
    message: "Threshold cannot be greater than total members"
});
export const RelayUrlSchema = z.string().url().startsWith('ws');
export const SecretKeySchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "Invalid secret key format - must be 64 hexadecimal characters");
export const NodeConfigSchema = z.object({
    group: z.string(),
    share: z.string(),
    relays: z.array(RelayUrlSchema).min(1, "At least one relay URL must be provided")
});
export const EchoListenerConfigSchema = z.object({
    groupCredential: z.string(),
    shareCredentials: z.array(z.string()).min(1),
    relays: z.array(RelayUrlSchema),
    timeout: z.number().int().positive().optional()
});
// Nostr validation schemas
export const NostrKeySchema = z.string().refine((key) => {
    try {
        const { type } = nip19.decode(key);
        return type === 'nsec' || type === 'npub';
    }
    catch {
        return false;
    }
}, { message: "Invalid nostr key format" });
export const HexKeySchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "Invalid hex key format - must be 64 hexadecimal characters");
// Error types
export class IglooError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'IglooError';
    }
}
export class KeysetError extends IglooError {
    constructor(message, details) {
        super(message, 'KEYSET_ERROR', details);
        this.name = 'KeysetError';
    }
}
export class NodeError extends IglooError {
    constructor(message, details) {
        super(message, 'NODE_ERROR', details);
        this.name = 'NodeError';
    }
}
export class RecoveryError extends IglooError {
    constructor(message, details) {
        super(message, 'RECOVERY_ERROR', details);
        this.name = 'RecoveryError';
    }
}
export class EchoError extends IglooError {
    constructor(message, details) {
        super(message, 'ECHO_ERROR', details);
        this.name = 'EchoError';
    }
}
export class NostrError extends IglooError {
    constructor(message, details) {
        super(message, 'NOSTR_ERROR', details);
        this.name = 'NostrError';
    }
}
// Validation error types
export class BifrostValidationError extends IglooError {
    constructor(message, field) {
        super(message, 'BIFROST_VALIDATION_ERROR');
        this.field = field;
        this.name = 'BifrostValidationError';
    }
}
export class NostrValidationError extends IglooError {
    constructor(message) {
        super(message, 'NOSTR_VALIDATION_ERROR');
        this.name = 'NostrValidationError';
    }
}
