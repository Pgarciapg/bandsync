import Client from 'socket.io-client';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { NetworkSimulator, NetworkPerformanceAnalyzer, NetworkTestUtils } from '../utils/network-simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 3005;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

describe('Network Conditions and Edge Cases', () => {
  let serverProcess;
  let networkSim;
  let perfAnalyzer;

  beforeAll(async () => {
    // Start test server
    const serverPath = path.join(__dirname, '../../apps/server/server.js');
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: 'pipe'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    networkSim = new NetworkSimulator();
    perfAnalyzer = new NetworkPerformanceAnalyzer();
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => {
        serverProcess.on('close', resolve);
        setTimeout(resolve, 1000);
      });
    }
  });

  beforeEach(() => {
    networkSim.enable();
  });

  afterEach(() => {
    networkSim.disable();
  });

  describe('Various Network Conditions', () => {
    test('should maintain synchronization on mobile 4G connection', async () => {
      const sessionId = 'mobile-4g-test';
      const measurement = perfAnalyzer.startMeasurement('mobile-4g-sync');

      // Create clients with 4G simulation
      const clients = [];
      for (let i = 0; i < 3; i++) {
        const client = new Client(SERVER_URL, { transports: ['websocket'] });
        networkSim.applyPreset(`client-${i}`, 'MOBILE_4G');
        networkSim.wrapClient(client, `client-${i}`);
        clients.push(client);

        await new Promise(resolve => {
          client.on('connect', resolve);
        });

        client.emit('join_session', { sessionId });
        await new Promise(resolve => {
          client.on('snapshot', resolve);
        });
      }

      const [leader, follower1, follower2] = clients;

      // Set leader and start session
      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) {
            measurement.recordEvent('leader_set');
            resolve();
          }
        });
      });

      // Track synchronization
      const syncData = { leader: [], follower1: [], follower2: [] };
      
      [leader, follower1, follower2].forEach((client, index) => {
        const name = ['leader', 'follower1', 'follower2'][index];
        client.on('scroll_tick', (data) => {
          syncData[name].push({
            position: data.positionMs,
            timestamp: performance.now()
          });
          measurement.recordEvent('scroll_tick', { client: name, position: data.positionMs });
        });
      });

      leader.emit('play', { sessionId });
      measurement.recordEvent('play_start');

      // Collect data for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));

      leader.emit('pause', { sessionId });
      measurement.recordEvent('play_end');

      const analysis = measurement.finish();

      // Verify synchronization despite mobile network conditions
      const minTicks = Math.min(...Object.values(syncData).map(d => d.length));
      expect(minTicks).toBeGreaterThan(15); // Should receive most ticks despite mobile network

      // Check position synchronization
      for (let i = 0; i < Math.min(minTicks, 10); i++) {
        const positions = Object.values(syncData).map(data => data[i].position);
        const uniquePositions = [...new Set(positions)];
        expect(uniquePositions.length).toBe(1); // All positions should match
      }

      // Performance should be acceptable despite network conditions
      expect(analysis.performanceGrade.grade).not.toBe('F');

      console.log(`Mobile 4G Test - Grade: ${analysis.performanceGrade.grade}, Completeness: ${(analysis.performanceGrade.completeness * 100).toFixed(1)}%`);

      clients.forEach(client => client.disconnect());
    });

    test('should handle poor WiFi conditions gracefully', async () => {
      const sessionId = 'poor-wifi-test';
      const measurement = perfAnalyzer.startMeasurement('poor-wifi-sync');

      // Create clients with poor WiFi simulation
      const clients = await Promise.all([
        this.createSimulatedClient('leader', 'POOR_WIFI'),
        this.createSimulatedClient('follower', 'POOR_WIFI')
      ]);

      const [leader, follower] = clients;

      // Join session
      await Promise.all(clients.map(client => {
        return new Promise(resolve => {
          client.emit('join_session', { sessionId });
          client.once('snapshot', resolve);
        });
      }));

      // Set leader
      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) {
            resolve();
          }
        });
      });

      // Track events with poor network conditions
      let leaderTicks = 0;
      let followerTicks = 0;
      let missedBeats = 0;

      leader.on('scroll_tick', () => {
        leaderTicks++;
        measurement.recordEvent('leader_tick');
      });

      follower.on('scroll_tick', () => {
        followerTicks++;
        measurement.recordEvent('follower_tick');
      });

      leader.emit('play', { sessionId });

      // Run for longer to account for poor network
      await new Promise(resolve => setTimeout(resolve, 4000));

      leader.emit('pause', { sessionId });

      const analysis = measurement.finish();

      // Even with poor WiFi, should maintain basic functionality
      expect(leaderTicks).toBeGreaterThan(0);
      expect(followerTicks).toBeGreaterThan(0);

      // May have reduced performance but shouldn't completely fail
      const completeness = Math.min(leaderTicks, followerTicks) / Math.max(leaderTicks, followerTicks);
      expect(completeness).toBeGreaterThan(0.5); // At least 50% of events should get through

      console.log(`Poor WiFi Test - Leader: ${leaderTicks} ticks, Follower: ${followerTicks} ticks, Grade: ${analysis.performanceGrade.grade}`);

      clients.forEach(client => client.disconnect());
    });

    test('should adapt to satellite connection delays', async () => {
      const sessionId = 'satellite-test';
      const measurement = perfAnalyzer.startMeasurement('satellite-sync');

      const clients = await Promise.all([
        this.createSimulatedClient('leader', 'SATELLITE'),
        this.createSimulatedClient('follower', 'SATELLITE')
      ]);

      const [leader, follower] = clients;

      // Measure round-trip times
      const joinLatency = await NetworkTestUtils.measureRoundTrip(
        leader,
        'join_session',
        { sessionId }
      );

      measurement.recordEvent('join_latency', { latency: joinLatency });

      await new Promise(resolve => {
        follower.emit('join_session', { sessionId });
        follower.once('snapshot', resolve);
      });

      // Set leader with satellite delay
      const roleLatency = await NetworkTestUtils.measureRoundTrip(
        leader,
        'set_role',
        { sessionId, role: 'leader' }
      );

      measurement.recordEvent('role_latency', { latency: roleLatency });

      // Verify high latency but eventual consistency
      expect(joinLatency).toBeGreaterThan(400); // Should reflect satellite delay
      expect(roleLatency).toBeGreaterThan(400);

      // But should still work
      expect(joinLatency).toBeLessThan(2000); // Shouldn't timeout
      expect(roleLatency).toBeLessThan(2000);

      console.log(`Satellite Test - Join: ${joinLatency.toFixed(0)}ms, Role: ${roleLatency.toFixed(0)}ms`);

      clients.forEach(client => client.disconnect());
    });
  });

  describe('Connection Instability', () => {
    test('should recover from intermittent connection drops', async () => {
      const sessionId = 'intermittent-test';
      const measurement = perfAnalyzer.startMeasurement('intermittent-recovery');

      const leader = new Client(SERVER_URL, { transports: ['websocket'] });
      const follower = new Client(SERVER_URL, { transports: ['websocket'] });

      // Initial connection
      await Promise.all([
        new Promise(resolve => leader.on('connect', resolve)),
        new Promise(resolve => follower.on('connect', resolve))
      ]);

      // Join session
      leader.emit('join_session', { sessionId });
      follower.emit('join_session', { sessionId });

      await Promise.all([
        new Promise(resolve => leader.once('snapshot', resolve)),
        new Promise(resolve => follower.once('snapshot', resolve))
      ]);

      // Set leader
      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.once('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) resolve();
        });
      });

      // Start playback
      leader.emit('play', { sessionId });

      let followerTicks = 0;
      let reconnectCount = 0;

      follower.on('scroll_tick', () => {
        followerTicks++;
        measurement.recordEvent('follower_tick_before_drop');
      });

      follower.on('disconnect', () => {
        measurement.recordEvent('disconnect');
      });

      follower.on('connect', () => {
        reconnectCount++;
        measurement.recordEvent('reconnect', { count: reconnectCount });
        
        // Rejoin session on reconnect
        follower.emit('join_session', { sessionId });
      });

      // Simulate intermittent connection
      setTimeout(() => {
        console.log('[Test] Simulating connection drop...');
        follower.disconnect();
        
        // Reconnect after 1 second
        setTimeout(() => {
          console.log('[Test] Reconnecting...');
          follower.connect();
        }, 1000);
      }, 1000);

      // Continue test for recovery period
      await new Promise(resolve => setTimeout(resolve, 4000));

      leader.emit('pause', { sessionId });

      const analysis = measurement.finish();

      // Should have reconnected
      expect(reconnectCount).toBeGreaterThan(0);

      // Should receive some ticks after reconnection
      let ticksAfterReconnect = 0;
      follower.on('scroll_tick', () => {
        ticksAfterReconnect++;
      });

      // Brief additional test to verify recovery
      leader.emit('play', { sessionId });
      await new Promise(resolve => setTimeout(resolve, 500));
      leader.emit('pause', { sessionId });

      expect(ticksAfterReconnect).toBeGreaterThan(0);

      console.log(`Intermittent Test - Reconnects: ${reconnectCount}, Recovery ticks: ${ticksAfterReconnect}`);

      [leader, follower].forEach(client => client.disconnect());
    });

    test('should handle gradual network degradation', async () => {
      const sessionId = 'degradation-test';
      const measurement = perfAnalyzer.startMeasurement('gradual-degradation');

      const clients = await Promise.all([
        this.createSimulatedClient('leader', 'BROADBAND'),
        this.createSimulatedClient('follower', 'BROADBAND')
      ]);

      const [leader, follower] = clients;

      // Setup session
      await Promise.all(clients.map(client => {
        return new Promise(resolve => {
          client.emit('join_session', { sessionId });
          client.once('snapshot', resolve);
        });
      }));

      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) resolve();
        });
      });

      // Track performance over time
      const tickTimes = [];
      let tickCount = 0;

      follower.on('scroll_tick', (data) => {
        tickCount++;
        tickTimes.push(performance.now());
        measurement.recordEvent('tick', { count: tickCount, position: data.positionMs });
      });

      leader.emit('play', { sessionId });

      // Simulate gradual network degradation
      const degradationPromise = networkSim.degradeConnection('follower', 5000);

      // Monitor performance during degradation
      const performanceSnapshots = [];
      const monitoringInterval = setInterval(() => {
        const recentTicks = tickTimes.filter(t => performance.now() - t < 1000);
        performanceSnapshots.push({
          timestamp: performance.now(),
          recentTickCount: recentTicks.length,
          totalTicks: tickCount
        });
      }, 1000);

      await degradationPromise;
      await new Promise(resolve => setTimeout(resolve, 1000));

      clearInterval(monitoringInterval);
      leader.emit('pause', { sessionId });

      const analysis = measurement.finish();

      // Analyze performance degradation
      const initialPerf = performanceSnapshots.slice(0, 2);
      const finalPerf = performanceSnapshots.slice(-2);

      const initialAvg = initialPerf.reduce((sum, s) => sum + s.recentTickCount, 0) / initialPerf.length;
      const finalAvg = finalPerf.reduce((sum, s) => sum + s.recentTickCount, 0) / finalPerf.length;

      console.log(`Degradation Test - Initial: ${initialAvg.toFixed(1)} ticks/sec, Final: ${finalAvg.toFixed(1)} ticks/sec`);

      // Should show performance degradation but maintain basic functionality
      expect(finalAvg).toBeLessThan(initialAvg); // Performance should degrade
      expect(finalAvg).toBeGreaterThan(0); // But shouldn't completely stop

      clients.forEach(client => client.disconnect());
    });
  });

  describe('Mixed Network Conditions', () => {
    test('should synchronize clients with different network qualities', async () => {
      const sessionId = 'mixed-network-test';
      const measurement = perfAnalyzer.startMeasurement('mixed-network-sync');

      // Create clients with different network conditions
      const clientConfigs = [
        { id: 'leader', preset: 'LOCAL' },
        { id: 'good-follower', preset: 'BROADBAND' },
        { id: 'mobile-follower', preset: 'MOBILE_4G' },
        { id: 'poor-follower', preset: 'POOR_WIFI' }
      ];

      const clients = [];
      for (const config of clientConfigs) {
        const client = await this.createSimulatedClient(config.id, config.preset);
        clients.push({ ...client, id: config.id });
      }

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
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) resolve();
        });
      });

      // Track synchronization across different network conditions
      const clientData = {};
      clients.forEach(client => {
        clientData[client.id] = [];
        client.on('scroll_tick', (data) => {
          clientData[client.id].push({
            position: data.positionMs,
            timestamp: performance.now()
          });
          measurement.recordEvent('tick', { client: client.id });
        });
      });

      leader.emit('play', { sessionId });
      await new Promise(resolve => setTimeout(resolve, 4000));
      leader.emit('pause', { sessionId });

      const analysis = measurement.finish();

      // Analyze synchronization across different network conditions
      const tickCounts = Object.entries(clientData).map(([id, data]) => ({
        id,
        count: data.length
      }));

      console.log('Mixed Network Results:');
      tickCounts.forEach(({ id, count }) => {
        console.log(`  ${id}: ${count} ticks`);
      });

      // All clients should receive some ticks
      tickCounts.forEach(({ count }) => {
        expect(count).toBeGreaterThan(0);
      });

      // Leader (local connection) should have the most ticks
      const leaderTicks = tickCounts.find(t => t.id === 'leader').count;
      const otherTicks = tickCounts.filter(t => t.id !== 'leader').map(t => t.count);

      expect(leaderTicks).toBeGreaterThanOrEqual(Math.max(...otherTicks));

      // Check position synchronization despite network differences
      const minTicks = Math.min(...Object.values(clientData).map(d => d.length));
      for (let i = 0; i < Math.min(minTicks, 5); i++) {
        const positions = Object.values(clientData).map(data => data[i].position);
        const uniquePositions = [...new Set(positions)];
        expect(uniquePositions.length).toBe(1); // All positions should match
      }

      clients.forEach(client => client.disconnect());
    });
  });

  describe('Stress Testing Under Network Load', () => {
    test('should handle high packet loss gracefully', async () => {
      const sessionId = 'high-packet-loss-test';
      const measurement = perfAnalyzer.startMeasurement('high-packet-loss');

      // Create clients with high packet loss
      const clients = await Promise.all([
        this.createSimulatedClient('leader', 'BROADBAND'),
        this.createCustomClient('lossy-follower', { delay: 50, jitter: 20, dropRate: 0.2 }) // 20% packet loss
      ]);

      const [leader, follower] = clients;

      // Setup session
      await Promise.all(clients.map(client => {
        return new Promise(resolve => {
          client.emit('join_session', { sessionId });
          client.once('snapshot', resolve);
        });
      }));

      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) resolve();
        });
      });

      let leaderTicks = 0;
      let followerTicks = 0;

      leader.on('scroll_tick', () => {
        leaderTicks++;
        measurement.recordEvent('leader_tick');
      });

      follower.on('scroll_tick', () => {
        followerTicks++;
        measurement.recordEvent('follower_tick');
      });

      leader.emit('play', { sessionId });
      await new Promise(resolve => setTimeout(resolve, 3000));
      leader.emit('pause', { sessionId });

      const analysis = measurement.finish();

      // With 20% packet loss, follower should receive ~80% of ticks
      const expectedRatio = 0.6; // Allow for some additional variance
      const actualRatio = followerTicks / leaderTicks;

      console.log(`High Packet Loss Test - Leader: ${leaderTicks}, Follower: ${followerTicks}, Ratio: ${actualRatio.toFixed(2)}`);

      expect(actualRatio).toBeGreaterThan(expectedRatio);
      expect(followerTicks).toBeGreaterThan(0); // Should still receive some events

      clients.forEach(client => client.disconnect());
    });
  });

  // Helper methods
  async createSimulatedClient(clientId, preset) {
    const client = new Client(SERVER_URL, { transports: ['websocket'] });
    networkSim.applyPreset(clientId, preset);
    networkSim.wrapClient(client, clientId);

    await new Promise(resolve => {
      client.on('connect', resolve);
    });

    return client;
  }

  async createCustomClient(clientId, config) {
    const client = new Client(SERVER_URL, { transports: ['websocket'] });
    
    networkSim.setDelay(clientId, config.delay);
    networkSim.setJitter(clientId, config.jitter);
    networkSim.setDropRate(clientId, config.dropRate);
    networkSim.wrapClient(client, clientId);

    await new Promise(resolve => {
      client.on('connect', resolve);
    });

    return client;
  }
});