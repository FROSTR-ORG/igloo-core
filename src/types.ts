import { z } from 'zod';
import { nip19 } from 'nostr-tools';
import type { 
  BifrostNode, 
  SignatureEntry, 
  ECDHPackage, 
  SignSessionPackage,
  GroupPackage,
  SharePackage 
} from '@frostr/bifrost';

// Validation schemas
export const KeysetParamsSchema = z.object({
  threshold: z.number().int().positive(),
  totalMembers: z.number().int().positive()
}).refine(data => data.threshold <= data.totalMembers, {
  message: "Threshold cannot be greater than total members"
});

export const RelayUrlSchema = z.string().url().startsWith('ws');

export const SecretKeySchema = z.string().regex(
  /^[0-9a-fA-F]{64}$/,
  "Invalid secret key format - must be 64 hexadecimal characters"
);

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
export const NostrKeySchema = z.string().refine(
  (key) => {
    try {
      const { type } = nip19.decode(key);
      return type === 'nsec' || type === 'npub';
    } catch {
      return false;
    }
  },
  { message: "Invalid nostr key format" }
);

export const HexKeySchema = z.string().regex(
  /^[0-9a-fA-F]{64}$/,
  "Invalid hex key format - must be 64 hexadecimal characters"
);

// Core types
export type KeysetParams = z.infer<typeof KeysetParamsSchema>;
export type NodeConfig = z.infer<typeof NodeConfigSchema>;
export type EchoListenerConfig = z.infer<typeof EchoListenerConfigSchema>;

export interface KeysetCredentials {
  groupCredential: string;
  shareCredentials: string[];
}

export interface ShareDetails {
  idx: number;
}

export interface ShareDetailsWithGroup {
  idx: number;
  threshold: number;
  totalMembers: number;
}

// Enhanced node configuration
export interface EnhancedNodeConfig extends NodeConfig {
  /** Timeout for initial connection in milliseconds */
  connectionTimeout?: number;
  /** Whether to automatically reconnect on disconnection */
  autoReconnect?: boolean;
}

// Node state information
export interface NodeState {
  isReady: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  lastError?: string;
  connectedRelays: string[];
}

// Enhanced node result
export interface NodeCreationResult {
  node: BifrostNode;
  state: NodeState;
}

// Nostr types
export interface NostrKeyPair {
  nsec: string;
  npub: string;
  hexPrivateKey: string;
  hexPublicKey: string;
}

// Event types for BifrostNode
export interface BifrostNodeEvents {
  // Base events
  'ready': (node: BifrostNode) => void;
  'closed': () => void;
  'message': (msg: any) => void;
  'bounced': (reason: string, msg: any) => void;
  'error': (error: unknown) => void;

  // ECDH events
  '/ecdh/sender/req': (msg: any) => void;
  '/ecdh/sender/res': (...msgs: any[]) => void;
  '/ecdh/sender/rej': (reason: string, pkg: ECDHPackage) => void;
  '/ecdh/sender/ret': (reason: string, pkgs: string) => void;
  '/ecdh/sender/err': (reason: string, msgs: any[]) => void;
  '/ecdh/handler/req': (msg: any) => void;
  '/ecdh/handler/res': (msg: any) => void;
  '/ecdh/handler/rej': (reason: string, msg: any) => void;

  // Signature events
  '/sign/sender/req': (msg: any) => void;
  '/sign/sender/res': (...msgs: any[]) => void;
  '/sign/sender/rej': (reason: string, pkg: SignSessionPackage) => void;
  '/sign/sender/ret': (reason: string, msgs: SignatureEntry[]) => void;
  '/sign/sender/err': (reason: string, msgs: any[]) => void;
  '/sign/handler/req': (msg: any) => void;
  '/sign/handler/res': (msg: any) => void;
  '/sign/handler/rej': (reason: string, msg: any) => void;

  // Ping events
  '/ping/handler/req': (msg: any) => void;
  '/ping/handler/res': (msg: any) => void;
  '/ping/handler/rej': (reason: string, msg: any) => void;
  '/ping/sender/req': (msg: any) => void;
  '/ping/sender/res': (msg: any) => void;
  '/ping/sender/rej': (reason: string, msg: any) => void;

  // Echo events
  '/echo/handler/req': (msg: any) => void;
  '/echo/handler/res': (msg: any) => void;
  '/echo/handler/rej': (reason: string, msg: any) => void;
  '/echo/sender/req': (msg: any) => void;
  '/echo/sender/res': (msg: any) => void;
  '/echo/sender/rej': (reason: string, msg: any) => void;
}

// Echo listener types
export interface EchoListener {
  cleanup: () => void;
  isActive: boolean;
}

export interface EchoReceivedEvent {
  shareIndex: number;
  shareCredential: string;
  timestamp: Date;
}

export type EchoReceivedCallback = (shareIndex: number, shareCredential: string) => void;

// Error types
export class IglooError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'IglooError';
  }
}

export class KeysetError extends IglooError {
  constructor(message: string, details?: any) {
    super(message, 'KEYSET_ERROR', details);
    this.name = 'KeysetError';
  }
}

export class NodeError extends IglooError {
  constructor(message: string, details?: any) {
    super(message, 'NODE_ERROR', details);
    this.name = 'NodeError';
  }
}

export class RecoveryError extends IglooError {
  constructor(message: string, details?: any) {
    super(message, 'RECOVERY_ERROR', details);
    this.name = 'RecoveryError';
  }
}

export class EchoError extends IglooError {
  constructor(message: string, details?: any) {
    super(message, 'ECHO_ERROR', details);
    this.name = 'EchoError';
  }
}

export class NostrError extends IglooError {
  constructor(message: string, details?: any) {
    super(message, 'NOSTR_ERROR', details);
    this.name = 'NostrError';
  }
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  message?: string;
  normalized?: string;
}

export interface RelayValidationResult extends ValidationResult {
  normalizedRelays?: string[];
  validRelays?: string[];
  errors?: string[];
}

export interface BifrostCredentials {
  group: string;
  shares: string[];
  relays: string[];
}

export interface ValidatedCredentials extends BifrostCredentials {
  isValid: boolean;
  errors: string[];
}

// Validation error types
export class BifrostValidationError extends IglooError {
  constructor(message: string, public field?: string) {
    super(message, 'BIFROST_VALIDATION_ERROR');
    this.name = 'BifrostValidationError';
  }
}

export class NostrValidationError extends IglooError {
  constructor(message: string) {
    super(message, 'NOSTR_VALIDATION_ERROR');
    this.name = 'NostrValidationError';
  }
}

// Re-export types from bifrost for convenience
export type {
  BifrostNode,
  SignatureEntry,
  ECDHPackage,
  SignSessionPackage,
  GroupPackage,
  SharePackage
} from '@frostr/bifrost'; 