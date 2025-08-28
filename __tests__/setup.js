// Global test setup and configuration
global.console = {
  ...console,
  // Uncomment to silence console logs during tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock for React Native modules in unit tests
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy'
  }
}));

// Socket.IO client mock for unit tests
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
    id: 'mock-socket-id'
  };
  
  const mockIo = jest.fn(() => mockSocket);
  mockIo.mockSocket = mockSocket;
  
  return mockIo;
});

// Performance monitoring setup
global.performance = global.performance || {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn()
};

// Synchronization test utilities
global.syncTestUtils = {
  // Helper to create mock timestamps with controlled timing
  createTimestamp: (offset = 0) => Date.now() + offset,
  
  // Helper to simulate network latency
  simulateNetworkDelay: (ms = 50) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to measure synchronization accuracy
  measureSyncAccuracy: (events) => {
    const timestamps = events.map(e => e.timestamp);
    const avgTime = timestamps.reduce((a, b) => a + b) / timestamps.length;
    const maxDrift = Math.max(...timestamps.map(t => Math.abs(t - avgTime)));
    return { avgTime, maxDrift };
  }
};

// Custom jest matchers for synchronization testing
expect.extend({
  toBeWithinSyncThreshold(received, expected, threshold = 100) {
    const drift = Math.abs(received - expected);
    const pass = drift <= threshold;
    
    if (pass) {
      return {
        message: () => `Expected ${received} not to be within ${threshold}ms of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be within ${threshold}ms of ${expected}, but drift was ${drift}ms`,
        pass: false,
      };
    }
  },

  toHaveLowLatency(received, maxLatency = 100) {
    const pass = received <= maxLatency;
    
    if (pass) {
      return {
        message: () => `Expected ${received}ms not to be low latency (under ${maxLatency}ms)`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received}ms to be low latency (under ${maxLatency}ms)`,
        pass: false,
      };
    }
  }
});