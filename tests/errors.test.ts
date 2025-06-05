import { 
  IglooError,
  KeysetError,
  NodeError,
  EchoError,
  RecoveryError,
  NostrError
} from '../src/types';

describe('Error Handling', () => {
  describe('KeysetError', () => {
    it('should extend IglooError', () => {
      const error = new KeysetError('Keyset error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IglooError);
      expect(error).toBeInstanceOf(KeysetError);
      expect(error.name).toBe('KeysetError');
      expect(error.message).toBe('Keyset error');
      expect(error.code).toBe('KEYSET_ERROR');
    });

    it('should preserve details parameter', () => {
      const details = { threshold: 5, totalMembers: 3 };
      const error = new KeysetError('Invalid threshold', details);
      
      expect(error.message).toBe('Invalid threshold');
      expect(error.details).toEqual(details);
      expect(error.code).toBe('KEYSET_ERROR');
    });
  });

  describe('NodeError', () => {
    it('should extend IglooError with correct properties', () => {
      const error = new NodeError('Node connection failed');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IglooError);
      expect(error).toBeInstanceOf(NodeError);
      expect(error.name).toBe('NodeError');
      expect(error.message).toBe('Node connection failed');
      expect(error.code).toBe('NODE_ERROR');
    });
  });

  describe('EchoError', () => {
    it('should extend IglooError with correct properties', () => {
      const error = new EchoError('Echo timeout');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IglooError);
      expect(error).toBeInstanceOf(EchoError);
      expect(error.name).toBe('EchoError');
      expect(error.message).toBe('Echo timeout');
      expect(error.code).toBe('ECHO_ERROR');
    });
  });

  describe('RecoveryError', () => {
    it('should extend IglooError with correct properties', () => {
      const error = new RecoveryError('Secret recovery failed');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IglooError);
      expect(error).toBeInstanceOf(RecoveryError);
      expect(error.name).toBe('RecoveryError');
      expect(error.message).toBe('Secret recovery failed');
      expect(error.code).toBe('RECOVERY_ERROR');
    });
  });

  describe('NostrError', () => {
    it('should extend IglooError with correct properties', () => {
      const error = new NostrError('Invalid nostr key');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IglooError);
      expect(error).toBeInstanceOf(NostrError);
      expect(error.name).toBe('NostrError');
      expect(error.message).toBe('Invalid nostr key');
      expect(error.code).toBe('NOSTR_ERROR');
    });
  });

  describe('Error type checking', () => {
    it('should allow proper type checking with instanceof', () => {
      const keysetError = new KeysetError('keyset');
      const nodeError = new NodeError('node');
      const echoError = new EchoError('echo');
      const recoveryError = new RecoveryError('recovery');
      const nostrError = new NostrError('nostr');

      // All should be instances of Error and IglooError
      [keysetError, nodeError, echoError, recoveryError, nostrError].forEach(error => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(IglooError);
      });

      // Test specific types
      expect(keysetError).toBeInstanceOf(KeysetError);
      expect(nodeError).toBeInstanceOf(NodeError);
      expect(echoError).toBeInstanceOf(EchoError);
      expect(recoveryError).toBeInstanceOf(RecoveryError);
      expect(nostrError).toBeInstanceOf(NostrError);

      // Test that they're not instances of other error types
      expect(keysetError).not.toBeInstanceOf(NodeError);
      expect(nodeError).not.toBeInstanceOf(KeysetError);
      expect(echoError).not.toBeInstanceOf(RecoveryError);
    });
  });

  describe('Error properties', () => {
    it('should have correct error codes', () => {
      expect(new KeysetError('test').code).toBe('KEYSET_ERROR');
      expect(new NodeError('test').code).toBe('NODE_ERROR');
      expect(new EchoError('test').code).toBe('ECHO_ERROR');
      expect(new RecoveryError('test').code).toBe('RECOVERY_ERROR');
      expect(new NostrError('test').code).toBe('NOSTR_ERROR');
    });

    it('should preserve stack traces', () => {
      const error = new KeysetError('Stack test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Stack test');
    });
  });
}); 