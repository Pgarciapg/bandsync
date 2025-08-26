/**
 * BandSync Hybrid Server - Day 5 Sprint Implementation
 * Falls back to basic functionality when Redis is not available
 */

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

// Import both versions for fallback capability
import { getRedisManager } from "./src/redis-manager.js";
import { SessionManager } from "./src/session-manager.js";
import { EVENTS as ENHANCED_EVENTS } from "./src/events-enhanced.js";
import { EVENTS } from "./src/events.js";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later."
});

app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*", credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Connection statistics
const connectionStats = {
  totalConnections: 0,
  peakConnections: 0,
  sessionsActive: 0,
  startTime: Date.now()
};

// Hybrid storage - will use Redis if available, in-memory as fallback
let redisManager = null;
let sessionManager = null;
let useEnhancedMode = false;

// Basic in-memory storage (fallback)
const sessions = new Map();
const scrollIntervals = new Map();
const memberInfo = new Map();

// Initialize storage
async function initializeStorage() {
  if (process.env.REDIS_ENABLED === 'true') {
    try {
      redisManager = getRedisManager({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3
      });
      
      // Test Redis connection
      await redisManager.redis.ping();
      sessionManager = new SessionManager(redisManager, io);
      useEnhancedMode = true;
      
      console.log('🚀 Enhanced mode: Redis connected, using advanced session management');
    } catch (error) {
      console.warn('⚠️  Redis connection failed, falling back to basic mode:', error.message);
      useEnhancedMode = false;
    }
  } else {
    console.log('📝 Development mode: Using in-memory session storage');
    useEnhancedMode = false;
  }
}

// Basic session management functions (fallback)
function createBasicSession(sessionId, creatorSocketId) {
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
  sessions.set(sessionId, session);
  return session;
}

function addBasicMember(sessionId, socketId, memberData = {}) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const member = {
    socketId,
    joinedAt: Date.now(),
    lastPingAt: Date.now(),
    role: memberData.role || 'follower',
    displayName: memberData.displayName || `User ${socketId.substr(-4)}`
  };
  
  session.members.set(socketId, member);
  session.lastActiveAt = Date.now();
  memberInfo.set(socketId, { sessionId, ...member });
  
  return member;
}

function removeBasicMember(sessionId, socketId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  const member = session.members.get(socketId);
  if (member) {
    session.members.delete(socketId);
    memberInfo.delete(socketId);
    session.lastActiveAt = Date.now();
    
    // Simple leader election
    if (session.leaderSocketId === socketId && session.members.size > 0) {
      const newLeader = Array.from(session.members.keys())[0];
      session.leaderSocketId = newLeader;
      session.members.get(newLeader).role = 'leader';
      return { member, newLeader };
    }
    
    return { member };
  }
  return false;
}

// Socket.IO Connection Handling
io.on("connection", (socket) => {
  const clientInfo = {
    id: socket.id,
    ip: socket.handshake.address,
    connectedAt: Date.now()
  };

  connectionStats.totalConnections++;
  connectionStats.peakConnections = Math.max(connectionStats.peakConnections, io.engine.clientsCount);

  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id} (${useEnhancedMode ? 'Enhanced' : 'Basic'} mode)`);

  // Route events based on mode
  if (useEnhancedMode) {
    // Use enhanced session manager
    setupEnhancedEventHandlers(socket);
  } else {
    // Use basic event handlers
    setupBasicEventHandlers(socket);
  }

  socket.on("disconnect", (reason) => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}, reason: ${reason}`);
    connectionStats.totalConnections = Math.max(0, connectionStats.totalConnections - 1);
    
    if (useEnhancedMode) {
      // Enhanced mode cleanup handled by SessionManager
    } else {
      // Basic mode cleanup
      const memberData = memberInfo.get(socket.id);
      if (memberData) {
        const result = removeBasicMember(memberData.sessionId, socket.id);
        if (result && result.newLeader) {
          const session = sessions.get(memberData.sessionId);
          io.to(memberData.sessionId).emit(EVENTS.ROLE_CHANGED, {
            socketId: result.newLeader,
            role: 'leader',
            reason: 'leader_disconnected'
          });
        }
      }
    }
  });
});

function setupEnhancedEventHandlers(socket) {
  // Enhanced mode uses SessionManager event handlers
  // Legacy support
  socket.on(EVENTS.JOIN_SESSION, async ({ sessionId, displayName, role }) => {
    await sessionManager.joinSession(socket, {
      sessionId,
      userId: socket.id,
      displayName: displayName || `User_${socket.id.substr(0, 6)}`
    });
  });

  // Other enhanced events are handled by SessionManager
}

function setupBasicEventHandlers(socket) {
  // Basic mode - similar to original server.js but with improvements
  
  socket.on(EVENTS.JOIN_SESSION, ({ sessionId, displayName, role }) => {
    console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId} as ${role || 'follower'}`);
    
    let session = sessions.get(sessionId);
    if (!session) {
      session = createBasicSession(sessionId, socket.id);
    }
    
    if (session.members.size >= session.settings.maxMembers) {
      socket.emit(EVENTS.ERROR, { message: `Session at capacity (${session.settings.maxMembers} members)` });
      return;
    }
    
    socket.join(sessionId);
    const member = addBasicMember(sessionId, socket.id, {
      displayName: displayName || `User ${socket.id.substr(-4)}`,
      role: role || 'follower'
    });
    
    // Auto-assign leadership
    if (session.members.size === 1 || role === 'leader') {
      session.leaderSocketId = socket.id;
      member.role = 'leader';
      session.message = `${member.displayName} is leading`;
    }
    
    // Send session state
    const sessionState = {
      ...session,
      members: Array.from(session.members.values()),
      serverTimestamp: Date.now()
    };
    socket.emit(EVENTS.SNAPSHOT, sessionState);
    
    // Notify others
    io.to(sessionId).emit(EVENTS.USER_JOINED, {
      member,
      memberCount: session.members.size
    });
  });

  socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
    const session = sessions.get(sessionId);
    if (!session || session.leaderSocketId !== socket.id) return;
    
    session.tempo = tempo;
    session.tempoBpm = tempo;
    
    const sessionState = {
      ...session,
      serverTimestamp: Date.now()
    };
    io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
  });

  socket.on(EVENTS.PLAY, ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session || session.leaderSocketId !== socket.id) return;
    
    session.isPlaying = true;
    const serverTimestamp = Date.now();
    
    io.to(sessionId).emit(EVENTS.PLAY, {
      sessionId,
      tempoBpm: session.tempoBpm,
      position: session.position,
      serverTimestamp
    });
    
    // Start basic scroll tick
    if (!scrollIntervals.has(sessionId)) {
      const interval = setInterval(() => {
        const currentSession = sessions.get(sessionId);
        if (currentSession && currentSession.isPlaying) {
          currentSession.position += 100;
          io.to(sessionId).emit(EVENTS.SCROLL_TICK, { 
            sessionId, 
            positionMs: currentSession.position,
            tempoBpm: currentSession.tempoBpm,
            serverTimestamp: Date.now()
          });
        }
      }, 100);
      scrollIntervals.set(sessionId, interval);
    }
  });

  socket.on(EVENTS.PAUSE, ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session || session.leaderSocketId !== socket.id) return;
    
    session.isPlaying = false;
    io.to(sessionId).emit(EVENTS.PAUSE, {
      sessionId,
      position: session.position,
      serverTimestamp: Date.now()
    });
    
    if (scrollIntervals.has(sessionId)) {
      clearInterval(scrollIntervals.get(sessionId));
      scrollIntervals.delete(sessionId);
    }
  });

  // Latency measurement
  socket.on(EVENTS.LATENCY_PROBE, ({ timestamp }) => {
    socket.emit(EVENTS.LATENCY_RESPONSE, {
      clientTimestamp: timestamp,
      serverTimestamp: Date.now()
    });
  });
}

// HTTP Endpoints
app.get("/", (req, res) => {
  res.json({ 
    ok: true,
    service: "BandSync Hybrid Server",
    version: process.env.SERVER_VERSION || "2.0.0",
    mode: useEnhancedMode ? "enhanced" : "basic",
    uptime: Date.now() - connectionStats.startTime
  });
});

app.get("/health", async (req, res) => {
  let redisStatus = "disabled";
  
  if (redisManager) {
    try {
      await redisManager.redis.ping();
      redisStatus = "connected";
    } catch (error) {
      redisStatus = "error: " + error.message;
    }
  }
  
  res.json({
    status: "healthy",
    timestamp: Date.now(),
    mode: useEnhancedMode ? "enhanced" : "basic",
    connections: {
      current: io.engine.clientsCount,
      total: connectionStats.totalConnections,
      peak: connectionStats.peakConnections
    },
    redis: redisStatus,
    sessions: useEnhancedMode ? "managed by SessionManager" : sessions.size,
    uptime: Date.now() - connectionStats.startTime
  });
});

app.get("/api/metrics", (req, res) => {
  res.json({
    connections: connectionStats,
    sessions: {
      active: useEnhancedMode ? 
        sessionManager?.healthMetrics?.totalSessions || 0 : 
        sessions.size,
      mode: useEnhancedMode ? "enhanced" : "basic"
    },
    performance: useEnhancedMode ? {
      avgLatency: sessionManager?.syncEngine?.metrics?.avgLatency || 0,
      syncDrift: sessionManager?.syncEngine?.metrics?.syncDrift || 0
    } : {
      avgLatency: 0,
      syncDrift: 0,
      note: "Performance metrics available in enhanced mode only"
    },
    timestamp: Date.now()
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('\nStarting graceful shutdown...');
  
  try {
    server.close(() => console.log('HTTP server closed.'));
    io.close(() => console.log('Socket.io server closed.'));

    if (useEnhancedMode && sessionManager) {
      await sessionManager.cleanup();
      console.log('Session manager cleaned up.');
    }

    // Clear basic mode intervals
    for (const [sessionId, interval] of scrollIntervals) {
      clearInterval(interval);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || 'localhost';

initializeStorage().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`
🎵 BandSync Hybrid Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server: http://${HOST}:${PORT}
⚙️  Mode: ${useEnhancedMode ? 'Enhanced (Redis)' : 'Basic (In-Memory)'}
${useEnhancedMode ? '🔗 Redis: ' + process.env.REDIS_HOST + ':' + process.env.REDIS_PORT : '💾 Storage: In-Memory'}
⚡ Features: ${useEnhancedMode ? 'Sub-50ms sync, Advanced session management' : 'Basic sync, Session management'}
📊 Monitoring: /health, /api/metrics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  });
});

export { io, redisManager, sessionManager };