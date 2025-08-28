/**
 * Network Condition Simulator for BandSync Testing
 * Simulates various network conditions and edge cases
 */

export class NetworkSimulator {
  constructor() {
    this.delays = new Map();
    this.dropRates = new Map();
    this.jitterRanges = new Map();
    this.bandwidthLimits = new Map();
    this.isEnabled = false;
  }

  /**
   * Enable network simulation
   */
  enable() {
    this.isEnabled = true;
  }

  /**
   * Disable network simulation
   */
  disable() {
    this.isEnabled = false;
    this.delays.clear();
    this.dropRates.clear();
    this.jitterRanges.clear();
    this.bandwidthLimits.clear();
  }

  /**
   * Set network delay for a client
   */
  setDelay(clientId, delayMs) {
    this.delays.set(clientId, delayMs);
  }

  /**
   * Set packet drop rate (0-1) for a client
   */
  setDropRate(clientId, dropRate) {
    this.dropRates.set(clientId, Math.max(0, Math.min(1, dropRate)));
  }

  /**
   * Set jitter range for a client
   */
  setJitter(clientId, jitterMs) {
    this.jitterRanges.set(clientId, jitterMs);
  }

  /**
   * Wrap a Socket.IO client with network simulation
   */
  wrapClient(client, clientId) {
    if (!this.isEnabled) {
      return client;
    }

    const originalEmit = client.emit.bind(client);
    const simulator = this;

    client.emit = function(...args) {
      // Check for packet drop
      const dropRate = simulator.dropRates.get(clientId) || 0;
      if (Math.random() < dropRate) {
        console.log(`[NetworkSim] Dropped packet from ${clientId}`);
        return; // Drop the packet
      }

      // Calculate delay with jitter
      let delay = simulator.delays.get(clientId) || 0;
      const jitter = simulator.jitterRanges.get(clientId) || 0;
      
      if (jitter > 0) {
        delay += (Math.random() - 0.5) * 2 * jitter; // ±jitter range
        delay = Math.max(0, delay);
      }

      if (delay > 0) {
        setTimeout(() => {
          originalEmit.apply(this, args);
        }, delay);
      } else {
        originalEmit.apply(this, args);
      }
    };

    return client;
  }

  /**
   * Simulate common network conditions
   */
  static createPresets() {
    return {
      // Perfect conditions (local network)
      LOCAL: {
        delay: 1,
        jitter: 0.5,
        dropRate: 0
      },

      // Good broadband connection
      BROADBAND: {
        delay: 20,
        jitter: 5,
        dropRate: 0.001
      },

      // Mobile 4G connection
      MOBILE_4G: {
        delay: 50,
        jitter: 20,
        dropRate: 0.01
      },

      // Mobile 3G connection
      MOBILE_3G: {
        delay: 150,
        jitter: 50,
        dropRate: 0.02
      },

      // Poor WiFi connection
      POOR_WIFI: {
        delay: 100,
        jitter: 75,
        dropRate: 0.05
      },

      // Satellite connection
      SATELLITE: {
        delay: 600,
        jitter: 100,
        dropRate: 0.01
      },

      // Unstable connection (high packet loss)
      UNSTABLE: {
        delay: 80,
        jitter: 200,
        dropRate: 0.15
      }
    };
  }

  /**
   * Apply a preset condition to a client
   */
  applyPreset(clientId, preset) {
    const presets = NetworkSimulator.createPresets();
    const config = presets[preset];
    
    if (!config) {
      throw new Error(`Unknown network preset: ${preset}`);
    }

    this.setDelay(clientId, config.delay);
    this.setJitter(clientId, config.jitter);
    this.setDropRate(clientId, config.dropRate);
  }

  /**
   * Simulate gradual network degradation
   */
  async degradeConnection(clientId, duration = 5000, steps = 10) {
    const stepDuration = duration / steps;
    
    for (let step = 0; step < steps; step++) {
      const progress = step / steps;
      
      // Gradually increase delay and packet loss
      const delay = progress * 200; // Up to 200ms delay
      const dropRate = progress * 0.1; // Up to 10% packet loss
      const jitter = progress * 50; // Up to 50ms jitter
      
      this.setDelay(clientId, delay);
      this.setDropRate(clientId, dropRate);
      this.setJitter(clientId, jitter);
      
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
  }

  /**
   * Simulate intermittent connection (connection drops)
   */
  async simulateIntermittentConnection(client, intervals = [1000, 500, 2000, 300]) {
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const isDisconnectPhase = i % 2 === 1;
      
      if (isDisconnectPhase) {
        console.log(`[NetworkSim] Disconnecting for ${interval}ms`);
        client.disconnect();
      } else {
        console.log(`[NetworkSim] Connecting for ${interval}ms`);
        if (!client.connected) {
          client.connect();
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  /**
   * Create a network stress test scenario
   */
  createStressScenario(clientIds) {
    const scenarios = [
      // Scenario 1: Mixed connection qualities
      () => {
        const presets = ['LOCAL', 'BROADBAND', 'MOBILE_4G', 'POOR_WIFI'];
        clientIds.forEach((clientId, index) => {
          this.applyPreset(clientId, presets[index % presets.length]);
        });
      },

      // Scenario 2: Everyone on poor connections
      () => {
        clientIds.forEach(clientId => {
          this.applyPreset(clientId, 'MOBILE_3G');
        });
      },

      // Scenario 3: High packet loss scenario
      () => {
        clientIds.forEach(clientId => {
          this.setDelay(clientId, 75);
          this.setJitter(clientId, 30);
          this.setDropRate(clientId, 0.08); // 8% packet loss
        });
      }
    ];

    return scenarios;
  }
}

/**
 * Performance Analyzer for network conditions
 */
export class NetworkPerformanceAnalyzer {
  constructor() {
    this.measurements = [];
  }

  /**
   * Start measuring network performance
   */
  startMeasurement(testName) {
    return {
      testName,
      startTime: performance.now(),
      events: [],
      
      recordEvent: function(eventType, data = {}) {
        this.events.push({
          type: eventType,
          timestamp: performance.now(),
          data
        });
      },
      
      finish: () => {
        const endTime = performance.now();
        const measurement = {
          testName,
          startTime: this.startTime,
          endTime,
          duration: endTime - this.startTime,
          events: this.events
        };
        
        this.measurements.push(measurement);
        return this.analyzeMeasurement(measurement);
      }
    };
  }

  /**
   * Analyze a completed measurement
   */
  analyzeMeasurement(measurement) {
    const { events, duration } = measurement;
    
    // Calculate event frequencies
    const eventTypes = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    // Calculate timing statistics
    const eventIntervals = [];
    for (let i = 1; i < events.length; i++) {
      eventIntervals.push(events[i].timestamp - events[i - 1].timestamp);
    }

    const avgInterval = eventIntervals.length > 0 
      ? eventIntervals.reduce((a, b) => a + b) / eventIntervals.length 
      : 0;

    const analysis = {
      testName: measurement.testName,
      totalDuration: duration,
      totalEvents: events.length,
      eventTypes,
      avgEventInterval: avgInterval,
      eventsPerSecond: events.length / (duration / 1000),
      
      // Specific analysis for sync events
      syncAccuracy: this.analyzeSyncAccuracy(events),
      performanceGrade: this.gradePerformance(events, duration)
    };

    return analysis;
  }

  /**
   * Analyze synchronization accuracy from events
   */
  analyzeSyncAccuracy(events) {
    const tickEvents = events.filter(e => e.type === 'scroll_tick');
    
    if (tickEvents.length < 2) {
      return { accuracy: 'insufficient_data' };
    }

    const intervals = [];
    for (let i = 1; i < tickEvents.length; i++) {
      intervals.push(tickEvents[i].timestamp - tickEvents[i - 1].timestamp);
    }

    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const deviations = intervals.map(i => Math.abs(i - 100)); // 100ms expected
    const maxDeviation = Math.max(...deviations);
    const avgDeviation = deviations.reduce((a, b) => a + b) / deviations.length;

    return {
      expectedInterval: 100,
      actualAvgInterval: avgInterval,
      maxDeviation,
      avgDeviation,
      consistency: maxDeviation < 50 ? 'good' : maxDeviation < 100 ? 'fair' : 'poor'
    };
  }

  /**
   * Grade overall performance
   */
  gradePerformance(events, duration) {
    const tickEvents = events.filter(e => e.type === 'scroll_tick');
    const expectedTicks = Math.floor(duration / 100); // 100ms intervals
    const actualTicks = tickEvents.length;
    
    const completeness = actualTicks / expectedTicks;
    
    let grade;
    if (completeness >= 0.95) grade = 'A'; // 95%+ completion
    else if (completeness >= 0.9) grade = 'B'; // 90%+ completion
    else if (completeness >= 0.8) grade = 'C'; // 80%+ completion
    else if (completeness >= 0.6) grade = 'D'; // 60%+ completion
    else grade = 'F'; // < 60% completion

    return {
      grade,
      completeness,
      expectedTicks,
      actualTicks
    };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    if (this.measurements.length === 0) {
      return 'No measurements recorded';
    }

    const report = {
      totalTests: this.measurements.length,
      summary: {},
      details: this.measurements
    };

    // Generate summary statistics
    const grades = this.measurements.map(m => m.analysis?.performanceGrade?.grade).filter(Boolean);
    const avgDuration = this.measurements.reduce((sum, m) => sum + m.duration, 0) / this.measurements.length;
    
    report.summary = {
      averageDuration: avgDuration,
      gradeDistribution: grades.reduce((acc, grade) => {
        acc[grade] = (acc[grade] || 0) + 1;
        return acc;
      }, {}),
      overallGrade: this.calculateOverallGrade(grades)
    };

    return report;
  }

  calculateOverallGrade(grades) {
    if (grades.length === 0) return 'N/A';
    
    const gradeValues = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const avgGradeValue = grades.reduce((sum, grade) => sum + gradeValues[grade], 0) / grades.length;
    
    if (avgGradeValue >= 3.5) return 'A';
    if (avgGradeValue >= 2.5) return 'B';
    if (avgGradeValue >= 1.5) return 'C';
    if (avgGradeValue >= 0.5) return 'D';
    return 'F';
  }
}

/**
 * Utility functions for network testing
 */
export const NetworkTestUtils = {
  /**
   * Wait for multiple clients to reach a specific state
   */
  waitForClientsSync: async (clients, condition, timeout = 5000) => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const allReady = clients.every(condition);
      if (allReady) return true;
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    throw new Error('Timeout waiting for clients to sync');
  },

  /**
   * Measure round-trip time for an event
   */
  measureRoundTrip: async (client, eventName, payload, responseEvent = 'snapshot') => {
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      const handler = () => {
        const endTime = performance.now();
        client.off(responseEvent, handler);
        resolve(endTime - startTime);
      };
      
      client.once(responseEvent, handler);
      client.emit(eventName, payload);
    });
  },

  /**
   * Create a realistic session simulation
   */
  createRealisticSession: async (clients, duration = 10000) => {
    const sessionId = `realistic-session-${Date.now()}`;
    const [leader, ...followers] = clients;
    
    // Setup session
    await Promise.all(clients.map(client => {
      return new Promise(resolve => {
        client.emit('join_session', { sessionId });
        client.once('snapshot', resolve);
      });
    }));

    // Set leader
    leader.emit('set_role', { sessionId, role: 'leader' });
    await new Promise(resolve => {
      leader.once('snapshot', (data) => {
        if (data.leaderSocketId === leader.id) resolve();
      });
    });

    // Simulate realistic band session activities
    const activities = [
      { time: 0, action: () => leader.emit('set_tempo', { sessionId, tempo: 120 }) },
      { time: 1000, action: () => leader.emit('play', { sessionId }) },
      { time: 3000, action: () => leader.emit('set_tempo', { sessionId, tempo: 110 }) },
      { time: 5000, action: () => leader.emit('pause', { sessionId }) },
      { time: 6000, action: () => leader.emit('set_tempo', { sessionId, tempo: 130 }) },
      { time: 7000, action: () => leader.emit('play', { sessionId }) },
      { time: 9000, action: () => leader.emit('pause', { sessionId }) }
    ];

    // Execute activities
    const promises = activities.map(({ time, action }) => {
      return new Promise(resolve => {
        setTimeout(() => {
          action();
          resolve();
        }, time);
      });
    });

    await Promise.all([
      ...promises,
      new Promise(resolve => setTimeout(resolve, duration))
    ]);

    return sessionId;
  }
};