import { 
  createBifrostNode, 
  setupNodeEvents,
  type NodeEventConfig 
} from '../src/node.js';
import type { BifrostNodeEvents } from '../src/types.js';

// Mock the @frostr/bifrost module
jest.mock('@frostr/bifrost', () => {
  const mockBifrostNodeInstance = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    client: { connected: true },
    constructor: { name: 'BifrostNode' }
  };

  return {
    BifrostNode: jest.fn().mockImplementation(() => mockBifrostNodeInstance),
    PackageEncoder: {
      group: { decode: jest.fn().mockReturnValue({ threshold: 2, group_pk: 'test', commits: ['test'] }) },
      share: { decode: jest.fn().mockReturnValue({ idx: 1, seckey: 'test', binder_sn: 'test', hidden_sn: 'test' }) }
    },
    __mockBifrostNodeInstance: mockBifrostNodeInstance
  };
});

describe('Bifrost Event Handling', () => {
  let mockNode: any;
  let consoleLogSpy: jest.SpyInstance;
  let customLogger: jest.Mock;

  const mockConfig = {
    group: 'bfgroup1test',
    share: 'bfshare1test',
    relays: ['wss://relay.test.com']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mock instance from the mocked module
    const { __mockBifrostNodeInstance } = require('@frostr/bifrost');
    mockNode = __mockBifrostNodeInstance;
    
    // Reset the mock functions
    mockNode.on.mockClear();

    // Spy on console.log to verify logging
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Create a custom logger mock
    customLogger = jest.fn();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('setupNodeEvents', () => {
    it('should register handlers for all base events', () => {
      setupNodeEvents(mockNode);

      // Verify all base events are registered
      const expectedBaseEvents = [
        '*', 'info', 'debug', 'ready', 'closed', 'message', 'bounced', 'error'
      ];

      expectedBaseEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should register handlers for all ECDH events', () => {
      setupNodeEvents(mockNode);

      const expectedECDHEvents = [
        '/ecdh/sender/req', '/ecdh/sender/res', '/ecdh/sender/rej', 
        '/ecdh/sender/ret', '/ecdh/sender/err',
        '/ecdh/handler/req', '/ecdh/handler/res', '/ecdh/handler/rej'
      ];

      expectedECDHEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should register handlers for all signature events', () => {
      setupNodeEvents(mockNode);

      const expectedSignEvents = [
        '/sign/sender/req', '/sign/sender/res', '/sign/sender/rej',
        '/sign/sender/ret', '/sign/sender/err',
        '/sign/handler/req', '/sign/handler/res', '/sign/handler/rej'
      ];

      expectedSignEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should register handlers for all ping events', () => {
      setupNodeEvents(mockNode);

      const expectedPingEvents = [
        '/ping/handler/req', '/ping/handler/res', '/ping/handler/rej', '/ping/handler/ret',
        '/ping/sender/req', '/ping/sender/res', '/ping/sender/rej', '/ping/sender/ret', '/ping/sender/err'
      ];

      expectedPingEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should register handlers for all echo events', () => {
      setupNodeEvents(mockNode);

      const expectedEchoEvents = [
        '/echo/handler/req', '/echo/handler/res', '/echo/handler/rej',
        '/echo/sender/req', '/echo/sender/res', '/echo/sender/rej', '/echo/sender/ret', '/echo/sender/err'
      ];

      expectedEchoEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should register handlers for ALL Bifrost events (complete coverage)', () => {
      setupNodeEvents(mockNode);

      // Complete list of all events from the Bifrost interface
      const allExpectedEvents = [
        // Base events
        '*', 'info', 'debug', 'error', 'ready', 'closed', 'bounced', 'message',
        
        // ECDH events
        '/ecdh/sender/req', '/ecdh/sender/res', '/ecdh/sender/rej', '/ecdh/sender/ret', '/ecdh/sender/err',
        '/ecdh/handler/req', '/ecdh/handler/res', '/ecdh/handler/rej',
        
        // Signature events
        '/sign/sender/req', '/sign/sender/res', '/sign/sender/rej', '/sign/sender/ret', '/sign/sender/err',
        '/sign/handler/req', '/sign/handler/res', '/sign/handler/rej',
        
        // Ping events
        '/ping/handler/req', '/ping/handler/res', '/ping/handler/rej', '/ping/handler/ret',
        '/ping/sender/req', '/ping/sender/res', '/ping/sender/rej', '/ping/sender/ret', '/ping/sender/err',
        
        // Echo events
        '/echo/handler/req', '/echo/handler/res', '/echo/handler/rej',
        '/echo/sender/req', '/echo/sender/res', '/echo/sender/rej', '/echo/sender/ret', '/echo/sender/err'
      ];

      // Verify each event was registered
      allExpectedEvents.forEach(event => {
        expect(mockNode.on).toHaveBeenCalledWith(event, expect.any(Function));
      });

      // Verify we registered exactly the expected number of events
      expect(mockNode.on).toHaveBeenCalledTimes(allExpectedEvents.length);
    });
  });

  describe('Event Handler Functionality', () => {
    let eventHandlers: { [key: string]: Function };

    beforeEach(() => {
      eventHandlers = {};
      
      // Capture all registered event handlers
      mockNode.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      });

      setupNodeEvents(mockNode, { enableLogging: true });
    });

    describe('Base events', () => {
      it('should handle wildcard event', () => {
        const handler = eventHandlers['*'];
        expect(handler).toBeDefined();
        
        handler('test-event', { data: 'test' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[DEBUG] Event emitted: test-event', { data: 'test' }
        );
      });

      it('should handle info event', () => {
        const handler = eventHandlers['info'];
        expect(handler).toBeDefined();
        
        handler({ message: 'test info' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Bifrost info', { message: 'test info' }
        );
      });

      it('should handle debug event', () => {
        const handler = eventHandlers['debug'];
        expect(handler).toBeDefined();
        
        handler({ debug: 'test debug' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[DEBUG] Bifrost debug', { debug: 'test debug' }
        );
      });

      it('should handle ready event with node parameter', () => {
        const handler = eventHandlers['ready'];
        expect(handler).toBeDefined();
        
        handler(mockNode);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Bifrost node is ready', { nodeId: 'BifrostNode' }
        );
      });

      it('should handle closed event with node parameter', () => {
        const handler = eventHandlers['closed'];
        expect(handler).toBeDefined();
        
        handler(mockNode);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Bifrost node connection closed', { nodeId: 'BifrostNode' }
        );
      });

      it('should handle bounced event with correct parameters', () => {
        const handler = eventHandlers['bounced'];
        expect(handler).toBeDefined();
        
        const reason = 'message rejected';
        const message = { data: 'test message' };
        
        handler(reason, message);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[WARN] Message bounced', { reason, message }
        );
      });

      it('should handle error event', () => {
        const handler = eventHandlers['error'];
        expect(handler).toBeDefined();
        
        const error = new Error('test error');
        handler(error);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[ERROR] Node error occurred', error
        );
      });
    });

    describe('New ping events', () => {
      it('should handle ping handler return event', () => {
        const handler = eventHandlers['/ping/handler/ret'];
        expect(handler).toBeDefined();
        
        handler('success', 'ping data');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Ping handler returned', { reason: 'success', data: 'ping data' }
        );
      });

      it('should handle ping sender return event', () => {
        const handler = eventHandlers['/ping/sender/ret'];
        expect(handler).toBeDefined();
        
        const peerConfig = { id: 'peer1', relays: ['wss://relay.test'] };
        handler(peerConfig);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Ping sender returned peer config', peerConfig
        );
      });

      it('should handle ping sender error event', () => {
        const handler = eventHandlers['/ping/sender/err'];
        expect(handler).toBeDefined();
        
        handler('timeout', { message: 'ping timeout' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[ERROR] Ping sender error', { reason: 'timeout', message: { message: 'ping timeout' } }
        );
      });
    });

    describe('New echo events', () => {
      it('should handle echo sender return event', () => {
        const handler = eventHandlers['/echo/sender/ret'];
        expect(handler).toBeDefined();
        
        handler('completed');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[INFO] Echo sender returned', { reason: 'completed' }
        );
      });

      it('should handle echo sender error event', () => {
        const handler = eventHandlers['/echo/sender/err'];
        expect(handler).toBeDefined();
        
        handler('network error', { error: 'connection failed' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[ERROR] Echo sender error', { reason: 'network error', message: { error: 'connection failed' } }
        );
      });
    });
  });

  describe('Event Configuration', () => {
    it('should respect enableLogging: false', () => {
      const config: NodeEventConfig = { enableLogging: false };
      
      const eventHandlers: { [key: string]: Function } = {};
      mockNode.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      });

      setupNodeEvents(mockNode, config);
      
      // Trigger an event
      const handler = eventHandlers['ready'];
      handler(mockNode);
      
      // Should not log anything
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should use custom logger when provided', () => {
      const config: NodeEventConfig = { 
        enableLogging: true, 
        customLogger 
      };
      
      const eventHandlers: { [key: string]: Function } = {};
      mockNode.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      });

      setupNodeEvents(mockNode, config);
      
      // Trigger an event
      const handler = eventHandlers['info'];
      handler({ test: 'data' });
      
      // Should use custom logger instead of console.log
      expect(customLogger).toHaveBeenCalledWith(
        'info', 'Bifrost info', { test: 'data' }
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should respect different log levels', () => {
      const config: NodeEventConfig = { 
        enableLogging: true, 
        logLevel: 'error',
        customLogger 
      };
      
      const eventHandlers: { [key: string]: Function } = {};
      mockNode.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      });

      setupNodeEvents(mockNode, config);
      
      // Test that handlers still work even if they would log at different levels
      const infoHandler = eventHandlers['info'];
      const errorHandler = eventHandlers['error'];
      
      infoHandler({ test: 'info' });
      errorHandler(new Error('test error'));
      
      // Both should call the custom logger (the logger itself handles level filtering)
      expect(customLogger).toHaveBeenCalledWith('info', 'Bifrost info', { test: 'info' });
      expect(customLogger).toHaveBeenCalledWith('error', 'Node error occurred', new Error('test error'));
    });
  });

  describe('Integration with createBifrostNode', () => {
    it('should automatically set up events when creating a node', () => {
      const node = createBifrostNode(mockConfig);
      
      // Verify that setupNodeEvents was called (events were registered)
      expect(mockNode.on).toHaveBeenCalled();
      
      // Verify we have handlers for key events
      expect(mockNode.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockNode.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockNode.on).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('should pass event config to setupNodeEvents', () => {
      const eventConfig: NodeEventConfig = {
        enableLogging: true,
        logLevel: 'debug',
        customLogger
      };
      
      const node = createBifrostNode(mockConfig, eventConfig);
      
      // The custom logger should be available for use
      // We can't easily test this without more complex mocking,
      // but we can verify that events were set up
      expect(mockNode.on).toHaveBeenCalled();
    }); 
  });

  describe('Event Coverage Regression Tests', () => {
    it('should not miss any events added in future Bifrost versions', () => {
      // This test serves as a reminder to update event handling 
      // if new events are added to Bifrost
      
      setupNodeEvents(mockNode);
      
      // Get all events that were registered
      const registeredEvents = mockNode.on.mock.calls.map(call => call[0]);
      
      // Sort for easier comparison
      registeredEvents.sort();
      
      const expectedEvents = [
        '*', 'bounced', 'closed', 'debug', 'error', 'info', 'message', 'ready',
        '/ecdh/handler/rej', '/ecdh/handler/req', '/ecdh/handler/res',
        '/ecdh/sender/err', '/ecdh/sender/rej', '/ecdh/sender/req', '/ecdh/sender/res', '/ecdh/sender/ret',
        '/echo/handler/rej', '/echo/handler/req', '/echo/handler/res',
        '/echo/sender/err', '/echo/sender/rej', '/echo/sender/req', '/echo/sender/res', '/echo/sender/ret',
        '/ping/handler/rej', '/ping/handler/req', '/ping/handler/res', '/ping/handler/ret',
        '/ping/sender/err', '/ping/sender/rej', '/ping/sender/req', '/ping/sender/res', '/ping/sender/ret',
        '/sign/handler/rej', '/sign/handler/req', '/sign/handler/res',
        '/sign/sender/err', '/sign/sender/rej', '/sign/sender/req', '/sign/sender/res', '/sign/sender/ret'
      ].sort();
      
      expect(registeredEvents).toEqual(expectedEvents);
      
      // If this test fails, it means either:
      // 1. New events were added to Bifrost that we need to handle
      // 2. Events were removed from Bifrost that we should stop handling
      // 3. We have a bug in our event registration
    });
  });
}); 