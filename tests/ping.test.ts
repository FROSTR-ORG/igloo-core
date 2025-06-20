import {
  pingPeer,
  pingPeersAdvanced,
  createPingMonitor,
  pingPeersFromCredentials,
  runPingDiagnostics,
  DEFAULT_PING_RELAYS,
  DEFAULT_PING_TIMEOUT,
  DEFAULT_PING_INTERVAL,
  type PingResult,
  type PingMonitorConfig,
  type PingMonitor
} from '../src/index.js';

// Mock the @frostr/bifrost module
jest.mock('@frostr/bifrost', () => {
  const mockNode = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    client: { connected: true },
    req: {
      ping: jest.fn()
    }
  };

  return {
    BifrostNode: jest.fn().mockImplementation(() => mockNode),
    PackageEncoder: {
      group: {
        decode: jest.fn().mockReturnValue({
          threshold: 2,
          participants: ['peer1_pubkey', 'peer2_pubkey', 'self_pubkey']
        })
      },
      share: {
        decode: jest.fn().mockReturnValue({
          idx: 1,
          pub: 'self_pubkey'
        })
      }
    }
  };
});

describe('Ping Functionality', () => {
  let mockNode: any;
  let createdMonitors: PingMonitor[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    createdMonitors = [];
    
    const { BifrostNode } = jest.requireMock('@frostr/bifrost');
    mockNode = new BifrostNode();
    
    // Default successful ping response
    mockNode.req.ping.mockResolvedValue({
      ok: true,
      data: { send: true, recv: true }
    });
  });

  afterEach(() => {
    // Cleanup all monitors
    createdMonitors.forEach(monitor => {
      if (monitor && typeof monitor.cleanup === 'function') {
        monitor.cleanup();
      }
    });
    createdMonitors = [];
  });

  afterAll(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constants', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_PING_RELAYS).toEqual([
        "wss://relay.damus.io",
        "wss://relay.primal.net"
      ]);
      expect(DEFAULT_PING_TIMEOUT).toBe(5000);
      expect(DEFAULT_PING_INTERVAL).toBe(30000);
    });
  });

  describe('pingPeer', () => {
    it('should ping a peer successfully', async () => {
      const peerPubkey = 'peer1_pubkey';
      
      // Mock successful ping response
      setTimeout(() => {
        const handlers = mockNode.on.mock.calls;
        const retHandler = handlers.find(call => call[0] === '/ping/sender/ret')?.[1];
        if (retHandler) {
          retHandler({
            pubkey: peerPubkey,
            policy: { send: true, recv: true }
          });
        }
      }, 10);

      const result = await pingPeer(mockNode, peerPubkey);
      
      expect(result.success).toBe(true);
      expect(result.pubkey).toBe(peerPubkey);
      expect(result.latency).toBeGreaterThan(0);
      expect(result.policy).toEqual({ send: true, recv: true });
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockNode.req.ping).toHaveBeenCalledWith(peerPubkey);
    });

    it('should handle ping timeout', async () => {
      const peerPubkey = 'peer1_pubkey';
      const timeout = 100;

      const result = await pingPeer(mockNode, peerPubkey, { timeout });
      
      expect(result.success).toBe(false);
      expect(result.pubkey).toBe(peerPubkey);
      expect(result.error).toContain('timeout');
      expect(result.latency).toBeUndefined();
    });

    it('should handle ping errors', async () => {
      const peerPubkey = 'peer1_pubkey';
      
      // Mock ping error
      setTimeout(() => {
        const handlers = mockNode.on.mock.calls;
        const errHandler = handlers.find(call => call[0] === '/ping/sender/err')?.[1];
        if (errHandler) {
          errHandler('Network error', {});
        }
      }, 10);

      const result = await pingPeer(mockNode, peerPubkey);
      
      expect(result.success).toBe(false);
      expect(result.pubkey).toBe(peerPubkey);
      expect(result.error).toBe('Network error');
    });

    it('should handle node request failures', async () => {
      const peerPubkey = 'peer1_pubkey';
      
      mockNode.req.ping.mockResolvedValue({
        ok: false,
        err: 'Connection failed'
      });

      const result = await pingPeer(mockNode, peerPubkey);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should handle node request exceptions', async () => {
      const peerPubkey = 'peer1_pubkey';
      
      mockNode.req.ping.mockRejectedValue(new Error('Network exception'));

      const result = await pingPeer(mockNode, peerPubkey);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network exception');
    });
  });

  describe('pingPeersAdvanced', () => {
    it('should ping multiple peers successfully', async () => {
      const peerPubkeys = ['peer1_pubkey', 'peer2_pubkey'];
      
      // Mock successful responses for both peers
      let responseCount = 0;
      setTimeout(() => {
        const handlers = mockNode.on.mock.calls;
        const retHandler = handlers.find(call => call[0] === '/ping/sender/ret')?.[1];
        if (retHandler) {
          peerPubkeys.forEach(pubkey => {
            setTimeout(() => {
              retHandler({
                pubkey,
                policy: { send: true, recv: true }
              });
              responseCount++;
            }, responseCount * 10);
          });
        }
      }, 10);

      const results = await pingPeersAdvanced(mockNode, peerPubkeys, { timeout: 1000 });
      
      expect(results).toHaveLength(2);
      expect(mockNode.req.ping).toHaveBeenCalledTimes(2);
    });

    it('should handle empty peer list', async () => {
      const results = await pingPeersAdvanced(mockNode, []);
      
      expect(results).toHaveLength(0);
      expect(mockNode.req.ping).not.toHaveBeenCalled();
    });
  });

  describe('createPingMonitor', () => {
    it('should create and start a ping monitor', async () => {
      const peerPubkeys = ['peer1_pubkey', 'peer2_pubkey'];
      const onPingResult = jest.fn();
      
      const monitor = createPingMonitor(mockNode, peerPubkeys, {
        interval: 100,
        timeout: 50,
        onPingResult
      });
      createdMonitors.push(monitor);
      
      expect(monitor.isRunning).toBe(false);
      
      monitor.start();
      expect(monitor.isRunning).toBe(true);
      
      // Wait for initial ping
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(mockNode.req.ping).toHaveBeenCalled();
      
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it('should cleanup properly', () => {
      const monitor = createPingMonitor(mockNode, ['peer1_pubkey']);
      
      monitor.start();
      expect(monitor.isRunning).toBe(true);
      
      monitor.cleanup();
      expect(monitor.isRunning).toBe(false);
      
      // Don't add to createdMonitors since we cleaned up manually
    });
  });

  describe('runPingDiagnostics', () => {
    it('should run ping diagnostics successfully', async () => {
      const peerPubkeys = ['peer1_pubkey', 'peer2_pubkey'];
      
      // Mock successful pings
      setTimeout(() => {
        const handlers = mockNode.on.mock.calls;
        const retHandler = handlers.find(call => call[0] === '/ping/sender/ret')?.[1];
        if (retHandler) {
          peerPubkeys.forEach(pubkey => {
            retHandler({
              pubkey,
              policy: { send: true, recv: true }
            });
          });
        }
      }, 10);

      const result = await runPingDiagnostics(mockNode, peerPubkeys, {
        rounds: 2,
        timeout: 100,
        interval: 50
      });
      
      expect(result.summary.totalRounds).toBe(2);
      expect(result.summary.totalPeers).toBe(2);
      expect(result.rounds).toHaveLength(2);
      expect(result.peerStats).toHaveProperty('peer1_pubkey');
      expect(result.peerStats).toHaveProperty('peer2_pubkey');
    });

    it('should handle diagnostics with no responses', async () => {
      const peerPubkeys = ['peer1_pubkey'];
      
      const result = await runPingDiagnostics(mockNode, peerPubkeys, {
        rounds: 1,
        timeout: 50
      });
      
      expect(result.summary.successRate).toBe(0);
      expect(result.summary.averageLatency).toBe(0);
      expect(result.summary.fastestPeer).toBeUndefined();
      expect(result.summary.slowestPeer).toBeUndefined();
    });
  });

  describe('pingPeersFromCredentials', () => {
    it('should ping peers from credentials successfully', async () => {
      const groupCredential = 'bfgroup1test';
      const shareCredential = 'bfshare1test';
      
      const results = await pingPeersFromCredentials(groupCredential, shareCredential, {
        timeout: 100
      });
      
      expect(Array.isArray(results)).toBe(true);
      // Results should be timeout failures since we're not mocking the ping responses
      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.error).toContain('timeout');
      });
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle setup errors in pingPeer', async () => {
      const peerPubkey = 'peer1_pubkey';
      
      // Mock node.on to throw an error
      mockNode.on.mockImplementation(() => {
        throw new Error('Setup error');
      });

      const result = await pingPeer(mockNode, peerPubkey);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Setup error');
    });
  });
}); 