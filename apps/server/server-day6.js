/**
 * BandSync Server - Day 6 Enhanced with Redis & Role Management
 * Complete session management with Redis persistence and enhanced role transitions
 */

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { EVENTS } from "./src/events.js";
import { sessionManager } from "./src/SessionManager.js";
import { roleManager } from "./src/RoleManager.js";
import { 
  leaderOnly, 
  memberOnly, 
  createEventMiddleware,
  rateLimitMiddleware,
  validateSession,
  loggingMiddleware,
  errorHandler
} from "./src/middleware/roleValidation.js";

dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false // Allow Socket.IO
}));

// Rate limiting for API endpoints
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

// Performance and monitoring
let performanceMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  sessionsCreated: 0,
  leaderTransitions: 0,
  startTime: Date.now()
};

// Scroll intervals tracking (local only - can't persist to Redis easily)
const scrollIntervals = new Map();

// Define leader-only and member-only events
const LEADER_ONLY_EVENTS = [
  EVENTS.PLAY,
  EVENTS.PAUSE, 
  EVENTS.STOP,
  EVENTS.SEEK,
  EVENTS.SET_TEMPO,
  'tempo_change'
];

const MEMBER_ONLY_EVENTS = [
  EVENTS.UPDATE_MESSAGE,
  'request_leader',
  'approve_leader_request',
  'deny_leader_request'
];

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  performanceMetrics.totalConnections++;
  performanceMetrics.activeConnections = io.engine.clientsCount;
  
  // Apply logging middleware to all events for debugging
  socket.use(loggingMiddleware);
  
  // Apply role-based middleware
  socket.use(createEventMiddleware(LEADER_ONLY_EVENTS, MEMBER_ONLY_EVENTS));

  // Session join with enhanced role management
  socket.on(EVENTS.JOIN_SESSION, errorHandler(async ({ sessionId, displayName, role }) => {
    try {
      console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId} as ${role || 'follower'}`);
      
      // Get or create session
      let session = await sessionManager.getSession(sessionId);
      if (!session) {
        session = await sessionManager.createSession(sessionId);
        performanceMetrics.sessionsCreated++;
        console.log(`[${new Date().toISOString()}] Created new session: ${sessionId}`);
      }

      // Check capacity
      const memberCount = await sessionManager.getMemberCount(sessionId);
      if (memberCount >= session.settings.maxMembers) {
        socket.emit(EVENTS.ERROR, { 
          message: `Session at capacity (${session.settings.maxMembers} members)`,
          code: 'SESSION_FULL'
        });
        return;
      }

      // Join socket.io room
      socket.join(sessionId);
      
      // Add member to session
      const member = await sessionManager.addMember(sessionId, socket.id, {
        displayName: displayName || `User ${socket.id.substr(-4)}`,
        role: role || 'follower'
      });

      // Handle leadership assignment
      if (!session.leaderSocketId || role === 'leader') {
        console.log(`[${new Date().toISOString()}] Assigning ${socket.id} as leader for ${sessionId}`);
        await roleManager.assignLeader(sessionId, socket.id, io);
        performanceMetrics.leaderTransitions++;
      }

      // Get updated session and members
      const updatedSession = await sessionManager.getSession(sessionId);
      const allMembers = await sessionManager.getAllMembers(sessionId);
      
      // Send session snapshot to joining member
      const sessionState = {
        ...updatedSession,
        members: Array.from(allMembers.values()),
        serverTimestamp: Date.now()
      };
      socket.emit(EVENTS.SNAPSHOT, sessionState);

      // Broadcast room stats and user join to all members
      const roomStats = {
        sessionId,
        memberCount: await sessionManager.getMemberCount(sessionId),
        isPlaying: updatedSession.isPlaying,
        leader: updatedSession.leaderSocketId,
        uptime: Date.now() - updatedSession.createdAt
      };
      
      io.to(sessionId).emit(EVENTS.ROOM_STATS, roomStats);
      io.to(sessionId).emit(EVENTS.USER_JOINED, {
        member,
        memberCount: roomStats.memberCount
      });

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in JOIN_SESSION:`, error);
      socket.emit(EVENTS.ERROR, { 
        message: 'Failed to join session',
        code: 'JOIN_SESSION_ERROR'
      });
    }
  }));

  // Role management events
  socket.on('request_leader', errorHandler(async ({ sessionId }) => {
    const result = await roleManager.requestLeader(sessionId, socket.id, io);
    socket.emit('leader_request_result', { sessionId, ...result });
    
    if (result.success && !result.pending) {
      performanceMetrics.leaderTransitions++;
    }
  }));

  socket.on('approve_leader_request', errorHandler(async ({ sessionId, requesterId }) => {
    const result = await roleManager.approveLeaderRequest(sessionId, socket.id, requesterId, io);
    socket.emit('leader_approval_result', { sessionId, ...result });
    
    if (result.success) {
      performanceMetrics.leaderTransitions++;
    }
  }));

  socket.on('deny_leader_request', errorHandler(async ({ sessionId, requesterId }) => {
    const result = await roleManager.denyLeaderRequest(sessionId, socket.id, requesterId, io);
    socket.emit('leader_denial_result', { sessionId, ...result });
  }));

  // Legacy SET_ROLE support with new role management
  socket.on(EVENTS.SET_ROLE, errorHandler(async ({ sessionId, role }) => {
    try {
      console.log(`[${new Date().toISOString()}] SET_ROLE: ${socket.id} -> ${role} in ${sessionId}`);
      
      if (role === "leader") {
        const result = await roleManager.requestLeader(sessionId, socket.id, io);
        socket.emit('role_request_result', { sessionId, role, ...result });
        
        if (result.success && !result.pending) {
          performanceMetrics.leaderTransitions++;
        }
      } else {
        // Set as follower
        await sessionManager.addMember(sessionId, socket.id, { role: 'follower' });
        const session = await sessionManager.getSession(sessionId);
        const members = await sessionManager.getAllMembers(sessionId);
        
        const sessionState = {
          ...session,
          members: Array.from(members.values()),
          serverTimestamp: Date.now()
        };
        io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_ROLE:`, error);
      socket.emit(EVENTS.ERROR, { message: 'Role change failed' });
    }
  }));

  // Transport controls (leader-only, middleware enforced)
  socket.on(EVENTS.PLAY, errorHandler(async ({ sessionId }) => {
    const session = await sessionManager.updateSession(sessionId, {
      isPlaying: true
    });
    
    if (session) {
      const serverTimestamp = Date.now();
      console.log(`[${new Date().toISOString()}] PLAY: ${sessionId} at tempo ${session.tempoBpm} BPM`);
      
      const members = await sessionManager.getAllMembers(sessionId);
      const sessionState = {
        ...session,
        members: Array.from(members.values()),
        serverTimestamp
      };
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      io.to(sessionId).emit(EVENTS.PLAY, {
        sessionId,
        tempoBpm: session.tempoBpm,
        position: session.position,
        serverTimestamp
      });

      // Start optimized scroll ticker
      if (!scrollIntervals.has(sessionId)) {
        console.log(`[${new Date().toISOString()}] Starting scroll ticker for ${sessionId}`);
        const interval = setInterval(async () => {
          const currentSession = await sessionManager.getSession(sessionId);
          if (currentSession && currentSession.isPlaying) {
            currentSession.position += 100;
            await sessionManager.updateSession(sessionId, { position: currentSession.position });
            
            io.to(sessionId).emit(EVENTS.SCROLL_TICK, { 
              sessionId, 
              positionMs: currentSession.position,
              tempoBpm: currentSession.tempoBpm,
              serverTimestamp: Date.now()
            });
          } else {
            clearInterval(interval);
            scrollIntervals.delete(sessionId);
          }
        }, 100);
        scrollIntervals.set(sessionId, interval);
      }
    }
  }));

  socket.on(EVENTS.PAUSE, errorHandler(async ({ sessionId }) => {
    const session = await sessionManager.updateSession(sessionId, {
      isPlaying: false
    });
    
    if (session) {
      const serverTimestamp = Date.now();
      console.log(`[${new Date().toISOString()}] PAUSE: ${sessionId}`);
      
      const members = await sessionManager.getAllMembers(sessionId);
      const sessionState = {
        ...session,
        members: Array.from(members.values()),
        serverTimestamp
      };
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      io.to(sessionId).emit(EVENTS.PAUSE, {
        sessionId,
        position: session.position,
        serverTimestamp
      });

      // Clear scroll ticker
      if (scrollIntervals.has(sessionId)) {
        clearInterval(scrollIntervals.get(sessionId));
        scrollIntervals.delete(sessionId);
        console.log(`[${new Date().toISOString()}] Stopped scroll ticker for ${sessionId}`);
      }
    }
  }));

  socket.on(EVENTS.SET_TEMPO, errorHandler(async ({ sessionId, tempo }) => {
    const session = await sessionManager.updateSession(sessionId, {
      tempo,
      tempoBpm: tempo
    });
    
    if (session) {
      console.log(`[${new Date().toISOString()}] SET_TEMPO: ${sessionId} -> ${tempo} BPM`);
      
      const members = await sessionManager.getAllMembers(sessionId);
      const sessionState = {
        ...session,
        members: Array.from(members.values()),
        serverTimestamp: Date.now()
      };
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
    }
  }));

  socket.on(EVENTS.SEEK, errorHandler(async ({ sessionId, position }) => {
    const session = await sessionManager.updateSession(sessionId, {
      position
    });
    
    if (session) {
      console.log(`[${new Date().toISOString()}] SEEK: ${sessionId} -> ${position}ms`);
      
      const members = await sessionManager.getAllMembers(sessionId);
      const sessionState = {
        ...session,
        members: Array.from(members.values()),
        serverTimestamp: Date.now()
      };
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
      io.to(sessionId).emit(EVENTS.SEEK, {
        sessionId,
        position,
        serverTimestamp: Date.now()
      });
    }
  }));

  // Message updates (member-only, middleware enforced)
  socket.on(EVENTS.UPDATE_MESSAGE, errorHandler(async ({ sessionId, message }) => {
    const session = await sessionManager.updateSession(sessionId, { message });
    
    if (session) {
      console.log(`[${new Date().toISOString()}] UPDATE_MESSAGE: ${sessionId} -> "${message}"`);
      
      const members = await sessionManager.getAllMembers(sessionId);
      const sessionState = {
        ...session,
        members: Array.from(members.values()),
        serverTimestamp: Date.now()
      };
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
    }
  }));

  // Sync and latency handling
  socket.on(EVENTS.SYNC_REQUEST, errorHandler(async ({ sessionId }) => {
    const session = await sessionManager.getSession(sessionId);
    if (session) {
      socket.emit(EVENTS.SYNC_RESPONSE, { 
        sessionId, 
        positionMs: session.position,
        tempoBpm: session.tempoBpm,
        isPlaying: session.isPlaying,
        serverTime: Date.now()
      });
    }
  }));

  socket.on(EVENTS.LATENCY_PROBE, ({ timestamp, sessionId }) => {
    const serverTime = Date.now();
    socket.emit(EVENTS.LATENCY_RESPONSE, {
      clientTimestamp: timestamp,
      serverTimestamp: serverTime
    });
  });

  // Session leave
  socket.on(EVENTS.LEAVE_SESSION, errorHandler(async ({ sessionId }) => {
    console.log(`[${new Date().toISOString()}] LEAVE_SESSION: ${socket.id} -> ${sessionId}`);
    socket.leave(sessionId);
    
    await handleMemberDisconnect(sessionId, socket.id);
  }));

  // Disconnect handling with enhanced role management
  socket.on("disconnect", async () => {
    try {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      performanceMetrics.activeConnections = io.engine.clientsCount;

      // Find which session this socket was in
      const session = await sessionManager.getSessionBySocketId(socket.id);
      if (session) {
        await handleMemberDisconnect(session.sessionId || 'unknown', socket.id);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in disconnect:`, error);
    }
  });

  // Helper function for member disconnect handling
  async function handleMemberDisconnect(sessionId, socketId) {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) return;

      // Remove member
      const removedMember = await sessionManager.removeMember(sessionId, socketId);
      
      if (removedMember) {
        // Handle leader disconnect
        if (session.leaderSocketId === socketId) {
          const result = await roleManager.handleLeaderDisconnect(sessionId, socketId, io);
          if (result.success) {
            performanceMetrics.leaderTransitions++;
          }
        }

        // Send updated stats
        const memberCount = await sessionManager.getMemberCount(sessionId);
        const roomStats = {
          sessionId,
          memberCount,
          isPlaying: session.isPlaying,
          leader: session.leaderSocketId
        };

        io.to(sessionId).emit(EVENTS.ROOM_STATS, roomStats);
        io.to(sessionId).emit(EVENTS.USER_LEFT, {
          socketId,
          memberCount
        });

        // Cleanup empty sessions
        if (memberCount === 0) {
          console.log(`[${new Date().toISOString()}] Session ${sessionId} is empty, cleaning up`);
          if (scrollIntervals.has(sessionId)) {
            clearInterval(scrollIntervals.get(sessionId));
            scrollIntervals.delete(sessionId);
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error handling member disconnect:`, error);
    }
  }
});

// Health and status endpoints
app.get("/", (_req, res) => res.json({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  performance: performanceMetrics
}));

app.get("/health", async (_req, res) => {
  const redisHealthy = await sessionManager.healthCheck();
  const stats = await sessionManager.getStats();
  
  res.json({ 
    status: redisHealthy ? "healthy" : "degraded",
    redis: redisHealthy,
    performance: performanceMetrics,
    sessionStats: stats,
    uptime: process.uptime(),
    features: {
      redisSessionPersistence: true,
      enhancedRoleManagement: true,
      leadershipTransitions: true,
      roleValidationMiddleware: true
    }
  });
});

// API endpoints for session management
app.get("/api/sessions", async (_req, res) => {
  try {
    const sessions = await sessionManager.getAllSessions();
    const sessionList = [];
    
    for (const [sessionId, session] of sessions) {
      const memberCount = await sessionManager.getMemberCount(sessionId);
      sessionList.push({
        sessionId,
        memberCount,
        isPlaying: session.isPlaying,
        leader: session.leaderSocketId,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt
      });
    }
    
    res.json({ sessions: sessionList });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup and monitoring
async function startCleanupProcess() {
  // Run cleanup every 5 minutes
  setInterval(async () => {
    try {
      const cleaned = await sessionManager.cleanupExpiredSessions();
      if (cleaned > 0) {
        console.log(`[${new Date().toISOString()}] Cleaned up ${cleaned} expired sessions`);
      }
    } catch (error) {
      console.error('Cleanup process error:', error);
    }
  }, 5 * 60 * 1000);

  // Performance metrics logging every 30 seconds
  setInterval(async () => {
    try {
      const stats = await sessionManager.getStats();
      console.log(`[${new Date().toISOString()}] Performance Metrics:`, {
        ...performanceMetrics,
        ...stats,
        scrollIntervals: scrollIntervals.size
      });
    } catch (error) {
      console.error('Metrics logging error:', error);
    }
  }, 30000);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Clear all intervals
  scrollIntervals.forEach((intervalId) => clearInterval(intervalId));
  scrollIntervals.clear();
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = Number(process.env.PORT || 3001);

async function startServer() {
  try {
    // Wait for Redis connection
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give Redis time to initialize
    
    await startCleanupProcess();
    
    server.listen(PORT, () => {
      console.log(`BandSync Day 6 Server listening on http://localhost:${PORT}`);
      console.log(`Features: Redis persistence, enhanced roles, leadership transitions`);
      console.log(`Leader-only events: ${LEADER_ONLY_EVENTS.join(', ')}`);
      console.log(`Member-only events: ${MEMBER_ONLY_EVENTS.join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();