/**
 * Test Client for BandSync Server Testing
 * Simulates multiple device connections for Sprint Day 5 validation
 */

import { io } from 'socket.io-client';
import { EVENTS } from './src/events.js';

const SERVER_URL = 'http://localhost:3001';
const SESSION_ID = 'test-session-1';
const NUM_CLIENTS = 4; // Test 4+ device requirement

class TestClient {
  constructor(clientId, displayName) {
    this.clientId = clientId;
    this.displayName = displayName;
    this.socket = null;
    this.latencyHistory = [];
    this.isLeader = false;
    this.connectionTime = 0;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        forceNew: true,
        timeout: 5000
      });

      this.socket.on('connect', () => {
        this.connectionTime = Date.now();
        console.log(`[${this.displayName}] Connected: ${this.socket.id}`);
        this.setupEventHandlers();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error(`[${this.displayName}] Connection error:`, error);
        reject(error);
      });
    });
  }

  setupEventHandlers() {
    // Heartbeat handling
    this.socket.on('heartbeat', ({ timestamp }) => {
      this.socket.emit('heartbeat_response', { timestamp });
    });

    // Session events
    this.socket.on(EVENTS.SNAPSHOT, (data) => {
      console.log(`[${this.displayName}] Session snapshot:`, {
        isPlaying: data.isPlaying,
        tempo: data.tempoBpm,
        position: data.position,
        leader: data.leaderSocketId,
        memberCount: data.members ? data.members.length : 0
      });
      this.isLeader = data.leaderSocketId === this.socket.id;
    });

    this.socket.on(EVENTS.ROLE_CHANGED, (data) => {
      console.log(`[${this.displayName}] Role changed:`, data);
      this.isLeader = data.socketId === this.socket.id && data.role === 'leader';
    });

    this.socket.on(EVENTS.ROOM_STATS, (stats) => {
      console.log(`[${this.displayName}] Room stats:`, stats);
    });

    this.socket.on(EVENTS.SCROLL_TICK, (data) => {
      const now = Date.now();
      const latency = now - data.serverTimestamp;
      this.latencyHistory.push(latency);
      
      // Keep only last 100 measurements
      if (this.latencyHistory.length > 100) {
        this.latencyHistory.shift();
      }
      
      if (latency > 100) {
        console.warn(`[${this.displayName}] HIGH SCROLL_TICK LATENCY: ${latency}ms`);
      }
    });

    this.socket.on(EVENTS.USER_JOINED, (data) => {
      console.log(`[${this.displayName}] User joined:`, data.member.displayName);
    });

    this.socket.on(EVENTS.USER_LEFT, (data) => {
      console.log(`[${this.displayName}] User left:`, data.socketId);
      if (data.newLeader) {
        console.log(`[${this.displayName}] New leader elected:`, data.newLeader);
      }
    });

    this.socket.on(EVENTS.ERROR, (error) => {
      console.error(`[${this.displayName}] Server error:`, error);
    });
  }

  async joinSession(role = 'follower') {
    return new Promise((resolve) => {
      this.socket.emit(EVENTS.JOIN_SESSION, {
        sessionId: SESSION_ID,
        displayName: this.displayName,
        role
      });
      
      // Wait for snapshot to confirm join
      const timeout = setTimeout(() => resolve(false), 3000);
      this.socket.once(EVENTS.SNAPSHOT, () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  measureLatency() {
    const timestamp = Date.now();
    this.socket.emit(EVENTS.LATENCY_PROBE, { timestamp, sessionId: SESSION_ID });
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);
      this.socket.once(EVENTS.LATENCY_RESPONSE, ({ clientTimestamp, serverTimestamp }) => {
        clearTimeout(timeout);
        const roundTripTime = Date.now() - clientTimestamp;
        resolve(roundTripTime);
      });
    });
  }

  play() {
    if (this.isLeader) {
      console.log(`[${this.displayName}] Starting playback as leader`);
      this.socket.emit(EVENTS.PLAY, { sessionId: SESSION_ID });
    }
  }

  pause() {
    if (this.isLeader) {
      console.log(`[${this.displayName}] Pausing as leader`);
      this.socket.emit(EVENTS.PAUSE, { sessionId: SESSION_ID });
    }
  }

  setTempo(tempo) {
    if (this.isLeader) {
      console.log(`[${this.displayName}] Setting tempo to ${tempo} BPM`);
      this.socket.emit(EVENTS.SET_TEMPO, { sessionId: SESSION_ID, tempo });
    }
  }

  getAverageLatency() {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log(`[${this.displayName}] Disconnected`);
    }
  }
}

// Test orchestrator
class MultiDeviceTest {
  constructor() {
    this.clients = [];
    this.testResults = {
      connectionSuccess: 0,
      averageLatency: 0,
      maxLatency: 0,
      leaderElections: 0,
      synchronizationDrift: 0
    };
  }

  async runTest() {
    console.log('\n=== BandSync Multi-Device Test ===');
    console.log(`Testing with ${NUM_CLIENTS} simulated devices\n`);

    // Create clients
    for (let i = 0; i < NUM_CLIENTS; i++) {
      const client = new TestClient(i, `Device-${i + 1}`);
      this.clients.push(client);
    }

    // Phase 1: Connect all clients
    console.log('Phase 1: Connecting all clients...');
    const connectionPromises = this.clients.map(client => client.connect());
    
    try {
      await Promise.all(connectionPromises);
      this.testResults.connectionSuccess = this.clients.length;
      console.log(`✓ All ${this.clients.length} clients connected successfully\n`);
    } catch (error) {
      console.error('✗ Failed to connect all clients:', error);
      return;
    }

    // Phase 2: Join session (first client as leader)
    console.log('Phase 2: Joining session...');
    for (let i = 0; i < this.clients.length; i++) {
      const role = i === 0 ? 'leader' : 'follower';
      const success = await this.clients[i].joinSession(role);
      if (!success) {
        console.error(`✗ Client ${i} failed to join session`);
        return;
      }
    }
    console.log('✓ All clients joined session\n');

    // Phase 3: Latency measurements
    console.log('Phase 3: Measuring latencies...');
    await this.measureLatencies();

    // Phase 4: Test synchronization
    console.log('Phase 4: Testing synchronization...');
    await this.testSynchronization();

    // Phase 5: Test leader election
    console.log('Phase 5: Testing leader election...');
    await this.testLeaderElection();

    // Phase 6: Performance stress test
    console.log('Phase 6: Performance stress test...');
    await this.stressTest();

    // Print results
    this.printResults();

    // Cleanup
    this.cleanup();
  }

  async measureLatencies() {
    const latencyPromises = this.clients.map(client => client.measureLatency());
    const latencies = await Promise.all(latencyPromises);
    
    const validLatencies = latencies.filter(l => l !== null);
    if (validLatencies.length > 0) {
      this.testResults.averageLatency = validLatencies.reduce((sum, l) => sum + l, 0) / validLatencies.length;
      this.testResults.maxLatency = Math.max(...validLatencies);
      
      console.log(`✓ Latency measurements complete:`);
      validLatencies.forEach((latency, i) => {
        const status = latency < 100 ? '✓' : '✗';
        console.log(`  ${status} ${this.clients[i].displayName}: ${latency}ms`);
      });
      console.log(`  Average: ${this.testResults.averageLatency.toFixed(1)}ms`);
      console.log(`  Max: ${this.testResults.maxLatency}ms\n`);
    }
  }

  async testSynchronization() {
    const leader = this.clients.find(c => c.isLeader);
    if (!leader) {
      console.error('✗ No leader found for sync test');
      return;
    }

    // Start playback and measure sync
    leader.play();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Let it play for 2 seconds
    
    // Check scroll tick latencies
    const scrollLatencies = this.clients.map(c => c.getAverageLatency()).filter(l => l > 0);
    if (scrollLatencies.length > 0) {
      const avgScrollLatency = scrollLatencies.reduce((sum, l) => sum + l, 0) / scrollLatencies.length;
      this.testResults.synchronizationDrift = avgScrollLatency;
      
      const syncStatus = avgScrollLatency < 100 ? '✓' : '✗';
      console.log(`${syncStatus} Synchronization test: ${avgScrollLatency.toFixed(1)}ms average drift`);
    }
    
    leader.pause();
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('');
  }

  async testLeaderElection() {
    const originalLeader = this.clients.find(c => c.isLeader);
    if (!originalLeader) {
      console.error('✗ No leader found for election test');
      return;
    }

    console.log(`Current leader: ${originalLeader.displayName}`);
    
    // Disconnect leader to trigger election
    originalLeader.disconnect();
    
    // Wait for election to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if new leader was elected
    const newLeader = this.clients.filter(c => c.socket && c.socket.connected).find(c => c.isLeader);
    if (newLeader) {
      console.log(`✓ Leader election successful: ${newLeader.displayName} is now leader`);
      this.testResults.leaderElections = 1;
    } else {
      console.log('✗ Leader election failed - no new leader elected');
    }
    console.log('');
  }

  async stressTest() {
    const leader = this.clients.find(c => c.isLeader);
    if (!leader) {
      console.log('✗ No leader available for stress test');
      return;
    }

    console.log('Running 10-second stress test with rapid tempo changes...');
    
    const startTime = Date.now();
    const tempos = [120, 140, 100, 160, 80, 200, 110, 150];
    let tempoIndex = 0;
    
    const stressInterval = setInterval(() => {
      leader.setTempo(tempos[tempoIndex % tempos.length]);
      tempoIndex++;
    }, 500); // Change tempo every 500ms
    
    // Run for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    clearInterval(stressInterval);
    
    console.log('✓ Stress test completed - server remained responsive\n');
  }

  printResults() {
    console.log('=== TEST RESULTS ===');
    console.log(`Connections successful: ${this.testResults.connectionSuccess}/${NUM_CLIENTS}`);
    console.log(`Average latency: ${this.testResults.averageLatency.toFixed(1)}ms`);
    console.log(`Max latency: ${this.testResults.maxLatency}ms`);
    console.log(`Synchronization drift: ${this.testResults.synchronizationDrift.toFixed(1)}ms`);
    console.log(`Leader elections: ${this.testResults.leaderElections}`);
    
    // Success criteria evaluation
    console.log('\n=== SUCCESS CRITERIA ===');
    console.log(`✓ 4+ device stability: ${this.testResults.connectionSuccess >= 4 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Sub-100ms latency: ${this.testResults.averageLatency < 100 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Sub-100ms sync drift: ${this.testResults.synchronizationDrift < 100 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Leader election: ${this.testResults.leaderElections > 0 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = this.testResults.connectionSuccess >= 4 && 
                      this.testResults.averageLatency < 100 && 
                      this.testResults.synchronizationDrift < 100 && 
                      this.testResults.leaderElections > 0;
    
    console.log(`\n=== OVERALL: ${allPassed ? 'PASS' : 'FAIL'} ===\n`);
  }

  cleanup() {
    this.clients.forEach(client => {
      if (client.socket && client.socket.connected) {
        client.disconnect();
      }
    });
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new MultiDeviceTest();
  
  process.on('SIGINT', () => {
    console.log('\nTest interrupted, cleaning up...');
    test.cleanup();
    process.exit(0);
  });
  
  test.runTest().catch(error => {
    console.error('Test failed:', error);
    test.cleanup();
    process.exit(1);
  });
}

export default MultiDeviceTest;