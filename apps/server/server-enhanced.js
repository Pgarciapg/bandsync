/**
 * Enhanced BandSync Server with Redis Session Persistence
 * Day 5 Sprint: Backend Services Enhancement
 * 
 * Key Improvements:
 * - Redis session persistence (replaces in-memory Map)
 * - Enhanced leader election logic
 * - Performance-optimized synchronization (sub-100ms target)
 * - Connection health monitoring
 * - Robust error handling and cleanup
 */

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { EVENTS } from "./src/events.js";
import { redisClient, sessionStore } from "./src/redis-client.js";

dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false // Allow Socket.IO
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP"
});
app.use('/api', limiter);

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: process.env.CORS_ORIGIN || "*" },
  pingInterval: 10000, // 10 seconds
  pingTimeout: 5000,   // 5 seconds
  maxHttpBufferSize: 1e6, // 1MB
  transports: ['websocket', 'polling']
});

// Performance monitoring
let performanceMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  messagesPerSecond: 0,
  averageLatency: 0,
  lastResetTime: Date.now()
};

// In-memory fallback for scroll intervals (can't be easily stored in Redis)
const scrollIntervals = new Map(); // sessionId -> intervalId
const connectionHealthMap = new Map(); // socketId -> { lastPing, latency, isHealthy }

// Initialize Redis connection
async function initializeRedis() {
  const connected = await redisClient.connect();
  if (!connected) {
    console.warn(`[${new Date().toISOString()}] Warning: Redis not available, falling back to in-memory storage`);
    return false;
  }
  
  // Load existing sessions from Redis on startup
  const sessions = await sessionStore.getAllSessions();
  console.log(`[${new Date().toISOString()}] Loaded ${sessions.size} sessions from Redis`);
  return true;
}

// Enhanced session management with Redis persistence
async function createSession(sessionId, creatorSocketId) {
  const session = {
    message: "Waiting for members…",
    tempo: 120,
    position: 0,
    isPlaying: false,
    leaderSocketId: null,
    tempoBpm: 120,
    members: new Map(),
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    settings: { maxMembers: 8 }
  };
  
  await sessionStore.createSession(sessionId, session);
  console.log(`[${new Date().toISOString()}] Created session ${sessionId} with Redis persistence`);
  return session;
}

async function getSession(sessionId) {
  return await sessionStore.getSession(sessionId);
}

async function updateSession(sessionId, session) {
  session.lastActiveAt = Date.now();
  return await sessionStore.updateSession(sessionId, session);
}

async function addMemberToSession(sessionId, socketId, memberData = {}) {
  const session = await getSession(sessionId);
  if (!session) return null;
  
  const member = {
    socketId,
    joinedAt: Date.now(),
    lastPingAt: Date.now(),
    role: memberData.role || 'follower',
    displayName: memberData.displayName || `User ${socketId.substr(-4)}`,
    ...memberData
  };
  
  session.members.set(socketId, member);
  await updateSession(sessionId, session);
  await sessionStore.setMember(socketId, { sessionId, ...member });
  
  console.log(`[${new Date().toISOString()}] Added member ${socketId} to session ${sessionId} (${session.members.size}/${session.settings.maxMembers})`);
  return member;
}

async function removeMemberFromSession(sessionId, socketId) {
  const session = await getSession(sessionId);
  if (!session) return false;
  
  const member = session.members.get(socketId);
  if (member) {
    session.members.delete(socketId);
    await updateSession(sessionId, session);
    await sessionStore.deleteMember(socketId);
    
    console.log(`[${new Date().toISOString()}] Removed member ${socketId} from session ${sessionId} (${session.members.size} remaining)`);
    
    // Enhanced leader election: elect most senior member
    if (session.leaderSocketId === socketId && session.members.size > 0) {
      const members = Array.from(session.members.values());
      // Sort by joinedAt timestamp (earliest first) for stable leader election
      members.sort((a, b) => a.joinedAt - b.joinedAt);
      const newLeader = members[0];
      
      session.leaderSocketId = newLeader.socketId;
      newLeader.role = 'leader';
      session.members.set(newLeader.socketId, newLeader);
      await updateSession(sessionId, session);
      
      console.log(`[${new Date().toISOString()}] Elected new leader: ${newLeader.socketId} (${newLeader.displayName}) for session ${sessionId}`);
      
      return { member, newLeader: newLeader.socketId };
    }
    
    return { member };
  }
  return false;
}

// Enhanced session stats with Redis metrics
async function getSessionStats(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;
  
  const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
  return {
    sessionId,
    memberCount: roomSize,
    connectedCount: session.members.size,
    isPlaying: session.isPlaying,
    tempo: session.tempoBpm,
    position: session.position,
    leader: session.leaderSocketId,
    uptime: Date.now() - session.createdAt,
    lastActiveAt: session.lastActiveAt
  };
}

// Connection health monitoring
function updateConnectionHealth(socketId, latency = 0) {
  connectionHealthMap.set(socketId, {
    lastPing: Date.now(),
    latency,
    isHealthy: latency < 200 // Consider healthy if under 200ms
  });
}

function getConnectionHealth(socketId) {
  return connectionHealthMap.get(socketId) || { isHealthy: false, latency: 0 };
}

// Performance-optimized scroll ticker with sub-100ms target
function createOptimizedScrollTicker(sessionId, session) {
  if (scrollIntervals.has(sessionId)) {
    clearInterval(scrollIntervals.get(sessionId));
  }
  
  console.log(`[${new Date().toISOString()}] Starting optimized scroll ticker for ${sessionId}`);
  const startTime = Date.now();
  
  const interval = setInterval(async () => {
    const currentSession = await getSession(sessionId);
    if (!currentSession || !currentSession.isPlaying) {
      clearInterval(interval);
      scrollIntervals.delete(sessionId);
      return;
    }
    
    const now = Date.now();
    currentSession.position += 100; // advance 100ms
    
    // Optimize payload size for faster transmission
    const tickData = { 
      sessionId, 
      positionMs: currentSession.position,
      tempoBpm: currentSession.tempoBpm,
      serverTimestamp: now
    };
    
    // Broadcast with minimal latency
    io.to(sessionId).emit(EVENTS.SCROLL_TICK, tickData);
    
    // Update session less frequently to reduce Redis load
    if (now - startTime > 1000) { // Update every second
      await updateSession(sessionId, currentSession);
    }
  }, 100);
  
  scrollIntervals.set(sessionId, interval);
  sessionStore.setScrollInterval(sessionId, interval);
}

// Enhanced cleanup with Redis
async function cleanupInactiveSessions() {
  try {
    const cleaned = await sessionStore.cleanupExpiredSessions();
    
    // Clean up local intervals for sessions that no longer exist
    const sessions = await sessionStore.getAllSessions();
    const activeSessionIds = new Set(sessions.keys());
    
    for (const [sessionId, intervalId] of scrollIntervals) {
      if (!activeSessionIds.has(sessionId)) {
        clearInterval(intervalId);
        scrollIntervals.delete(sessionId);
        console.log(`[${new Date().toISOString()}] Cleaned up orphaned scroll interval for session ${sessionId}`);
      }
    }
    
    return cleaned;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in cleanup:`, error);
    return 0;
  }
}

// Performance metrics tracking
function updatePerformanceMetrics() {
  const now = Date.now();
  const timeDiff = now - performanceMetrics.lastResetTime;
  
  if (timeDiff >= 60000) { // Reset every minute
    performanceMetrics.messagesPerSecond = 0;
    performanceMetrics.lastResetTime = now;
  }
  
  performanceMetrics.messagesPerSecond++;
  performanceMetrics.activeConnections = io.engine.clientsCount;
  
  // Calculate average latency from healthy connections
  const healthyConnections = Array.from(connectionHealthMap.values()).filter(h => h.isHealthy);
  if (healthyConnections.length > 0) {
    performanceMetrics.averageLatency = healthyConnections.reduce((sum, h) => sum + h.latency, 0) / healthyConnections.length;
  }
}

// Initialize server
async function initializeServer() {
  const redisConnected = await initializeRedis();
  
  if (redisConnected) {
    // Run cleanup every 5 minutes
    setInterval(cleanupInactiveSessions, 5 * 60 * 1000);
    
    // Performance metrics logging every 30 seconds
    setInterval(async () => {
      const redisStats = await sessionStore.getStats();
      console.log(`[${new Date().toISOString()}] Performance Metrics:`, {
        ...performanceMetrics,
        ...redisStats
      });
    }, 30000);
  }
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  performanceMetrics.totalConnections++;
  performanceMetrics.activeConnections = io.engine.clientsCount;
  
  // Initialize connection health tracking
  updateConnectionHealth(socket.id, 0);
  
  // Enhanced heartbeat mechanism
  const heartbeatInterval = setInterval(() => {
    const health = getConnectionHealth(socket.id);
    if (health.isHealthy) {
      socket.emit('heartbeat', { timestamp: Date.now() });
    }
  }, 30000); // Every 30 seconds
  
  socket.on('heartbeat_response', ({ timestamp }) => {
    const latency = Date.now() - timestamp;
    updateConnectionHealth(socket.id, latency);
    updatePerformanceMetrics();
  });

  socket.on(EVENTS.JOIN_SESSION, async ({ sessionId, displayName, role }) => {
    try {
      console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId} as ${role || 'follower'}`);
      updatePerformanceMetrics();
      
      // Create session if it doesn't exist
      let session = await getSession(sessionId);
      if (!session) {
        session = await createSession(sessionId, socket.id);
      }
      
      // Check capacity
      if (session.members.size >= session.settings.maxMembers) {
        socket.emit(EVENTS.ERROR, { 
          message: `Session at capacity (${session.settings.maxMembers} members)` 
        });
        return;
      }
      
      // Add member to session
      socket.join(sessionId);
      const member = await addMemberToSession(sessionId, socket.id, {
        displayName: displayName || `User ${socket.id.substr(-4)}`,
        role: role || 'follower'
      });
      
      // Enhanced leadership assignment
      if (session.members.size === 1 || role === 'leader') {
        session.leaderSocketId = socket.id;
        member.role = 'leader';
        session.message = `${member.displayName} is leading`;
        await updateSession(sessionId, session);
      }
      
      // Send current state to joining member
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp: Date.now()
      };
      socket.emit(EVENTS.SNAPSHOT, sessionState);
      
      // Notify all members of new joiner
      const stats = await getSessionStats(sessionId);
      io.to(sessionId).emit(EVENTS.ROOM_STATS, stats);
      io.to(sessionId).emit(EVENTS.USER_JOINED, {
        member,
        memberCount: stats.memberCount
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in JOIN_SESSION:`, error);
      socket.emit(EVENTS.ERROR, { message: 'Failed to join session' });
    }
  });

  socket.on(EVENTS.UPDATE_MESSAGE, async ({ sessionId, message }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      
      console.log(`[${new Date().toISOString()}] UPDATE_MESSAGE: ${sessionId} -> "${message}"`);
      session.message = message;
      await updateSession(sessionId, session);
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp: Date.now()
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in UPDATE_MESSAGE:`, error);
    }
  });

  socket.on(EVENTS.SET_ROLE, async ({ sessionId, role }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      
      console.log(`[${new Date().toISOString()}] SET_ROLE: ${socket.id} -> ${role} in ${sessionId}`);
      
      if (role === "leader") {
        // Enhanced role transition - notify previous leader
        const previousLeader = session.leaderSocketId;
        session.leaderSocketId = socket.id;
        session.message = "Leader connected";
        
        const member = session.members.get(socket.id);
        if (member) {
          member.role = 'leader';
          session.members.set(socket.id, member);
        }
        
        await updateSession(sessionId, session);
        
        // Notify about leadership change
        if (previousLeader && previousLeader !== socket.id) {
          io.to(sessionId).emit(EVENTS.ROLE_CHANGED, {
            socketId: socket.id,
            role: 'leader',
            previousLeader,
            timestamp: Date.now()
          });
        }
        
        console.log(`[${new Date().toISOString()}] New leader set: ${socket.id} in ${sessionId}`);
      }
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp: Date.now()
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_ROLE:`, error);
    }
  });

  socket.on(EVENTS.SET_TEMPO, async ({ sessionId, tempo }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      if (session.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED SET_TEMPO: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] SET_TEMPO: ${sessionId} -> ${tempo} BPM`);
      session.tempo = tempo;
      session.tempoBpm = tempo;
      await updateSession(sessionId, session);
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp: Date.now()
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_TEMPO:`, error);
    }
  });

  socket.on(EVENTS.PLAY, async ({ sessionId }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      if (session.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED PLAY: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] PLAY: ${sessionId} at tempo ${session.tempoBpm} BPM`);
      session.isPlaying = true;
      const serverTimestamp = Date.now();
      await updateSession(sessionId, session);
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      
      // Optimized PLAY event with server timestamp for precise sync
      io.to(sessionId).emit(EVENTS.PLAY, {
        sessionId,
        tempoBpm: session.tempoBpm,
        position: session.position,
        serverTimestamp
      });
      
      // Start optimized scroll ticker
      createOptimizedScrollTicker(sessionId, session);
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in PLAY:`, error);
    }
  });

  socket.on(EVENTS.PAUSE, async ({ sessionId }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      if (session.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED PAUSE: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] PAUSE: ${sessionId}`);
      session.isPlaying = false;
      const serverTimestamp = Date.now();
      await updateSession(sessionId, session);
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      
      // Optimized PAUSE event with server timestamp for precise sync
      io.to(sessionId).emit(EVENTS.PAUSE, {
        sessionId,
        position: session.position,
        serverTimestamp
      });
      
      // Clear scroll tick interval
      if (scrollIntervals.has(sessionId)) {
        console.log(`[${new Date().toISOString()}] Stopping scroll ticker for ${sessionId}`);
        clearInterval(scrollIntervals.get(sessionId));
        scrollIntervals.delete(sessionId);
        await sessionStore.deleteScrollInterval(sessionId);
      }
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in PAUSE:`, error);
    }
  });

  socket.on(EVENTS.SEEK, async ({ sessionId, position }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      if (session.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED SEEK: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      
      console.log(`[${new Date().toISOString()}] SEEK: ${sessionId} -> ${position}ms`);
      session.position = position;
      const serverTimestamp = Date.now();
      await updateSession(sessionId, session);
      
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()),
        serverTimestamp
      };
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      
      // Optimized SEEK event with server timestamp for precise sync
      io.to(sessionId).emit(EVENTS.SEEK, {
        sessionId,
        position,
        serverTimestamp
      });
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SEEK:`, error);
    }
  });

  socket.on(EVENTS.SYNC_REQUEST, async ({ sessionId }) => {
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      
      const serverTime = Date.now();
      socket.emit(EVENTS.SYNC_RESPONSE, { 
        sessionId, 
        positionMs: session.position,
        tempoBpm: session.tempoBpm,
        isPlaying: session.isPlaying,
        serverTime
      });
      updatePerformanceMetrics();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SYNC_REQUEST:`, error);
    }
  });

  // Enhanced latency measurement with connection health tracking
  socket.on(EVENTS.LATENCY_PROBE, ({ timestamp, sessionId }) => {
    try {
      const serverTime = Date.now();
      const latency = serverTime - timestamp;
      
      socket.emit(EVENTS.LATENCY_RESPONSE, {
        clientTimestamp: timestamp,
        serverTimestamp: serverTime
      });
      
      updateConnectionHealth(socket.id, latency);
      updatePerformanceMetrics();
      
      if (latency > 100) {
        console.warn(`[${new Date().toISOString()}] HIGH LATENCY from ${socket.id}: ${latency}ms`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in LATENCY_PROBE:`, error);
    }
  });

  socket.on("disconnect", async () => {
    try {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      clearInterval(heartbeatInterval);
      connectionHealthMap.delete(socket.id);
      
      // Find which session this socket was in from Redis
      const memberData = await sessionStore.getMember(socket.id);
      if (memberData) {
        const { sessionId } = memberData;
        const result = await removeMemberFromSession(sessionId, socket.id);
        
        if (result) {
          const session = await getSession(sessionId);
          
          // Enhanced leader handoff when leader disconnects
          if (result.newLeader) {
            session.message = `${session.members.get(result.newLeader).displayName} is now leading`;
            
            // Stop playback during leader transition for stability
            session.isPlaying = false;
            await updateSession(sessionId, session);
            
            if (scrollIntervals.has(sessionId)) {
              clearInterval(scrollIntervals.get(sessionId));
              scrollIntervals.delete(sessionId);
            }
            
            io.to(sessionId).emit(EVENTS.ROLE_CHANGED, {
              socketId: result.newLeader,
              role: 'leader',
              previousRole: 'follower',
              reason: 'leader_disconnected',
              timestamp: Date.now()
            });
            
            console.log(`[${new Date().toISOString()}] Leader handoff complete: ${result.newLeader} now leads session ${sessionId}`);
          }
          
          // Send updated session state
          const sessionState = {
            ...session,
            members: Array.from(session.members.values()),
            serverTimestamp: Date.now()
          };
          io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
          
          // Send updated room stats
          const stats = await getSessionStats(sessionId);
          io.to(sessionId).emit(EVENTS.ROOM_STATS, stats);
          
          // Notify of user leaving
          io.to(sessionId).emit(EVENTS.USER_LEFT, {
            socketId: socket.id,
            memberCount: stats.memberCount,
            newLeader: result.newLeader || null
          });
        }
      }
      
      performanceMetrics.activeConnections = io.engine.clientsCount;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in disconnect:`, error);
    }
  });
});

// Health check endpoints
app.get("/", (_req, res) => res.json({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  performance: performanceMetrics
}));

app.get("/health", async (_req, res) => {
  const redisHealthy = await redisClient.healthCheck();
  const stats = await sessionStore.getStats();
  
  res.json({ 
    status: redisHealthy ? "healthy" : "degraded",
    redis: redisHealthy,
    performance: performanceMetrics,
    sessionStats: stats,
    uptime: process.uptime()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Clear all intervals
  scrollIntervals.forEach((intervalId) => clearInterval(intervalId));
  scrollIntervals.clear();
  
  // Close Redis connection
  await redisClient.disconnect();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Initialize and start server
const PORT = Number(process.env.PORT || 3001);

async function startServer() {
  await initializeServer();
  
  server.listen(PORT, () => {
    console.log(`BandSync Enhanced Server listening on http://localhost:${PORT}`);
    console.log(`Performance target: <100ms synchronization latency`);
    console.log(`Features: Redis persistence, enhanced leader election, connection monitoring`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});