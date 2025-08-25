/**
 * Enhanced BandSync Server
 * Production-ready server with Redis, advanced sync, and 100+ session support
 */

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Enhanced BandSync components
import { getRedisManager } from "./src/redis-manager.js";
import { SessionManager } from "./src/session-manager.js";
import { EVENTS } from "./src/events-enhanced.js";

// Load environment configuration
dotenv.config();

// Create Express application with security middleware
const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for Socket.io
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({ 
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));

// Rate limiting for HTTP endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});

app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10mb' }));

// HTTP Server
const server = http.createServer(app);

// Socket.io Server with enhanced configuration
const io = new Server(server, {
  cors: { 
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB max buffer
  transports: ['websocket', 'polling'],
  allowEIO3: true // Backwards compatibility
});

// Connection state tracking
const connectionStats = {
  totalConnections: 0,
  peakConnections: 0,
  sessionsActive: 0,
  startTime: Date.now()
};

// Initialize Redis Manager
const redisManager = getRedisManager({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3
});

// Initialize Session Manager
const sessionManager = new SessionManager(redisManager, io);

/**
 * ENHANCED SOCKET.IO CONNECTION HANDLING
 */
io.on("connection", (socket) => {
  const clientInfo = {
    id: socket.id,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    connectedAt: Date.now()
  };

  connectionStats.totalConnections++;
  connectionStats.peakConnections = Math.max(
    connectionStats.peakConnections,
    io.engine.clientsCount
  );

  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id} from ${clientInfo.ip}`);

  // Send connection acknowledgment with server info
  socket.emit(EVENTS.AUTH_HANDSHAKE, {
    serverId: process.env.SERVER_ID || 'bandsync-server',
    serverVersion: process.env.SERVER_VERSION || '2.0.0',
    features: [
      'redis-persistence',
      'high-frequency-sync',
      'multi-band-routing',
      'sub-50ms-latency'
    ],
    limits: {
      maxSessionMembers: 8,
      maxSessionsPerBand: 50,
      syncRate: '80fps'
    }
  });

  /**
   * ENHANCED SESSION EVENTS
   * All handled by SessionManager with rate limiting and validation
   */

  // Legacy event support for migration
  socket.on(EVENTS.JOIN_SESSION, async ({ sessionId }) => {
    console.log(`[${new Date().toISOString()}] LEGACY JOIN_SESSION: ${socket.id} -> ${sessionId}`);
    
    // Convert to new format
    await sessionManager.joinSession(socket, {
      sessionId,
      userId: socket.id, // Temporary user ID
      displayName: `User_${socket.id.substr(0, 6)}`
    });
  });

  // Legacy tempo and control events
  socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
    sessionManager.startMetronome(socket, { sessionId, tempo });
  });

  socket.on(EVENTS.PLAY, ({ sessionId }) => {
    const session = redisManager.getSession(sessionId);
    if (session) {
      sessionManager.startMetronome(socket, { 
        sessionId, 
        tempo: session.metronome?.tempo || 120 
      });
    }
  });

  socket.on(EVENTS.PAUSE, ({ sessionId }) => {
    sessionManager.stopMetronome(socket, { sessionId });
  });

  /**
   * PERFORMANCE MONITORING EVENTS
   */
  
  socket.on(EVENTS.LATENCY_PROBE, (timestamp) => {
    // Echo back for RTT measurement
    socket.emit(EVENTS.LATENCY_RESPONSE, {
      clientTimestamp: timestamp,
      serverTimestamp: Date.now()
    });
  });

  /**
   * ERROR HANDLING
   */
  
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
    
    socket.emit(EVENTS.ERROR_CONNECTION_LOST, {
      message: 'Connection error occurred',
      shouldReconnect: true,
      reconnectDelay: 1000
    });
  });

  /**
   * DISCONNECT HANDLING
   */
  
  socket.on("disconnect", (reason) => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}, reason: ${reason}`);
    
    connectionStats.totalConnections = Math.max(0, connectionStats.totalConnections - 1);
    
    // Cleanup is handled by SessionManager automatically
  });
});

/**
 * HTTP API ENDPOINTS
 */

app.get("/", (req, res) => {
  res.json({ 
    ok: true,
    service: "BandSync Server",
    version: process.env.SERVER_VERSION || "2.0.0",
    uptime: Date.now() - connectionStats.startTime
  });
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    // Test Redis connection
    await redisManager.redis.ping();
    
    res.json({
      status: "healthy",
      timestamp: Date.now(),
      connections: {
        current: io.engine.clientsCount,
        total: connectionStats.totalConnections,
        peak: connectionStats.peakConnections
      },
      redis: "connected",
      uptime: Date.now() - connectionStats.startTime
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Sessions API
app.get("/api/sessions", async (req, res) => {
  try {
    const bandId = req.query.bandId;
    
    if (bandId) {
      const sessions = await sessionManager.getBandSessions(bandId);
      res.json({ sessions });
    } else {
      const sessions = await redisManager.getActiveSessions();
      res.json({ 
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          bandId: s.bandId,
          memberCount: s.members?.size || 0,
          isPlaying: s.metronome?.isPlaying || false
        }))
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Metrics endpoint for monitoring
app.get("/api/metrics", (req, res) => {
  res.json({
    connections: connectionStats,
    sessions: {
      active: sessionManager.healthMetrics.totalSessions,
      avgSize: sessionManager.healthMetrics.avgSessionSize
    },
    performance: {
      avgLatency: sessionManager.syncEngine?.metrics?.avgLatency || 0,
      syncDrift: sessionManager.syncEngine?.metrics?.syncDrift || 0
    },
    timestamp: Date.now()
  });
});

// Latency profiling endpoint
app.get("/api/latency/:sessionId?", (req, res) => {
  const sessionId = req.params.sessionId;
  const eventType = req.query.eventType;
  
  try {
    const latencyMetrics = sessionManager.getLatencyMetrics(sessionId, eventType);
    res.json({
      success: true,
      data: latencyMetrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ERROR HANDLING & GRACEFUL SHUTDOWN
 */

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown() {
  console.log('\nStarting graceful shutdown...');
  
  try {
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
    });

    // Close Socket.io connections
    io.close(() => {
      console.log('Socket.io server closed.');
    });

    // Cleanup session manager
    await sessionManager.cleanup();
    console.log('Session manager cleaned up.');

    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * SERVER STARTUP
 */

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
  console.log(`
🎵 BandSync Enhanced Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server: http://${HOST}:${PORT}
🔗 Redis: ${redisManager.config.host}:${redisManager.config.port}
⚡ Features: Sub-50ms sync, 100+ sessions, Multi-band routing
📊 Monitoring: /health, /api/metrics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

export { io, redisManager, sessionManager };