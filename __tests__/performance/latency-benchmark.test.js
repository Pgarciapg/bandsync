import Client from 'socket.io-client';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 3004;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Performance thresholds
const LATENCY_THRESHOLDS = {
  EXCELLENT: 25, // Under 25ms is excellent
  GOOD: 50,      // Under 50ms is good
  ACCEPTABLE: 100, // Under 100ms is acceptable
  POOR: 200      // Over 200ms is poor
};

describe('BandSync Latency and Performance Benchmarks', () => {
  let serverProcess;

  beforeAll(async () => {
    // Start server for performance testing
    const serverPath = path.join(__dirname, '../../apps/server/server.js');
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: 'pipe'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
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

  describe('Connection Latency', () => {
    test('should establish connection within acceptable latency threshold', async () => {
      const connectionTimes = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const client = new Client(SERVER_URL, { transports: ['websocket'] });
        
        await new Promise((resolve) => {
          client.on('connect', () => {
            const endTime = performance.now();
            const latency = endTime - startTime;
            connectionTimes.push(latency);
            client.disconnect();
            resolve();
          });
        });
      }

      const avgLatency = connectionTimes.reduce((a, b) => a + b) / connectionTimes.length;
      const maxLatency = Math.max(...connectionTimes);
      const minLatency = Math.min(...connectionTimes);

      console.log(`Connection Latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms, Min: ${minLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE);
      expect(maxLatency).toBeLessThan(LATENCY_THRESHOLDS.POOR);
    });
  });

  describe('Event Response Latency', () => {
    test('should measure round-trip latency for various events', async () => {
      const client = new Client(SERVER_URL, { transports: ['websocket'] });
      const sessionId = 'latency-test-session';
      
      await new Promise(resolve => {
        client.on('connect', resolve);
      });

      // Join session
      client.emit('join_session', { sessionId });
      await new Promise(resolve => {
        client.on('snapshot', resolve);
      });

      const eventTests = [
        { event: 'set_role', payload: { sessionId, role: 'leader' } },
        { event: 'set_tempo', payload: { sessionId, tempo: 120 } },
        { event: 'play', payload: { sessionId } },
        { event: 'pause', payload: { sessionId } },
        { event: 'sync_request', payload: { sessionId } }
      ];

      const latencyResults = {};

      for (const { event, payload } of eventTests) {
        const latencies = [];
        
        for (let i = 0; i < 5; i++) {
          const startTime = performance.now();
          
          client.emit(event, payload);
          
          await new Promise((resolve) => {
            const handler = () => {
              const endTime = performance.now();
              const latency = endTime - startTime;
              latencies.push(latency);
              resolve();
            };

            if (event === 'sync_request') {
              client.once('sync_response', handler);
            } else {
              client.once('snapshot', handler);
            }
          });

          // Small delay between iterations
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
        latencyResults[event] = {
          average: avgLatency,
          max: Math.max(...latencies),
          min: Math.min(...latencies)
        };
      }

      // Log results
      Object.entries(latencyResults).forEach(([event, stats]) => {
        console.log(`${event} - Avg: ${stats.average.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms, Min: ${stats.min.toFixed(2)}ms`);
        
        expect(stats.average).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE);
        expect(stats.max).toBeLessThan(LATENCY_THRESHOLDS.POOR);
      });

      client.disconnect();
    });
  });

  describe('Synchronization Latency', () => {
    test('should measure scroll_tick distribution latency across multiple clients', async () => {
      const sessionId = 'sync-latency-test';
      const clientCount = 4;
      const clients = [];

      // Create multiple clients
      for (let i = 0; i < clientCount; i++) {
        const client = new Client(SERVER_URL, { transports: ['websocket'] });
        clients.push({
          id: i,
          socket: client,
          tickTimes: []
        });

        await new Promise(resolve => {
          client.on('connect', resolve);
        });

        client.emit('join_session', { sessionId });
        
        await new Promise(resolve => {
          client.on('snapshot', resolve);
        });
      }

      // Set first client as leader
      const leader = clients[0];
      leader.socket.emit('set_role', { sessionId, role: 'leader' });
      
      await new Promise(resolve => {
        leader.socket.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.socket.id) {
            resolve();
          }
        });
      });

      // Setup tick time recording
      clients.forEach(client => {
        client.socket.on('scroll_tick', (data) => {
          client.tickTimes.push({
            positionMs: data.positionMs,
            receivedAt: performance.now()
          });
        });
      });

      // Start playback and measure
      const playbackStart = performance.now();
      leader.socket.emit('play', { sessionId });

      // Collect data for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      leader.socket.emit('pause', { sessionId });

      // Analyze synchronization latency
      const minTicks = Math.min(...clients.map(c => c.tickTimes.length));
      const syncLatencies = [];

      for (let tickIndex = 0; tickIndex < Math.min(minTicks, 15); tickIndex++) {
        const tickData = clients.map(client => ({
          clientId: client.id,
          receivedAt: client.tickTimes[tickIndex].receivedAt,
          position: client.tickTimes[tickIndex].positionMs
        }));

        // Ensure all clients received the same position
        const positions = tickData.map(t => t.position);
        const uniquePositions = [...new Set(positions)];
        expect(uniquePositions.length).toBe(1);

        // Calculate spread of receive times
        const receiveTimes = tickData.map(t => t.receivedAt);
        const maxTime = Math.max(...receiveTimes);
        const minTime = Math.min(...receiveTimes);
        const spread = maxTime - minTime;

        syncLatencies.push(spread);
      }

      const avgSyncLatency = syncLatencies.reduce((a, b) => a + b) / syncLatencies.length;
      const maxSyncLatency = Math.max(...syncLatencies);

      console.log(`Sync Latency - Avg Spread: ${avgSyncLatency.toFixed(2)}ms, Max Spread: ${maxSyncLatency.toFixed(2)}ms`);

      expect(avgSyncLatency).toBeLessThan(LATENCY_THRESHOLDS.GOOD);
      expect(maxSyncLatency).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE);

      // Cleanup
      clients.forEach(client => client.socket.disconnect());
    });

    test('should maintain consistent timing intervals in scroll_tick events', async () => {
      const sessionId = 'timing-consistency-test';
      const client = new Client(SERVER_URL, { transports: ['websocket'] });
      const tickTimes = [];

      await new Promise(resolve => {
        client.on('connect', resolve);
      });

      client.emit('join_session', { sessionId });
      await new Promise(resolve => {
        client.on('snapshot', resolve);
      });

      client.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        client.on('snapshot', (data) => {
          if (data.leaderSocketId === client.id) {
            resolve();
          }
        });
      });

      client.on('scroll_tick', (data) => {
        tickTimes.push({
          position: data.positionMs,
          timestamp: performance.now()
        });
      });

      // Start playback
      client.emit('play', { sessionId });

      // Collect data for 3 seconds (should get ~30 ticks at 100ms intervals)
      await new Promise(resolve => setTimeout(resolve, 3000));

      client.emit('pause', { sessionId });

      // Analyze timing consistency
      expect(tickTimes.length).toBeGreaterThan(25); // Should have at least 25 ticks

      const intervals = [];
      for (let i = 1; i < tickTimes.length; i++) {
        const interval = tickTimes[i].timestamp - tickTimes[i - 1].timestamp;
        intervals.push(interval);
      }

      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const intervalDeviations = intervals.map(i => Math.abs(i - 100)); // 100ms expected
      const maxDeviation = Math.max(...intervalDeviations);
      const avgDeviation = intervalDeviations.reduce((a, b) => a + b) / intervalDeviations.length;

      console.log(`Timing Consistency - Avg Interval: ${avgInterval.toFixed(2)}ms, Max Deviation: ${maxDeviation.toFixed(2)}ms, Avg Deviation: ${avgDeviation.toFixed(2)}ms`);

      expect(avgInterval).toBeCloseTo(100, 1); // Should be close to 100ms
      expect(maxDeviation).toBeLessThan(50); // Max deviation should be under 50ms
      expect(avgDeviation).toBeLessThan(20); // Average deviation should be under 20ms

      client.disconnect();
    });
  });

  describe('Load Performance', () => {
    test('should maintain performance under concurrent client load', async () => {
      const sessionId = 'load-performance-test';
      const clientCount = 8; // Higher load test
      const clients = [];
      const connectionTimes = [];
      const eventLatencies = [];

      // Create clients and measure connection times
      for (let i = 0; i < clientCount; i++) {
        const startTime = performance.now();
        const client = new Client(SERVER_URL, { transports: ['websocket'] });
        
        await new Promise(resolve => {
          client.on('connect', () => {
            const connectionTime = performance.now() - startTime;
            connectionTimes.push(connectionTime);
            resolve();
          });
        });

        client.emit('join_session', { sessionId });
        clients.push(client);
      }

      // Set first client as leader
      const leader = clients[0];
      leader.emit('set_role', { sessionId, role: 'leader' });

      // Measure event response times under load
      const testEvents = [
        { event: 'set_tempo', payload: { sessionId, tempo: 110 } },
        { event: 'play', payload: { sessionId } },
        { event: 'pause', payload: { sessionId } },
        { event: 'set_tempo', payload: { sessionId, tempo: 140 } }
      ];

      for (const { event, payload } of testEvents) {
        const eventStart = performance.now();
        
        leader.emit(event, payload);
        
        // Wait for all clients to receive snapshot
        await Promise.all(clients.map(client => {
          return new Promise(resolve => {
            client.once('snapshot', resolve);
          });
        }));

        const eventLatency = performance.now() - eventStart;
        eventLatencies.push(eventLatency);
      }

      // Performance analysis
      const avgConnectionTime = connectionTimes.reduce((a, b) => a + b) / connectionTimes.length;
      const maxConnectionTime = Math.max(...connectionTimes);
      const avgEventLatency = eventLatencies.reduce((a, b) => a + b) / eventLatencies.length;
      const maxEventLatency = Math.max(...eventLatencies);

      console.log(`Load Performance (${clientCount} clients):`);
      console.log(`  Connection - Avg: ${avgConnectionTime.toFixed(2)}ms, Max: ${maxConnectionTime.toFixed(2)}ms`);
      console.log(`  Event Latency - Avg: ${avgEventLatency.toFixed(2)}ms, Max: ${maxEventLatency.toFixed(2)}ms`);

      // Performance should degrade gracefully under load
      expect(avgConnectionTime).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE * 2); // Allow 2x threshold under load
      expect(maxConnectionTime).toBeLessThan(LATENCY_THRESHOLDS.POOR * 2);
      expect(avgEventLatency).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE * 1.5); // Allow 1.5x threshold under load

      // Cleanup
      clients.forEach(client => client.disconnect());
    });

    test('should handle rapid event bursts without degradation', async () => {
      const sessionId = 'burst-performance-test';
      const client = new Client(SERVER_URL, { transports: ['websocket'] });
      
      await new Promise(resolve => {
        client.on('connect', resolve);
      });

      client.emit('join_session', { sessionId });
      await new Promise(resolve => {
        client.on('snapshot', resolve);
      });

      client.emit('set_role', { sessionId, role: 'leader' });

      // Send rapid tempo changes (burst test)
      const burstStart = performance.now();
      const tempoValues = Array.from({ length: 50 }, (_, i) => 60 + (i % 120));
      const responseLatencies = [];
      let responsesReceived = 0;

      client.on('snapshot', (data) => {
        const responseTime = performance.now() - burstStart;
        responseLatencies.push(responseTime);
        responsesReceived++;
      });

      // Send all tempo changes rapidly
      tempoValues.forEach(tempo => {
        client.emit('set_tempo', { sessionId, tempo });
      });

      // Wait for all responses
      await new Promise(resolve => {
        const checkResponses = () => {
          if (responsesReceived >= tempoValues.length) {
            resolve();
          } else {
            setTimeout(checkResponses, 10);
          }
        };
        checkResponses();
      });

      const totalTime = performance.now() - burstStart;
      const avgResponseLatency = responseLatencies.reduce((a, b) => a + b) / responseLatencies.length;
      const maxResponseLatency = Math.max(...responseLatencies);

      console.log(`Burst Performance (${tempoValues.length} events):`);
      console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Avg Response: ${avgResponseLatency.toFixed(2)}ms`);
      console.log(`  Max Response: ${maxResponseLatency.toFixed(2)}ms`);

      expect(totalTime).toBeLessThan(5000); // Should complete burst in under 5 seconds
      expect(avgResponseLatency).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE * 3); // Allow higher latency for bursts
      expect(responsesReceived).toBe(tempoValues.length); // All events should be processed

      client.disconnect();
    });
  });

  describe('Memory and Resource Performance', () => {
    test('should not leak memory during extended operation', async () => {
      const sessionId = 'memory-test-session';
      const client = new Client(SERVER_URL, { transports: ['websocket'] });
      
      await new Promise(resolve => {
        client.on('connect', resolve);
      });

      client.emit('join_session', { sessionId });
      await new Promise(resolve => {
        client.on('snapshot', resolve);
      });

      client.emit('set_role', { sessionId, role: 'leader' });
      
      // Collect baseline memory if available
      const initialMemory = process.memoryUsage().heapUsed;

      // Run extended operation (simulating long session)
      client.emit('play', { sessionId });
      
      let tickCount = 0;
      client.on('scroll_tick', () => {
        tickCount++;
      });

      // Run for 5 seconds (should generate ~50 ticks)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      client.emit('pause', { sessionId });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory Usage - Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB, Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB, Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Tick Count: ${tickCount}`);

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Under 10MB increase
      expect(tickCount).toBeGreaterThan(40); // Should have received expected ticks

      client.disconnect();
    });
  });

  describe('Cross-Platform Performance', () => {
    test('should maintain consistent performance across connection types', async () => {
      const sessionId = 'cross-platform-test';
      const connectionTypes = ['websocket', 'polling'];
      const performanceResults = {};

      for (const transport of connectionTypes) {
        const client = new Client(SERVER_URL, { transports: [transport] });
        const startTime = performance.now();

        await new Promise(resolve => {
          client.on('connect', resolve);
        });

        const connectionTime = performance.now() - startTime;

        client.emit('join_session', { sessionId: `${sessionId}-${transport}` });
        
        const eventStart = performance.now();
        await new Promise(resolve => {
          client.on('snapshot', resolve);
        });
        const eventTime = performance.now() - eventStart;

        performanceResults[transport] = {
          connectionTime,
          eventTime
        };

        client.disconnect();
      }

      // Log results
      Object.entries(performanceResults).forEach(([transport, perf]) => {
        console.log(`${transport} - Connection: ${perf.connectionTime.toFixed(2)}ms, Event: ${perf.eventTime.toFixed(2)}ms`);
      });

      // WebSocket should generally be faster, but both should be acceptable
      expect(performanceResults.websocket.connectionTime).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE);
      expect(performanceResults.websocket.eventTime).toBeLessThan(LATENCY_THRESHOLDS.GOOD);
      expect(performanceResults.polling.connectionTime).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE * 2);
      expect(performanceResults.polling.eventTime).toBeLessThan(LATENCY_THRESHOLDS.ACCEPTABLE);
    });
  });
});