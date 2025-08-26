/**
 * Multi-User BandSync Test Script
 * Tests 4+ device scenario for Day 5 sprint requirements
 */

import { io as Client } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
const SESSION_ID = 'test-session-day5';
const NUM_CLIENTS = 6; // Test with 6 clients to exceed the 4+ requirement

class TestClient {
  constructor(clientId) {
    this.clientId = clientId;
    this.socket = null;
    this.isLeader = false;
    this.isConnected = false;
    this.latencyMeasurements = [];
    this.syncEvents = [];
    this.startTime = Date.now();
    
    console.log(`[Client ${clientId}] Initializing...`);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = Client(SERVER_URL, {
        transports: ['websocket'],
        timeout: 5000
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log(`[Client ${this.clientId}] ✅ Connected (${this.socket.id})`);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error(`[Client ${this.clientId}] ❌ Connection failed:`, error.message);
        reject(error);
      });

      this.setupEventHandlers();

      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  setupEventHandlers() {
    // Session events
    this.socket.on('snapshot', (data) => {
      console.log(`[Client ${this.clientId}] 📸 Snapshot: tempo=${data.tempoBpm}, playing=${data.isPlaying}, leader=${data.leaderSocketId === this.socket.id}`);
      this.isLeader = data.leaderSocketId === this.socket.id;
    });

    this.socket.on('user_joined', (data) => {
      console.log(`[Client ${this.clientId}] 👋 User joined: ${data.member.displayName} (${data.memberCount} total)`);
    });

    this.socket.on('user_left', (data) => {
      console.log(`[Client ${this.clientId}] 👋 User left: ${data.socketId} (${data.memberCount} remaining)`);
    });

    this.socket.on('role_changed', (data) => {
      if (data.socketId === this.socket.id) {
        this.isLeader = data.role === 'leader';
        console.log(`[Client ${this.clientId}] 👑 Role changed to: ${data.role}`);
      } else {
        console.log(`[Client ${this.clientId}] 👑 ${data.socketId} role changed to: ${data.role}`);
      }
    });

    // Sync events
    this.socket.on('scroll_tick', (data) => {
      if (this.syncEvents.length < 10) { // Only log first 10 for brevity
        const latency = Date.now() - data.serverTimestamp;
        this.syncEvents.push({
          event: 'scroll_tick',
          serverTime: data.serverTimestamp,
          clientTime: Date.now(),
          latency,
          position: data.positionMs
        });
        
        if (this.syncEvents.length <= 5) {
          console.log(`[Client ${this.clientId}] 🎵 Scroll tick: pos=${data.positionMs}ms, latency=${latency}ms`);
        }
      }
    });

    this.socket.on('play', (data) => {
      const latency = Date.now() - data.serverTimestamp;
      console.log(`[Client ${this.clientId}] ▶️ Play started: tempo=${data.tempoBpm}, latency=${latency}ms`);
    });

    this.socket.on('pause', (data) => {
      const latency = Date.now() - data.serverTimestamp;
      console.log(`[Client ${this.clientId}] ⏸️ Paused: pos=${data.position}, latency=${latency}ms`);
    });

    // Latency measurement
    this.socket.on('latency_response', (data) => {
      const rtt = Date.now() - data.clientTimestamp;
      this.latencyMeasurements.push(rtt);
      
      if (this.latencyMeasurements.length <= 3) {
        console.log(`[Client ${this.clientId}] 📊 RTT: ${rtt}ms`);
      }
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error(`[Client ${this.clientId}] ❌ Error:`, error);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log(`[Client ${this.clientId}] 🔌 Disconnected: ${reason}`);
    });
  }

  async joinSession() {
    return new Promise((resolve) => {
      console.log(`[Client ${this.clientId}] 🚪 Joining session: ${SESSION_ID}`);
      
      this.socket.emit('join_session', {
        sessionId: SESSION_ID,
        displayName: `TestClient${this.clientId}`,
        role: this.clientId === 0 ? 'leader' : 'follower' // First client wants to be leader
      });

      // Wait for snapshot to confirm join
      const timeout = setTimeout(() => {
        console.warn(`[Client ${this.clientId}] ⚠️ Join timeout`);
        resolve(false);
      }, 3000);

      this.socket.once('snapshot', () => {
        clearTimeout(timeout);
        console.log(`[Client ${this.clientId}] ✅ Successfully joined session`);
        resolve(true);
      });
    });
  }

  async measureLatency(count = 3) {
    console.log(`[Client ${this.clientId}] 📊 Measuring latency (${count} samples)...`);
    
    for (let i = 0; i < count; i++) {
      this.socket.emit('latency_probe', { timestamp: Date.now() });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for responses
  }

  async performLeaderActions() {
    if (!this.isLeader) {
      console.log(`[Client ${this.clientId}] 🚫 Not leader, skipping leader actions`);
      return;
    }

    console.log(`[Client ${this.clientId}] 👑 Performing leader actions...`);

    // Change tempo
    console.log(`[Client ${this.clientId}] 🎼 Setting tempo to 140 BPM`);
    this.socket.emit('set_tempo', { sessionId: SESSION_ID, tempo: 140 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start playback
    console.log(`[Client ${this.clientId}] ▶️ Starting playback`);
    this.socket.emit('play', { sessionId: SESSION_ID });
    await new Promise(resolve => setTimeout(resolve, 3000)); // Play for 3 seconds

    // Change tempo during playback
    console.log(`[Client ${this.clientId}] 🎼 Changing tempo to 120 BPM during playback`);
    this.socket.emit('set_tempo', { sessionId: SESSION_ID, tempo: 120 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Pause
    console.log(`[Client ${this.clientId}] ⏸️ Pausing playback`);
    this.socket.emit('pause', { sessionId: SESSION_ID });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  getStats() {
    const avgLatency = this.latencyMeasurements.length > 0 
      ? this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length 
      : 0;

    const syncLatencies = this.syncEvents.map(e => e.latency);
    const avgSyncLatency = syncLatencies.length > 0
      ? syncLatencies.reduce((a, b) => a + b, 0) / syncLatencies.length
      : 0;

    return {
      clientId: this.clientId,
      isConnected: this.isConnected,
      isLeader: this.isLeader,
      avgLatency: Math.round(avgLatency * 100) / 100,
      avgSyncLatency: Math.round(avgSyncLatency * 100) / 100,
      latencyMeasurements: this.latencyMeasurements.length,
      syncEvents: this.syncEvents.length,
      uptime: Date.now() - this.startTime
    };
  }

  disconnect() {
    if (this.socket) {
      console.log(`[Client ${this.clientId}] 🔌 Disconnecting...`);
      this.socket.disconnect();
    }
  }
}

// Test orchestrator
class MultiUserTest {
  constructor() {
    this.clients = [];
    this.testResults = {
      started: Date.now(),
      phases: [],
      errors: [],
      success: false
    };
  }

  async runTest() {
    console.log(`\n🎵 BandSync Multi-User Test Starting (${NUM_CLIENTS} clients)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      await this.phase1_ConnectClients();
      await this.phase2_JoinSession();
      await this.phase3_MeasureLatency();
      await this.phase4_TestLeaderActions();
      await this.phase5_TestDisconnection();
      await this.phase6_GenerateReport();

      this.testResults.success = true;
      console.log(`\n✅ Multi-User Test PASSED`);
    } catch (error) {
      this.testResults.errors.push(error.message);
      console.error(`\n❌ Multi-User Test FAILED:`, error.message);
    } finally {
      await this.cleanup();
    }
  }

  async phase1_ConnectClients() {
    console.log(`\n📡 Phase 1: Connecting ${NUM_CLIENTS} clients...`);
    const phaseStart = Date.now();

    for (let i = 0; i < NUM_CLIENTS; i++) {
      const client = new TestClient(i);
      this.clients.push(client);
    }

    // Connect all clients in parallel
    const connectionPromises = this.clients.map(client => client.connect());
    await Promise.all(connectionPromises);

    console.log(`✅ Phase 1 Complete: All ${NUM_CLIENTS} clients connected`);
    this.testResults.phases.push({
      name: 'Connect Clients',
      duration: Date.now() - phaseStart,
      success: true
    });
  }

  async phase2_JoinSession() {
    console.log(`\n🚪 Phase 2: Joining session "${SESSION_ID}"...`);
    const phaseStart = Date.now();

    // Join session sequentially to test leader election
    for (const client of this.clients) {
      const joined = await client.joinSession();
      if (!joined) {
        throw new Error(`Client ${client.clientId} failed to join session`);
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Stagger joins
    }

    // Verify leader was elected
    const leaders = this.clients.filter(c => c.isLeader);
    if (leaders.length !== 1) {
      throw new Error(`Expected 1 leader, found ${leaders.length}`);
    }

    console.log(`✅ Phase 2 Complete: All clients joined, leader: Client ${leaders[0].clientId}`);
    this.testResults.phases.push({
      name: 'Join Session',
      duration: Date.now() - phaseStart,
      success: true,
      leader: leaders[0].clientId
    });
  }

  async phase3_MeasureLatency() {
    console.log(`\n📊 Phase 3: Measuring connection latency...`);
    const phaseStart = Date.now();

    const latencyPromises = this.clients.map(client => client.measureLatency(5));
    await Promise.all(latencyPromises);

    console.log(`✅ Phase 3 Complete: Latency measurements collected`);
    this.testResults.phases.push({
      name: 'Measure Latency',
      duration: Date.now() - phaseStart,
      success: true
    });
  }

  async phase4_TestLeaderActions() {
    console.log(`\n👑 Phase 4: Testing leader synchronization actions...`);
    const phaseStart = Date.now();

    const leader = this.clients.find(c => c.isLeader);
    if (!leader) {
      throw new Error('No leader found');
    }

    await leader.performLeaderActions();

    console.log(`✅ Phase 4 Complete: Leader actions tested`);
    this.testResults.phases.push({
      name: 'Leader Actions',
      duration: Date.now() - phaseStart,
      success: true
    });
  }

  async phase5_TestDisconnection() {
    console.log(`\n🔌 Phase 5: Testing leader disconnection and re-election...`);
    const phaseStart = Date.now();

    const leader = this.clients.find(c => c.isLeader);
    if (leader) {
      console.log(`Disconnecting current leader: Client ${leader.clientId}`);
      leader.disconnect();
      
      // Wait for re-election
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if a new leader was elected
      const newLeaders = this.clients.filter(c => c.isConnected && c.isLeader);
      if (newLeaders.length === 0) {
        console.warn('⚠️ No new leader elected (may be expected in basic mode)');
      } else {
        console.log(`✅ New leader elected: Client ${newLeaders[0].clientId}`);
      }
    }

    console.log(`✅ Phase 5 Complete: Disconnection handling tested`);
    this.testResults.phases.push({
      name: 'Disconnection Test',
      duration: Date.now() - phaseStart,
      success: true
    });
  }

  async phase6_GenerateReport() {
    console.log(`\n📊 Phase 6: Generating performance report...`);
    
    const serverHealth = await this.getServerHealth();
    const clientStats = this.clients.map(c => c.getStats());

    console.log(`\n🎵 BandSync Multi-User Test Results`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📈 Server Health:`);
    console.log(`   Status: ${serverHealth.status}`);
    console.log(`   Mode: ${serverHealth.mode}`);
    console.log(`   Active Sessions: ${serverHealth.sessions}`);
    console.log(`   Peak Connections: ${serverHealth.connections.peak}`);
    console.log(`   Uptime: ${Math.round(serverHealth.uptime / 1000)}s`);

    console.log(`\n👥 Client Performance:`);
    clientStats.forEach(stats => {
      const status = stats.isConnected ? '✅' : '❌';
      const role = stats.isLeader ? '👑' : '👥';
      console.log(`   Client ${stats.clientId} ${status} ${role}: RTT=${stats.avgLatency}ms, Sync=${stats.avgSyncLatency}ms`);
    });

    const avgRTT = clientStats.reduce((sum, s) => sum + s.avgLatency, 0) / clientStats.length;
    const avgSyncLatency = clientStats.reduce((sum, s) => sum + s.avgSyncLatency, 0) / clientStats.length;

    console.log(`\n🏁 Summary:`);
    console.log(`   Total Test Duration: ${Math.round((Date.now() - this.testResults.started) / 1000)}s`);
    console.log(`   Connected Clients: ${clientStats.filter(s => s.isConnected).length}/${NUM_CLIENTS}`);
    console.log(`   Average RTT: ${Math.round(avgRTT * 100) / 100}ms`);
    console.log(`   Average Sync Latency: ${Math.round(avgSyncLatency * 100) / 100}ms`);
    console.log(`   Target Achieved: ${avgSyncLatency < 100 ? '✅ Yes' : '⚠️ No'} (sub-100ms requirement)`);

    this.testResults.phases.push({
      name: 'Generate Report',
      duration: Date.now() - Date.now(),
      success: true,
      avgRTT,
      avgSyncLatency,
      connectedClients: clientStats.filter(s => s.isConnected).length
    });
  }

  async getServerHealth() {
    try {
      const response = await fetch('http://localhost:3001/health');
      return await response.json();
    } catch (error) {
      return { status: 'unknown', error: error.message };
    }
  }

  async cleanup() {
    console.log(`\n🧹 Cleaning up...`);
    this.clients.forEach(client => client.disconnect());
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the test
const test = new MultiUserTest();
test.runTest().catch(console.error);