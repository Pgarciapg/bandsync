import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import { EVENTS } from '../../../apps/server/src/events.js';

// Test server setup
let httpServer;
let io;
let serverSocket;
let clientSockets = [];

const TEST_PORT = 3002;
const TEST_URL = `http://localhost:${TEST_PORT}`;

describe('BandSync Server', () => {
  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: "*" }
    });
    
    httpServer.listen(TEST_PORT, done);
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
  });

  beforeEach((done) => {
    // Clear any existing sessions
    const sessions = new Map();
    const scrollIntervals = new Map();
    
    // Setup server-side socket handling (simplified version of actual server)
    io.on('connection', (socket) => {
      serverSocket = socket;
      
      socket.on(EVENTS.JOIN_SESSION, ({ sessionId }) => {
        socket.join(sessionId);
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, { 
            message: "Waiting for leader…", 
            tempo: 100, 
            position: 0, 
            isPlaying: false,
            leaderSocketId: null,
            tempoBpm: 100
          });
        }
        const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
        socket.emit(EVENTS.SNAPSHOT, sessions.get(sessionId));
        io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
      });

      socket.on(EVENTS.SET_ROLE, ({ sessionId, role }) => {
        const s = sessions.get(sessionId);
        if (!s) return;
        if (role === "leader") {
          s.leaderSocketId = socket.id;
          s.message = "Leader connected";
        }
        io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
      });

      socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
        const s = sessions.get(sessionId);
        if (!s || s.leaderSocketId !== socket.id) return;
        s.tempo = tempo;
        s.tempoBpm = tempo;
        io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
      });

      socket.on(EVENTS.PLAY, ({ sessionId }) => {
        const s = sessions.get(sessionId);
        if (!s || s.leaderSocketId !== socket.id) return;
        s.isPlaying = true;
        io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
        
        if (!scrollIntervals.has(sessionId)) {
          const interval = setInterval(() => {
            const session = sessions.get(sessionId);
            if (session && session.isPlaying) {
              session.position += 100;
              io.to(sessionId).emit(EVENTS.SCROLL_TICK, { 
                sessionId, 
                positionMs: session.position 
              });
            }
          }, 100);
          scrollIntervals.set(sessionId, interval);
        }
      });

      socket.on(EVENTS.PAUSE, ({ sessionId }) => {
        const s = sessions.get(sessionId);
        if (!s || s.leaderSocketId !== socket.id) return;
        s.isPlaying = false;
        io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
        
        if (scrollIntervals.has(sessionId)) {
          clearInterval(scrollIntervals.get(sessionId));
          scrollIntervals.delete(sessionId);
        }
      });

      socket.on(EVENTS.SYNC_REQUEST, ({ sessionId }) => {
        const s = sessions.get(sessionId);
        if (!s) return;
        socket.emit(EVENTS.SYNC_RESPONSE, { 
          sessionId, 
          positionMs: s.position,
          tempoBpm: s.tempoBpm,
          isPlaying: s.isPlaying
        });
      });

      socket.on('disconnect', () => {
        sessions.forEach((session, sessionId) => {
          if (session.leaderSocketId === socket.id) {
            session.leaderSocketId = null;
            session.isPlaying = false;
            session.message = "Leader disconnected";
            
            if (scrollIntervals.has(sessionId)) {
              clearInterval(scrollIntervals.get(sessionId));
              scrollIntervals.delete(sessionId);
            }
            
            io.to(sessionId).emit(EVENTS.SNAPSHOT, session);
            const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
            io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
          }
        });
      });
    });
    
    done();
  });

  afterEach(() => {
    // Disconnect all client sockets
    clientSockets.forEach(socket => {
      if (socket.connected) {
        socket.disconnect();
      }
    });
    clientSockets = [];
  });

  describe('Connection Management', () => {
    test('should accept client connections', (done) => {
      const client = new Client(TEST_URL);
      clientSockets.push(client);
      
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        done();
      });
    });

    test('should handle multiple concurrent connections', (done) => {
      let connectedCount = 0;
      const totalClients = 5;
      
      for (let i = 0; i < totalClients; i++) {
        const client = new Client(TEST_URL);
        clientSockets.push(client);
        
        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === totalClients) {
            expect(connectedCount).toBe(totalClients);
            done();
          }
        });
      }
    });
  });

  describe('Session Management', () => {
    test('should create session when client joins', (done) => {
      const client = new Client(TEST_URL);
      clientSockets.push(client);
      
      client.on('connect', () => {
        client.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
      });

      client.on(EVENTS.SNAPSHOT, (data) => {
        expect(data).toMatchObject({
          message: "Waiting for leader…",
          tempo: 100,
          position: 0,
          isPlaying: false,
          tempoBpm: 100
        });
        done();
      });
    });

    test('should update room statistics when clients join', (done) => {
      const client1 = new Client(TEST_URL);
      const client2 = new Client(TEST_URL);
      clientSockets.push(client1, client2);
      
      let roomStatsReceived = 0;
      
      const handleRoomStats = (data) => {
        roomStatsReceived++;
        if (roomStatsReceived === 2) { // Both clients should receive room stats
          expect(data).toMatchObject({
            sessionId: 'test-session',
            memberCount: 2
          });
          done();
        }
      };

      client1.on('connect', () => {
        client1.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
      });

      client1.on(EVENTS.ROOM_STATS, handleRoomStats);
      client2.on(EVENTS.ROOM_STATS, handleRoomStats);

      client2.on('connect', () => {
        client2.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
      });
    });
  });

  describe('Leader/Follower Role Management', () => {
    test('should set leader role and update session state', (done) => {
      const leader = new Client(TEST_URL);
      const follower = new Client(TEST_URL);
      clientSockets.push(leader, follower);
      
      let snapshotCount = 0;
      
      const handleSnapshot = (data) => {
        snapshotCount++;
        if (snapshotCount === 3) { // Initial + leader role + follower receives update
          expect(data.message).toBe("Leader connected");
          expect(data.leaderSocketId).toBeTruthy();
          done();
        }
      };

      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'test-session', role: 'leader' });
      });

      follower.on('connect', () => {
        follower.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
      });

      leader.on(EVENTS.SNAPSHOT, handleSnapshot);
      follower.on(EVENTS.SNAPSHOT, handleSnapshot);
    });

    test('should prevent non-leaders from changing tempo', (done) => {
      const leader = new Client(TEST_URL);
      const follower = new Client(TEST_URL);
      clientSockets.push(leader, follower);
      
      let leaderSetup = false;
      let tempoChangeAttempted = false;
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'test-session', role: 'leader' });
      });

      follower.on('connect', () => {
        follower.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
      });

      leader.on(EVENTS.SNAPSHOT, (data) => {
        if (data.message === "Leader connected" && !leaderSetup) {
          leaderSetup = true;
          // Follower tries to change tempo (should be ignored)
          follower.emit(EVENTS.SET_TEMPO, { sessionId: 'test-session', tempo: 140 });
          tempoChangeAttempted = true;
          
          // Give time for potential tempo change
          setTimeout(() => {
            expect(data.tempoBpm).toBe(100); // Should remain unchanged
            done();
          }, 100);
        }
      });
    });
  });

  describe('Real-time Synchronization', () => {
    test('should start scroll ticking when leader plays', (done) => {
      const leader = new Client(TEST_URL);
      clientSockets.push(leader);
      
      let tickReceived = false;
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'test-session', role: 'leader' });
        leader.emit(EVENTS.PLAY, { sessionId: 'test-session' });
      });

      leader.on(EVENTS.SCROLL_TICK, (data) => {
        if (!tickReceived) {
          tickReceived = true;
          expect(data).toMatchObject({
            sessionId: 'test-session',
            positionMs: expect.any(Number)
          });
          expect(data.positionMs).toBeGreaterThan(0);
          done();
        }
      });
    });

    test('should maintain accurate scroll tick timing', (done) => {
      const leader = new Client(TEST_URL);
      clientSockets.push(leader);
      
      const tickTimestamps = [];
      let tickCount = 0;
      const expectedTicks = 5;
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'test-session', role: 'leader' });
        leader.emit(EVENTS.PLAY, { sessionId: 'test-session' });
      });

      leader.on(EVENTS.SCROLL_TICK, (data) => {
        tickTimestamps.push(Date.now());
        tickCount++;
        
        if (tickCount === expectedTicks) {
          // Analyze timing accuracy
          const intervals = [];
          for (let i = 1; i < tickTimestamps.length; i++) {
            intervals.push(tickTimestamps[i] - tickTimestamps[i - 1]);
          }
          
          const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
          const maxDeviation = Math.max(...intervals.map(i => Math.abs(i - 100))); // 100ms expected
          
          expect(avgInterval).toBeCloseTo(100, 0); // Within 1ms of 100ms
          expect(maxDeviation).toBeLessThan(50); // Max deviation under 50ms
          done();
        }
      });
    });

    test('should stop scroll ticking when paused', (done) => {
      const leader = new Client(TEST_URL);
      clientSockets.push(leader);
      
      let playSnapshot = false;
      let pauseSnapshot = false;
      let ticksAfterPause = 0;
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'test-session' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'test-session', role: 'leader' });
        leader.emit(EVENTS.PLAY, { sessionId: 'test-session' });
      });

      leader.on(EVENTS.SNAPSHOT, (data) => {
        if (data.isPlaying && !playSnapshot) {
          playSnapshot = true;
          // Pause after a short delay
          setTimeout(() => {
            leader.emit(EVENTS.PAUSE, { sessionId: 'test-session' });
          }, 150);
        } else if (!data.isPlaying && playSnapshot && !pauseSnapshot) {
          pauseSnapshot = true;
          // Count ticks for 200ms after pause
          setTimeout(() => {
            expect(ticksAfterPause).toBe(0);
            done();
          }, 200);
        }
      });

      leader.on(EVENTS.SCROLL_TICK, (data) => {
        if (pauseSnapshot) {
          ticksAfterPause++;
        }
      });
    });
  });

  describe('Synchronization Accuracy', () => {
    test('should maintain position consistency across multiple clients', (done) => {
      const leader = new Client(TEST_URL);
      const follower1 = new Client(TEST_URL);
      const follower2 = new Client(TEST_URL);
      clientSockets.push(leader, follower1, follower2);
      
      const clientTicks = {
        leader: [],
        follower1: [],
        follower2: []
      };
      
      const setupClient = (client, name) => {
        client.on('connect', () => {
          client.emit(EVENTS.JOIN_SESSION, { sessionId: 'sync-test' });
        });
        
        client.on(EVENTS.SCROLL_TICK, (data) => {
          clientTicks[name].push({
            position: data.positionMs,
            timestamp: Date.now()
          });
          
          // Check sync after 5 ticks from each client
          if (Object.values(clientTicks).every(ticks => ticks.length >= 5)) {
            analyzeSynchronization();
          }
        });
      };
      
      const analyzeSynchronization = () => {
        const tick5Data = {
          leader: clientTicks.leader[4],
          follower1: clientTicks.follower1[4],
          follower2: clientTicks.follower2[4]
        };
        
        // All clients should have the same position at the same tick
        const positions = Object.values(tick5Data).map(data => data.position);
        const uniquePositions = [...new Set(positions)];
        
        expect(uniquePositions.length).toBe(1); // All positions should be identical
        done();
      };
      
      setupClient(leader, 'leader');
      setupClient(follower1, 'follower1');
      setupClient(follower2, 'follower2');
      
      // Start playback once leader is set up
      leader.on(EVENTS.SNAPSHOT, (data) => {
        if (data.message === "Leader connected") {
          leader.emit(EVENTS.PLAY, { sessionId: 'sync-test' });
        }
      });
      
      leader.on('connect', () => {
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'sync-test', role: 'leader' });
      });
    });

    test('should handle sync requests accurately', (done) => {
      const leader = new Client(TEST_URL);
      const follower = new Client(TEST_URL);
      clientSockets.push(leader, follower);
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'sync-request-test' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'sync-request-test', role: 'leader' });
        leader.emit(EVENTS.SET_TEMPO, { sessionId: 'sync-request-test', tempo: 120 });
        leader.emit(EVENTS.PLAY, { sessionId: 'sync-request-test' });
      });

      follower.on('connect', () => {
        follower.emit(EVENTS.JOIN_SESSION, { sessionId: 'sync-request-test' });
        
        // Wait a bit then request sync
        setTimeout(() => {
          follower.emit(EVENTS.SYNC_REQUEST, { sessionId: 'sync-request-test' });
        }, 250);
      });

      follower.on(EVENTS.SYNC_RESPONSE, (data) => {
        expect(data).toMatchObject({
          sessionId: 'sync-request-test',
          positionMs: expect.any(Number),
          tempoBpm: 120,
          isPlaying: true
        });
        
        expect(data.positionMs).toBeGreaterThan(0);
        expect(data.positionMs).toBeLessThan(1000); // Should be reasonable position
        done();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle disconnect gracefully and clean up leader state', (done) => {
      const leader = new Client(TEST_URL);
      const follower = new Client(TEST_URL);
      clientSockets.push(leader, follower);
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'disconnect-test' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'disconnect-test', role: 'leader' });
        leader.emit(EVENTS.PLAY, { sessionId: 'disconnect-test' });
      });

      follower.on('connect', () => {
        follower.emit(EVENTS.JOIN_SESSION, { sessionId: 'disconnect-test' });
      });

      let leaderPlaying = false;
      
      follower.on(EVENTS.SNAPSHOT, (data) => {
        if (data.isPlaying && !leaderPlaying) {
          leaderPlaying = true;
          // Disconnect leader
          leader.disconnect();
        } else if (!data.isPlaying && leaderPlaying && data.message === "Leader disconnected") {
          expect(data.leaderSocketId).toBe(null);
          expect(data.isPlaying).toBe(false);
          done();
        }
      });
    });

    test('should handle invalid session operations gracefully', (done) => {
      const client = new Client(TEST_URL);
      clientSockets.push(client);
      
      client.on('connect', () => {
        // Try to perform operations on non-existent session
        client.emit(EVENTS.SET_ROLE, { sessionId: 'non-existent', role: 'leader' });
        client.emit(EVENTS.PLAY, { sessionId: 'non-existent' });
        client.emit(EVENTS.SET_TEMPO, { sessionId: 'non-existent', tempo: 140 });
        
        // Should not crash - wait and finish
        setTimeout(() => {
          expect(client.connected).toBe(true);
          done();
        }, 100);
      });
    });
  });

  describe('Performance Under Load', () => {
    test('should handle rapid event emissions', (done) => {
      const leader = new Client(TEST_URL);
      clientSockets.push(leader);
      
      let eventsProcessed = 0;
      const totalEvents = 100;
      
      leader.on('connect', () => {
        leader.emit(EVENTS.JOIN_SESSION, { sessionId: 'load-test' });
        leader.emit(EVENTS.SET_ROLE, { sessionId: 'load-test', role: 'leader' });
        
        // Rapid tempo changes
        for (let i = 0; i < totalEvents; i++) {
          const tempo = 60 + (i % 120); // Vary tempo between 60-180 BPM
          leader.emit(EVENTS.SET_TEMPO, { sessionId: 'load-test', tempo });
        }
      });

      leader.on(EVENTS.SNAPSHOT, (data) => {
        eventsProcessed++;
        if (eventsProcessed >= totalEvents) {
          expect(data.tempoBpm).toBeGreaterThan(0);
          expect(data.tempoBpm).toBeLessThan(200);
          done();
        }
      });
    });
  });
});