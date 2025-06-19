import { BifrostNode } from '@frostr/bifrost';
import { 
  extractPeersFromCredentials, 
  pingPeers, 
  checkPeerStatus,
  PeerManager,
  StaticPeerManager,
  createPeerManager,
  createPeerManagerRobust,
  DEFAULT_PEER_MONITOR_CONFIG
} from '../src/peer';
import { IglooCore } from '../src/index';
import { NodeError } from '../src/types';

// Mock the ping module to prevent real network calls
jest.mock('../src/ping.js', () => ({
  pingPeers: jest.fn().mockResolvedValue([
    {
      success: true,
      pubkey: 'peer1_pubkey',
      latency: 100,
      timestamp: new Date()
    }
  ]),
  createPingMonitor: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    cleanup: jest.fn(),
    isRunning: false
  })),
  DEFAULT_PING_TIMEOUT: 5000,
  DEFAULT_PING_INTERVAL: 30000
}));

// Mock the bifrost library
jest.mock('@frostr/bifrost', () => {
  const mockNode = {
    req: {
      ping: jest.fn().mockResolvedValue({
        ok: true,
        data: ['peer1_pubkey']
      })
    },
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn()
  };

  return {
    BifrostNode: jest.fn(() => mockNode),
    PackageEncoder: {
      group: {
        decode: jest.fn().mockReturnValue({
          threshold: 2,
          participants: ['peer1_pubkey', 'peer2_pubkey', 'self_pubkey'],
          commits: [
            { pubkey: 'peer1_pubkey' },
            { pubkey: 'peer2_pubkey' },
            { pubkey: 'self_pubkey' }
          ]
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

describe('Peer Management', () => {
  let mockNode: any;
  let mockGroupDecode: jest.Mock;
  let mockShareDecode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const { BifrostNode, PackageEncoder } = jest.requireMock('@frostr/bifrost');
    mockNode = new BifrostNode();
    mockGroupDecode = PackageEncoder.group.decode;
    mockShareDecode = PackageEncoder.share.decode;
  });

  describe('extractPeersFromCredentials', () => {
    it('should extract peers successfully', () => {
      const peers = extractPeersFromCredentials('group_cred', 'share_cred');
      
      expect(mockGroupDecode).toHaveBeenCalledWith('group_cred');
      expect(mockShareDecode).toHaveBeenCalledWith('share_cred');
      expect(peers).toEqual(['peer1_pubkey', 'peer2_pubkey']);
      expect(peers).not.toContain('self_pubkey');
    });
  });

  describe('pingPeers', () => {
    it('should ping peers and return online list', async () => {
      const result = await pingPeers(mockNode);
      
      expect(mockNode.req.ping).toHaveBeenCalled();
      expect(result).toEqual(['peer1_pubkey']);
    });

    it('should handle ping failure', async () => {
      mockNode.req.ping.mockResolvedValue({ ok: false });

      const result = await pingPeers(mockNode);
      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockNode.req.ping.mockResolvedValue({ ok: false, error: 'Network error' });

      const result = await pingPeers(mockNode);
      expect(result).toEqual([]);
    });
  });

  describe('checkPeerStatus', () => {
    it('should return correct peer status', async () => {
      // Mock the internal ping function to return expected results
      const { pingPeers: mockPingPeersInternal } = jest.requireMock('../src/ping.js');
      mockPingPeersInternal.mockResolvedValueOnce([
        {
          success: true,
          pubkey: 'peer1_pubkey',
          latency: 100,
          timestamp: new Date()
        },
        {
          success: false,
          pubkey: 'peer2_pubkey',
          error: 'timeout',
          timestamp: new Date()
        }
      ]);

      const status = await checkPeerStatus(mockNode, 'group_cred', 'share_cred');
      
      expect(status).toEqual([
        { pubkey: 'peer1_pubkey', status: 'online' },
        { pubkey: 'peer2_pubkey', status: 'offline' }
      ]);
    });
  });

  describe('PeerManager', () => {
    let peerManager: PeerManager;
    const mockCallback = jest.fn();
    let createdPeerManagers: (PeerManager | StaticPeerManager)[] = [];

    beforeEach(() => {
      peerManager = new PeerManager(mockNode, 'self_pubkey', {
        autoMonitor: false,
        onPeerStatusChange: mockCallback
      });
      createdPeerManagers.push(peerManager);
    });

    afterEach(async () => {
      // Clean up all peer managers
      const cleanupPromises = createdPeerManagers.map(async (manager) => {
        if (manager && typeof manager.cleanup === 'function') {
          try {
            await manager.cleanup();
          } catch (error) {
            // Ignore cleanup errors in tests
          }
        }
      });
      
      await Promise.all(cleanupPromises);
      createdPeerManagers = [];
    });

    it('should create PeerManager instance', () => {
      expect(peerManager).toBeInstanceOf(PeerManager);
    });

    it('should initialize peers from credentials', () => {
      peerManager.initializePeers('group_cred', 'share_cred');
      
      const peers = peerManager.getAllPeers();
      expect(peers).toHaveLength(2);
      expect(peers.map(p => p.pubkey)).toEqual(['peer1_pubkey', 'peer2_pubkey']);
    });

    it('should update peer status and trigger callback', () => {
      peerManager.initializePeers('group_cred', 'share_cred');
      peerManager.updatePeerStatus('peer1_pubkey', 'online');
      
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: 'peer1_pubkey',
          status: 'online'
        })
      );
    });

    it('should ping peers and update statuses', async () => {
      // Set up the mock to return expected ping results
      const { pingPeers: mockPingPeersInternal } = jest.requireMock('../src/ping.js');
      mockPingPeersInternal.mockResolvedValueOnce([
        {
          success: true,
          pubkey: 'peer1_pubkey',
          latency: 100,
          timestamp: new Date()
        },
        {
          success: false,
          pubkey: 'peer2_pubkey',
          error: 'timeout',
          timestamp: new Date()
        }
      ]);

      peerManager.initializePeers('group_cred', 'share_cred');
      const result = await peerManager.pingPeers();
      
      // With our new implementation, we expect the ping module to be called
      expect(result.onlineCount).toBe(1);
      expect(result.totalPeers).toBe(2);
    });

    it('should cleanup properly', () => {
      peerManager.initializePeers('group_cred', 'share_cred');
      
      expect(peerManager.getAllPeers()).toHaveLength(2);
      
      peerManager.cleanup();
      expect(peerManager.getAllPeers()).toHaveLength(0);
    });

    it('should get peer status summary', () => {
      peerManager.initializePeers('group_cred', 'share_cred');
      peerManager.updatePeerStatus('peer1_pubkey', 'online');
      peerManager.updatePeerStatus('peer2_pubkey', 'offline');
      
      const status = peerManager.getPeerStatus();
      
      expect(status.totalPeers).toBe(2);
      expect(status.onlineCount).toBe(1);
      expect(status.onlinePeers).toHaveLength(1);
      expect(status.offlinePeers).toHaveLength(1);
    });
  });

  describe('createPeerManager', () => {
    let createdPeerManagers: (PeerManager | StaticPeerManager)[] = [];

    afterEach(async () => {
      // Clean up all peer managers
      const cleanupPromises = createdPeerManagers.map(async (manager) => {
        if (manager && typeof manager.cleanup === 'function') {
          try {
            await manager.cleanup();
          } catch (error) {
            // Ignore cleanup errors in tests
          }
        }
      });
      
      await Promise.all(cleanupPromises);
      createdPeerManagers = [];
    });

    it('should create and initialize PeerManager', async () => {
      const peerManager = await createPeerManager(
        mockNode, 
        'group_cred', 
        'share_cred'
      );
      createdPeerManagers.push(peerManager);
      
      expect(peerManager).toBeInstanceOf(PeerManager);
      expect(peerManager.getAllPeers()).toHaveLength(2);
    });

    it('should handle creation errors', async () => {
      mockShareDecode.mockImplementation(() => {
        throw new Error('Invalid share');
      });

      await expect(
        createPeerManager(mockNode, 'group_cred', 'invalid_share')
      ).rejects.toThrow(NodeError);
    });
  });

  describe('StaticPeerManager', () => {
    it('should initialize with provided peers', () => {
      const staticManager = new StaticPeerManager(['peer1', 'peer2'], ['warning']);
      const status = staticManager.getPeerStatus();
      
      expect(status.totalPeers).toBe(2);
      expect(status.onlineCount).toBe(0);
      
      staticManager.cleanup();
    });
  });

  describe('DEFAULT_PEER_MONITOR_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_PEER_MONITOR_CONFIG).toEqual({
        pingInterval: 30000,
        pingTimeout: 5000,
        autoMonitor: true,
        enableLogging: false,
        onPeerStatusChange: undefined
      });
    });
  });
}); 