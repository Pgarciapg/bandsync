/**
 * Enhanced Redis Configuration for BandSync Day 6
 * Builds upon Day 5 Redis client with enhanced session management capabilities
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
  commandTimeout: 5000,
  keyPrefix: 'bandsync:' // Namespace all keys
};

class EnhancedRedisClient {
  constructor() {
    this.client = new Redis(REDIS_CONFIG);
    this.isConnected = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('connect', () => {
      console.log(`[${new Date().toISOString()}] Redis connected successfully`);
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
      if (!this.isConnected) {
        await this.client.connect();
      }
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to connect to Redis:`, error);
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
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

  // Enhanced key management
  getSessionKey(sessionId) {
    return `session:${sessionId}`;
  }

  getMemberKey(sessionId) {
    return `session:${sessionId}:members`;
  }

  getSocketSessionKey(socketId) {
    return `socket:${socketId}:session`;
  }

  getLeaderRequestKey(sessionId) {
    return `session:${sessionId}:leader_requests`;
  }
}

// Export singleton instance
const redisClient = new EnhancedRedisClient();
export { redisClient };
export default redisClient;