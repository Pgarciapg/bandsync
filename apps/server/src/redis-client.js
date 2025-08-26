/**
 * Redis Client Configuration for BandSync Session Persistence
 * Replaces in-memory Map storage with Redis for scalability and persistence
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000
};

// Create Redis client with connection health monitoring
class RedisClient {
  constructor() {
    this.client = new Redis(REDIS_CONFIG);
    this.isConnected = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('connect', () => {
      console.log(`[${new Date().toISOString()}] Redis connected`);
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log(`[${new Date().toISOString()}] Redis ready for commands`);
    });

    this.client.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Redis error:`, error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log(`[${new Date().toISOString()}] Redis connection closed`);
      this.isConnected = false;
    });

    this.client.on('reconnecting', (delay) => {
      console.log(`[${new Date().toISOString()}] Redis reconnecting in ${delay}ms`);
    });
  }

  async connect() {
    try {
      await this.client.connect();
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to connect to Redis:`, error);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  getClient() {
    return this.client;
  }

  async healthCheck() {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis health check failed:`, error);
      return false;
    }
  }
}

// Session storage operations with Redis
class RedisSessionStore {
  constructor(redisClient) {
    this.redis = redisClient;
    this.SESSION_PREFIX = 'session:';
    this.MEMBER_PREFIX = 'member:';
    this.INTERVAL_PREFIX = 'interval:';
    this.SESSION_TTL = 30 * 60; // 30 minutes TTL
  }

  // Session management
  async createSession(sessionId, sessionData) {
    try {
      const key = this.SESSION_PREFIX + sessionId;
      const serialized = JSON.stringify({
        ...sessionData,
        members: Array.from(sessionData.members || []),
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      });
      
      await this.redis.setex(key, this.SESSION_TTL, serialized);
      console.log(`[${new Date().toISOString()}] Redis: Created session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to create session ${sessionId}:`, error);
      return false;
    }
  }

  async getSession(sessionId) {
    try {
      const key = this.SESSION_PREFIX + sessionId;
      const data = await this.redis.get(key);
      if (!data) return null;

      const session = JSON.parse(data);
      // Convert members array back to Map
      session.members = new Map(session.members);
      return session;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSession(sessionId, sessionData) {
    try {
      const key = this.SESSION_PREFIX + sessionId;
      const serialized = JSON.stringify({
        ...sessionData,
        members: Array.from(sessionData.members || []),
        lastActiveAt: Date.now()
      });
      
      await this.redis.setex(key, this.SESSION_TTL, serialized);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to update session ${sessionId}:`, error);
      return false;
    }
  }

  async deleteSession(sessionId) {
    try {
      const key = this.SESSION_PREFIX + sessionId;
      await this.redis.del(key);
      console.log(`[${new Date().toISOString()}] Redis: Deleted session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  async getAllSessions() {
    try {
      const keys = await this.redis.keys(this.SESSION_PREFIX + '*');
      const sessions = new Map();
      
      for (const key of keys) {
        const sessionId = key.replace(this.SESSION_PREFIX, '');
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.set(sessionId, session);
        }
      }
      
      return sessions;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to get all sessions:`, error);
      return new Map();
    }
  }

  // Member management
  async setMember(socketId, memberData) {
    try {
      const key = this.MEMBER_PREFIX + socketId;
      const serialized = JSON.stringify(memberData);
      await this.redis.setex(key, this.SESSION_TTL, serialized);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to set member ${socketId}:`, error);
      return false;
    }
  }

  async getMember(socketId) {
    try {
      const key = this.MEMBER_PREFIX + socketId;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to get member ${socketId}:`, error);
      return null;
    }
  }

  async deleteMember(socketId) {
    try {
      const key = this.MEMBER_PREFIX + socketId;
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to delete member ${socketId}:`, error);
      return false;
    }
  }

  // Interval tracking for scroll tickers
  async setScrollInterval(sessionId, intervalId) {
    try {
      const key = this.INTERVAL_PREFIX + sessionId;
      await this.redis.setex(key, this.SESSION_TTL, intervalId.toString());
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to set scroll interval ${sessionId}:`, error);
      return false;
    }
  }

  async getScrollInterval(sessionId) {
    try {
      const key = this.INTERVAL_PREFIX + sessionId;
      const data = await this.redis.get(key);
      return data ? parseInt(data, 10) : null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to get scroll interval ${sessionId}:`, error);
      return null;
    }
  }

  async deleteScrollInterval(sessionId) {
    try {
      const key = this.INTERVAL_PREFIX + sessionId;
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to delete scroll interval ${sessionId}:`, error);
      return false;
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
        if (now - session.lastActiveAt > INACTIVE_THRESHOLD && session.members.size === 0) {
          await this.deleteSession(sessionId);
          await this.deleteScrollInterval(sessionId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[${new Date().toISOString()}] Redis: Cleaned up ${cleaned} expired sessions`);
      }
      return cleaned;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to cleanup expired sessions:`, error);
      return 0;
    }
  }

  // Performance monitoring
  async getStats() {
    try {
      const sessionKeys = await this.redis.keys(this.SESSION_PREFIX + '*');
      const memberKeys = await this.redis.keys(this.MEMBER_PREFIX + '*');
      const intervalKeys = await this.redis.keys(this.INTERVAL_PREFIX + '*');
      
      return {
        totalSessions: sessionKeys.length,
        totalMembers: memberKeys.length,
        activeIntervals: intervalKeys.length,
        redisMemoryUsage: await this.redis.memory('usage')
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Redis: Failed to get stats:`, error);
      return null;
    }
  }
}

// Export singleton instances
const redisClient = new RedisClient();
const sessionStore = new RedisSessionStore(redisClient.getClient());

export { redisClient, sessionStore, RedisSessionStore };
export default redisClient;