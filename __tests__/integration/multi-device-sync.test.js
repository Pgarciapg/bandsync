import { spawn } from 'child_process';
import Client from 'socket.io-client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 3003;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const MAX_SYNC_DRIFT = 100; // 100ms maximum acceptable drift
const TARGET_SYNC_DRIFT = 50; // 50ms target for high-quality sync

describe('Multi-Device Synchronization Integration Tests', () => {
  let serverProcess;
  let devices = [];

  beforeAll(async () => {
    // Start test server instance
    const serverPath = path.join(__dirname, '../../apps/server/server.js');
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => {
        serverProcess.on('close', resolve);
        setTimeout(resolve, 1000); // Fallback timeout
      });
    }
  });

  beforeEach(() => {
    devices = [];
  });

  afterEach(() => {
    // Disconnect all devices
    devices.forEach(device => {
      if (device.socket && device.socket.connected) {
        device.socket.disconnect();
      }
    });
    devices = [];
  });

  const createDevice = (deviceId, sessionId) => {
    return new Promise((resolve) => {
      const socket = Client(SERVER_URL, { transports: ['websocket'] });
      const device = {
        id: deviceId,
        socket,
        state: null,
        ticks: [],
        connected: false
      };

      socket.on('connect', () => {
        device.connected = true;
        socket.emit('join_session', { sessionId });
      });

      socket.on('snapshot', (data) => {
        device.state = data;
        if (device.state.message === "Waiting for leader…" || device.state.message === "Leader connected") {
          resolve(device);
        }
      });

      socket.on('scroll_tick', (data) => {
        device.ticks.push({
          positionMs: data.positionMs,
          timestamp: Date.now(),
          deviceTime: performance.now()
        });
      });

      devices.push(device);
    });
  };

  const setLeader = (device, sessionId) => {
    return new Promise((resolve) => {
      const originalHandler = device.socket.listeners('snapshot')[0];
      
      device.socket.off('snapshot', originalHandler);
      device.socket.on('snapshot', (data) => {
        device.state = data;
        if (data.leaderSocketId === device.socket.id) {
          resolve();
        }
        originalHandler(data);
      });

      device.socket.emit('set_role', { sessionId, role: 'leader' });
    });
  };

  describe('2-Device Synchronization', () => {
    test('should maintain synchronization accuracy under 50ms between leader and follower', async () => {
      const sessionId = 'two-device-sync-test';
      
      // Create devices
      const [leader, follower] = await Promise.all([
        createDevice('leader', sessionId),
        createDevice('follower', sessionId)
      ]);

      // Set leader
      await setLeader(leader, sessionId);

      // Start playback
      leader.socket.emit('play', { sessionId });

      // Collect synchronization data
      await new Promise((resolve) => {
        setTimeout(() => {
          // Stop playback
          leader.socket.emit('pause', { sessionId });
          resolve();
        }, 2000); // Collect data for 2 seconds
      });

      // Analyze synchronization accuracy
      const minTicks = Math.min(leader.ticks.length, follower.ticks.length);
      expect(minTicks).toBeGreaterThan(15); // Should have at least 15 ticks (1.5 seconds of data)

      const syncDrifts = [];
      for (let i = 0; i < minTicks; i++) {
        const leaderTick = leader.ticks[i];
        const followerTick = follower.ticks[i];
        
        // Both should have the same position
        expect(leaderTick.positionMs).toBe(followerTick.positionMs);
        
        // Measure time drift between receiving the same tick
        const timeDrift = Math.abs(leaderTick.timestamp - followerTick.timestamp);
        syncDrifts.push(timeDrift);
      }

      const maxDrift = Math.max(...syncDrifts);
      const avgDrift = syncDrifts.reduce((a, b) => a + b) / syncDrifts.length;

      expect(maxDrift).toBeLessThan(MAX_SYNC_DRIFT);
      expect(avgDrift).toBeLessThan(TARGET_SYNC_DRIFT);
      
      console.log(`2-Device Sync - Max Drift: ${maxDrift}ms, Avg Drift: ${avgDrift}ms`);
    });

    test('should handle leader disconnection and recovery', async () => {
      const sessionId = 'leader-recovery-test';
      
      const [leader, follower] = await Promise.all([
        createDevice('leader', sessionId),
        createDevice('follower', sessionId)
      ]);

      await setLeader(leader, sessionId);
      leader.socket.emit('play', { sessionId });

      // Wait for some playback
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Disconnect leader
      leader.socket.disconnect();

      // Wait and check follower state
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(follower.state.isPlaying).toBe(false);
      expect(follower.state.message).toBe("Leader disconnected");
      expect(follower.state.leaderSocketId).toBe(null);

      // Create new leader
      const newLeader = await createDevice('new-leader', sessionId);
      await setLeader(newLeader, sessionId);
      
      expect(follower.state.message).toBe("Leader connected");
    });
  });

  describe('4-Device Synchronization', () => {
    test('should maintain tight synchronization across 4 devices', async () => {
      const sessionId = 'four-device-sync-test';
      
      // Create 4 devices (1 leader, 3 followers)
      const devicePromises = [];
      for (let i = 0; i < 4; i++) {
        devicePromises.push(createDevice(`device-${i}`, sessionId));
      }
      
      const allDevices = await Promise.all(devicePromises);
      const [leader, ...followers] = allDevices;

      // Set leader
      await setLeader(leader, sessionId);
      
      // Set tempo to 120 BPM for consistent testing
      leader.socket.emit('set_tempo', { sessionId, tempo: 120 });
      
      // Start playback
      leader.socket.emit('play', { sessionId });

      // Collect data for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      leader.socket.emit('pause', { sessionId });

      // Analyze cross-device synchronization
      const minTicks = Math.min(...allDevices.map(d => d.ticks.length));
      expect(minTicks).toBeGreaterThan(25); // Should have sufficient data

      const tickAnalysis = [];
      for (let tickIndex = 0; tickIndex < Math.min(minTicks, 20); tickIndex++) {
        const tickData = allDevices.map(device => ({
          deviceId: device.id,
          position: device.ticks[tickIndex].positionMs,
          timestamp: device.ticks[tickIndex].timestamp
        }));

        // All devices should have identical positions
        const positions = tickData.map(t => t.position);
        const uniquePositions = [...new Set(positions)];
        expect(uniquePositions.length).toBe(1);

        // Measure timestamp spread across devices
        const timestamps = tickData.map(t => t.timestamp);
        const maxTimestamp = Math.max(...timestamps);
        const minTimestamp = Math.min(...timestamps);
        const spread = maxTimestamp - minTimestamp;

        tickAnalysis.push({ spread, position: positions[0] });
      }

      const maxSpread = Math.max(...tickAnalysis.map(t => t.spread));
      const avgSpread = tickAnalysis.reduce((sum, t) => sum + t.spread, 0) / tickAnalysis.length;

      expect(maxSpread).toBeLessThan(MAX_SYNC_DRIFT);
      expect(avgSpread).toBeLessThan(TARGET_SYNC_DRIFT);
      
      console.log(`4-Device Sync - Max Spread: ${maxSpread}ms, Avg Spread: ${avgSpread}ms`);
    });

    test('should maintain performance with high-frequency updates', async () => {
      const sessionId = 'high-frequency-test';
      
      const allDevices = await Promise.all([
        createDevice('leader', sessionId),
        createDevice('follower1', sessionId),
        createDevice('follower2', sessionId),
        createDevice('follower3', sessionId)
      ]);

      const [leader] = allDevices;
      await setLeader(leader, sessionId);

      // Set high tempo (180 BPM)
      leader.socket.emit('set_tempo', { sessionId, tempo: 180 });
      leader.socket.emit('play', { sessionId });

      const startTime = Date.now();
      
      // Run for 2 seconds at high frequency
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      leader.socket.emit('pause', { sessionId });
      const endTime = Date.now();

      // Verify all devices received updates consistently
      const expectedTicks = Math.floor((endTime - startTime) / 100); // 100ms intervals
      
      allDevices.forEach(device => {
        const tickCount = device.ticks.length;
        const tickRate = tickCount / ((endTime - startTime) / 1000);
        
        // Should be close to 10 ticks per second (100ms intervals)
        expect(tickRate).toBeGreaterThan(8);
        expect(tickRate).toBeLessThan(12);
        
        // Verify no missed beats
        expect(tickCount).toBeGreaterThan(expectedTicks * 0.8); // Allow some tolerance
      });
    });
  });

  describe('6-Device Synchronization (Stress Test)', () => {
    test('should handle 6 concurrent devices with acceptable performance degradation', async () => {
      const sessionId = 'six-device-stress-test';
      
      // Create 6 devices
      const devicePromises = [];
      for (let i = 0; i < 6; i++) {
        devicePromises.push(createDevice(`stress-device-${i}`, sessionId));
      }
      
      const allDevices = await Promise.all(devicePromises);
      const [leader, ...followers] = allDevices;

      await setLeader(leader, sessionId);
      
      const startTime = performance.now();
      leader.socket.emit('play', { sessionId });

      // Shorter duration for stress test
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      leader.socket.emit('pause', { sessionId });
      const endTime = performance.now();

      // Analyze performance under load
      const minTicks = Math.min(...allDevices.map(d => d.ticks.length));
      expect(minTicks).toBeGreaterThan(10); // Should have reasonable data

      // Check synchronization accuracy (may be slightly relaxed under load)
      const syncSpreads = [];
      for (let tickIndex = 0; tickIndex < Math.min(minTicks, 10); tickIndex++) {
        const timestamps = allDevices.map(device => device.ticks[tickIndex].timestamp);
        const spread = Math.max(...timestamps) - Math.min(...timestamps);
        syncSpreads.push(spread);
      }

      const maxSpread = Math.max(...syncSpreads);
      const avgSpread = syncSpreads.reduce((a, b) => a + b) / syncSpreads.length;

      // Allow higher thresholds for stress test
      expect(maxSpread).toBeLessThan(MAX_SYNC_DRIFT * 1.5); // 150ms max under load
      expect(avgSpread).toBeLessThan(TARGET_SYNC_DRIFT * 2); // 100ms average under load
      
      console.log(`6-Device Stress - Max Spread: ${maxSpread}ms, Avg Spread: ${avgSpread}ms`);
      
      // Verify no devices were dropped
      expect(allDevices.every(d => d.connected)).toBe(true);
    });
  });

  describe('Network Condition Simulation', () => {
    test('should maintain synchronization with simulated network latency', async () => {
      const sessionId = 'network-latency-test';
      
      // Create devices with artificial latency
      const createDelayedDevice = async (deviceId, baseDelay) => {
        const device = await createDevice(deviceId, sessionId);
        
        // Wrap socket emit with delay
        const originalEmit = device.socket.emit.bind(device.socket);
        device.socket.emit = (...args) => {
          const delay = baseDelay + (Math.random() * 20 - 10); // ±10ms jitter
          setTimeout(() => originalEmit(...args), delay);
        };
        
        return device;
      };

      const [leader, follower1, follower2] = await Promise.all([
        createDelayedDevice('leader', 10), // 10ms base delay
        createDelayedDevice('follower1', 30), // 30ms base delay
        createDelayedDevice('follower2', 50) // 50ms base delay
      ]);

      await setLeader(leader, sessionId);
      leader.socket.emit('play', { sessionId });

      await new Promise(resolve => setTimeout(resolve, 2000));
      leader.socket.emit('pause', { sessionId });

      // Despite network delays, synchronization should still be maintained
      const devices = [leader, follower1, follower2];
      const minTicks = Math.min(...devices.map(d => d.ticks.length));
      
      // Verify positions are synchronized despite network delays
      for (let i = 0; i < Math.min(minTicks, 10); i++) {
        const positions = devices.map(d => d.ticks[i].positionMs);
        const uniquePositions = [...new Set(positions)];
        expect(uniquePositions.length).toBe(1); // All should have same position
      }
    });

    test('should handle intermittent connection drops gracefully', async () => {
      const sessionId = 'connection-drop-test';
      
      const [leader, follower] = await Promise.all([
        createDevice('leader', sessionId),
        createDevice('follower', sessionId)
      ]);

      await setLeader(leader, sessionId);
      leader.socket.emit('play', { sessionId });

      // Simulate connection drop and recovery
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Temporarily disconnect follower
      follower.socket.disconnect();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reconnect follower
      follower.socket.connect();
      
      await new Promise((resolve) => {
        follower.socket.on('connect', () => {
          follower.socket.emit('join_session', { sessionId });
          resolve();
        });
      });

      // Continue playback
      await new Promise(resolve => setTimeout(resolve, 1000));
      leader.socket.emit('pause', { sessionId });

      // Verify follower recovered and continued receiving updates
      expect(follower.ticks.length).toBeGreaterThan(0);
      expect(follower.connected).toBe(true);
    });
  });

  describe('Tempo Synchronization Accuracy', () => {
    test('should maintain metronome synchronization across tempo changes', async () => {
      const sessionId = 'tempo-sync-test';
      
      const [leader, follower] = await Promise.all([
        createDevice('leader', sessionId),
        createDevice('follower', sessionId)
      ]);

      await setLeader(leader, sessionId);

      // Test multiple tempo changes
      const tempos = [60, 120, 90, 150, 100];
      const tempoResults = [];

      for (const tempo of tempos) {
        leader.socket.emit('set_tempo', { sessionId, tempo });
        leader.socket.emit('play', { sessionId });
        
        const startTicks = leader.ticks.length;
        const startTime = Date.now();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        leader.socket.emit('pause', { sessionId });
        
        const endTicks = leader.ticks.length;
        const endTime = Date.now();
        const actualDuration = endTime - startTime;
        const tickCount = endTicks - startTicks;
        const measuredRate = tickCount / (actualDuration / 1000);
        
        // Should be close to 10 ticks per second (100ms scroll tick interval)
        expect(measuredRate).toBeCloseTo(10, 1);
        
        tempoResults.push({ tempo, measuredRate, tickCount });
      }

      // Verify consistency across tempo changes
      const rates = tempoResults.map(r => r.measuredRate);
      const avgRate = rates.reduce((a, b) => a + b) / rates.length;
      const maxDeviation = Math.max(...rates.map(r => Math.abs(r - avgRate)));
      
      expect(maxDeviation).toBeLessThan(2); // Max 2 ticks/sec deviation
    });
  });

  describe('Real-world Scenario Tests', () => {
    test('should handle realistic band session with multiple role changes', async () => {
      const sessionId = 'realistic-band-session';
      
      // Simulate 4 band members
      const [guitarist, bassist, drummer, keyboardist] = await Promise.all([
        createDevice('guitarist', sessionId),
        createDevice('bassist', sessionId),
        createDevice('drummer', sessionId),
        createDevice('keyboardist', sessionId)
      ]);

      // Guitarist starts as leader
      await setLeader(guitarist, sessionId);
      guitarist.socket.emit('set_tempo', { sessionId, tempo: 110 });
      guitarist.socket.emit('play', { sessionId });

      // Play for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      guitarist.socket.emit('pause', { sessionId });

      // Change leader to drummer (common in real sessions)
      await setLeader(drummer, sessionId);
      drummer.socket.emit('set_tempo', { sessionId, tempo: 125 });
      drummer.socket.emit('play', { sessionId });

      // Play for another second
      await new Promise(resolve => setTimeout(resolve, 1000));
      drummer.socket.emit('pause', { sessionId });

      // Verify all members stayed synchronized through leadership change
      const allDevices = [guitarist, bassist, drummer, keyboardist];
      const allConnected = allDevices.every(d => d.connected);
      const allHaveTicks = allDevices.every(d => d.ticks.length > 0);
      
      expect(allConnected).toBe(true);
      expect(allHaveTicks).toBe(true);
      
      // Final state should show drummer as leader
      expect(drummer.state.leaderSocketId).toBe(drummer.socket.id);
      expect(drummer.state.tempoBpm).toBe(125);
    });
  });
});