// Jest setup file for BandSync shared utilities

// Mock performance.now() for consistent timing tests
const mockPerformanceNow = (() => {
  let time = 0;
  return {
    now: () => time,
    advance: (ms) => { time += ms; },
    reset: () => { time = 0; }
  };
})();

// Replace the global performance.now with our mock
global.performance = {
  now: mockPerformanceNow.now
};

// Add custom matchers for timing tests
expect.extend({
  toBeWithinTolerance(received, expected, tolerance) {
    const pass = Math.abs(received - expected) <= tolerance;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within ${tolerance} of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within ${tolerance} of ${expected}`,
        pass: false,
      };
    }
  },
});

// Provide access to mock time control in tests
global.mockTime = mockPerformanceNow;

// Setup console spy to reduce noise in tests
global.console = {
  ...console,
  // Comment out the next line to see console output during tests
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase timeout for timing-sensitive tests
jest.setTimeout(15000);