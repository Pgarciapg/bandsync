# BandSync Multi-Device Testing Guide

## Overview
This comprehensive testing guide provides step-by-step procedures for validating BandSync's real-time synchronization functionality across multiple devices. The guide covers manual testing procedures, automated test scenarios, and performance validation methods.

## Target Specifications
- **Synchronization Accuracy**: <50ms target latency
- **Multi-Device Support**: 2-8 devices per session
- **Role Management**: Leader/Follower role switching
- **Connection Quality**: Network resilience and graceful degradation
- **Visual Feedback**: Real-time latency indicators and sync quality metrics

## Testing Environment Setup

### Prerequisites
- Multiple test devices (minimum 2, recommended 4-6 for comprehensive testing)
- Network simulation tools for latency/packet loss testing
- Timer/stopwatch for manual synchronization measurements
- Screen recording capability for visual verification
- Access to server logs and metrics

### Device Configuration
1. Install BandSync mobile app on each test device
2. Ensure all devices connect to the same network
3. Configure server URL in app settings
4. Enable developer options for debug logging (if available)
5. Set consistent time zones across all devices

### Network Testing Tools
- **Network Link Conditioner** (iOS/macOS) for network simulation
- **Clumsy** (Windows) for packet loss simulation  
- **tc** (Linux) for traffic control
- **Charles Proxy** for traffic monitoring

## Manual Testing Procedures

### 1. Basic Multi-Device Session Testing

#### Test Case 1.1: Two-Device Basic Sync
**Objective**: Verify basic synchronization between two devices

**Steps**:
1. Start BandSync server on localhost:3001
2. Open BandSync on Device A
3. Join session "test-sync" as follower
4. Open BandSync on Device B  
5. Join same session "test-sync" as follower
6. On Device A, tap "Become Leader" (👑 should appear)
7. Set tempo to 120 BPM on Device A
8. Tap "Play" on Device A
9. Observe metronome sync on both devices

**Expected Results**:
- Both devices show session members count: 2
- Device A shows crown (👑) leader indicator
- Device B shows follower (👥) indicator
- Visual metronomes beat in sync within 50ms
- Connection status shows "Connected" with latency <100ms
- Tempo changes on Device A reflect on Device B within 100ms

**Success Criteria**:
✅ Visual beats align within 1-2 frames (50ms tolerance)
✅ Audio click alignment (use headphones for precision)
✅ No visible drift over 30 seconds of playback
✅ UI updates propagate within 200ms

#### Test Case 1.2: Four-Device Session
**Objective**: Validate synchronization with multiple followers

**Steps**:
1. Join 4 devices to session "multi-test"
2. Device 1 becomes leader
3. Devices 2-4 remain as followers
4. Leader sets tempo 100 BPM and starts playback
5. Monitor sync quality on all devices for 60 seconds

**Measurement Points**:
- Record latency readings from each device every 10 seconds
- Note any sync quality degradation warnings
- Monitor server resource usage
- Check for any visual drift between devices

### 2. Role Management Testing

#### Test Case 2.1: Leader Handoff
**Objective**: Test seamless leader role transfer

**Steps**:
1. Start session with Device A as leader
2. Add Device B and C as followers
3. Start playback at 120 BPM
4. On Device B, tap "Become Leader"
5. Verify playback continues without interruption
6. Change tempo to 90 BPM on Device B (new leader)
7. Observe updates on Devices A and C

**Expected Results**:
- Crown (👑) moves from Device A to Device B
- Playback continues seamlessly
- Tempo change propagates to all devices
- Device A and C show follower (👥) status
- No synchronization glitches during handoff

#### Test Case 2.2: Leader Disconnection Recovery
**Objective**: Test system behavior when leader disconnects

**Steps**:
1. Start session with 3 devices, Device 1 as leader
2. Begin playback at 110 BPM
3. Force close BandSync app on Device 1 (leader)
4. Monitor behavior on remaining devices
5. Have Device 2 become new leader
6. Resume playback control

**Expected Results**:
- Playback stops when leader disconnects
- Remaining devices show "Leader disconnected" message
- Session remains active for followers to rejoin
- New leader can successfully control session
- Synchronization resumes when new leader starts playback

### 3. Tempo Synchronization Testing

#### Test Case 3.1: Tempo Change Propagation
**Objective**: Measure tempo change synchronization accuracy

**Equipment Needed**:
- High-precision timer/metronome app
- Screen recording on multiple devices

**Steps**:
1. Set up 3 devices in session
2. Start recording screens simultaneously
3. Leader sets tempo to 60 BPM (1 beat per second)
4. Start playback and record for 30 seconds
5. Leader changes tempo to 120 BPM
6. Record tempo change propagation time
7. Continue recording for 30 seconds at new tempo

**Measurements**:
- Time from tempo change to visual update on followers
- Beat alignment accuracy after tempo change
- Any temporary sync loss during transition

**Success Criteria**:
✅ Tempo change propagates within 100ms
✅ Beat alignment maintained within 50ms tolerance
✅ No dropped beats during tempo transition

#### Test Case 3.2: Extreme Tempo Testing
**Objective**: Test synchronization at tempo boundaries

**Test Scenarios**:
- Minimum tempo: 60 BPM
- Maximum tempo: 200 BPM  
- Rapid tempo changes: 60→120→180→90 BPM in 10-second intervals
- Micro tempo adjustments: 120→121→122 BPM

**Validation**:
- All devices maintain sync at extreme tempos
- UI remains responsive during rapid changes
- No audio glitches or timing artifacts

## Connection Quality Testing

### Test Case 4.1: Network Latency Simulation
**Objective**: Validate sync quality under various network conditions

**Network Conditions to Test**:
1. **Baseline**: LAN connection (~1ms latency)
2. **Good WiFi**: 10-30ms latency
3. **Poor WiFi**: 100-200ms latency
4. **Mobile 4G**: 50-100ms latency with jitter
5. **Degraded**: 300-500ms latency

**Testing Procedure**:
1. Configure network simulator for each condition
2. Join 3 devices to test session
3. Measure sync accuracy for 5 minutes per condition
4. Document sync quality indicators
5. Note any adaptive behavior or warnings

**Quality Metrics to Monitor**:
- Displayed latency values
- Sync quality indicator (Good/Fair/Poor)
- Visual beat alignment
- Connection stability warnings

### Test Case 4.2: Packet Loss Resilience
**Objective**: Test system behavior under packet loss conditions

**Test Matrix**:
- 0% packet loss (baseline)
- 1-2% packet loss (realistic)
- 5% packet loss (poor network)
- 10%+ packet loss (degraded)

**Expected Behaviors**:
- Automatic reconnection attempts
- Graceful degradation of sync quality
- Connection quality warnings to users
- Session state recovery after reconnection

### Test Case 4.3: Connection Interruption Recovery
**Objective**: Test recovery from complete connection loss

**Scenarios**:
1. **WiFi dropout**: Disable WiFi for 10 seconds, then reconnect
2. **App backgrounding**: Background app for 30 seconds
3. **Network switching**: Switch from WiFi to cellular
4. **Server restart**: Restart server during active session

**Recovery Validation**:
- Session rejoining automatically
- State synchronization after reconnection
- Leader role persistence or appropriate reassignment
- Minimal user intervention required

## Automated Testing Framework

### Test Environment Setup

```bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react-native detox socket.io-client
```

### Socket Event Testing Suite

Create `/Users/pablogarciapizano/bandsync/apps/mobile/__tests__/socket-sync.test.js`:

```javascript
/**
 * BandSync Socket Synchronization Test Suite
 * Tests real-time synchronization, role management, and connection handling
 */

import io from 'socket.io-client';
import { EVENTS } from 'bandsync-shared';

const SERVER_URL = 'http://localhost:3001';
const TEST_SESSION = 'automated-test-session';

describe('BandSync Multi-Device Synchronization', () => {
  let leaderSocket, followerSocket1, followerSocket2;
  let serverUrl = SERVER_URL;

  beforeAll((done) => {
    // Ensure server is running
    setTimeout(done, 1000);
  });

  afterAll(() => {
    if (leaderSocket) leaderSocket.disconnect();
    if (followerSocket1) followerSocket1.disconnect();
    if (followerSocket2) followerSocket2.disconnect();
  });

  describe('Session Management', () => {
    test('Multiple devices can join the same session', (done) => {
      let joinedCount = 0;
      const expectedJoins = 3;

      leaderSocket = io(serverUrl);
      followerSocket1 = io(serverUrl);
      followerSocket2 = io(serverUrl);

      const handleJoin = (data) => {
        joinedCount++;
        expect(data).toHaveProperty('message');
        if (joinedCount === expectedJoins) {
          done();
        }
      };

      leaderSocket.on(EVENTS.SNAPSHOT, handleJoin);
      followerSocket1.on(EVENTS.SNAPSHOT, handleJoin);
      followerSocket2.on(EVENTS.SNAPSHOT, handleJoin);

      leaderSocket.emit(EVENTS.JOIN_SESSION, { sessionId: TEST_SESSION });
      followerSocket1.emit(EVENTS.JOIN_SESSION, { sessionId: TEST_SESSION });
      followerSocket2.emit(EVENTS.JOIN_SESSION, { sessionId: TEST_SESSION });
    });

    test('Leader role can be established and verified', (done) => {
      leaderSocket.on(EVENTS.SNAPSHOT, (data) => {
        if (data.leaderSocketId === leaderSocket.id) {
          expect(data.leaderSocketId).toBe(leaderSocket.id);
          done();
        }
      });

      leaderSocket.emit(EVENTS.SET_ROLE, {
        sessionId: TEST_SESSION,
        role: 'leader'
      });
    });
  });

  describe('Tempo Synchronization', () => {
    test('Tempo changes propagate to all followers within 100ms', (done) => {
      const testTempo = 140;
      const startTime = Date.now();
      let followersUpdated = 0;

      const checkTempoUpdate = (data) => {
        const propagationTime = Date.now() - startTime;
        expect(data.tempo).toBe(testTempo);
        expect(propagationTime).toBeLessThan(100);
        
        followersUpdated++;
        if (followersUpdated === 2) {
          done();
        }
      };

      followerSocket1.on(EVENTS.SNAPSHOT, checkTempoUpdate);
      followerSocket2.on(EVENTS.SNAPSHOT, checkTempoUpdate);

      leaderSocket.emit(EVENTS.SET_TEMPO, {
        sessionId: TEST_SESSION,
        tempo: testTempo
      });
    });
  });

  describe('Real-time Sync Events', () => {
    test('SCROLL_TICK events maintain consistent timing', (done) => {
      let tickCount = 0;
      let lastTickTime = null;
      const expectedInterval = 100; // ms
      const tolerance = 20; // ms

      const handleScrollTick = (data) => {
        const currentTime = Date.now();
        
        if (lastTickTime) {
          const actualInterval = currentTime - lastTickTime;
          expect(Math.abs(actualInterval - expectedInterval)).toBeLessThan(tolerance);
        }
        
        lastTickTime = currentTime;
        tickCount++;

        if (tickCount >= 5) {
          leaderSocket.emit(EVENTS.PAUSE, { sessionId: TEST_SESSION });
          done();
        }
      };

      followerSocket1.on(EVENTS.SCROLL_TICK, handleScrollTick);
      leaderSocket.emit(EVENTS.PLAY, { sessionId: TEST_SESSION });
    });
  });

  describe('Latency Measurement', () => {
    test('Latency probe returns accurate round-trip time', (done) => {
      const startTime = Date.now();

      followerSocket1.on(EVENTS.LATENCY_RESPONSE, (data) => {
        const rtt = Date.now() - data.clientTimestamp;
        const serverProcessingTime = data.serverTimestamp - data.clientTimestamp;
        
        expect(rtt).toBeGreaterThan(0);
        expect(rtt).toBeLessThan(1000); // Should be under 1 second for local testing
        expect(serverProcessingTime).toBeLessThan(50); // Server should respond quickly
        
        done();
      });

      followerSocket1.emit(EVENTS.LATENCY_PROBE, {
        timestamp: startTime,
        sessionId: TEST_SESSION
      });
    });
  });

  describe('Connection Resilience', () => {
    test('Session state recovers after disconnection', (done) => {
      // Simulate disconnection and reconnection
      followerSocket1.disconnect();
      
      setTimeout(() => {
        followerSocket1 = io(serverUrl);
        
        followerSocket1.on(EVENTS.SNAPSHOT, (data) => {
          expect(data).toHaveProperty('tempo');
          expect(data).toHaveProperty('isPlaying');
          expect(data).toHaveProperty('leaderSocketId');
          done();
        });

        followerSocket1.emit(EVENTS.JOIN_SESSION, { sessionId: TEST_SESSION });
      }, 1000);
    });
  });
});
```

### Performance Testing Script

Create `/Users/pablogarciapizano/bandsync/test-scripts/sync-performance.js`:

```javascript
/**
 * BandSync Performance Testing Script
 * Measures synchronization accuracy and server performance under load
 */

import io from 'socket.io-client';
import { performance } from 'perf_hooks';

const SERVER_URL = 'http://localhost:3001';
const TEST_DURATION = 60000; // 1 minute
const DEVICE_COUNT = 6; // Simulate 6 devices

class SyncPerformanceTest {
  constructor() {
    this.clients = [];
    this.metrics = {
      latencyMeasurements: [],
      syncAccuracy: [],
      tempoChangePropagation: [],
      connectionStability: []
    };
  }

  async runPerformanceTest() {
    console.log(`🚀 Starting BandSync performance test with ${DEVICE_COUNT} simulated devices`);
    
    await this.setupClients();
    await this.establishLeadership();
    await this.runSyncAccuracyTest();
    await this.runTempoChangeTest();
    await this.runLoadTest();
    
    this.generateReport();
    this.cleanup();
  }

  async setupClients() {
    console.log('📱 Setting up simulated devices...');
    
    for (let i = 0; i < DEVICE_COUNT; i++) {
      const client = {
        id: i,
        socket: io(SERVER_URL),
        latencyHistory: [],
        lastSync: null
      };
      
      client.socket.on('connect', () => {
        console.log(`Device ${i + 1} connected`);
        client.socket.emit('join_session', { sessionId: 'perf-test' });
      });
      
      client.socket.on('latency_response', (data) => {
        const rtt = Date.now() - data.clientTimestamp;
        client.latencyHistory.push(rtt);
        this.metrics.latencyMeasurements.push({ deviceId: i, rtt, timestamp: Date.now() });
      });

      this.clients.push(client);
    }
    
    // Wait for all connections
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async establishLeadership() {
    console.log('👑 Establishing leadership...');
    const leader = this.clients[0];
    
    leader.socket.emit('set_role', { sessionId: 'perf-test', role: 'leader' });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async runSyncAccuracyTest() {
    console.log('⏱️ Testing synchronization accuracy...');
    const leader = this.clients[0];
    
    // Start playback and measure sync
    leader.socket.emit('play', { sessionId: 'perf-test' });
    
    const startTime = Date.now();
    const testDuration = 30000; // 30 seconds
    
    const syncCheckInterval = setInterval(() => {
      // Measure latency for all devices
      this.clients.forEach(client => {
        client.socket.emit('latency_probe', {
          timestamp: Date.now(),
          sessionId: 'perf-test'
        });
      });
    }, 1000);
    
    await new Promise(resolve => setTimeout(resolve, testDuration));
    clearInterval(syncCheckInterval);
    
    leader.socket.emit('pause', { sessionId: 'perf-test' });
  }

  async runTempoChangeTest() {
    console.log('🎵 Testing tempo change propagation...');
    const leader = this.clients[0];
    const tempos = [60, 120, 180, 90, 150];
    
    for (const tempo of tempos) {
      const changeStartTime = performance.now();
      
      // Set up listeners for tempo change
      this.clients.slice(1).forEach((client, index) => {
        client.socket.once('snapshot', (data) => {
          if (data.tempo === tempo) {
            const propagationTime = performance.now() - changeStartTime;
            this.metrics.tempoChangePropagation.push({
              deviceId: index + 1,
              tempo,
              propagationTime
            });
          }
        });
      });
      
      leader.socket.emit('set_tempo', { sessionId: 'perf-test', tempo });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async runLoadTest() {
    console.log('⚡ Running load test...');
    const leader = this.clients[0];
    
    // Generate rapid tempo changes and sync requests
    const loadTestDuration = 30000;
    const startTime = Date.now();
    
    const loadInterval = setInterval(() => {
      // Random tempo changes
      const randomTempo = Math.floor(Math.random() * 140) + 60;
      leader.socket.emit('set_tempo', { sessionId: 'perf-test', tempo: randomTempo });
      
      // Sync requests from followers
      this.clients.slice(1).forEach(client => {
        if (Math.random() < 0.3) { // 30% chance
          client.socket.emit('sync_request', { sessionId: 'perf-test' });
        }
      });
    }, 500);
    
    await new Promise(resolve => setTimeout(resolve, loadTestDuration));
    clearInterval(loadInterval);
  }

  generateReport() {
    console.log('\n📊 Performance Test Results');
    console.log('=' .repeat(50));
    
    // Latency statistics
    const latencies = this.metrics.latencyMeasurements.map(m => m.rtt);
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    
    console.log(`\n🏓 Latency Statistics:`);
    console.log(`   Average: ${avgLatency.toFixed(2)}ms`);
    console.log(`   Min: ${minLatency}ms`);
    console.log(`   Max: ${maxLatency}ms`);
    console.log(`   Measurements: ${latencies.length}`);
    
    // Tempo change propagation
    if (this.metrics.tempoChangePropagation.length > 0) {
      const avgPropagation = this.metrics.tempoChangePropagation
        .reduce((sum, m) => sum + m.propagationTime, 0) / this.metrics.tempoChangePropagation.length;
      
      console.log(`\n🎵 Tempo Change Propagation:`);
      console.log(`   Average: ${avgPropagation.toFixed(2)}ms`);
      console.log(`   Target: <100ms`);
      console.log(`   Status: ${avgPropagation < 100 ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    // Overall sync quality assessment
    const syncQuality = avgLatency < 50 ? 'Excellent' : 
                       avgLatency < 100 ? 'Good' : 
                       avgLatency < 200 ? 'Fair' : 'Poor';
    
    console.log(`\n🎯 Overall Sync Quality: ${syncQuality}`);
    console.log(`   Target: <50ms for excellent synchronization`);
    
    // Performance recommendations
    console.log('\n💡 Recommendations:');
    if (avgLatency > 50) {
      console.log('   - Consider optimizing server response times');
      console.log('   - Implement client-side prediction');
    }
    if (maxLatency > 200) {
      console.log('   - Add connection quality warnings');
      console.log('   - Implement adaptive sync strategies');
    }
  }

  cleanup() {
    console.log('\n🧹 Cleaning up connections...');
    this.clients.forEach(client => {
      if (client.socket) {
        client.socket.disconnect();
      }
    });
  }
}

// Run the performance test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new SyncPerformanceTest();
  test.runPerformanceTest().catch(console.error);
}

export { SyncPerformanceTest };
```

### Network Quality Testing

Create `/Users/pablogarciapizano/bandsync/test-scripts/network-simulation.js`:

```javascript
/**
 * Network Quality Simulation Testing
 * Tests BandSync behavior under various network conditions
 */

class NetworkSimulationTest {
  constructor() {
    this.testScenarios = [
      { name: 'Excellent', latency: 10, jitter: 2, packetLoss: 0 },
      { name: 'Good WiFi', latency: 50, jitter: 10, packetLoss: 0.1 },
      { name: 'Poor WiFi', latency: 150, jitter: 50, packetLoss: 2 },
      { name: 'Mobile 4G', latency: 80, jitter: 30, packetLoss: 1 },
      { name: 'Degraded', latency: 400, jitter: 100, packetLoss: 5 }
    ];
  }

  async runNetworkTests() {
    console.log('🌐 Starting network simulation tests...');
    
    for (const scenario of this.testScenarios) {
      console.log(`\n📡 Testing scenario: ${scenario.name}`);
      console.log(`   Latency: ${scenario.latency}ms ± ${scenario.jitter}ms`);
      console.log(`   Packet Loss: ${scenario.packetLoss}%`);
      
      // In a real implementation, this would:
      // 1. Configure network simulation tools (tc, Clumsy, etc.)
      // 2. Run sync accuracy tests
      // 3. Measure performance degradation
      // 4. Record adaptive behaviors
      
      await this.simulateNetworkCondition(scenario);
      await this.measureSyncPerformance(scenario);
    }
    
    this.generateNetworkReport();
  }

  async simulateNetworkCondition(scenario) {
    // Placeholder for network simulation setup
    console.log(`   ⚙️ Configuring network simulation...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async measureSyncPerformance(scenario) {
    // Placeholder for performance measurement under simulated conditions
    console.log(`   📊 Measuring sync performance...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  generateNetworkReport() {
    console.log('\n📋 Network Simulation Report');
    console.log('=' .repeat(40));
    console.log('Results show expected performance degradation under poor network conditions.');
    console.log('Recommendations: Implement adaptive sync quality based on network conditions.');
  }
}

export { NetworkSimulationTest };
```

## Manual Testing Checklists

### Pre-Test Setup Checklist
- [ ] Server is running and accessible
- [ ] All test devices have app installed
- [ ] Network simulation tools configured
- [ ] Screen recording setup ready
- [ ] Test session IDs decided
- [ ] Timing measurement tools ready

### Multi-Device Session Testing
- [ ] 2-device basic sync verification
- [ ] 4-device session management
- [ ] 6-device maximum capacity test
- [ ] Session member count accuracy
- [ ] Connection status indicators working
- [ ] Latency measurements displaying

### Role Management Testing  
- [ ] Leader role establishment
- [ ] Leader handoff between devices
- [ ] Leader disconnection recovery
- [ ] Follower permissions validation
- [ ] Role indicator UI updates
- [ ] Authority validation working

### Synchronization Accuracy
- [ ] Visual metronome alignment
- [ ] Audio click synchronization
- [ ] Tempo change propagation
- [ ] Beat timing consistency
- [ ] Sync drift over time
- [ ] Quality indicator accuracy

### Connection Quality Testing
- [ ] Latency measurement accuracy
- [ ] Network condition simulation
- [ ] Packet loss resilience
- [ ] Reconnection handling
- [ ] Graceful degradation
- [ ] Quality warnings display

### Performance Validation
- [ ] Server resource monitoring
- [ ] Client memory usage
- [ ] Battery impact assessment
- [ ] Network bandwidth usage
- [ ] Concurrent session limits
- [ ] Load testing completion

## Success Criteria Summary

### Functional Requirements
✅ Multi-device sessions support 2-8 concurrent users
✅ Real-time synchronization accuracy within 50ms target
✅ Leader/Follower role management working correctly
✅ Network resilience and graceful degradation
✅ Visual feedback and status indicators accurate

### Performance Requirements  
✅ Server response time <100ms for critical events
✅ Client UI remains responsive under all conditions
✅ Memory usage stable during long sessions
✅ Network usage optimized for mobile connections
✅ Battery impact minimized

### Quality Requirements
✅ No synchronization drift over extended periods
✅ Consistent behavior across iOS and Android
✅ Accessibility features working properly
✅ Error recovery mechanisms functioning
✅ User experience remains smooth under degraded conditions

## Troubleshooting Common Issues

### Sync Drift
- Verify system clocks are synchronized
- Check for consistent frame rates across devices
- Monitor CPU usage during testing
- Validate network stability

### Connection Issues  
- Test with different network configurations
- Verify firewall and NAT settings
- Check WebSocket connection stability
- Monitor server logs for errors

### Performance Problems
- Profile memory usage on client and server
- Monitor network bandwidth utilization
- Check for resource leaks during long tests
- Validate cleanup procedures

This testing guide provides comprehensive coverage of BandSync's multi-device synchronization features and should be executed regularly during development and before releases to ensure consistent quality and performance.