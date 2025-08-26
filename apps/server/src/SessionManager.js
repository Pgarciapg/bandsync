/**
 * Enhanced SessionManager with Redis persistence for Day 6
 * Manages sessions, members, and role assignments with Redis backend
 */

import { redisClient } from './redis-enhanced.js';

class SessionManager {
  constructor() {
    this.redis = redisClient.getClient();
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      await redisClient.connect();
      this.initialized = true;
      console.log(`[${new Date().toISOString()}] SessionManager initialized with Redis`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] SessionManager initialization failed:`, error);
      this.initialized = false;
    }
  }

  // Session key helpers
  getSessionKey(sessionId) {
    return redisClient.getSessionKey(sessionId);
  }

  getMemberKey(sessionId) {
    return redisClient.getMemberKey(sessionId);
  }

  getSocketSessionKey(socketId) {
    return redisClient.getSocketSessionKey(socketId);
  }

  getLeaderRequestKey(sessionId) {
    return redisClient.getLeaderRequestKey(sessionId);
  }

  // Session CRUD operations
  async createSession(sessionId, initialData = {}) {
    try {
      const defaultSession = {
        message: "Waiting for leader…",
        tempo: 120,
        position: 0,
        isPlaying: false,
        leaderSocketId: null,
        tempoBpm: 120,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        settings: { maxMembers: 8 },
        ...initialData
      };

      const sessionKey = this.getSessionKey(sessionId);
      await this.redis.setex(sessionKey, 3600, JSON.stringify(defaultSession));
      
      console.log(`[${new Date().toISOString()}] Created session ${sessionId} with Redis persistence`);
      return defaultSession;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error creating session ${sessionId}:`, error);
      return null;
    }
  }

  async getSession(sessionId) {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) return null;
      
      const session = JSON.parse(sessionData);
      // Update last access time
      session.lastAccessAt = Date.now();
      await this.redis.setex(sessionKey, 3600, JSON.stringify(session));
      
      return session;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSession(sessionId, updates) {
    try {
      const current = await this.getSession(sessionId);
      if (!current) return null;

      const updated = { 
        ...current, 
        ...updates,
        lastActiveAt: Date.now()
      };

      const sessionKey = this.getSessionKey(sessionId);
      await this.redis.setex(sessionKey, 3600, JSON.stringify(updated));
      
      return updated;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating session ${sessionId}:`, error);
      return null;
    }
  }

  async deleteSession(sessionId) {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const memberKey = this.getMemberKey(sessionId);
      const leaderRequestKey = this.getLeaderRequestKey(sessionId);
      
      // Delete all related keys
      await this.redis.del(sessionKey);
      await this.redis.del(memberKey);
      await this.redis.del(leaderRequestKey);
      
      console.log(`[${new Date().toISOString()}] Deleted session ${sessionId} and related data`);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  async getAllSessions() {
    try {
      const keys = await this.redis.keys('session:*');
      const sessions = new Map();
      
      for (const key of keys) {
        if (!key.includes(':members') && !key.includes(':leader_requests')) {
          const sessionId = key.replace('session:', '');
          const session = await this.getSession(sessionId);
          if (session) {
            sessions.set(sessionId, session);
          }
        }
      }
      
      return sessions;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting all sessions:`, error);
      return new Map();
    }
  }

  // Member management
  async addMember(sessionId, socketId, memberData = {}) {
    try {
      const member = {
        socketId,
        joinedAt: Date.now(),
        lastPingAt: Date.now(),
        role: memberData.role || 'follower',
        displayName: memberData.displayName || `User ${socketId.substr(-4)}`,
        ...memberData
      };
      
      const memberKey = this.getMemberKey(sessionId);
      const socketSessionKey = this.getSocketSessionKey(socketId);
      
      // Store member data and socket-session mapping
      await this.redis.hset(memberKey, socketId, JSON.stringify(member));
      await this.redis.setex(socketSessionKey, 3600, sessionId);
      
      console.log(`[${new Date().toISOString()}] Added member ${socketId} to session ${sessionId} as ${member.role}`);
      return member;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error adding member to ${sessionId}:`, error);
      return null;
    }
  }

  async removeMember(sessionId, socketId) {
    try {
      const memberKey = this.getMemberKey(sessionId);
      const socketSessionKey = this.getSocketSessionKey(socketId);
      
      // Get member data before deletion
      const memberData = await this.redis.hget(memberKey, socketId);
      
      // Remove member and socket mapping
      await this.redis.hdel(memberKey, socketId);
      await this.redis.del(socketSessionKey);
      
      console.log(`[${new Date().toISOString()}] Removed member ${socketId} from session ${sessionId}`);
      return memberData ? JSON.parse(memberData) : null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error removing member from ${sessionId}:`, error);
      return null;
    }
  }

  async getMember(sessionId, socketId) {
    try {
      const memberKey = this.getMemberKey(sessionId);
      const memberData = await this.redis.hget(memberKey, socketId);
      
      return memberData ? JSON.parse(memberData) : null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting member ${socketId} from ${sessionId}:`, error);
      return null;
    }
  }

  async getAllMembers(sessionId) {
    try {
      const memberKey = this.getMemberKey(sessionId);
      const members = await this.redis.hgetall(memberKey);
      const parsed = new Map();
      
      for (const [socketId, data] of Object.entries(members)) {
        parsed.set(socketId, JSON.parse(data));
      }
      
      return parsed;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting members for ${sessionId}:`, error);
      return new Map();
    }
  }

  async getMemberCount(sessionId) {
    try {
      const memberKey = this.getMemberKey(sessionId);
      return await this.redis.hlen(memberKey);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting member count for ${sessionId}:`, error);
      return 0;
    }
  }

  async getSessionBySocketId(socketId) {
    try {
      const socketSessionKey = this.getSocketSessionKey(socketId);
      const sessionId = await this.redis.get(socketSessionKey);
      
      if (!sessionId) return null;
      return await this.getSession(sessionId);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting session by socket ${socketId}:`, error);
      return null;
    }
  }

  // Leader request management
  async addLeaderRequest(sessionId, socketId, requestData = {}) {
    try {
      const leaderRequestKey = this.getLeaderRequestKey(sessionId);
      const request = {
        socketId,
        requestedAt: Date.now(),
        status: 'pending',
        ...requestData
      };
      
      await this.redis.hset(leaderRequestKey, socketId, JSON.stringify(request));
      console.log(`[${new Date().toISOString()}] Added leader request from ${socketId} in ${sessionId}`);
      return request;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error adding leader request:`, error);
      return null;
    }
  }

  async removeLeaderRequest(sessionId, socketId) {
    try {
      const leaderRequestKey = this.getLeaderRequestKey(sessionId);
      await this.redis.hdel(leaderRequestKey, socketId);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error removing leader request:`, error);
      return false;
    }
  }

  async getLeaderRequests(sessionId) {
    try {
      const leaderRequestKey = this.getLeaderRequestKey(sessionId);
      const requests = await this.redis.hgetall(leaderRequestKey);
      const parsed = [];
      
      for (const [socketId, data] of Object.entries(requests)) {
        const request = JSON.parse(data);
        request.socketId = socketId;
        parsed.push(request);
      }
      
      return parsed.sort((a, b) => a.requestedAt - b.requestedAt);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting leader requests:`, error);
      return [];
    }
  }

  // Cleanup operations
  async cleanupExpiredSessions() {
    try {
      const sessions = await this.getAllSessions();
      const now = Date.now();
      const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
      let cleaned = 0;

      for (const [sessionId, session] of sessions) {
        const memberCount = await this.getMemberCount(sessionId);
        if (now - session.lastActiveAt > INACTIVE_THRESHOLD && memberCount === 0) {
          await this.deleteSession(sessionId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[${new Date().toISOString()}] Cleaned up ${cleaned} expired sessions`);
      }
      return cleaned;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error cleaning up sessions:`, error);
      return 0;
    }
  }

  // Health and stats
  async healthCheck() {
    try {
      return await redisClient.healthCheck();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] SessionManager health check failed:`, error);
      return false;
    }
  }

  async getStats() {
    try {
      const sessions = await this.getAllSessions();
      let totalMembers = 0;
      let activeSessions = 0;
      
      for (const [sessionId] of sessions) {
        const memberCount = await this.getMemberCount(sessionId);
        totalMembers += memberCount;
        if (memberCount > 0) activeSessions++;
      }
      
      return {
        totalSessions: sessions.size,
        activeSessions,
        totalMembers,
        redisConnected: this.initialized
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting stats:`, error);
      return null;
    }
  }
}

// Export singleton instance
const sessionManager = new SessionManager();
export { sessionManager };
export default sessionManager;