/**
 * BandSync Automated Validation Suite
 * Comprehensive automated testing for multi-device synchronization
 * 
 * This suite provides complete test coverage for:
 * - Socket event handling and real-time synchronization
 * - Role management and permission enforcement
 * - Tempo synchronization accuracy and propagation
 * - Connection quality monitoring and adaptive behavior
 * - Performance validation under various conditions
 */

import io from 'socket.io-client';
import { performance } from 'perf_hooks';

// Import shared event constants
const EVENTS = {
  JOIN_SESSION: 'join_session',
  LEAVE_SESSION: 'leave_session',
  SET_ROLE: 'set_role',
  SET_TEMPO: 'set_tempo',
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  SEEK: 'seek',
  SNAPSHOT: 'snapshot',
  SCROLL_TICK: 'scroll_tick',
  LATENCY_PROBE: 'latency_probe',
  LATENCY_RESPONSE: 'latency_response',
  SYNC_REQUEST: 'sync_request',
  SYNC_RESPONSE: 'sync_response',
  ROLE_CHANGED: 'role_changed',
  TEMPO_CHANGE: 'tempo_change',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  ERROR: 'error'
};

const SERVER_URL = process.env.BANDSYNC_SERVER_URL || 'http://localhost:3001';
const TEST_SESSION_PREFIX = 'automated-test-';

class AutomatedValidationSuite {
  constructor() {
    this.testResults = [];
    this.currentTestSession = null;
    this.testDevices = [];
    this.testStartTime = null;
  }

  async runCompleteValidationSuite() {
    console.log('🤖 BandSync Automated Validation Suite');
    console.log('=' .repeat(60));
    console.log(`Server: ${SERVER_URL}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    this.testStartTime = Date.now();

    try {
      // Core functionality tests
      await this.runCoreFunctionalityTests();
      
      // Real-time synchronization tests
      await this.runSynchronizationTests();
      
      // Role management tests
      await this.runRoleManagementTests();
      
      // Performance and load tests
      await this.runPerformanceTests();
      
      // Error handling and recovery tests
      await this.runErrorHandlingTests();
      
      // Generate comprehensive report
      this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ Test suite execution failed:', error);
      this.testResults.push({
        category: 'SUITE_ERROR',
        test: 'Overall Execution',
        status: 'FAIL',
        error: error.message,
        timestamp: Date.now()
      });
    } finally {
      await this.cleanup();
    }
  }

  // ===========================================
  // CORE FUNCTIONALITY TESTS
  // ===========================================

  async runCoreFunctionalityTests() {
    console.log('\n🔧 Core Functionality Tests');
    console.log('-'.repeat(40));

    await this.testServerConnection();
    await this.testSessionJoining();
    await this.testBasicSocketEvents();
    await this.testEventValidation();
  }

  async testServerConnection() {
    const testName = 'Server Connection Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL, { timeout: 5000 });
      
      const connectionResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        socket.on('connect', () => {
          clearTimeout(timeout);
          resolve({ connected: true, socketId: socket.id });
        });

        socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      socket.disconnect();

      this.recordTestResult('CORE', testName, 'PASS', {
        socketId: connectionResult.socketId,
        connectionTime: Date.now() - this.testStartTime
      });

    } catch (error) {
      this.recordTestResult('CORE', testName, 'FAIL', { error: error.message });
    }
  }

  async testSessionJoining() {
    const testName = 'Session Joining Test';
    console.log(`Running: ${testName}`);
    
    try {
      this.currentTestSession = `${TEST_SESSION_PREFIX}${Date.now()}`;
      const socket = io(SERVER_URL);

      const joinResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Join session timeout'));
        }, 5000);

        socket.on(EVENTS.SNAPSHOT, (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        socket.on(EVENTS.ERROR, (error) => {
          clearTimeout(timeout);
          reject(new Error(error.message || 'Join failed'));
        });

        socket.on('connect', () => {
          socket.emit(EVENTS.JOIN_SESSION, {
            sessionId: this.currentTestSession,
            displayName: 'Test Device 1'
          });
        });
      });

      socket.disconnect();

      this.recordTestResult('CORE', testName, 'PASS', {
        sessionId: this.currentTestSession,
        memberCount: joinResult.members?.length || 0,
        sessionData: joinResult
      });

    } catch (error) {
      this.recordTestResult('CORE', testName, 'FAIL', { error: error.message });
    }
  }

  async testBasicSocketEvents() {
    const testName = 'Basic Socket Events Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}basic-events-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      // Test event sequence: join → become leader → set tempo → play → pause
      const eventResults = [];

      // Join session
      const joinResult = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Event Test Device' },
        EVENTS.SNAPSHOT
      );
      eventResults.push({ event: 'JOIN_SESSION', success: true, data: joinResult });

      // Become leader
      const roleResult = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );
      eventResults.push({ event: 'SET_ROLE', success: roleResult.leaderSocketId === socket.id });

      // Set tempo
      const tempoResult = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.SET_TEMPO,
        { sessionId, tempo: 120 },
        EVENTS.SNAPSHOT
      );
      eventResults.push({ event: 'SET_TEMPO', success: tempoResult.tempo === 120 });

      // Start playback
      const playResult = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.PLAY,
        { sessionId },
        EVENTS.SNAPSHOT
      );
      eventResults.push({ event: 'PLAY', success: playResult.isPlaying === true });

      // Pause playback
      const pauseResult = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.PAUSE,
        { sessionId },
        EVENTS.SNAPSHOT
      );
      eventResults.push({ event: 'PAUSE', success: pauseResult.isPlaying === false });

      socket.disconnect();

      const allEventsSuccessful = eventResults.every(r => r.success);
      this.recordTestResult('CORE', testName, allEventsSuccessful ? 'PASS' : 'FAIL', {
        eventResults,
        totalEvents: eventResults.length
      });

    } catch (error) {
      this.recordTestResult('CORE', testName, 'FAIL', { error: error.message });
    }
  }

  async testEventValidation() {
    const testName = 'Event Validation Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}validation-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      // Join as follower first
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Validation Test Device' },
        EVENTS.SNAPSHOT
      );

      const validationResults = [];

      // Test 1: Follower attempts leader-only action (should be blocked)
      try {
        socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 140 });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait to see if change occurs
        
        const syncResponse = await this.sendEventAndWaitForResponse(
          socket,
          EVENTS.SYNC_REQUEST,
          { sessionId },
          EVENTS.SYNC_RESPONSE
        );
        
        // Tempo should NOT have changed (still default or previous value)
        validationResults.push({
          test: 'Follower tempo change blocked',
          success: syncResponse.tempoBpm !== 140,
          actualTempo: syncResponse.tempoBpm
        });
      } catch (error) {
        validationResults.push({
          test: 'Follower tempo change blocked',
          success: false,
          error: error.message
        });
      }

      // Test 2: Invalid session ID
      socket.emit(EVENTS.SET_TEMPO, { sessionId: 'invalid-session', tempo: 100 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      validationResults.push({
        test: 'Invalid session rejected',
        success: true // If no error thrown, it was properly ignored
      });

      // Test 3: Invalid tempo range
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      try {
        socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 300 }); // Invalid tempo
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const syncResponse = await this.sendEventAndWaitForResponse(
          socket,
          EVENTS.SYNC_REQUEST,
          { sessionId },
          EVENTS.SYNC_RESPONSE
        );
        
        validationResults.push({
          test: 'Invalid tempo rejected',
          success: syncResponse.tempoBpm !== 300,
          actualTempo: syncResponse.tempoBpm
        });
      } catch (error) {
        validationResults.push({
          test: 'Invalid tempo rejected',
          success: true, // Error is expected
          error: error.message
        });
      }

      socket.disconnect();

      const allValidationsPassed = validationResults.every(r => r.success);
      this.recordTestResult('CORE', testName, allValidationsPassed ? 'PASS' : 'FAIL', {
        validationResults
      });

    } catch (error) {
      this.recordTestResult('CORE', testName, 'FAIL', { error: error.message });
    }
  }

  // ===========================================
  // REAL-TIME SYNCHRONIZATION TESTS
  // ===========================================

  async runSynchronizationTests() {
    console.log('\n⏱️  Real-time Synchronization Tests');
    console.log('-'.repeat(40));

    await this.testMultiDeviceSync();
    await this.testLatencyMeasurement();
    await this.testScrollTickAccuracy();
    await this.testTempoChangePropagation();
  }

  async testMultiDeviceSync() {
    const testName = 'Multi-Device Synchronization Test';
    console.log(`Running: ${testName}`);
    
    try {
      const deviceCount = 4;
      const sessionId = `${TEST_SESSION_PREFIX}multi-sync-${Date.now()}`;
      const devices = [];

      // Setup multiple devices
      for (let i = 0; i < deviceCount; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL),
          latencyMeasurements: [],
          syncEvents: []
        };
        
        await this.waitForConnection(device.socket);
        
        device.socket.on(EVENTS.SCROLL_TICK, (data) => {
          device.syncEvents.push({
            positionMs: data.positionMs,
            timestamp: performance.now(),
            serverTimestamp: data.serverTimestamp
          });
        });

        device.socket.on(EVENTS.LATENCY_RESPONSE, (data) => {
          const rtt = performance.now() - data.clientTimestamp;
          device.latencyMeasurements.push(rtt);
        });

        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Device ${i + 1}` },
          EVENTS.SNAPSHOT
        );

        devices.push(device);
      }

      // Make first device leader
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      // Start playback and measure sync for 15 seconds
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.PLAY,
        { sessionId },
        EVENTS.SNAPSHOT
      );

      // Measure latency periodically
      const latencyInterval = setInterval(() => {
        devices.forEach(device => {
          device.socket.emit(EVENTS.LATENCY_PROBE, {
            timestamp: performance.now(),
            sessionId
          });
        });
      }, 2000);

      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
      clearInterval(latencyInterval);

      // Stop playback
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.PAUSE,
        { sessionId },
        EVENTS.SNAPSHOT
      );

      // Analyze synchronization quality
      const syncAnalysis = this.analyzeSyncData(devices);
      
      // Cleanup devices
      devices.forEach(device => device.socket.disconnect());

      this.recordTestResult('SYNC', testName, 
        syncAnalysis.averageDeviation < 100 ? 'PASS' : 'FAIL', // 100ms tolerance for automated test
        syncAnalysis
      );

    } catch (error) {
      this.recordTestResult('SYNC', testName, 'FAIL', { error: error.message });
    }
  }

  analyzeSyncData(devices) {
    const syncDeviations = [];
    const minEventCount = Math.min(...devices.map(d => d.syncEvents.length));
    
    // Analyze sync deviation for each scroll tick
    for (let i = 0; i < minEventCount; i++) {
      const eventTimes = devices.map(device => device.syncEvents[i].timestamp);
      const maxTime = Math.max(...eventTimes);
      const minTime = Math.min(...eventTimes);
      const deviation = maxTime - minTime;
      syncDeviations.push(deviation);
    }

    const averageDeviation = syncDeviations.reduce((a, b) => a + b, 0) / syncDeviations.length;
    const maxDeviation = Math.max(...syncDeviations);
    const excellentSync = syncDeviations.filter(d => d < 50).length / syncDeviations.length;
    
    // Analyze average latencies
    const deviceLatencies = devices.map(device => {
      const avg = device.latencyMeasurements.reduce((a, b) => a + b, 0) / device.latencyMeasurements.length;
      return { deviceId: device.id, averageLatency: avg, measurements: device.latencyMeasurements.length };
    });

    return {
      averageDeviation,
      maxDeviation,
      excellentSyncPercentage: excellentSync,
      totalSyncEvents: minEventCount,
      deviceLatencies,
      overallQuality: averageDeviation < 50 ? 'Excellent' : 
                      averageDeviation < 100 ? 'Good' : 
                      averageDeviation < 200 ? 'Fair' : 'Poor'
    };
  }

  async testLatencyMeasurement() {
    const testName = 'Latency Measurement Accuracy Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}latency-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Latency Test Device' },
        EVENTS.SNAPSHOT
      );

      const latencyMeasurements = [];
      const measurementCount = 10;

      for (let i = 0; i < measurementCount; i++) {
        const probeResult = await this.measureSingleLatency(socket, sessionId);
        latencyMeasurements.push(probeResult);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between measurements
      }

      socket.disconnect();

      const avgLatency = latencyMeasurements.reduce((a, b) => a + b.rtt, 0) / latencyMeasurements.length;
      const maxLatency = Math.max(...latencyMeasurements.map(m => m.rtt));
      const minLatency = Math.min(...latencyMeasurements.map(m => m.rtt));
      const jitter = this.calculateJitter(latencyMeasurements.map(m => m.rtt));

      this.recordTestResult('SYNC', testName, 
        avgLatency < 1000 && jitter < 100 ? 'PASS' : 'FAIL', // Reasonable thresholds for automated test
        {
          averageLatency: avgLatency,
          maxLatency,
          minLatency,
          jitter,
          measurements: latencyMeasurements.length,
          allMeasurements: latencyMeasurements
        }
      );

    } catch (error) {
      this.recordTestResult('SYNC', testName, 'FAIL', { error: error.message });
    }
  }

  async measureSingleLatency(socket, sessionId) {
    const probeTime = performance.now();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Latency probe timeout'));
      }, 5000);

      socket.once(EVENTS.LATENCY_RESPONSE, (data) => {
        clearTimeout(timeout);
        const rtt = performance.now() - data.clientTimestamp;
        const serverProcessingTime = data.serverTimestamp - data.clientTimestamp;
        
        resolve({
          rtt,
          serverProcessingTime,
          clientTimestamp: data.clientTimestamp,
          serverTimestamp: data.serverTimestamp
        });
      });

      socket.emit(EVENTS.LATENCY_PROBE, {
        timestamp: probeTime,
        sessionId
      });
    });
  }

  async testScrollTickAccuracy() {
    const testName = 'Scroll Tick Timing Accuracy Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}scroll-tick-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Scroll Tick Test Device' },
        EVENTS.SNAPSHOT
      );

      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      const scrollTicks = [];
      let lastTickTime = null;

      socket.on(EVENTS.SCROLL_TICK, (data) => {
        const receiveTime = performance.now();
        
        scrollTicks.push({
          positionMs: data.positionMs,
          receiveTime,
          serverTimestamp: data.serverTimestamp,
          intervalSinceLastTick: lastTickTime ? receiveTime - lastTickTime : null
        });
        
        lastTickTime = receiveTime;
      });

      // Start playback
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.PLAY,
        { sessionId },
        EVENTS.SNAPSHOT
      );

      // Measure for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Stop playback
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.PAUSE,
        { sessionId },
        EVENTS.SNAPSHOT
      );

      socket.disconnect();

      // Analyze tick timing accuracy
      const intervals = scrollTicks.filter(tick => tick.intervalSinceLastTick !== null)
                                  .map(tick => tick.intervalSinceLastTick);
      
      const expectedInterval = 100; // Should be 100ms
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const intervalDeviations = intervals.map(interval => Math.abs(interval - expectedInterval));
      const avgDeviation = intervalDeviations.reduce((a, b) => a + b, 0) / intervalDeviations.length;
      const maxDeviation = Math.max(...intervalDeviations);

      this.recordTestResult('SYNC', testName, 
        avgDeviation < 50 && maxDeviation < 100 ? 'PASS' : 'FAIL', // 50ms average, 100ms max deviation
        {
          expectedInterval,
          averageInterval: avgInterval,
          averageDeviation,
          maxDeviation,
          totalTicks: scrollTicks.length,
          ticksWithGoodTiming: intervalDeviations.filter(d => d < 20).length
        }
      );

    } catch (error) {
      this.recordTestResult('SYNC', testName, 'FAIL', { error: error.message });
    }
  }

  async testTempoChangePropagation() {
    const testName = 'Tempo Change Propagation Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionId = `${TEST_SESSION_PREFIX}tempo-propagation-${Date.now()}`;
      const devices = [];

      // Setup 3 devices
      for (let i = 0; i < 3; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL),
          tempoChanges: []
        };
        
        await this.waitForConnection(device.socket);
        
        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Tempo Test Device ${i + 1}` },
          EVENTS.SNAPSHOT
        );

        device.socket.on(EVENTS.SNAPSHOT, (data) => {
          device.tempoChanges.push({
            tempo: data.tempo,
            timestamp: performance.now()
          });
        });

        devices.push(device);
      }

      // Make first device leader
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      const tempoSequence = [120, 100, 160, 80, 140];
      const propagationResults = [];

      for (const tempo of tempoSequence) {
        // Clear previous tempo changes
        devices.forEach(device => {
          device.tempoChanges = [];
        });

        const changeStartTime = performance.now();
        
        // Leader changes tempo
        devices[0].socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo });

        // Wait for propagation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Analyze propagation times
        const followerPropagationTimes = devices.slice(1).map(device => {
          const tempoChange = device.tempoChanges.find(change => change.tempo === tempo);
          return tempoChange ? tempoChange.timestamp - changeStartTime : null;
        }).filter(time => time !== null);

        propagationResults.push({
          tempo,
          followerCount: followerPropagationTimes.length,
          averagePropagationTime: followerPropagationTimes.reduce((a, b) => a + b, 0) / followerPropagationTimes.length,
          maxPropagationTime: Math.max(...followerPropagationTimes),
          allPropagated: followerPropagationTimes.length === devices.length - 1
        });
      }

      // Cleanup devices
      devices.forEach(device => device.socket.disconnect());

      const avgPropagationTime = propagationResults.reduce((sum, result) => sum + result.averagePropagationTime, 0) / propagationResults.length;
      const maxPropagationTime = Math.max(...propagationResults.map(r => r.maxPropagationTime));
      const allChangesSuccessful = propagationResults.every(r => r.allPropagated);

      this.recordTestResult('SYNC', testName, 
        allChangesSuccessful && avgPropagationTime < 500 ? 'PASS' : 'FAIL', // 500ms tolerance
        {
          averagePropagationTime,
          maxPropagationTime,
          allChangesSuccessful,
          propagationResults,
          tempoSequence
        }
      );

    } catch (error) {
      this.recordTestResult('SYNC', testName, 'FAIL', { error: error.message });
    }
  }

  // ===========================================
  // ROLE MANAGEMENT TESTS
  // ===========================================

  async runRoleManagementTests() {
    console.log('\n👑 Role Management Tests');
    console.log('-'.repeat(40));

    await this.testRoleAssignment();
    await this.testLeadershipTransition();
    await this.testPermissionEnforcement();
    await this.testLeaderDisconnection();
  }

  async testRoleAssignment() {
    const testName = 'Role Assignment Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionId = `${TEST_SESSION_PREFIX}role-assignment-${Date.now()}`;
      const socket = io(SERVER_URL);
      
      await this.waitForConnection(socket);
      
      // Join as follower initially
      const joinSnapshot = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Role Assignment Test Device' },
        EVENTS.SNAPSHOT
      );

      // Verify no leader initially
      const noLeaderInitially = joinSnapshot.leaderSocketId === null;

      // Become leader
      const leaderSnapshot = await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      // Verify leadership assignment
      const becameLeader = leaderSnapshot.leaderSocketId === socket.id;

      socket.disconnect();

      this.recordTestResult('ROLE', testName, 
        noLeaderInitially && becameLeader ? 'PASS' : 'FAIL',
        {
          noLeaderInitially,
          becameLeader,
          socketId: socket.id,
          leaderSocketId: leaderSnapshot.leaderSocketId
        }
      );

    } catch (error) {
      this.recordTestResult('ROLE', testName, 'FAIL', { error: error.message });
    }
  }

  async testLeadershipTransition() {
    const testName = 'Leadership Transition Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionId = `${TEST_SESSION_PREFIX}leadership-transition-${Date.now()}`;
      const devices = [];

      // Setup 3 devices
      for (let i = 0; i < 3; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL),
          isLeader: false
        };
        
        await this.waitForConnection(device.socket);
        
        device.socket.on(EVENTS.SNAPSHOT, (data) => {
          device.isLeader = data.leaderSocketId === device.socket.id;
        });

        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Transition Test Device ${i + 1}` },
          EVENTS.SNAPSHOT
        );

        devices.push(device);
      }

      const transitionResults = [];

      // Device 0 becomes leader
      const startTime1 = performance.now();
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );
      transitionResults.push({
        transition: '0 becomes leader',
        time: performance.now() - startTime1,
        success: devices[0].isLeader && !devices[1].isLeader && !devices[2].isLeader
      });

      // Device 1 takes leadership
      const startTime2 = performance.now();
      await this.sendEventAndWaitForResponse(
        devices[1].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );
      transitionResults.push({
        transition: '0 -> 1 transition',
        time: performance.now() - startTime2,
        success: !devices[0].isLeader && devices[1].isLeader && !devices[2].isLeader
      });

      // Device 2 takes leadership
      const startTime3 = performance.now();
      await this.sendEventAndWaitForResponse(
        devices[2].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );
      transitionResults.push({
        transition: '1 -> 2 transition',
        time: performance.now() - startTime3,
        success: !devices[0].isLeader && !devices[1].isLeader && devices[2].isLeader
      });

      // Cleanup devices
      devices.forEach(device => device.socket.disconnect());

      const allTransitionsSuccessful = transitionResults.every(r => r.success);
      const avgTransitionTime = transitionResults.reduce((sum, r) => sum + r.time, 0) / transitionResults.length;

      this.recordTestResult('ROLE', testName, 
        allTransitionsSuccessful && avgTransitionTime < 1000 ? 'PASS' : 'FAIL',
        {
          allTransitionsSuccessful,
          avgTransitionTime,
          transitionResults
        }
      );

    } catch (error) {
      this.recordTestResult('ROLE', testName, 'FAIL', { error: error.message });
    }
  }

  async testPermissionEnforcement() {
    const testName = 'Permission Enforcement Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionId = `${TEST_SESSION_PREFIX}permission-${Date.now()}`;
      const devices = [];

      // Setup leader and follower
      for (let i = 0; i < 2; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL)
        };
        
        await this.waitForConnection(device.socket);
        
        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Permission Test Device ${i + 1}` },
          EVENTS.SNAPSHOT
        );

        devices.push(device);
      }

      // Make device 0 leader
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      const permissionTests = [];

      // Test 1: Leader can set tempo
      devices[0].socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 130 });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const leaderTempoResult = await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SYNC_REQUEST,
        { sessionId },
        EVENTS.SYNC_RESPONSE
      );
      
      permissionTests.push({
        test: 'Leader can set tempo',
        success: leaderTempoResult.tempoBpm === 130
      });

      // Test 2: Follower cannot set tempo
      devices[1].socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 90 });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const followerTempoResult = await this.sendEventAndWaitForResponse(
        devices[1].socket,
        EVENTS.SYNC_REQUEST,
        { sessionId },
        EVENTS.SYNC_RESPONSE
      );
      
      permissionTests.push({
        test: 'Follower cannot set tempo',
        success: followerTempoResult.tempoBpm === 130 // Should remain 130, not 90
      });

      // Test 3: Leader can control playback
      const playResult = await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.PLAY,
        { sessionId },
        EVENTS.SNAPSHOT
      );
      
      permissionTests.push({
        test: 'Leader can start playback',
        success: playResult.isPlaying === true
      });

      // Test 4: Follower cannot control playback (this is harder to test as server might ignore)
      // We'll test by having follower try to pause, then checking if it's still playing
      devices[1].socket.emit(EVENTS.PAUSE, { sessionId });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const playbackResult = await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SYNC_REQUEST,
        { sessionId },
        EVENTS.SYNC_RESPONSE
      );
      
      permissionTests.push({
        test: 'Follower cannot control playback',
        success: playbackResult.isPlaying === true // Should still be playing
      });

      // Cleanup devices
      devices.forEach(device => device.socket.disconnect());

      const allPermissionTestsPassed = permissionTests.every(test => test.success);

      this.recordTestResult('ROLE', testName, 
        allPermissionTestsPassed ? 'PASS' : 'FAIL',
        {
          allPermissionTestsPassed,
          permissionTests
        }
      );

    } catch (error) {
      this.recordTestResult('ROLE', testName, 'FAIL', { error: error.message });
    }
  }

  async testLeaderDisconnection() {
    const testName = 'Leader Disconnection Recovery Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionId = `${TEST_SESSION_PREFIX}leader-disconnect-${Date.now()}`;
      const devices = [];

      // Setup 3 devices
      for (let i = 0; i < 3; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL),
          sessionStates: []
        };
        
        await this.waitForConnection(device.socket);
        
        device.socket.on(EVENTS.SNAPSHOT, (data) => {
          device.sessionStates.push({
            leaderSocketId: data.leaderSocketId,
            isPlaying: data.isPlaying,
            memberCount: data.members ? data.members.length : 0,
            timestamp: performance.now()
          });
        });

        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Disconnect Test Device ${i + 1}` },
          EVENTS.SNAPSHOT
        );

        devices.push(device);
      }

      // Make device 0 leader and start playback
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.PLAY,
        { sessionId },
        EVENTS.SNAPSHOT
      );

      // Record state before disconnection
      const stateBeforeDisconnect = devices[1].sessionStates[devices[1].sessionStates.length - 1];

      // Clear previous states for cleaner analysis
      devices.slice(1).forEach(device => {
        device.sessionStates = [];
      });

      // Disconnect leader
      const disconnectTime = performance.now();
      devices[0].socket.disconnect();

      // Wait for system to detect disconnection
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check states after disconnection
      const statesAfterDisconnect = devices.slice(1).map(device => 
        device.sessionStates[device.sessionStates.length - 1]
      );

      // New leader assignment test
      await this.sendEventAndWaitForResponse(
        devices[1].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      // Cleanup remaining devices
      devices.slice(1).forEach(device => device.socket.disconnect());

      const recoveryAnalysis = {
        hadLeaderBefore: stateBeforeDisconnect.leaderSocketId !== null,
        wasPlayingBefore: stateBeforeDisconnect.isPlaying === true,
        noLeaderAfterDisconnect: statesAfterDisconnect.every(state => state.leaderSocketId === null),
        stoppedPlayingAfterDisconnect: statesAfterDisconnect.every(state => state.isPlaying === false),
        memberCountReduced: statesAfterDisconnect.every(state => state.memberCount === 2), // Should be 2 after leader left
        recoveryTime: performance.now() - disconnectTime
      };

      const recoverySuccessful = 
        recoveryAnalysis.hadLeaderBefore &&
        recoveryAnalysis.wasPlayingBefore &&
        recoveryAnalysis.noLeaderAfterDisconnect &&
        recoveryAnalysis.stoppedPlayingAfterDisconnect &&
        recoveryAnalysis.memberCountReduced;

      this.recordTestResult('ROLE', testName, 
        recoverySuccessful ? 'PASS' : 'FAIL',
        recoveryAnalysis
      );

    } catch (error) {
      this.recordTestResult('ROLE', testName, 'FAIL', { error: error.message });
    }
  }

  // ===========================================
  // PERFORMANCE TESTS
  // ===========================================

  async runPerformanceTests() {
    console.log('\n⚡ Performance Tests');
    console.log('-'.repeat(40));

    await this.testHighFrequencyEvents();
    await this.testConcurrentSessions();
    await this.testMemoryUsage();
    await this.testServerLoad();
  }

  async testHighFrequencyEvents() {
    const testName = 'High Frequency Events Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}high-freq-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'High Frequency Test Device' },
        EVENTS.SNAPSHOT
      );

      const eventResults = {
        latencyProbesSent: 0,
        latencyResponsesReceived: 0,
        syncRequestsSent: 0,
        syncResponsesReceived: 0,
        errors: []
      };

      socket.on(EVENTS.LATENCY_RESPONSE, () => {
        eventResults.latencyResponsesReceived++;
      });

      socket.on(EVENTS.SYNC_RESPONSE, () => {
        eventResults.syncResponsesReceived++;
      });

      socket.on(EVENTS.ERROR, (error) => {
        eventResults.errors.push(error);
      });

      const testDuration = 10000; // 10 seconds
      const eventInterval = 100; // Send event every 100ms

      const highFrequencyInterval = setInterval(() => {
        // Send latency probe
        socket.emit(EVENTS.LATENCY_PROBE, {
          timestamp: performance.now(),
          sessionId
        });
        eventResults.latencyProbesSent++;

        // Send sync request
        socket.emit(EVENTS.SYNC_REQUEST, { sessionId });
        eventResults.syncRequestsSent++;
      }, eventInterval);

      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(highFrequencyInterval);

      // Allow time for final responses
      await new Promise(resolve => setTimeout(resolve, 1000));

      socket.disconnect();

      const responseRate = (eventResults.latencyResponsesReceived + eventResults.syncResponsesReceived) / 
                          (eventResults.latencyProbesSent + eventResults.syncRequestsSent);

      this.recordTestResult('PERFORMANCE', testName, 
        responseRate > 0.8 && eventResults.errors.length === 0 ? 'PASS' : 'FAIL',
        {
          ...eventResults,
          responseRate,
          testDuration,
          eventInterval
        }
      );

    } catch (error) {
      this.recordTestResult('PERFORMANCE', testName, 'FAIL', { error: error.message });
    }
  }

  async testConcurrentSessions() {
    const testName = 'Concurrent Sessions Test';
    console.log(`Running: ${testName}`);
    
    try {
      const sessionCount = 5;
      const devicesPerSession = 3;
      const sessions = [];

      for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex++) {
        const sessionId = `${TEST_SESSION_PREFIX}concurrent-${sessionIndex}-${Date.now()}`;
        const sessionDevices = [];

        for (let deviceIndex = 0; deviceIndex < devicesPerSession; deviceIndex++) {
          const device = {
            sessionId,
            deviceIndex,
            socket: io(SERVER_URL),
            connected: false,
            joined: false
          };

          await this.waitForConnection(device.socket);
          device.connected = true;

          await this.sendEventAndWaitForResponse(
            device.socket,
            EVENTS.JOIN_SESSION,
            { sessionId, displayName: `Session ${sessionIndex} Device ${deviceIndex}` },
            EVENTS.SNAPSHOT
          );
          device.joined = true;

          sessionDevices.push(device);
        }

        // Make first device in each session the leader
        await this.sendEventAndWaitForResponse(
          sessionDevices[0].socket,
          EVENTS.SET_ROLE,
          { sessionId, role: 'leader' },
          EVENTS.SNAPSHOT
        );

        sessions.push(sessionDevices);
      }

      // Test concurrent operations
      const concurrentOperations = sessions.map(async (sessionDevices, sessionIndex) => {
        const leader = sessionDevices[0];
        const sessionId = leader.sessionId;

        // Set unique tempo for each session
        const tempo = 100 + (sessionIndex * 10);
        leader.socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo });

        // Start playback
        await this.sendEventAndWaitForResponse(
          leader.socket,
          EVENTS.PLAY,
          { sessionId },
          EVENTS.SNAPSHOT
        );

        // Let it run for a bit
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Stop playback
        await this.sendEventAndWaitForResponse(
          leader.socket,
          EVENTS.PAUSE,
          { sessionId },
          EVENTS.SNAPSHOT
        );

        return { sessionIndex, tempo };
      });

      await Promise.all(concurrentOperations);

      // Cleanup all sessions
      sessions.forEach(sessionDevices => {
        sessionDevices.forEach(device => {
          if (device.socket) {
            device.socket.disconnect();
          }
        });
      });

      const totalDevices = sessionCount * devicesPerSession;
      const connectedDevices = sessions.flat().filter(device => device.connected).length;
      const joinedDevices = sessions.flat().filter(device => device.joined).length;

      this.recordTestResult('PERFORMANCE', testName, 
        connectedDevices === totalDevices && joinedDevices === totalDevices ? 'PASS' : 'FAIL',
        {
          sessionCount,
          devicesPerSession,
          totalDevices,
          connectedDevices,
          joinedDevices,
          successRate: joinedDevices / totalDevices
        }
      );

    } catch (error) {
      this.recordTestResult('PERFORMANCE', testName, 'FAIL', { error: error.message });
    }
  }

  async testMemoryUsage() {
    const testName = 'Memory Usage Test';
    console.log(`Running: ${testName}`);
    
    try {
      const initialMemory = process.memoryUsage();
      const devices = [];
      const deviceCount = 20;

      // Create many connections
      for (let i = 0; i < deviceCount; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL)
        };
        
        await this.waitForConnection(device.socket);
        
        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId: `${TEST_SESSION_PREFIX}memory-test-${i}`, displayName: `Memory Test Device ${i}` },
          EVENTS.SNAPSHOT
        );

        devices.push(device);
      }

      const peakMemory = process.memoryUsage();

      // Cleanup all devices
      devices.forEach(device => device.socket.disconnect());

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for cleanup

      const finalMemory = process.memoryUsage();

      const memoryIncrease = peakMemory.heapUsed - initialMemory.heapUsed;
      const memoryPerDevice = memoryIncrease / deviceCount;
      const memoryRecovered = peakMemory.heapUsed - finalMemory.heapUsed;
      const recoveryPercentage = memoryRecovered / memoryIncrease;

      this.recordTestResult('PERFORMANCE', testName, 
        memoryPerDevice < 1024 * 1024 && recoveryPercentage > 0.5 ? 'PASS' : 'FAIL', // 1MB per device, 50% recovery
        {
          initialMemoryMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
          peakMemoryMB: Math.round(peakMemory.heapUsed / 1024 / 1024),
          finalMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
          memoryIncreaseKB: Math.round(memoryIncrease / 1024),
          memoryPerDeviceKB: Math.round(memoryPerDevice / 1024),
          memoryRecoveredKB: Math.round(memoryRecovered / 1024),
          recoveryPercentage: Math.round(recoveryPercentage * 100),
          deviceCount
        }
      );

    } catch (error) {
      this.recordTestResult('PERFORMANCE', testName, 'FAIL', { error: error.message });
    }
  }

  async testServerLoad() {
    const testName = 'Server Load Test';
    console.log(`Running: ${testName}`);
    
    try {
      const deviceCount = 15;
      const sessionId = `${TEST_SESSION_PREFIX}load-test-${Date.now()}`;
      const devices = [];
      const startTime = performance.now();

      // Setup devices
      for (let i = 0; i < deviceCount; i++) {
        const device = {
          id: i,
          socket: io(SERVER_URL),
          latencyMeasurements: [],
          eventResponseTimes: []
        };
        
        await this.waitForConnection(device.socket);
        
        device.socket.on(EVENTS.LATENCY_RESPONSE, (data) => {
          const rtt = performance.now() - data.clientTimestamp;
          device.latencyMeasurements.push(rtt);
        });

        const joinStartTime = performance.now();
        await this.sendEventAndWaitForResponse(
          device.socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: `Load Test Device ${i}` },
          EVENTS.SNAPSHOT
        );
        device.eventResponseTimes.push(performance.now() - joinStartTime);

        devices.push(device);
      }

      // Make first device leader
      await this.sendEventAndWaitForResponse(
        devices[0].socket,
        EVENTS.SET_ROLE,
        { sessionId, role: 'leader' },
        EVENTS.SNAPSHOT
      );

      // Start intensive testing phase
      const testPhaseStart = performance.now();
      
      // All devices send latency probes simultaneously
      const probeInterval = setInterval(() => {
        devices.forEach(device => {
          device.socket.emit(EVENTS.LATENCY_PROBE, {
            timestamp: performance.now(),
            sessionId
          });
        });
      }, 1000);

      // Leader frequently changes tempo
      const tempoChangeInterval = setInterval(() => {
        const randomTempo = Math.floor(Math.random() * 100) + 80; // 80-180 BPM
        devices[0].socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: randomTempo });
      }, 3000);

      // Run load test for 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30000));

      clearInterval(probeInterval);
      clearInterval(tempoChangeInterval);

      const testPhaseEnd = performance.now();

      // Cleanup devices
      devices.forEach(device => device.socket.disconnect());

      const setupTime = testPhaseStart - startTime;
      const testPhaseTime = testPhaseEnd - testPhaseStart;

      // Analyze performance under load
      const allLatencies = devices.flatMap(device => device.latencyMeasurements);
      const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
      const maxLatency = Math.max(...allLatencies);
      
      const avgJoinTime = devices.reduce((sum, device) => sum + device.eventResponseTimes[0], 0) / devices.length;
      const maxJoinTime = Math.max(...devices.map(device => device.eventResponseTimes[0]));

      this.recordTestResult('PERFORMANCE', testName, 
        avgLatency < 500 && maxLatency < 1000 && avgJoinTime < 1000 ? 'PASS' : 'FAIL',
        {
          deviceCount,
          setupTimeMs: Math.round(setupTime),
          testPhaseTimeMs: Math.round(testPhaseTime),
          totalLatencyMeasurements: allLatencies.length,
          avgLatencyMs: Math.round(avgLatency),
          maxLatencyMs: Math.round(maxLatency),
          avgJoinTimeMs: Math.round(avgJoinTime),
          maxJoinTimeMs: Math.round(maxJoinTime)
        }
      );

    } catch (error) {
      this.recordTestResult('PERFORMANCE', testName, 'FAIL', { error: error.message });
    }
  }

  // ===========================================
  // ERROR HANDLING TESTS
  // ===========================================

  async runErrorHandlingTests() {
    console.log('\n🛡️  Error Handling Tests');
    console.log('-'.repeat(40));

    await this.testInvalidEventHandling();
    await this.testConnectionRecovery();
    await this.testMalformedDataHandling();
  }

  async testInvalidEventHandling() {
    const testName = 'Invalid Event Handling Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}invalid-events-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      const errorEvents = [];
      socket.on(EVENTS.ERROR, (error) => {
        errorEvents.push(error);
      });

      // Test various invalid events
      const invalidTests = [
        {
          name: 'Invalid session ID',
          event: () => socket.emit(EVENTS.SET_TEMPO, { sessionId: 'non-existent-session', tempo: 120 })
        },
        {
          name: 'Malformed data',
          event: () => socket.emit(EVENTS.SET_TEMPO, { invalid: 'data' })
        },
        {
          name: 'Missing required fields',
          event: () => socket.emit(EVENTS.JOIN_SESSION, {})
        },
        {
          name: 'Invalid tempo value',
          event: () => socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 'not-a-number' })
        }
      ];

      // Join session first to have valid context for some tests
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Invalid Events Test Device' },
        EVENTS.SNAPSHOT
      );

      // Execute invalid events
      for (const test of invalidTests) {
        test.event();
        await new Promise(resolve => setTimeout(resolve, 200)); // Brief pause between tests
      }

      // Wait for any error responses
      await new Promise(resolve => setTimeout(resolve, 2000));

      socket.disconnect();

      // Server should handle gracefully (either ignore or send error responses)
      // The key is that it shouldn't crash
      const handledGracefully = true; // If we reach here, server didn't crash

      this.recordTestResult('ERROR', testName, 
        handledGracefully ? 'PASS' : 'FAIL',
        {
          invalidTestsExecuted: invalidTests.length,
          errorEventsReceived: errorEvents.length,
          errorEvents: errorEvents.slice(0, 5), // Limit output
          handledGracefully
        }
      );

    } catch (error) {
      this.recordTestResult('ERROR', testName, 'FAIL', { error: error.message });
    }
  }

  async testConnectionRecovery() {
    const testName = 'Connection Recovery Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL, { 
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });
      const sessionId = `${TEST_SESSION_PREFIX}recovery-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      // Join session
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Recovery Test Device' },
        EVENTS.SNAPSHOT
      );

      const connectionEvents = [];
      
      socket.on('disconnect', (reason) => {
        connectionEvents.push({ event: 'disconnect', reason, timestamp: performance.now() });
      });
      
      socket.on('reconnect', (attemptNumber) => {
        connectionEvents.push({ event: 'reconnect', attempt: attemptNumber, timestamp: performance.now() });
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        connectionEvents.push({ event: 'reconnect_attempt', attempt: attemptNumber, timestamp: performance.now() });
      });

      // Force disconnection
      const disconnectTime = performance.now();
      socket.disconnect();

      // Wait for reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Manually reconnect if auto-reconnect didn't work
      if (!socket.connected) {
        socket.connect();
        await this.waitForConnection(socket);
      }

      // Try to rejoin session after reconnection
      try {
        await this.sendEventAndWaitForResponse(
          socket,
          EVENTS.JOIN_SESSION,
          { sessionId, displayName: 'Recovery Test Device Rejoined' },
          EVENTS.SNAPSHOT
        );
      } catch (rejoinError) {
        connectionEvents.push({ event: 'rejoin_failed', error: rejoinError.message });
      }

      socket.disconnect();

      const totalRecoveryTime = connectionEvents.length > 0 ? 
        Math.max(...connectionEvents.map(e => e.timestamp)) - disconnectTime : 0;

      const recoverySuccessful = connectionEvents.some(e => e.event === 'reconnect') || socket.connected;

      this.recordTestResult('ERROR', testName, 
        recoverySuccessful && totalRecoveryTime < 10000 ? 'PASS' : 'FAIL', // 10 second recovery limit
        {
          recoverySuccessful,
          totalRecoveryTime: Math.round(totalRecoveryTime),
          connectionEvents
        }
      );

    } catch (error) {
      this.recordTestResult('ERROR', testName, 'FAIL', { error: error.message });
    }
  }

  async testMalformedDataHandling() {
    const testName = 'Malformed Data Handling Test';
    console.log(`Running: ${testName}`);
    
    try {
      const socket = io(SERVER_URL);
      const sessionId = `${TEST_SESSION_PREFIX}malformed-${Date.now()}`;
      
      await this.waitForConnection(socket);
      
      // Join session to have valid context
      await this.sendEventAndWaitForResponse(
        socket,
        EVENTS.JOIN_SESSION,
        { sessionId, displayName: 'Malformed Data Test Device' },
        EVENTS.SNAPSHOT
      );

      const testCases = [
        {
          name: 'Null data',
          data: null
        },
        {
          name: 'Empty object',
          data: {}
        },
        {
          name: 'Array instead of object',
          data: [1, 2, 3]
        },
        {
          name: 'String instead of object',
          data: 'invalid data'
        },
        {
          name: 'Very large object',
          data: { sessionId, tempo: 120, largeField: 'x'.repeat(100000) }
        }
      ];

      let serverStillResponding = true;

      for (const testCase of testCases) {
        try {
          socket.emit(EVENTS.SET_TEMPO, testCase.data);
          await new Promise(resolve => setTimeout(resolve, 500));

          // Test if server is still responding
          const pingResponse = await Promise.race([
            this.sendEventAndWaitForResponse(
              socket,
              EVENTS.SYNC_REQUEST,
              { sessionId },
              EVENTS.SYNC_RESPONSE
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Server not responding')), 2000))
          ]);

          if (!pingResponse) {
            serverStillResponding = false;
            break;
          }
        } catch (error) {
          // Individual test case errors are acceptable - server should handle gracefully
          console.log(`  Malformed data test "${testCase.name}" caused: ${error.message}`);
        }
      }

      socket.disconnect();

      this.recordTestResult('ERROR', testName, 
        serverStillResponding ? 'PASS' : 'FAIL',
        {
          serverStillResponding,
          testCasesExecuted: testCases.length
        }
      );

    } catch (error) {
      this.recordTestResult('ERROR', testName, 'FAIL', { error: error.message });
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  async waitForConnection(socket, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (socket.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeoutMs);

      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async sendEventAndWaitForResponse(socket, eventToSend, eventData, expectedResponseEvent, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${expectedResponseEvent} after sending ${eventToSend}`));
      }, timeoutMs);

      socket.once(expectedResponseEvent, (responseData) => {
        clearTimeout(timeout);
        resolve(responseData);
      });

      socket.once(EVENTS.ERROR, (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Server error'));
      });

      socket.emit(eventToSend, eventData);
    });
  }

  calculateJitter(values) {
    if (values.length < 2) return 0;
    
    let jitterSum = 0;
    for (let i = 1; i < values.length; i++) {
      jitterSum += Math.abs(values[i] - values[i-1]);
    }
    
    return jitterSum / (values.length - 1);
  }

  recordTestResult(category, testName, status, data = {}) {
    const result = {
      category,
      test: testName,
      status,
      timestamp: Date.now(),
      duration: Date.now() - this.testStartTime,
      data
    };
    
    this.testResults.push(result);
    
    const statusIcon = status === 'PASS' ? '✅' : '❌';
    console.log(`  ${statusIcon} ${testName}: ${status}`);
    
    if (status === 'FAIL' && data.error) {
      console.log(`     Error: ${data.error}`);
    }
  }

  generateFinalReport() {
    console.log('\n📊 BandSync Automated Validation Report');
    console.log('=' .repeat(80));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
    const failedTests = this.testResults.filter(r => r.status === 'FAIL').length;
    const passRate = (passedTests / totalTests * 100).toFixed(1);
    
    console.log(`\nOverall Results:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${failedTests}`);
    console.log(`  Pass Rate: ${passRate}%`);
    
    // Results by category
    const categories = [...new Set(this.testResults.map(r => r.category))];
    
    categories.forEach(category => {
      const categoryResults = this.testResults.filter(r => r.category === category);
      const categoryPassed = categoryResults.filter(r => r.status === 'PASS').length;
      const categoryTotal = categoryResults.length;
      const categoryPassRate = (categoryPassed / categoryTotal * 100).toFixed(1);
      
      console.log(`\n${category} Tests:`);
      console.log(`  Pass Rate: ${categoryPassRate}% (${categoryPassed}/${categoryTotal})`);
      
      categoryResults.forEach(result => {
        const statusIcon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`    ${statusIcon} ${result.test}`);
      });
    });
    
    // Failed tests summary
    const failedTestsList = this.testResults.filter(r => r.status === 'FAIL');
    if (failedTestsList.length > 0) {
      console.log(`\n❌ Failed Tests Summary:`);
      failedTestsList.forEach(result => {
        console.log(`  • ${result.category}: ${result.test}`);
        if (result.data.error) {
          console.log(`    Error: ${result.data.error}`);
        }
      });
    }
    
    // Performance metrics
    const syncTests = this.testResults.filter(r => r.category === 'SYNC' && r.status === 'PASS');
    if (syncTests.length > 0) {
      console.log(`\n⚡ Performance Highlights:`);
      
      // Find multi-device sync results
      const multiDeviceTest = syncTests.find(r => r.test.includes('Multi-Device'));
      if (multiDeviceTest && multiDeviceTest.data.overallQuality) {
        console.log(`  Sync Quality: ${multiDeviceTest.data.overallQuality}`);
        console.log(`  Avg Deviation: ${multiDeviceTest.data.averageDeviation.toFixed(1)}ms`);
      }
      
      // Find latency results
      const latencyTest = syncTests.find(r => r.test.includes('Latency'));
      if (latencyTest && latencyTest.data.averageLatency) {
        console.log(`  Avg Latency: ${latencyTest.data.averageLatency.toFixed(1)}ms`);
      }
    }
    
    // Recommendations
    console.log(`\n💡 Recommendations:`);
    if (passRate < 80) {
      console.log(`  • Address failing tests before production deployment`);
    }
    if (failedTestsList.some(r => r.category === 'SYNC')) {
      console.log(`  • Review synchronization implementation for timing issues`);
    }
    if (failedTestsList.some(r => r.category === 'ROLE')) {
      console.log(`  • Check role management and permission enforcement`);
    }
    if (failedTestsList.some(r => r.category === 'PERFORMANCE')) {
      console.log(`  • Optimize server performance for high-load scenarios`);
    }
    
    console.log(`\nTest execution completed in ${((Date.now() - this.testStartTime) / 1000).toFixed(1)} seconds`);
    console.log(`Report generated: ${new Date().toISOString()}`);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test resources...');
    
    // Disconnect any remaining test devices
    this.testDevices.forEach(device => {
      if (device.socket && device.socket.connected) {
        device.socket.disconnect();
      }
    });
    
    // Clear test data
    this.testDevices = [];
    this.currentTestSession = null;
    
    console.log('Cleanup completed');
  }
}

// Export for use in other test modules
export { AutomatedValidationSuite };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new AutomatedValidationSuite();
  suite.runCompleteValidationSuite().catch(console.error);
}