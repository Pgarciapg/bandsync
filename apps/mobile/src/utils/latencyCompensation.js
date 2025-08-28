// Latency compensation utilities for real-time synchronization
export class LatencyCompensation {
  constructor() {
    this.samples = [];
    this.maxSamples = 20;
    this.averageLatency = 0;
    this.jitter = 0;
    this.clockOffset = 0;
    this.lastServerTime = 0;
    this.lastLocalTime = 0;
  }

  // Add a latency sample from ping/pong measurement
  addLatencySample(roundTripTime, serverTime, localTime) {
    const latency = roundTripTime / 2;
    
    this.samples.push({
      latency,
      serverTime,
      localTime,
      timestamp: Date.now()
    });

    // Keep only recent samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Calculate statistics
    this.calculateStatistics();
    
    // Update clock offset for time synchronization
    this.updateClockOffset(serverTime, localTime, latency);
  }

  calculateStatistics() {
    if (this.samples.length === 0) return;

    // Calculate average latency
    const latencies = this.samples.map(s => s.latency);
    this.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    // Calculate jitter (standard deviation of latencies)
    const variance = latencies.reduce((acc, latency) => {
      return acc + Math.pow(latency - this.averageLatency, 2);
    }, 0) / latencies.length;
    
    this.jitter = Math.sqrt(variance);
  }

  updateClockOffset(serverTime, localTime, latency) {
    // Estimate server time at the moment we received the response
    const estimatedServerTime = serverTime + latency;
    const currentLocalTime = localTime;
    
    // Calculate offset between server and local clocks
    this.clockOffset = estimatedServerTime - currentLocalTime;
    this.lastServerTime = serverTime;
    this.lastLocalTime = localTime;
  }

  // Get compensated position based on current time and network conditions
  getCompensatedPosition(basePosition, isPlaying, tempoBpm, lastUpdateTime) {
    if (!isPlaying || !basePosition) return basePosition;

    const now = Date.now();
    const timeSinceUpdate = now - lastUpdateTime;
    
    // Account for network latency
    const compensatedTimeSinceUpdate = Math.max(0, timeSinceUpdate - this.averageLatency);
    
    // Predict position based on tempo
    const beatsPerMs = tempoBpm / (60 * 1000);
    const expectedPosition = basePosition + compensatedTimeSinceUpdate;
    
    // Apply jitter compensation - smooth out position updates if jitter is high
    if (this.jitter > 50) {
      // Use exponential smoothing for high jitter situations
      const smoothingFactor = 0.3;
      return basePosition + (expectedPosition - basePosition) * smoothingFactor;
    }
    
    return expectedPosition;
  }

  // Get server time synchronized with local time
  getServerTime() {
    return Date.now() + this.clockOffset;
  }

  // Check if connection quality is good for real-time sync
  isConnectionGoodForRealtime() {
    return this.averageLatency < 100 && this.jitter < 30;
  }

  // Get adaptive buffer size based on network conditions
  getAdaptiveBufferSize() {
    if (this.averageLatency < 50 && this.jitter < 10) {
      return 50; // Low buffer for excellent connections
    } else if (this.averageLatency < 100 && this.jitter < 30) {
      return 100; // Medium buffer for good connections
    } else {
      return 200; // High buffer for poor connections
    }
  }

  // Predict future position for smooth rendering
  predictPosition(currentPosition, isPlaying, tempoBpm, lookaheadMs = 16) {
    if (!isPlaying) return currentPosition;
    
    // Add lookahead for smooth 60fps rendering
    const compensatedLookahead = lookaheadMs + (this.averageLatency / 2);
    return currentPosition + compensatedLookahead;
  }

  // Get network quality metrics
  getNetworkMetrics() {
    return {
      averageLatency: Math.round(this.averageLatency),
      jitter: Math.round(this.jitter),
      clockOffset: Math.round(this.clockOffset),
      quality: this.isConnectionGoodForRealtime() ? 'Good' : 'Poor',
      bufferSize: this.getAdaptiveBufferSize()
    };
  }
}

// Create a singleton instance
export const latencyCompensator = new LatencyCompensation();

// Performance optimization utilities
export const performanceUtils = {
  // Throttle function for high-frequency updates
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  },

  // Debounce function for delayed execution
  debounce(func, wait, immediate) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      const later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  },

  // Request animation frame with fallback
  requestAnimationFrame: (typeof requestAnimationFrame !== 'undefined') 
    ? requestAnimationFrame 
    : (callback) => setTimeout(callback, 16),

  // Cancel animation frame with fallback
  cancelAnimationFrame: (typeof cancelAnimationFrame !== 'undefined')
    ? cancelAnimationFrame
    : clearTimeout,

  // High precision timestamp
  now: () => (typeof performance !== 'undefined' && performance.now) 
    ? performance.now() 
    : Date.now(),

  // Memory usage (if available)
  getMemoryUsage: () => {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        percentage: Math.round((performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100)
      };
    }
    return null;
  }
};