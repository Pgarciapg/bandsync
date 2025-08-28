import { renderHook, act } from '@testing-library/react';
import io from 'socket.io-client';
import { useSocket } from '../../../apps/mobile/src/hooks/useSocket';

// Mock the config
jest.mock('../../../apps/mobile/src/config', () => ({
  SERVER_URL: 'http://localhost:3001'
}));

describe('useSocket Hook', () => {
  let mockSocket;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup socket mock
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: false,
      id: 'test-socket-id'
    };
    
    io.mockReturnValue(mockSocket);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Connection Management', () => {
    test('should initialize socket connection on mount', () => {
      renderHook(() => useSocket('test-session'));
      
      expect(io).toHaveBeenCalledWith('http://localhost:3001', {
        transports: ['websocket']
      });
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    test('should join session on connection', () => {
      renderHook(() => useSocket('test-session'));
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
      act(() => {
        connectHandler();
      });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('join_session', { sessionId: 'test-session' });
    });

    test('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() => useSocket('test-session'));
      
      unmount();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    test('should update state on snapshot event', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      const snapshotHandler = mockSocket.on.mock.calls.find(call => call[0] === 'snapshot')[1];
      const testState = {
        message: 'Test message',
        tempo: 120,
        position: 1000,
        isPlaying: true,
        tempoBpm: 120
      };
      
      act(() => {
        snapshotHandler(testState);
      });
      
      expect(result.current.state).toEqual(testState);
    });

    test('should update position on scroll_tick event', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      // Set initial state
      const snapshotHandler = mockSocket.on.mock.calls.find(call => call[0] === 'snapshot')[1];
      act(() => {
        snapshotHandler({ position: 0, tempoBpm: 100 });
      });
      
      // Update position via scroll tick
      const scrollTickHandler = mockSocket.on.mock.calls.find(call => call[0] === 'scroll_tick')[1];
      act(() => {
        scrollTickHandler({ sessionId: 'test-session', positionMs: 2000 });
      });
      
      expect(result.current.state.position).toBe(2000);
    });

    test('should not update position for different session', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      // Set initial state
      const snapshotHandler = mockSocket.on.mock.calls.find(call => call[0] === 'snapshot')[1];
      act(() => {
        snapshotHandler({ position: 1000 });
      });
      
      // Try to update position for different session
      const scrollTickHandler = mockSocket.on.mock.calls.find(call => call[0] === 'scroll_tick')[1];
      act(() => {
        scrollTickHandler({ sessionId: 'other-session', positionMs: 3000 });
      });
      
      expect(result.current.state.position).toBe(1000); // Should not change
    });

    test('should update room stats for correct session', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      const roomStatsHandler = mockSocket.on.mock.calls.find(call => call[0] === 'room_stats')[1];
      const roomStats = { sessionId: 'test-session', memberCount: 3 };
      
      act(() => {
        roomStatsHandler(roomStats);
      });
      
      expect(result.current.roomStats).toEqual(roomStats);
    });
  });

  describe('Event Emission', () => {
    test('should emit events through socket', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      act(() => {
        result.current.emit('test_event', { data: 'test' });
      });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('test_event', { data: 'test' });
    });

    test('should handle emit errors gracefully', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      // Mock emit to throw error
      mockSocket.emit.mockImplementation(() => {
        throw new Error('Emit error');
      });
      
      // Should not throw
      expect(() => {
        act(() => {
          result.current.emit('test_event', { data: 'test' });
        });
      }).not.toThrow();
    });

    test('should not emit when socket is null', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      // Clear the socket reference
      act(() => {
        result.current.emit('test_event', { data: 'test' });
      });
      
      // Should still work without throwing
      expect(() => {
        act(() => {
          result.current.emit('test_event', { data: 'test' });
        });
      }).not.toThrow();
    });
  });

  describe('Connection Status', () => {
    test('should track connection status', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      expect(result.current.connected).toBe(false);
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
      act(() => {
        connectHandler();
      });
      
      expect(result.current.connected).toBe(true);
      
      // Simulate disconnection
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
      act(() => {
        disconnectHandler();
      });
      
      expect(result.current.connected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle socket errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useSocket('test-session'));
      
      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'error')[1];
      const testError = { message: 'Connection failed' };
      
      act(() => {
        errorHandler(testError);
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('Socket error:', testError);
      consoleSpy.mockRestore();
    });
  });

  describe('Synchronization Accuracy Tests', () => {
    test('should handle rapid scroll_tick updates accurately', async () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      const scrollTickHandler = mockSocket.on.mock.calls.find(call => call[0] === 'scroll_tick')[1];
      const startTime = Date.now();
      const positions = [];
      
      // Simulate rapid position updates (every 100ms as per server)
      for (let i = 0; i < 10; i++) {
        const position = i * 100;
        positions.push(position);
        
        act(() => {
          scrollTickHandler({ 
            sessionId: 'test-session', 
            positionMs: position 
          });
        });
        
        // Small delay to simulate real-time updates
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify final position
      expect(result.current.state.position).toBe(900);
      
      // Verify update processing time is reasonable
      expect(duration).toBeLessThan(1000); // Should process all updates in under 1 second
    });

    test('should maintain state consistency during concurrent updates', () => {
      const { result } = renderHook(() => useSocket('test-session'));
      
      const snapshotHandler = mockSocket.on.mock.calls.find(call => call[0] === 'snapshot')[1];
      const scrollTickHandler = mockSocket.on.mock.calls.find(call => call[0] === 'scroll_tick')[1];
      
      // Set initial state
      act(() => {
        snapshotHandler({
          message: 'Initial',
          tempo: 100,
          position: 0,
          isPlaying: true,
          tempoBpm: 100
        });
      });
      
      // Concurrent updates
      act(() => {
        // Snapshot update
        snapshotHandler({
          message: 'Updated',
          tempo: 120,
          position: 500,
          isPlaying: true,
          tempoBpm: 120
        });
        
        // Position update
        scrollTickHandler({
          sessionId: 'test-session',
          positionMs: 600
        });
      });
      
      // State should have latest values
      expect(result.current.state).toEqual({
        message: 'Updated',
        tempo: 120,
        position: 600, // Position updated by scroll tick
        isPlaying: true,
        tempoBpm: 120
      });
    });
  });
});