import { z } from 'zod';
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

export const SecretKeySchema = z.string().min(1, "Secret key cannot be empty");

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

// Re-export types from bifrost for convenience
export type {
  BifrostNode,
  SignatureEntry,
  ECDHPackage,
  SignSessionPackage,
  GroupPackage,
  SharePackage
} from '@frostr/bifrost'; 