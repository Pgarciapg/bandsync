/**
 * Redis Connection Configuration with Fallback Logic
 * Provides robust Redis connection handling with graceful fallbacks
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';

export class RedisConfig extends EventEmitter {
  constructor() {
    super();
    this.isRedisEnabled = process.env.REDIS_ENABLED === 'true';
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 5;
    this.retryDelay = parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILURE) || 100;
    this.connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000;
    this.commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000;
    
    // Redis instances
    this.client = null;
    this.publisher = null;
    this.subscriber = null;
  }

  /**
   * Initialize Redis connection with fallback handling
   */
  async initialize() {
    if (!this.isRedisEnabled) {
      console.log('[Redis] Redis is disabled, using in-memory storage');
      this.emit('fallback', 'disabled');
      return { success: false, reason: 'disabled' };
    }

    try {
      console.log('[Redis] Attempting to connect to Redis...');
      
      const config = this.getRedisConfig();
      
      // Test connection first
      const testClient = new Redis(config);
      
      await Promise.race([
        testClient.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), this.connectTimeout)
        )
      ]);

      await testClient.disconnect();
      
      // Create actual connections
      this.client = new Redis(config);
      this.publisher = new Redis(config);
      this.subscriber = new Redis(config);
      
      this.setupEventHandlers();
      
      this.isConnected = true;
      console.log('[Redis] Successfully connected to Redis');
      this.emit('connected');
      
      return { success: true };

    } catch (error) {
      console.warn('[Redis] Failed to connect to Redis:', error.message);
      console.log('[Redis] Falling back to in-memory storage');
      
      this.isConnected = false;
      this.emit('fallback', error.message);
      
      return { success: false, reason: error.message };
    }
  }

  /**
   * Get Redis configuration from environment variables
   */
  getRedisConfig() {
    const config = {
      connectTimeout: this.connectTimeout,
      commandTimeout: this.commandTimeout,
      retryDelayOnFailover: this.retryDelay,
      maxRetriesPerRequest: this.maxRetries,
      lazyConnect: true,
      enableOfflineQueue: false,
    };

    // Use REDIS_URL if available, otherwise construct from parts
    if (process.env.REDIS_URL) {
      return { ...config, connectionString: process.env.REDIS_URL };
    }

    return {
      ...config,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'bandsync:'
    };
  }

  /**
   * Setup Redis event handlers for monitoring
   */
  setupEventHandlers() {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
      this.isConnected = true;
      this.connectionAttempts = 0;
      this.emit('connected');
    });

    this.client.on('ready', () => {
      console.log('[Redis] Redis client is ready');
      this.emit('ready');
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Redis client error:', error.message);
      this.isConnected = false;
      this.emit('error', error);
    });

    this.client.on('close', () => {
      console.log('[Redis] Redis connection closed');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.client.on('reconnecting', (delay) => {
      this.connectionAttempts++;
      console.log(`[Redis] Reconnecting to Redis... Attempt ${this.connectionAttempts}, delay: ${delay}ms`);
      this.emit('reconnecting', { attempt: this.connectionAttempts, delay });
      
      // If too many retries, fallback to in-memory
      if (this.connectionAttempts >= this.maxRetries) {
        console.warn(`[Redis] Max retries (${this.maxRetries}) reached, falling back to in-memory storage`);
        this.emit('fallback', 'max_retries_exceeded');
      }
    });
  }

  /**
   * Test Redis connection health
   */
  async healthCheck() {
    if (!this.isConnected || !this.client) {
      return { healthy: false, reason: 'not_connected' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency,
        connected: this.isConnected,
        connectionAttempts: this.connectionAttempts
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
        connected: this.isConnected
      };
    }
  }

  /**
   * Execute Redis command with fallback handling
   */
  async executeCommand(command, ...args) {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected - command cannot be executed');
    }

    try {
      return await this.client[command](...args);
    } catch (error) {
      console.error(`[Redis] Command ${command} failed:`, error.message);
      
      // If connection lost, emit fallback signal
      if (error.message.includes('Connection is closed') || 
          error.message.includes('connect ECONNREFUSED')) {
        this.isConnected = false;
        this.emit('fallback', 'connection_lost');
      }
      
      throw error;
    }
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      enabled: this.isRedisEnabled,
      connected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      maxRetries: this.maxRetries,
      hasClient: !!this.client,
      hasPublisher: !!this.publisher,
      hasSubscriber: !!this.subscriber
    };
  }

  /**
   * Graceful disconnection
   */
  async disconnect() {
    console.log('[Redis] Disconnecting from Redis...');
    
    try {
      const disconnectPromises = [];
      
      if (this.client) {
        disconnectPromises.push(this.client.disconnect());
      }
      if (this.publisher) {
        disconnectPromises.push(this.publisher.disconnect());
      }
      if (this.subscriber) {
        disconnectPromises.push(this.subscriber.disconnect());
      }
      
      await Promise.all(disconnectPromises);
      
      this.client = null;
      this.publisher = null;
      this.subscriber = null;
      this.isConnected = false;
      
      console.log('[Redis] Successfully disconnected from Redis');
      this.emit('disconnected');
      
    } catch (error) {
      console.error('[Redis] Error during disconnect:', error.message);
    }
  }

  /**
   * Force reconnection attempt
   */
  async reconnect() {
    console.log('[Redis] Force reconnecting to Redis...');
    
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.warn('[Redis] Error disconnecting during reconnect:', error.message);
      }
    }
    
    this.client = null;
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    
    return await this.initialize();
  }
}

// Singleton instance
let redisConfig = null;

export const getRedisConfig = () => {
  if (!redisConfig) {
    redisConfig = new RedisConfig();
  }
  return redisConfig;
};

export default RedisConfig;