import { 
  createAndConnectNode, 
  createConnectedNode,
  isNodeReady,
  cleanupBifrostNode,
  NodeError
} from '../src/index.js';

// Mock the @frostr/bifrost module
jest.mock('@frostr/bifrost', () => {
  return {
    BifrostNode: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      client: { connected: true }
    })),
    PackageEncoder: {
      group: { decode: jest.fn().mockReturnValue({ threshold: 2, group_pk: 'test', commits: ['test'] }) },
      share: { decode: jest.fn().mockReturnValue({ idx: 1, seckey: 'test', binder_sn: 'test', hidden_sn: 'test' }) }
    }
  };
});

describe('Node Management', () => {
  const mockConfig = {
    group: 'bfgroup1test',
    share: 'bfshare1test',
    relays: ['wss://relay.test.com']
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAndConnectNode', () => {
    it('should create and connect a node successfully', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      expect(node).toBeDefined();
      expect(node.connect).toHaveBeenCalled();
    });

    it('should throw NodeError on invalid config', async () => {
      const invalidConfig = {
        group: '',
        share: '',
        relays: []
      };

      await expect(createAndConnectNode(invalidConfig)).rejects.toThrow();
    });
  });

  describe('createConnectedNode', () => {
    it('should create node with enhanced state information', async () => {
      const enhancedConfig = {
        ...mockConfig,
        connectionTimeout: 5000,
        autoReconnect: true
      };

      const result = await createConnectedNode(enhancedConfig);
      
      expect(result).toHaveProperty('node');
      expect(result).toHaveProperty('state');
      expect(result.state.isReady).toBe(true);
      expect(result.state.isConnected).toBe(true);
      expect(result.state.isConnecting).toBe(false);
      expect(result.state.connectedRelays).toEqual(mockConfig.relays);
    });

    it('should handle invalid config in enhanced mode', async () => {
      const invalidConfig = {
        group: '',
        share: '',
        relays: []
      };

      await expect(createConnectedNode(invalidConfig)).rejects.toThrow();
    });
  });

  describe('isNodeReady', () => {
    it('should return true for connected node', () => {
      const mockNode = {
        client: { connected: true }
      };

      expect(isNodeReady(mockNode as any)).toBe(true);
    });

    it('should return false for disconnected node', () => {
      const mockNode = {
        client: { connected: false }
      };

      expect(isNodeReady(mockNode as any)).toBe(false);
    });

    it('should return false for node without client', () => {
      const mockNode = {};

      expect(isNodeReady(mockNode as any)).toBe(false);
    });

    it('should handle errors gracefully', () => {
      const mockNode = {
        get client() {
          throw new Error('Client access error');
        }
      };

      expect(isNodeReady(mockNode as any)).toBe(false);
    });
  });

  describe('cleanupBifrostNode', () => {
    it('should clean up node with removeAllListeners', () => {
      const mockNode = {
        removeAllListeners: jest.fn(),
        close: jest.fn()
      };

      cleanupBifrostNode(mockNode as any);

      expect(mockNode.removeAllListeners).toHaveBeenCalled();
      expect(mockNode.close).toHaveBeenCalled();
    });

    it('should handle cleanup without removeAllListeners', () => {
      const mockNode = {
        close: jest.fn()
      };

      // Should not throw and should still call close
      expect(() => cleanupBifrostNode(mockNode as any)).not.toThrow();
      expect(mockNode.close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', () => {
      const mockNode = {
        removeAllListeners: jest.fn(),
        close: jest.fn().mockImplementation(() => {
          throw new Error('Close error');
        })
      };

      // Should not throw even if close fails
      expect(() => cleanupBifrostNode(mockNode as any)).not.toThrow();
    });

    it('should handle null/undefined nodes', () => {
      expect(() => cleanupBifrostNode(null as any)).not.toThrow();
      expect(() => cleanupBifrostNode(undefined as any)).not.toThrow();
    });
  });

  describe('Event Lifecycle Race Conditions', () => {
    it('should ensure node is ready immediately after createAndConnectNode resolves', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      // This test verifies that we don't need to wait for 'ready' event
      // The node should be immediately usable
      expect(isNodeReady(node)).toBe(true);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      // Simulate rapid cleanup
      cleanupBifrostNode(node);
      
      // Should handle multiple cleanups gracefully
      expect(() => cleanupBifrostNode(node)).not.toThrow();
    });
  });

  describe('Enhanced Event Handling', () => {
    it('should register all required event handlers during node creation', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      // Verify that event handlers were registered on the returned node
      expect(node.on).toHaveBeenCalled();
      
      // Verify we have handlers for key events by checking if they were called with the event names
      const onCalls = (node.on as jest.Mock).mock.calls;
      const registeredEvents = onCalls.map(call => call[0]);
      
      // Verify base events
      expect(registeredEvents).toContain('ready');
      expect(registeredEvents).toContain('error');
      expect(registeredEvents).toContain('closed');
      
      // Verify new events are also registered
      expect(registeredEvents).toContain('*');
      expect(registeredEvents).toContain('info');
      expect(registeredEvents).toContain('debug');
      
      // Verify echo events that were missing before
      expect(registeredEvents).toContain('/echo/sender/ret');
      expect(registeredEvents).toContain('/echo/sender/err');
      
      // Verify ping events that were missing before
      expect(registeredEvents).toContain('/ping/handler/ret');
      expect(registeredEvents).toContain('/ping/sender/ret');
      expect(registeredEvents).toContain('/ping/sender/err');
    });

    it('should handle event configuration in node creation', async () => {
      const customLogger = jest.fn();
      const eventConfig = {
        enableLogging: true,
        logLevel: 'debug' as const,
        customLogger
      };
      
      const node = await createAndConnectNode(mockConfig, eventConfig);
      
      // Verify that events were registered (this confirms setupNodeEvents was called with config)
      expect(node.on).toHaveBeenCalled();
    });

    it('should properly handle all event categories', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      // Get all registered event names
      const onCalls = (node.on as jest.Mock).mock.calls;
      const registeredEvents = onCalls.map(call => call[0]);
      
      // Verify we have events from all categories
      const hasBaseEvents = registeredEvents.some((event: string) => ['ready', 'closed', 'error', '*'].includes(event));
      const hasECDHEvents = registeredEvents.some((event: string) => event.startsWith('/ecdh/'));
      const hasSignEvents = registeredEvents.some((event: string) => event.startsWith('/sign/'));
      const hasPingEvents = registeredEvents.some((event: string) => event.startsWith('/ping/'));
      const hasEchoEvents = registeredEvents.some((event: string) => event.startsWith('/echo/'));
      
      expect(hasBaseEvents).toBe(true);
      expect(hasECDHEvents).toBe(true);
      expect(hasSignEvents).toBe(true);
      expect(hasPingEvents).toBe(true);
      expect(hasEchoEvents).toBe(true);
    });
  });

  describe('Event Handler Verification', () => {
    it('should verify event handlers can be called without errors', async () => {
      // Capture event handlers during node creation
      const eventHandlers: { [key: string]: Function } = {};
      
      // Create a node with a modified mock that captures handlers
      const originalMockImplementation = jest.requireMock('@frostr/bifrost').BifrostNode;
      const mockNode = {
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
        on: jest.fn().mockImplementation((event: string, handler: Function) => {
          eventHandlers[event] = handler;
        }),
        off: jest.fn(),
        removeAllListeners: jest.fn(),
        client: { connected: true },
        constructor: { name: 'BifrostNode' }
      };
      
      // Temporarily replace the mock implementation
      jest.requireMock('@frostr/bifrost').BifrostNode.mockImplementationOnce(() => mockNode);
      
      const node = await createAndConnectNode(mockConfig);
      
      // Test that critical event handlers don't throw when called
      expect(() => {
        if (eventHandlers['ready']) {
          eventHandlers['ready'](mockNode);
        }
      }).not.toThrow();
      
      expect(() => {
        if (eventHandlers['error']) {
          eventHandlers['error'](new Error('test error'));
        }
      }).not.toThrow();
      
      expect(() => {
        if (eventHandlers['*']) {
          eventHandlers['*']('test-event', { data: 'test' });
        }
      }).not.toThrow();
      
      // Test new events
      expect(() => {
        if (eventHandlers['/echo/sender/ret']) {
          eventHandlers['/echo/sender/ret']('success');
        }
      }).not.toThrow();
      
      expect(() => {
        if (eventHandlers['/ping/sender/err']) {
          eventHandlers['/ping/sender/err']('timeout', { error: 'test' });
        }
      }).not.toThrow();
    });
  });

  describe('React Integration Scenarios', () => {
    it('should support useRef pattern for node storage', async () => {
      // Simulate React useRef pattern
      const nodeRef: { current: any } = { current: null };
      
      nodeRef.current = await createAndConnectNode(mockConfig);
      expect(nodeRef.current).toBeDefined();
      expect(isNodeReady(nodeRef.current)).toBe(true);
      
      // Cleanup
      if (nodeRef.current) {
        cleanupBifrostNode(nodeRef.current);
        nodeRef.current = null;
      }
      
      expect(nodeRef.current).toBeNull();
    });

    it('should handle component unmount cleanup', async () => {
      const node = await createAndConnectNode(mockConfig);
      
      // Simulate React component unmount
      const cleanup = () => {
        if (node) {
          cleanupBifrostNode(node);
        }
      };
      
      expect(() => cleanup()).not.toThrow();
    });
  });
}); 