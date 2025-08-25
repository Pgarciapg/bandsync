/**
 * BandSync Scalable Session Manager  
 * Handles 100+ concurrent sessions with multi-band routing
 */

import { EVENTS, EVENT_SCHEMAS, RATE_LIMITS } from './events-enhanced.js';
import { SyncEngine } from './sync-engine.js';

export class SessionManager {
  constructor(redisManager, io) {
    this.redis = redisManager;
    this.io = io;
    this.syncEngine = new SyncEngine(redisManager, io);
    
    // Connection pools and load balancing
    this.sessionPools = new Map(); // bandId -> Set<sessionId>
    this.connectionCounts = new Map(); // sessionId -> count
    this.rateLimiters = new Map(); // socketId -> rate limit state
    
    // Multi-band routing
    this.bandRouters = new Map(); // bandId -> BandRouter
    
    // Health monitoring
    this.healthMetrics = {
      totalSessions: 0,
      totalConnections: 0,
      avgSessionSize: 0,
      peakSessionSize: 0,
      lastHealthCheck: Date.now()
    };

    // Latency profiling
    this.latencyMetrics = {
      eventLatencies: new Map(), // eventType -> [latencies]
      sessionLatencies: new Map(), // sessionId -> avgLatency
      clientLatencies: new Map(), // socketId -> latency data
      measurementWindow: 60000 // 1 minute window
    };
    
    this.setupHealthMonitoring();
    this.setupEventHandlers();
  }

  /**
   * SESSION LIFECYCLE MANAGEMENT
   */
  
  async createSession(socket, sessionData) {
    try {
      // Validate input
      const validation = this.validateEventData(EVENTS.SESSION_CREATE, sessionData);
      if (!validation.valid) {
        socket.emit(EVENTS.ERROR_VALIDATION, validation.errors);
        return null;
      }

      const sessionId = this.generateSessionId();
      const bandId = sessionData.bandId;

      // Create session in Redis
      const session = await this.redis.createSession({
        sessionId,
        ...sessionData,
        creatorSocketId: socket.id,
        leaderSocketId: socket.id,
        maxMembers: sessionData.maxMembers || 8
      });

      // Initialize session pool tracking
      if (!this.sessionPools.has(bandId)) {
        this.sessionPools.set(bandId, new Set());
      }
      this.sessionPools.get(bandId).add(sessionId);
      this.connectionCounts.set(sessionId, 0);

      // Setup Redis pub/sub for this session
      await this.redis.subscribeToSession(sessionId, (event, data) => {
        this.handleSessionEvent(sessionId, event, data);
      });

      console.log(`Session created: ${sessionId} in band ${bandId}`);
      
      // Add creator to session
      await this.joinSession(socket, { sessionId, ...sessionData });
      
      return session;

    } catch (error) {
      console.error('Error creating session:', error);
      socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Failed to create session' });
      return null;
    }
  }

  async joinSession(socket, joinData) {
    try {
      const validation = this.validateEventData(EVENTS.SESSION_JOIN, joinData);
      if (!validation.valid) {
        socket.emit(EVENTS.ERROR_VALIDATION, validation.errors);
        return false;
      }

      const { sessionId } = joinData;
      const session = await this.redis.getSession(sessionId);
      
      if (!session) {
        socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Session not found' });
        return false;
      }

      // Check capacity
      const currentCount = this.connectionCounts.get(sessionId) || 0;
      if (currentCount >= session.maxMembers) {
        socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Session at capacity' });
        return false;
      }

      // Join socket room
      socket.join(sessionId);
      
      // Initialize clock sync for this socket
      await this.syncEngine.initializeClockSync(socket);

      // Add member to session
      const memberData = {
        socketId: socket.id,
        userId: joinData.userId,
        displayName: joinData.displayName,
        instrument: joinData.instrument || 'unknown',
        preferredRole: joinData.preferredRole || 'follower'
      };

      await this.redis.addMember(sessionId, memberData);
      
      // Update connection count
      const newCount = currentCount + 1;
      this.connectionCounts.set(sessionId, newCount);
      this.updateHealthMetrics();

      // Send session state to new member
      const updatedSession = await this.redis.getSession(sessionId);
      socket.emit(EVENTS.SESSION_STATE_SYNC, updatedSession);

      // Notify all members of new joiner
      this.io.to(sessionId).emit(EVENTS.SESSION_MEMBER_UPDATE, {
        action: 'joined',
        member: memberData,
        memberCount: newCount
      });

      console.log(`Member ${socket.id} joined session ${sessionId} (${newCount}/${session.maxMembers})`);
      return true;

    } catch (error) {
      console.error('Error joining session:', error);
      socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Failed to join session' });
      return false;
    }
  }

  async leaveSession(socket, sessionId) {
    try {
      const session = await this.redis.getSession(sessionId);
      if (!session) return false;

      // Leave socket room
      socket.leave(sessionId);

      // Remove member from session
      const updatedSession = await this.redis.removeMember(sessionId, socket.id);
      if (!updatedSession) return false;

      // Update connection count
      const currentCount = this.connectionCounts.get(sessionId) || 0;
      const newCount = Math.max(0, currentCount - 1);
      this.connectionCounts.set(sessionId, newCount);

      // If session is empty, clean up
      if (newCount === 0) {
        await this.destroySession(sessionId);
        return true;
      }

      // Handle leader change if necessary
      if (session.leaderSocketId === socket.id && updatedSession.leaderSocketId !== socket.id) {
        await this.syncEngine.stopMetronomeSync(sessionId);
        
        this.io.to(sessionId).emit(EVENTS.LEADER_ELECTION, {
          oldLeader: socket.id,
          newLeader: updatedSession.leaderSocketId,
          sessionId
        });
      }

      // Notify remaining members
      this.io.to(sessionId).emit(EVENTS.SESSION_MEMBER_UPDATE, {
        action: 'left',
        socketId: socket.id,
        memberCount: newCount
      });

      this.updateHealthMetrics();
      console.log(`Member ${socket.id} left session ${sessionId} (${newCount}/${session.maxMembers})`);
      return true;

    } catch (error) {
      console.error('Error leaving session:', error);
      return false;
    }
  }

  async destroySession(sessionId) {
    try {
      const session = await this.redis.getSession(sessionId);
      if (!session) return false;

      // Stop any active sync
      await this.syncEngine.stopMetronomeSync(sessionId);

      // Notify all members
      this.io.to(sessionId).emit(EVENTS.SESSION_DESTROY, { sessionId });

      // Remove from pools
      const bandId = session.bandId;
      if (this.sessionPools.has(bandId)) {
        this.sessionPools.get(bandId).delete(sessionId);
      }
      this.connectionCounts.delete(sessionId);

      // Cleanup Redis
      await this.redis.unsubscribeFromSession(sessionId);
      await this.redis.deleteSession(sessionId);

      console.log(`Session destroyed: ${sessionId}`);
      this.updateHealthMetrics();
      return true;

    } catch (error) {
      console.error('Error destroying session:', error);
      return false;
    }
  }

  /**
   * METRONOME & SYNC CONTROL
   */

  async changeTempo(socket, { sessionId, newTempo, rampDurationMs = 0 }) {
    const session = await this.redis.getSession(sessionId);
    if (!session || session.leaderSocketId !== socket.id) {
      socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Only leader can change tempo' });
      return false;
    }

    const oldTempo = session.metronome?.tempo || 120;
    const effectiveTimestamp = Date.now() + (rampDurationMs || 0);

    // Update session state immediately
    await this.redis.updateSession(sessionId, {
      'metronome.tempo': newTempo,
      'metronome.lastTempoChange': effectiveTimestamp,
      'metronome.tempoRampDuration': rampDurationMs
    });

    // If metronome is playing, update sync engine
    if (session.metronome?.isPlaying) {
      await this.syncEngine.updateTempo(sessionId, newTempo, rampDurationMs);
    }

    // Broadcast tempo change to all members
    this.io.to(sessionId).emit(EVENTS.TEMPO_CHANGE, {
      sessionId,
      oldTempo,
      newTempo,
      effectiveTimestamp,
      rampDurationMs,
      timestamp: Date.now()
    });

    // Profile latency for tempo change propagation
    this.profileLatency(sessionId, 'tempo_change', Date.now());

    console.log(`Tempo changed in session ${sessionId}: ${oldTempo} -> ${newTempo} BPM`);
    return true;
  }
  
  async startMetronome(socket, { sessionId, tempo, timeSignature }) {
    const session = await this.redis.getSession(sessionId);
    if (!session || session.leaderSocketId !== socket.id) {
      socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Only leader can control metronome' });
      return false;
    }

    // Update session state
    await this.redis.updateSession(sessionId, {
      'metronome.isPlaying': true,
      'metronome.tempo': tempo,
      'metronome.timeSignature': timeSignature || '4/4',
      'metronome.startTime': Date.now()
    });

    // Start high-frequency sync
    await this.syncEngine.startMetronomeSync(sessionId, tempo, timeSignature);

    // Notify all members
    this.io.to(sessionId).emit(EVENTS.METRONOME_START, {
      sessionId,
      tempo,
      timeSignature,
      startTime: Date.now()
    });

    return true;
  }

  async stopMetronome(socket, { sessionId }) {
    const session = await this.redis.getSession(sessionId);
    if (!session || session.leaderSocketId !== socket.id) {
      socket.emit(EVENTS.ERROR_VALIDATION, { message: 'Only leader can control metronome' });
      return false;
    }

    // Update session state
    await this.redis.updateSession(sessionId, {
      'metronome.isPlaying': false,
      'metronome.stopTime': Date.now()
    });

    // Stop sync engine
    await this.syncEngine.stopMetronomeSync(sessionId);

    // Notify all members
    this.io.to(sessionId).emit(EVENTS.METRONOME_STOP, {
      sessionId,
      stopTime: Date.now()
    });

    return true;
  }

  /**
   * MULTI-BAND ROUTING & DISCOVERY
   */
  
  async getBandSessions(bandId) {
    const sessions = await this.redis.getBandSessions(bandId);
    
    // Add connection counts
    return sessions.map(session => ({
      ...session,
      memberCount: this.connectionCounts.get(session.sessionId) || 0
    }));
  }

  async switchBand(socket, { fromBandId, toBandId }) {
    // Leave current band sessions
    if (fromBandId) {
      const currentSessions = await this.getBandSessions(fromBandId);
      for (const session of currentSessions) {
        if (session.members.has(socket.id)) {
          await this.leaveSession(socket, session.sessionId);
        }
      }
    }

    // Send available sessions for new band
    const newBandSessions = await this.getBandSessions(toBandId);
    socket.emit(EVENTS.BAND_SESSION_LIST, {
      bandId: toBandId,
      sessions: newBandSessions
    });

    return true;
  }

  /**
   * RATE LIMITING & SECURITY
   */
  
  checkRateLimit(socket, event) {
    const socketId = socket.id;
    const limit = RATE_LIMITS[event];
    
    if (!limit) return true; // No limit defined
    
    const now = Date.now();
    const windowStart = Math.floor(now / 1000) * 1000; // 1-second windows
    
    if (!this.rateLimiters.has(socketId)) {
      this.rateLimiters.set(socketId, new Map());
    }
    
    const socketLimits = this.rateLimiters.get(socketId);
    const eventKey = `${event}:${windowStart}`;
    
    const current = socketLimits.get(eventKey) || 0;
    
    if (current >= limit.maxPerSecond) {
      socket.emit(EVENTS.ERROR_VALIDATION, { 
        message: 'Rate limit exceeded',
        event,
        retryAfter: 1000 
      });
      return false;
    }
    
    socketLimits.set(eventKey, current + 1);
    
    // Cleanup old entries
    for (const [key, value] of socketLimits) {
      const [, timestamp] = key.split(':');
      if (now - parseInt(timestamp) > 5000) { // 5 second cleanup window
        socketLimits.delete(key);
      }
    }
    
    return true;
  }

  /**
   * EVENT VALIDATION
   */
  
  validateEventData(event, data) {
    const schema = EVENT_SCHEMAS[event];
    if (!schema) return { valid: true };

    const errors = [];
    
    // Check required fields
    for (const field of schema.required || []) {
      if (!(field in data) || data[field] == null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Basic type validation (extend as needed)
    if (data.sessionId && typeof data.sessionId !== 'string') {
      errors.push('sessionId must be a string');
    }
    
    if (data.tempo && (typeof data.tempo !== 'number' || data.tempo < 60 || data.tempo > 200)) {
      errors.push('tempo must be a number between 60 and 200');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * EVENT HANDLERS SETUP
   */
  
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Session lifecycle
      socket.on(EVENTS.SESSION_CREATE, (data) => {
        if (this.checkRateLimit(socket, EVENTS.SESSION_CREATE)) {
          this.createSession(socket, data);
        }
      });

      socket.on(EVENTS.SESSION_JOIN, (data) => {
        if (this.checkRateLimit(socket, EVENTS.SESSION_JOIN)) {
          this.joinSession(socket, data);
        }
      });

      // Metronome control
      socket.on(EVENTS.METRONOME_START, (data) => {
        if (this.checkRateLimit(socket, EVENTS.METRONOME_START)) {
          this.startMetronome(socket, data);
        }
      });

      socket.on(EVENTS.METRONOME_STOP, (data) => {
        this.stopMetronome(socket, data);
      });

      socket.on(EVENTS.TEMPO_CHANGE, (data) => {
        if (this.checkRateLimit(socket, EVENTS.TEMPO_CHANGE)) {
          this.changeTempo(socket, data);
        }
      });

      // Position sync and drift correction
      socket.on(EVENTS.POSITION_SYNC, (data) => {
        if (this.checkRateLimit(socket, EVENTS.POSITION_SYNC)) {
          this.syncEngine.correctSyncDrift(
            data.sessionId,
            data.positionMs,
            data.timestamp,
            socket.id
          );
        }
      });

      // Band routing
      socket.on(EVENTS.BAND_SESSION_LIST, async (data) => {
        const sessions = await this.getBandSessions(data.bandId);
        socket.emit(EVENTS.BAND_SESSION_LIST, { 
          bandId: data.bandId, 
          sessions 
        });
      });

      // Disconnect handling
      socket.on('disconnect', async () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        // Leave all sessions this socket was in
        const rooms = Array.from(socket.rooms);
        for (const room of rooms) {
          if (room !== socket.id) { // Skip the default socket room
            await this.leaveSession(socket, room);
          }
        }
        
        // Cleanup rate limiters
        this.rateLimiters.delete(socket.id);
      });
    });
  }

  /**
   * SESSION EVENT HANDLER (from Redis pub/sub)
   */
  
  handleSessionEvent(sessionId, event, data) {
    // Forward pub/sub events to socket room (for horizontal scaling)
    this.io.to(sessionId).emit(event, data);
  }

  /**
   * HEALTH MONITORING & METRICS
   */
  
  setupHealthMonitoring() {
    setInterval(() => {
      this.updateHealthMetrics();
      this.performHealthCheck();
    }, 10000); // Every 10 seconds
  }

  updateHealthMetrics() {
    const totalSessions = this.connectionCounts.size;
    const totalConnections = Array.from(this.connectionCounts.values())
      .reduce((sum, count) => sum + count, 0);
    
    const sessionSizes = Array.from(this.connectionCounts.values());
    const avgSessionSize = sessionSizes.length > 0 
      ? sessionSizes.reduce((sum, size) => sum + size, 0) / sessionSizes.length 
      : 0;
    const peakSessionSize = Math.max(...sessionSizes, this.healthMetrics.peakSessionSize);

    this.healthMetrics = {
      totalSessions,
      totalConnections,
      avgSessionSize,
      peakSessionSize,
      lastHealthCheck: Date.now()
    };
  }

  async performHealthCheck() {
    // Cleanup expired sessions
    const cleanedCount = await this.redis.cleanupExpiredSessions();
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }

    // Emit health metrics
    this.io.emit(EVENTS.HEALTH_CHECK, this.healthMetrics);
    
    console.log(`Health: ${this.healthMetrics.totalSessions} sessions, ${this.healthMetrics.totalConnections} connections`);
  }

  /**
   * LATENCY PROFILING SYSTEM
   */

  profileLatency(sessionId, eventType, startTime, socketId = null) {
    const latency = Date.now() - startTime;
    
    // Store event-type latencies
    if (!this.latencyMetrics.eventLatencies.has(eventType)) {
      this.latencyMetrics.eventLatencies.set(eventType, []);
    }
    const eventLatencies = this.latencyMetrics.eventLatencies.get(eventType);
    eventLatencies.push({ timestamp: Date.now(), latency });
    
    // Keep only recent measurements (1-minute window)
    const cutoff = Date.now() - this.latencyMetrics.measurementWindow;
    this.latencyMetrics.eventLatencies.set(
      eventType, 
      eventLatencies.filter(m => m.timestamp > cutoff)
    );

    // Store session latencies
    if (!this.latencyMetrics.sessionLatencies.has(sessionId)) {
      this.latencyMetrics.sessionLatencies.set(sessionId, { measurements: [], avg: 0 });
    }
    const sessionData = this.latencyMetrics.sessionLatencies.get(sessionId);
    sessionData.measurements.push({ timestamp: Date.now(), latency, eventType });
    sessionData.measurements = sessionData.measurements.filter(m => m.timestamp > cutoff);
    
    // Calculate rolling average
    if (sessionData.measurements.length > 0) {
      sessionData.avg = sessionData.measurements.reduce((sum, m) => sum + m.latency, 0) / 
                      sessionData.measurements.length;
    }

    // Store client latency if provided
    if (socketId) {
      this.latencyMetrics.clientLatencies.set(socketId, {
        timestamp: Date.now(),
        latency,
        eventType
      });
    }

    // Log high latency events
    if (latency > 100) {
      console.warn(`High latency detected - Event: ${eventType}, Session: ${sessionId}, Latency: ${latency}ms`);
    }
  }

  async measureRoundTripTime(socket, sessionId) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      socket.emit(EVENTS.LATENCY_PROBE, startTime);
      
      const timeout = setTimeout(() => {
        resolve({ rtt: null, error: 'timeout' });
      }, 5000);

      socket.once(EVENTS.LATENCY_RESPONSE, (data) => {
        clearTimeout(timeout);
        const rtt = Date.now() - data.clientTimestamp;
        
        // Store client RTT data
        this.latencyMetrics.clientLatencies.set(socket.id, {
          timestamp: Date.now(),
          rtt,
          sessionId,
          clockOffset: data.serverTimestamp - data.clientTimestamp
        });

        resolve({ rtt, clockOffset: data.serverTimestamp - data.clientTimestamp });
      });
    });
  }

  getLatencyMetrics(sessionId = null, eventType = null) {
    const now = Date.now();
    const cutoff = now - this.latencyMetrics.measurementWindow;

    const metrics = {
      timestamp: now,
      overall: {
        avgLatency: 0,
        maxLatency: 0,
        minLatency: Infinity,
        measurements: 0
      }
    };

    // Event type specific metrics
    if (eventType && this.latencyMetrics.eventLatencies.has(eventType)) {
      const eventLatencies = this.latencyMetrics.eventLatencies.get(eventType)
        .filter(m => m.timestamp > cutoff);
      
      if (eventLatencies.length > 0) {
        const latencies = eventLatencies.map(m => m.latency);
        metrics[eventType] = {
          avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
          maxLatency: Math.max(...latencies),
          minLatency: Math.min(...latencies),
          p95Latency: this.calculatePercentile(latencies, 95),
          measurements: latencies.length
        };
      }
    }

    // Session specific metrics
    if (sessionId && this.latencyMetrics.sessionLatencies.has(sessionId)) {
      const sessionData = this.latencyMetrics.sessionLatencies.get(sessionId);
      const recentMeasurements = sessionData.measurements.filter(m => m.timestamp > cutoff);
      
      if (recentMeasurements.length > 0) {
        const latencies = recentMeasurements.map(m => m.latency);
        metrics.session = {
          sessionId,
          avgLatency: sessionData.avg,
          maxLatency: Math.max(...latencies),
          minLatency: Math.min(...latencies),
          measurements: latencies.length,
          eventBreakdown: {}
        };

        // Break down by event type
        const eventGroups = recentMeasurements.reduce((acc, m) => {
          if (!acc[m.eventType]) acc[m.eventType] = [];
          acc[m.eventType].push(m.latency);
          return acc;
        }, {});

        Object.entries(eventGroups).forEach(([event, latencies]) => {
          metrics.session.eventBreakdown[event] = {
            avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
            measurements: latencies.length
          };
        });
      }
    }

    return metrics;
  }

  calculatePercentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * UTILITY METHODS
   */
  
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * CLEANUP
   */
  
  async cleanup() {
    this.syncEngine.cleanup();
    await this.redis.disconnect();
  }
}