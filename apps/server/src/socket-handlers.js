import { performance } from 'perf_hooks';
import { logger } from './logger.js';
import { performanceMonitor } from './performance-monitor.js';
import { EVENTS } from './events.js';
import { v4 as uuidv4 } from 'uuid';

class SocketHandlers {
  constructor(io, syncEngine) {
    this.io = io;
    this.syncEngine = syncEngine;
    this.connectionMap = new Map(); // socketId -> connection metadata
    this.rateLimitMap = new Map(); // socketId -> rate limit data
  }

  setupHandlers(socket) {
    const startTime = performance.now();
    
    // Connection metadata
    const connectionId = uuidv4();
    this.connectionMap.set(socket.id, {
      id: connectionId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      sessions: new Set(),
      rateLimitViolations: 0
    });

    logger.info({ 
      socketId: socket.id, 
      connectionId,
      clientIp: socket.handshake.address 
    }, 'Client connected');

    performanceMonitor.trackSocketConnection();

    // Set up all event handlers with error handling and rate limiting
    this.setupJoinSessionHandler(socket);
    this.setupUpdateMessageHandler(socket);
    this.setupSetRoleHandler(socket);
    this.setupSetTempoHandler(socket);
    this.setupPlayHandler(socket);
    this.setupPauseHandler(socket);
    this.setupSeekHandler(socket);
    this.setupSyncRequestHandler(socket);
    this.setupDisconnectHandler(socket);
    this.setupHeartbeatHandler(socket);

    // Setup connection monitoring
    this.setupConnectionMonitoring(socket);

    const setupLatency = performance.now() - startTime;
    logger.debug({ socketId: socket.id, setupLatency: `${Math.round(setupLatency * 100) / 100}ms` }, 'Socket handlers setup complete');
  }

  setupJoinSessionHandler(socket) {
    socket.on(EVENTS.JOIN_SESSION, async ({ sessionId }) => {
      const startTime = performance.now();
      
      if (!this.validateAndRateLimit(socket, 'JOIN_SESSION')) return;

      try {
        if (!sessionId || typeof sessionId !== 'string') {
          socket.emit('error', { message: 'Invalid session ID' });
          return;
        }

        logger.debug({ socketId: socket.id, sessionId }, 'JOIN_SESSION request');

        // Join socket room
        await socket.join(sessionId);
        
        // Update connection metadata
        const connection = this.connectionMap.get(socket.id);
        if (connection) {
          connection.sessions.add(sessionId);
        }

        // Initialize or get session
        let session = this.syncEngine.getSession(sessionId);
        if (!session) {
          session = await this.syncEngine.initializeSession(sessionId);
        }

        // Update member count
        const roomSize = this.io.sockets.adapter.rooms.get(sessionId)?.size || 0;
        this.syncEngine.updateMemberCount(sessionId, roomSize);

        // Send immediate snapshot
        socket.emit(EVENTS.SNAPSHOT, session);

        const latency = performance.now() - startTime;
        logger.info({ 
          socketId: socket.id, 
          sessionId, 
          memberCount: roomSize,
          latency: `${Math.round(latency * 100) / 100}ms`
        }, 'Client joined session');

        performanceMonitor.trackSyncLatency(latency);

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId, 
          error: error.message 
        }, 'Error in JOIN_SESSION');
        socket.emit('error', { message: 'Failed to join session' });
      }
    });
  }

  setupUpdateMessageHandler(socket) {
    socket.on(EVENTS.UPDATE_MESSAGE, async ({ sessionId, message }) => {
      if (!this.validateAndRateLimit(socket, 'UPDATE_MESSAGE')) return;

      try {
        if (!sessionId || typeof message !== 'string') {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Sanitize message
        const sanitizedMessage = message.slice(0, 500); // Limit message length

        await this.syncEngine.updateSession(sessionId, { 
          message: sanitizedMessage 
        }, true);

        logger.debug({ socketId: socket.id, sessionId, message: sanitizedMessage }, 'Message updated');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId, 
          error: error.message 
        }, 'Error in UPDATE_MESSAGE');
        socket.emit('error', { message: 'Failed to update message' });
      }
    });
  }

  setupSetRoleHandler(socket) {
    socket.on(EVENTS.SET_ROLE, async ({ sessionId, role }) => {
      if (!this.validateAndRateLimit(socket, 'SET_ROLE')) return;

      try {
        if (!sessionId || !['leader', 'follower'].includes(role)) {
          socket.emit('error', { message: 'Invalid role data' });
          return;
        }

        const updates = {};
        if (role === 'leader') {
          updates.leaderSocketId = socket.id;
          updates.message = 'Leader connected';
        }

        await this.syncEngine.updateSession(sessionId, updates, true);

        logger.info({ 
          socketId: socket.id, 
          sessionId, 
          role 
        }, 'Role set');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId, 
          role,
          error: error.message 
        }, 'Error in SET_ROLE');
        socket.emit('error', { message: 'Failed to set role' });
      }
    });
  }

  setupSetTempoHandler(socket) {
    socket.on(EVENTS.SET_TEMPO, async ({ sessionId, tempo }) => {
      if (!this.validateAndRateLimit(socket, 'SET_TEMPO')) return;

      try {
        if (!sessionId || typeof tempo !== 'number' || tempo < 40 || tempo > 300) {
          socket.emit('error', { message: 'Invalid tempo data' });
          return;
        }

        const session = this.syncEngine.getSession(sessionId);
        if (!session || session.leaderSocketId !== socket.id) {
          logger.debug({ socketId: socket.id, sessionId }, 'Unauthorized tempo change blocked');
          socket.emit('error', { message: 'Only leader can change tempo' });
          return;
        }

        await this.syncEngine.updateSession(sessionId, { 
          tempo, 
          tempoBpm: tempo 
        }, true);

        logger.info({ socketId: socket.id, sessionId, tempo }, 'Tempo updated');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId, 
          tempo,
          error: error.message 
        }, 'Error in SET_TEMPO');
        socket.emit('error', { message: 'Failed to set tempo' });
      }
    });
  }

  setupPlayHandler(socket) {
    socket.on(EVENTS.PLAY, async ({ sessionId }) => {
      if (!this.validateAndRateLimit(socket, 'PLAY')) return;

      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Invalid session ID' });
          return;
        }

        const session = this.syncEngine.getSession(sessionId);
        if (!session || session.leaderSocketId !== socket.id) {
          logger.debug({ socketId: socket.id, sessionId }, 'Unauthorized play blocked');
          socket.emit('error', { message: 'Only leader can start playback' });
          return;
        }

        await this.syncEngine.updateSession(sessionId, { 
          isPlaying: true 
        }, true);

        // Start high-precision synchronization
        this.syncEngine.startHighPrecisionSync(sessionId);

        logger.info({ 
          socketId: socket.id, 
          sessionId, 
          tempo: session.tempoBpm 
        }, 'Playback started');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId,
          error: error.message 
        }, 'Error in PLAY');
        socket.emit('error', { message: 'Failed to start playback' });
      }
    });
  }

  setupPauseHandler(socket) {
    socket.on(EVENTS.PAUSE, async ({ sessionId }) => {
      if (!this.validateAndRateLimit(socket, 'PAUSE')) return;

      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Invalid session ID' });
          return;
        }

        const session = this.syncEngine.getSession(sessionId);
        if (!session || session.leaderSocketId !== socket.id) {
          logger.debug({ socketId: socket.id, sessionId }, 'Unauthorized pause blocked');
          socket.emit('error', { message: 'Only leader can pause playback' });
          return;
        }

        await this.syncEngine.updateSession(sessionId, { 
          isPlaying: false 
        }, true);

        // Stop high-precision synchronization
        this.syncEngine.stopHighPrecisionSync(sessionId);

        logger.info({ socketId: socket.id, sessionId }, 'Playback paused');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId,
          error: error.message 
        }, 'Error in PAUSE');
        socket.emit('error', { message: 'Failed to pause playback' });
      }
    });
  }

  setupSeekHandler(socket) {
    socket.on(EVENTS.SEEK, async ({ sessionId, position }) => {
      if (!this.validateAndRateLimit(socket, 'SEEK')) return;

      try {
        if (!sessionId || typeof position !== 'number' || position < 0) {
          socket.emit('error', { message: 'Invalid seek data' });
          return;
        }

        const session = this.syncEngine.getSession(sessionId);
        if (!session || session.leaderSocketId !== socket.id) {
          logger.debug({ socketId: socket.id, sessionId }, 'Unauthorized seek blocked');
          socket.emit('error', { message: 'Only leader can seek' });
          return;
        }

        await this.syncEngine.updateSession(sessionId, { 
          position: Math.round(position)
        }, true);

        logger.info({ 
          socketId: socket.id, 
          sessionId, 
          position: `${position}ms` 
        }, 'Position seeked');

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId, 
          position,
          error: error.message 
        }, 'Error in SEEK');
        socket.emit('error', { message: 'Failed to seek position' });
      }
    });
  }

  setupSyncRequestHandler(socket) {
    socket.on(EVENTS.SYNC_REQUEST, async ({ sessionId }) => {
      if (!this.validateAndRateLimit(socket, 'SYNC_REQUEST', 10)) return; // Higher rate limit for sync

      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Invalid session ID' });
          return;
        }

        await this.syncEngine.handleSyncRequest(sessionId, socket);

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          sessionId,
          error: error.message 
        }, 'Error in SYNC_REQUEST');
        socket.emit('sync_error', { message: 'Sync request failed' });
      }
    });
  }

  setupHeartbeatHandler(socket) {
    socket.on('heartbeat', ({ timestamp }) => {
      const connection = this.connectionMap.get(socket.id);
      if (connection) {
        connection.lastActivity = Date.now();
        
        // Calculate round-trip time
        const rtt = Date.now() - timestamp;
        socket.emit('heartbeat_response', { 
          timestamp: Date.now(), 
          rtt 
        });
      }
    });
  }

  setupDisconnectHandler(socket) {
    socket.on('disconnect', async (reason) => {
      try {
        const connection = this.connectionMap.get(socket.id);
        
        logger.info({ 
          socketId: socket.id, 
          reason,
          connectionDuration: connection ? Date.now() - connection.connectedAt : 0,
          messageCount: connection?.messageCount || 0
        }, 'Client disconnected');

        performanceMonitor.trackSocketDisconnection();

        if (connection) {
          // Clean up leader roles
          for (const sessionId of connection.sessions) {
            const session = this.syncEngine.getSession(sessionId);
            if (session && session.leaderSocketId === socket.id) {
              await this.syncEngine.updateSession(sessionId, {
                leaderSocketId: null,
                isPlaying: false,
                message: 'Leader disconnected'
              }, true);

              // Stop sync for this session
              this.syncEngine.stopHighPrecisionSync(sessionId);

              // Update member count
              const roomSize = this.io.sockets.adapter.rooms.get(sessionId)?.size || 0;
              this.syncEngine.updateMemberCount(sessionId, roomSize);

              logger.info({ socketId: socket.id, sessionId }, 'Leader role cleaned up');
            }
          }
        }

        // Clean up connection metadata
        this.connectionMap.delete(socket.id);
        this.rateLimitMap.delete(socket.id);

      } catch (error) {
        logger.error({ 
          socketId: socket.id, 
          error: error.message 
        }, 'Error in disconnect handler');
      }
    });
  }

  setupConnectionMonitoring(socket) {
    // Monitor connection health
    const monitoringInterval = setInterval(() => {
      const connection = this.connectionMap.get(socket.id);
      if (!connection) {
        clearInterval(monitoringInterval);
        return;
      }

      const timeSinceLastActivity = Date.now() - connection.lastActivity;
      
      // Disconnect stale connections
      if (timeSinceLastActivity > 300000) { // 5 minutes
        logger.warn({ socketId: socket.id, timeSinceLastActivity }, 'Disconnecting stale connection');
        socket.disconnect(true);
        clearInterval(monitoringInterval);
      }
    }, 60000); // Check every minute

    socket.on('disconnect', () => clearInterval(monitoringInterval));
  }

  validateAndRateLimit(socket, eventType, maxPerSecond = 5) {
    const connection = this.connectionMap.get(socket.id);
    if (!connection) return false;

    // Update activity time
    connection.lastActivity = Date.now();
    connection.messageCount++;

    // Rate limiting
    const now = Date.now();
    const rateLimitKey = `${socket.id}:${eventType}`;
    
    if (!this.rateLimitMap.has(rateLimitKey)) {
      this.rateLimitMap.set(rateLimitKey, { count: 0, resetTime: now + 1000 });
    }

    const rateLimit = this.rateLimitMap.get(rateLimitKey);
    
    if (now > rateLimit.resetTime) {
      rateLimit.count = 0;
      rateLimit.resetTime = now + 1000;
    }

    rateLimit.count++;

    if (rateLimit.count > maxPerSecond) {
      connection.rateLimitViolations++;
      logger.warn({ 
        socketId: socket.id, 
        eventType, 
        violations: connection.rateLimitViolations 
      }, 'Rate limit exceeded');
      
      socket.emit('rate_limit_exceeded', { 
        eventType, 
        retryAfter: rateLimit.resetTime - now 
      });

      // Disconnect persistent violators
      if (connection.rateLimitViolations > 10) {
        socket.disconnect(true);
      }
      
      return false;
    }

    performanceMonitor.trackMessage();
    return true;
  }

  getConnectionStats() {
    const stats = {
      totalConnections: this.connectionMap.size,
      connections: []
    };

    for (const [socketId, connection] of this.connectionMap) {
      stats.connections.push({
        socketId,
        connectedAt: connection.connectedAt,
        messageCount: connection.messageCount,
        sessionCount: connection.sessions.size,
        rateLimitViolations: connection.rateLimitViolations
      });
    }

    return stats;
  }
}

export { SocketHandlers };