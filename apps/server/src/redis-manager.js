/**
 * Redis Integration Manager for BandSync
 * Handles session state persistence, pub/sub, and horizontal scaling
 */

import Redis from 'ioredis';
import { EVENTS } from './events-enhanced.js';

export class RedisManager {
  constructor(config = {}) {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'bandsync:',
      ...config
    };

    // Primary Redis connection for data operations
    this.redis = new Redis(this.config);
    
    // Separate connections for pub/sub (Redis requirement)
    this.publisher = new Redis(this.config);
    this.subscriber = new Redis(this.config);

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.redis.on('connect', () => console.log('Redis connected'));
    this.redis.on('error', (err) => console.error('Redis error:', err));
    this.redis.on('reconnecting', () => console.log('Redis reconnecting...'));
  }

  /**
   * SESSION STATE MANAGEMENT
   */
  
  async createSession(sessionData) {
    const sessionKey = this.getSessionKey(sessionData.sessionId);
    const session = {
      ...sessionData,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      members: new Map(),
      metronome: {
        isPlaying: false,
        tempo: sessionData.tempo || 120,
        position: 0,
        timeSignature: sessionData.timeSignature || '4/4',
        lastBeatAt: null
      }
    };

    await this.redis.hset(sessionKey, 'data', JSON.stringify(session));
    await this.redis.expire(sessionKey, 3600); // 1 hour TTL
    
    // Add to band's session list
    const bandSessionsKey = this.getBandSessionsKey(sessionData.bandId);
    await this.redis.sadd(bandSessionsKey, sessionData.sessionId);
    
    return session;
  }

  async getSession(sessionId) {
    const sessionKey = this.getSessionKey(sessionId);
    const sessionData = await this.redis.hget(sessionKey, 'data');
    
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData);
    // Convert members back to Map
    session.members = new Map(Object.entries(session.members || {}));
    
    return session;
  }

  async updateSession(sessionId, updates) {
    const sessionKey = this.getSessionKey(sessionId);
    const session = await this.getSession(sessionId);
    
    if (!session) return null;
    
    const updatedSession = {
      ...session,
      ...updates,
      lastActiveAt: Date.now()
    };
    
    // Convert Map to Object for JSON storage
    const sessionForStorage = {
      ...updatedSession,
      members: Object.fromEntries(updatedSession.members)
    };
    
    await this.redis.hset(sessionKey, 'data', JSON.stringify(sessionForStorage));
    await this.redis.expire(sessionKey, 3600);
    
    return updatedSession;
  }

  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const sessionKey = this.getSessionKey(sessionId);
    const bandSessionsKey = this.getBandSessionsKey(session.bandId);
    
    await Promise.all([
      this.redis.del(sessionKey),
      this.redis.srem(bandSessionsKey, sessionId)
    ]);
    
    return true;
  }

  /**
   * MEMBER MANAGEMENT
   */
  
  async addMember(sessionId, memberData) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.members.set(memberData.socketId, {
      ...memberData,
      joinedAt: Date.now(),
      lastPingAt: Date.now(),
      latency: 0
    });

    return await this.updateSession(sessionId, { members: session.members });
  }

  async removeMember(sessionId, socketId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const wasLeader = session.leaderSocketId === socketId;
    session.members.delete(socketId);

    const updates = { members: session.members };
    
    // Handle leader transition
    if (wasLeader) {
      const remainingMembers = Array.from(session.members.values());
      const newLeader = remainingMembers.find(m => m.preferredRole === 'leader') || remainingMembers[0];
      
      updates.leaderSocketId = newLeader?.socketId || null;
      updates.metronome = { ...session.metronome, isPlaying: false };
    }

    return await this.updateSession(sessionId, updates);
  }

  async updateMemberPing(sessionId, socketId, latency) {
    const session = await this.getSession(sessionId);
    if (!session || !session.members.has(socketId)) return null;

    const member = session.members.get(socketId);
    member.lastPingAt = Date.now();
    member.latency = latency;

    return await this.updateSession(sessionId, { members: session.members });
  }

  /**
   * HIGH-FREQUENCY POSITION SYNC
   */
  
  async updatePosition(sessionId, positionMs, timestamp, beatInfo = {}) {
    const positionKey = this.getPositionKey(sessionId);
    
    const positionData = {
      positionMs,
      timestamp,
      serverTimestamp: Date.now(),
      ...beatInfo
    };

    // Use Redis Streams for high-frequency position updates
    await this.redis.xadd(
      positionKey,
      'MAXLEN', '~', 1000, // Keep last 1000 position updates
      '*',
      'data', JSON.stringify(positionData)
    );

    // Also update session's current position
    await this.updateSession(sessionId, { 
      'metronome.position': positionMs,
      'metronome.lastUpdateAt': Date.now()
    });
  }

  async getRecentPositions(sessionId, count = 10) {
    const positionKey = this.getPositionKey(sessionId);
    const entries = await this.redis.xrevrange(positionKey, '+', '-', 'COUNT', count);
    
    return entries.map(([id, fields]) => ({
      id,
      ...JSON.parse(fields[1]) // fields[1] is the 'data' field
    }));
  }

  /**
   * PUB/SUB FOR HORIZONTAL SCALING
   */
  
  async publishToSession(sessionId, event, data) {
    const channel = this.getSessionChannel(sessionId);
    const message = {
      event,
      data,
      timestamp: Date.now(),
      serverId: process.env.SERVER_ID || 'unknown'
    };
    
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribeToSession(sessionId, callback) {
    const channel = this.getSessionChannel(sessionId);
    
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const parsed = JSON.parse(message);
          callback(parsed.event, parsed.data, parsed.timestamp);
        } catch (error) {
          console.error('Error parsing pub/sub message:', error);
        }
      }
    });
  }

  async unsubscribeFromSession(sessionId) {
    const channel = this.getSessionChannel(sessionId);
    await this.subscriber.unsubscribe(channel);
  }

  /**
   * BAND AND SESSION DISCOVERY
   */
  
  async getBandSessions(bandId) {
    const bandSessionsKey = this.getBandSessionsKey(bandId);
    const sessionIds = await this.redis.smembers(bandSessionsKey);
    
    const sessions = await Promise.all(
      sessionIds.map(id => this.getSession(id))
    );
    
    return sessions.filter(Boolean); // Remove null sessions
  }

  async getActiveSessions() {
    const pattern = this.config.keyPrefix + 'session:*';
    const keys = await this.redis.keys(pattern);
    
    const sessions = await Promise.all(
      keys.map(async (key) => {
        const sessionId = key.replace(this.config.keyPrefix + 'session:', '');
        return await this.getSession(sessionId);
      })
    );
    
    return sessions.filter(Boolean);
  }

  /**
   * CLEANUP AND MAINTENANCE
   */
  
  async cleanupExpiredSessions() {
    const pattern = this.config.keyPrefix + 'session:*';
    const keys = await this.redis.keys(pattern);
    let cleanedCount = 0;

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl < 0) { // No expiry set
        const sessionId = key.replace(this.config.keyPrefix + 'session:', '');
        const session = await this.getSession(sessionId);
        
        // Delete sessions inactive for more than 2 hours
        if (session && (Date.now() - session.lastActiveAt) > 7200000) {
          await this.deleteSession(sessionId);
          cleanedCount++;
        }
      }
    }
    
    return cleanedCount;
  }

  /**
   * HELPER METHODS
   */
  
  getSessionKey(sessionId) {
    return `${this.config.keyPrefix}session:${sessionId}`;
  }

  getPositionKey(sessionId) {
    return `${this.config.keyPrefix}position:${sessionId}`;
  }

  getBandSessionsKey(bandId) {
    return `${this.config.keyPrefix}band:${bandId}:sessions`;
  }

  getSessionChannel(sessionId) {
    return `${this.config.keyPrefix}channel:${sessionId}`;
  }

  async disconnect() {
    await Promise.all([
      this.redis.disconnect(),
      this.publisher.disconnect(),
      this.subscriber.disconnect()
    ]);
  }
}

/**
 * Singleton instance for application use
 */
let redisManager = null;

export const getRedisManager = (config) => {
  if (!redisManager) {
    redisManager = new RedisManager(config);
  }
  return redisManager;
};