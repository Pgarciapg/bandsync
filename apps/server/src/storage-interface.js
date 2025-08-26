/**
 * Storage Interface Abstraction
 * Provides unified interface for both in-memory and Redis session storage
 */

/**
 * Base interface that all storage implementations must follow
 */
export class StorageInterface {
  constructor() {
    if (this.constructor === StorageInterface) {
      throw new Error('StorageInterface is abstract and cannot be instantiated');
    }
  }

  // Session management
  async createSession(sessionData) { throw new Error('Not implemented'); }
  async getSession(sessionId) { throw new Error('Not implemented'); }
  async updateSession(sessionId, updates) { throw new Error('Not implemented'); }
  async deleteSession(sessionId) { throw new Error('Not implemented'); }
  async sessionExists(sessionId) { throw new Error('Not implemented'); }

  // Member management
  async addMember(sessionId, memberData) { throw new Error('Not implemented'); }
  async removeMember(sessionId, socketId) { throw new Error('Not implemented'); }
  async updateMemberPing(sessionId, socketId, latency) { throw new Error('Not implemented'); }
  async getMemberCount(sessionId) { throw new Error('Not implemented'); }

  // Position sync (high-frequency operations)
  async updatePosition(sessionId, positionMs, timestamp, beatInfo) { throw new Error('Not implemented'); }
  async getRecentPositions(sessionId, count) { throw new Error('Not implemented'); }

  // Discovery and listing
  async getBandSessions(bandId) { throw new Error('Not implemented'); }
  async getActiveSessions() { throw new Error('Not implemented'); }

  // Pub/sub for horizontal scaling (optional - in-memory doesn't need this)
  async publishToSession(sessionId, event, data) { return false; } // Default no-op
  async subscribeToSession(sessionId, callback) { return false; } // Default no-op
  async unsubscribeFromSession(sessionId) { return false; } // Default no-op

  // Cleanup and maintenance
  async cleanupExpiredSessions() { throw new Error('Not implemented'); }
  async healthCheck() { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }

  // Storage type identification
  getStorageType() { throw new Error('Not implemented'); }
  isRedisEnabled() { return false; }
}

/**
 * In-Memory Storage Implementation
 * Compatible with existing server.js session management
 */
export class InMemoryStorage extends StorageInterface {
  constructor() {
    super();
    this.sessions = new Map();
    this.memberInfo = new Map(); // socketId -> { sessionId, ...memberData }
    this.positionHistory = new Map(); // sessionId -> Array of position updates
    this.bandSessions = new Map(); // bandId -> Set<sessionId>
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  async createSession(sessionData) {
    const session = {
      sessionId: sessionData.sessionId,
      message: sessionData.message || "Waiting for members…",
      tempo: sessionData.tempo || 120,
      position: 0,
      isPlaying: false,
      leaderSocketId: sessionData.leaderSocketId || null,
      tempoBpm: sessionData.tempo || 120,
      members: new Map(),
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      settings: { 
        maxMembers: sessionData.maxMembers || 8 
      },
      bandId: sessionData.bandId,
      ...sessionData
    };

    this.sessions.set(sessionData.sessionId, session);

    // Track band sessions
    if (sessionData.bandId) {
      if (!this.bandSessions.has(sessionData.bandId)) {
        this.bandSessions.set(sessionData.bandId, new Set());
      }
      this.bandSessions.get(sessionData.bandId).add(sessionData.sessionId);
    }

    console.log(`[InMemory] Created session ${sessionData.sessionId}`);
    return session;
  }

  async getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Handle nested property updates (e.g., 'metronome.tempo')
    const updatedSession = { ...session };
    
    for (const [key, value] of Object.entries(updates)) {
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        if (!updatedSession[parent]) updatedSession[parent] = {};
        updatedSession[parent][child] = value;
      } else {
        updatedSession[key] = value;
      }
    }
    
    updatedSession.lastActiveAt = Date.now();
    this.sessions.set(sessionId, updatedSession);
    
    return updatedSession;
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove from band sessions tracking
    if (session.bandId && this.bandSessions.has(session.bandId)) {
      this.bandSessions.get(session.bandId).delete(sessionId);
      if (this.bandSessions.get(session.bandId).size === 0) {
        this.bandSessions.delete(session.bandId);
      }
    }

    // Remove member info
    session.members.forEach((_, socketId) => {
      this.memberInfo.delete(socketId);
    });

    // Remove position history
    this.positionHistory.delete(sessionId);

    this.sessions.delete(sessionId);
    console.log(`[InMemory] Deleted session ${sessionId}`);
    return true;
  }

  async sessionExists(sessionId) {
    return this.sessions.has(sessionId);
  }

  async addMember(sessionId, memberData) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const member = {
      socketId: memberData.socketId,
      joinedAt: Date.now(),
      lastPingAt: Date.now(),
      role: memberData.role || 'follower',
      displayName: memberData.displayName || `User ${memberData.socketId.substr(-4)}`,
      latency: 0,
      ...memberData
    };

    session.members.set(memberData.socketId, member);
    session.lastActiveAt = Date.now();
    this.memberInfo.set(memberData.socketId, { sessionId, ...member });

    this.sessions.set(sessionId, session);
    console.log(`[InMemory] Added member ${memberData.socketId} to session ${sessionId}`);
    return member;
  }

  async removeMember(sessionId, socketId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const member = session.members.get(socketId);
    if (!member) return null;

    const wasLeader = session.leaderSocketId === socketId;
    session.members.delete(socketId);
    this.memberInfo.delete(socketId);
    session.lastActiveAt = Date.now();

    const updates = { members: session.members };

    // Handle leader transition
    if (wasLeader && session.members.size > 0) {
      const remainingMembers = Array.from(session.members.values());
      const newLeader = remainingMembers.find(m => m.preferredRole === 'leader') || remainingMembers[0];
      
      updates.leaderSocketId = newLeader?.socketId || null;
      updates.isPlaying = false; // Stop playback when leader changes
      
      if (newLeader) {
        newLeader.role = 'leader';
        session.members.set(newLeader.socketId, newLeader);
      }

      this.sessions.set(sessionId, { ...session, ...updates });
      console.log(`[InMemory] Removed member ${socketId} from session ${sessionId}, new leader: ${newLeader?.socketId}`);
      
      return { member, newLeader: newLeader?.socketId };
    }

    this.sessions.set(sessionId, { ...session, ...updates });
    console.log(`[InMemory] Removed member ${socketId} from session ${sessionId}`);
    return { member };
  }

  async updateMemberPing(sessionId, socketId, latency) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.members.has(socketId)) return null;

    const member = session.members.get(socketId);
    member.lastPingAt = Date.now();
    member.latency = latency;

    session.members.set(socketId, member);
    session.lastActiveAt = Date.now();
    this.sessions.set(sessionId, session);

    return member;
  }

  async getMemberCount(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.members.size : 0;
  }

  async updatePosition(sessionId, positionMs, timestamp, beatInfo = {}) {
    if (!this.positionHistory.has(sessionId)) {
      this.positionHistory.set(sessionId, []);
    }

    const history = this.positionHistory.get(sessionId);
    const positionData = {
      positionMs,
      timestamp,
      serverTimestamp: Date.now(),
      ...beatInfo
    };

    history.push(positionData);

    // Keep only last 1000 position updates
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Update session's current position
    await this.updateSession(sessionId, {
      position: positionMs,
      lastPositionUpdate: Date.now()
    });

    return positionData;
  }

  async getRecentPositions(sessionId, count = 10) {
    const history = this.positionHistory.get(sessionId) || [];
    return history.slice(-count).reverse(); // Most recent first
  }

  async getBandSessions(bandId) {
    const sessionIds = this.bandSessions.get(bandId) || new Set();
    const sessions = Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter(Boolean);
    
    return sessions;
  }

  async getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  async cleanupExpiredSessions() {
    const INACTIVE_THRESHOLD = parseInt(process.env.REDIS_TTL) * 1000 || 30 * 60 * 1000; // 30 minutes default
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > INACTIVE_THRESHOLD && session.members.size === 0) {
        console.log(`[InMemory] Cleaning up inactive session: ${sessionId}`);
        await this.deleteSession(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async healthCheck() {
    return {
      healthy: true,
      storageType: 'in-memory',
      totalSessions: this.sessions.size,
      totalMembers: this.memberInfo.size,
      timestamp: Date.now()
    };
  }

  async disconnect() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    console.log('[InMemory] In-memory storage disconnected');
  }

  getStorageType() {
    return 'in-memory';
  }

  isRedisEnabled() {
    return false;
  }
}

/**
 * Redis Storage Adapter 
 * Wraps existing RedisManager to conform to StorageInterface
 */
export class RedisStorageAdapter extends StorageInterface {
  constructor(redisManager) {
    super();
    this.redis = redisManager;
  }

  async createSession(sessionData) {
    return await this.redis.createSession(sessionData);
  }

  async getSession(sessionId) {
    return await this.redis.getSession(sessionId);
  }

  async updateSession(sessionId, updates) {
    return await this.redis.updateSession(sessionId, updates);
  }

  async deleteSession(sessionId) {
    return await this.redis.deleteSession(sessionId);
  }

  async sessionExists(sessionId) {
    const session = await this.redis.getSession(sessionId);
    return !!session;
  }

  async addMember(sessionId, memberData) {
    return await this.redis.addMember(sessionId, memberData);
  }

  async removeMember(sessionId, socketId) {
    return await this.redis.removeMember(sessionId, socketId);
  }

  async updateMemberPing(sessionId, socketId, latency) {
    return await this.redis.updateMemberPing(sessionId, socketId, latency);
  }

  async getMemberCount(sessionId) {
    const session = await this.redis.getSession(sessionId);
    return session ? session.members.size : 0;
  }

  async updatePosition(sessionId, positionMs, timestamp, beatInfo = {}) {
    return await this.redis.updatePosition(sessionId, positionMs, timestamp, beatInfo);
  }

  async getRecentPositions(sessionId, count = 10) {
    return await this.redis.getRecentPositions(sessionId, count);
  }

  async getBandSessions(bandId) {
    return await this.redis.getBandSessions(bandId);
  }

  async getActiveSessions() {
    return await this.redis.getActiveSessions();
  }

  async publishToSession(sessionId, event, data) {
    return await this.redis.publishToSession(sessionId, event, data);
  }

  async subscribeToSession(sessionId, callback) {
    return await this.redis.subscribeToSession(sessionId, callback);
  }

  async unsubscribeFromSession(sessionId) {
    return await this.redis.unsubscribeFromSession(sessionId);
  }

  async cleanupExpiredSessions() {
    return await this.redis.cleanupExpiredSessions();
  }

  async healthCheck() {
    // Delegate to Redis manager for comprehensive health check
    if (this.redis.redis) {
      try {
        await this.redis.redis.ping();
        return {
          healthy: true,
          storageType: 'redis',
          connected: true,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          healthy: false,
          storageType: 'redis',
          connected: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    }
    return {
      healthy: false,
      storageType: 'redis',
      connected: false,
      error: 'Redis client not initialized',
      timestamp: Date.now()
    };
  }

  async disconnect() {
    return await this.redis.disconnect();
  }

  getStorageType() {
    return 'redis';
  }

  isRedisEnabled() {
    return true;
  }
}