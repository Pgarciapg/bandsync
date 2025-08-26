/**
 * Storage Manager with Graceful Redis Fallback
 * Manages storage backend selection and seamless fallback to in-memory storage
 */

import { getRedisConfig } from './redis-config.js';
import { getRedisManager } from './redis-manager.js';
import { StorageInterface, InMemoryStorage, RedisStorageAdapter } from './storage-interface.js';
import { EventEmitter } from 'events';

export class StorageManager extends EventEmitter {
  constructor() {
    super();
    this.currentStorage = null;
    this.storageType = null;
    this.isInitialized = false;
    this.fallbackReason = null;
    this.redisConfig = null;
    this.redisManager = null;
    this.inMemoryStorage = null;
    
    // Fallback monitoring
    this.fallbackAttempts = 0;
    this.maxFallbackAttempts = 3;
    this.reconnectInterval = null;
    this.reconnectDelay = 30000; // 30 seconds
  }

  /**
   * Initialize storage with Redis preference and in-memory fallback
   */
  async initialize() {
    if (this.isInitialized) {
      console.log(`[StorageManager] Already initialized with ${this.storageType} storage`);
      return { success: true, storageType: this.storageType };
    }

    console.log('[StorageManager] Initializing storage manager...');

    try {
      // Always create in-memory storage as fallback
      this.inMemoryStorage = new InMemoryStorage();
      console.log('[StorageManager] In-memory storage prepared as fallback');

      // Try Redis first if enabled
      const redisResult = await this.initializeRedis();
      
      if (redisResult.success) {
        this.currentStorage = new RedisStorageAdapter(this.redisManager);
        this.storageType = 'redis';
        console.log('[StorageManager] Successfully initialized with Redis storage');
        this.emit('storage_ready', { type: 'redis' });
      } else {
        await this.fallbackToInMemory(redisResult.reason);
      }

      this.isInitialized = true;
      return { success: true, storageType: this.storageType, fallbackReason: this.fallbackReason };

    } catch (error) {
      console.error('[StorageManager] Failed to initialize storage:', error);
      await this.fallbackToInMemory(error.message);
      this.isInitialized = true;
      return { success: true, storageType: this.storageType, fallbackReason: this.fallbackReason };
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    try {
      this.redisConfig = getRedisConfig();
      
      // Set up Redis event handlers for fallback scenarios
      this.redisConfig.on('fallback', (reason) => {
        console.warn(`[StorageManager] Redis fallback triggered: ${reason}`);
        this.handleRedisFallback(reason);
      });

      this.redisConfig.on('connected', () => {
        console.log('[StorageManager] Redis reconnected, attempting to restore Redis storage');
        this.handleRedisReconnect();
      });

      this.redisConfig.on('error', (error) => {
        console.error('[StorageManager] Redis error:', error.message);
        if (this.storageType === 'redis') {
          this.handleRedisFallback(`redis_error: ${error.message}`);
        }
      });

      // Attempt Redis connection
      const result = await this.redisConfig.initialize();
      
      if (result.success) {
        this.redisManager = getRedisManager({
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
          db: process.env.REDIS_DB,
          keyPrefix: process.env.REDIS_KEY_PREFIX
        });
        
        console.log('[StorageManager] Redis manager initialized');
        return { success: true };
      } else {
        return { success: false, reason: result.reason };
      }

    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * Handle Redis fallback scenarios
   */
  async handleRedisFallback(reason) {
    if (this.storageType === 'in-memory') {
      console.log('[StorageManager] Already using in-memory storage, ignoring fallback signal');
      return;
    }

    console.warn(`[StorageManager] Handling Redis fallback: ${reason}`);
    this.fallbackAttempts++;

    // Migrate current sessions to in-memory storage
    await this.migrateToInMemory(reason);

    // Set up reconnection monitoring if not already running
    if (!this.reconnectInterval && this.fallbackAttempts < this.maxFallbackAttempts) {
      this.startReconnectionMonitoring();
    }
  }

  /**
   * Handle Redis reconnection
   */
  async handleRedisReconnect() {
    if (this.storageType === 'redis') {
      console.log('[StorageManager] Redis already active, ignoring reconnect signal');
      return;
    }

    console.log('[StorageManager] Attempting to restore Redis storage after reconnection');
    
    try {
      // Test Redis health
      const healthCheck = await this.redisConfig.healthCheck();
      
      if (healthCheck.healthy) {
        // Migrate sessions back to Redis
        await this.migrateToRedis();
        this.stopReconnectionMonitoring();
        this.fallbackAttempts = 0;
        console.log('[StorageManager] Successfully restored Redis storage');
      } else {
        console.warn('[StorageManager] Redis health check failed, staying with in-memory');
      }
    } catch (error) {
      console.error('[StorageManager] Failed to restore Redis storage:', error.message);
    }
  }

  /**
   * Fallback to in-memory storage
   */
  async fallbackToInMemory(reason) {
    console.warn(`[StorageManager] Falling back to in-memory storage: ${reason}`);
    
    this.currentStorage = this.inMemoryStorage;
    this.storageType = 'in-memory';
    this.fallbackReason = reason;
    
    this.emit('storage_fallback', { 
      from: 'redis', 
      to: 'in-memory', 
      reason,
      timestamp: Date.now() 
    });
  }

  /**
   * Migrate sessions from Redis to in-memory storage
   */
  async migrateToInMemory(reason) {
    if (!this.redisManager || this.storageType === 'in-memory') return;

    console.log('[StorageManager] Migrating sessions from Redis to in-memory storage');
    
    try {
      // Get all active sessions from Redis
      const activeSessions = await this.redisManager.getActiveSessions();
      
      console.log(`[StorageManager] Found ${activeSessions.length} sessions to migrate`);
      
      // Migrate each session
      for (const session of activeSessions) {
        try {
          await this.inMemoryStorage.createSession(session);
          
          // Migrate members
          if (session.members) {
            for (const [socketId, memberData] of session.members.entries()) {
              await this.inMemoryStorage.addMember(session.sessionId, memberData);
            }
          }
          
          console.log(`[StorageManager] Migrated session ${session.sessionId}`);
        } catch (error) {
          console.error(`[StorageManager] Failed to migrate session ${session.sessionId}:`, error.message);
        }
      }

      // Switch to in-memory storage
      this.currentStorage = this.inMemoryStorage;
      this.storageType = 'in-memory';
      this.fallbackReason = reason;
      
      this.emit('storage_migrated', { 
        from: 'redis', 
        to: 'in-memory', 
        sessionCount: activeSessions.length,
        reason,
        timestamp: Date.now() 
      });

      console.log(`[StorageManager] Successfully migrated ${activeSessions.length} sessions to in-memory storage`);

    } catch (error) {
      console.error('[StorageManager] Migration to in-memory failed:', error.message);
      // Force fallback anyway
      this.currentStorage = this.inMemoryStorage;
      this.storageType = 'in-memory';
      this.fallbackReason = `migration_failed: ${error.message}`;
    }
  }

  /**
   * Migrate sessions from in-memory to Redis storage
   */
  async migrateToRedis() {
    if (this.storageType === 'redis' || !this.inMemoryStorage) return;

    console.log('[StorageManager] Migrating sessions from in-memory to Redis storage');
    
    try {
      // Get all sessions from in-memory storage
      const activeSessions = await this.inMemoryStorage.getActiveSessions();
      
      console.log(`[StorageManager] Found ${activeSessions.length} sessions to migrate to Redis`);
      
      // Create Redis storage adapter
      const redisStorage = new RedisStorageAdapter(this.redisManager);
      
      // Migrate each session
      for (const session of activeSessions) {
        try {
          await redisStorage.createSession(session);
          
          // Migrate members
          if (session.members) {
            for (const [socketId, memberData] of session.members.entries()) {
              await redisStorage.addMember(session.sessionId, memberData);
            }
          }
          
          console.log(`[StorageManager] Migrated session ${session.sessionId} to Redis`);
        } catch (error) {
          console.error(`[StorageManager] Failed to migrate session ${session.sessionId} to Redis:`, error.message);
        }
      }

      // Switch to Redis storage
      this.currentStorage = redisStorage;
      this.storageType = 'redis';
      this.fallbackReason = null;
      
      this.emit('storage_migrated', { 
        from: 'in-memory', 
        to: 'redis', 
        sessionCount: activeSessions.length,
        timestamp: Date.now() 
      });

      console.log(`[StorageManager] Successfully migrated ${activeSessions.length} sessions to Redis storage`);

    } catch (error) {
      console.error('[StorageManager] Migration to Redis failed:', error.message);
      throw error;
    }
  }

  /**
   * Start monitoring for Redis reconnection opportunities
   */
  startReconnectionMonitoring() {
    if (this.reconnectInterval) return;

    console.log(`[StorageManager] Starting Redis reconnection monitoring (every ${this.reconnectDelay}ms)`);
    
    this.reconnectInterval = setInterval(async () => {
      if (this.fallbackAttempts >= this.maxFallbackAttempts) {
        console.log('[StorageManager] Max fallback attempts reached, stopping reconnection monitoring');
        this.stopReconnectionMonitoring();
        return;
      }

      console.log(`[StorageManager] Attempting Redis reconnection (attempt ${this.fallbackAttempts + 1}/${this.maxFallbackAttempts})`);
      
      try {
        const result = await this.redisConfig.reconnect();
        if (result.success) {
          console.log('[StorageManager] Redis reconnection successful');
          // handleRedisReconnect will be called by the event handler
        } else {
          console.log('[StorageManager] Redis reconnection failed, will retry');
        }
      } catch (error) {
        console.error('[StorageManager] Redis reconnection error:', error.message);
      }
    }, this.reconnectDelay);
  }

  /**
   * Stop reconnection monitoring
   */
  stopReconnectionMonitoring() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
      console.log('[StorageManager] Stopped Redis reconnection monitoring');
    }
  }

  /**
   * Get current storage instance (implements StorageInterface)
   */
  getStorage() {
    if (!this.isInitialized) {
      throw new Error('StorageManager not initialized. Call initialize() first.');
    }
    return this.currentStorage;
  }

  /**
   * Get current storage status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      storageType: this.storageType,
      fallbackReason: this.fallbackReason,
      fallbackAttempts: this.fallbackAttempts,
      maxFallbackAttempts: this.maxFallbackAttempts,
      reconnectMonitoring: !!this.reconnectInterval,
      redisStatus: this.redisConfig ? this.redisConfig.getStatus() : null
    };
  }

  /**
   * Force storage type switch (for testing/admin purposes)
   */
  async forceStorageType(targetType) {
    if (!['redis', 'in-memory'].includes(targetType)) {
      throw new Error('Invalid storage type. Must be "redis" or "in-memory"');
    }

    if (this.storageType === targetType) {
      console.log(`[StorageManager] Already using ${targetType} storage`);
      return { success: true, storageType: targetType };
    }

    console.log(`[StorageManager] Force switching from ${this.storageType} to ${targetType} storage`);

    try {
      if (targetType === 'in-memory') {
        await this.migrateToInMemory('force_switch');
      } else {
        // Ensure Redis is available
        if (!this.redisConfig) {
          await this.initializeRedis();
        }
        
        const healthCheck = await this.redisConfig.healthCheck();
        if (!healthCheck.healthy) {
          throw new Error(`Redis not healthy: ${healthCheck.reason}`);
        }
        
        await this.migrateToRedis();
      }

      return { success: true, storageType: this.storageType };
    } catch (error) {
      console.error(`[StorageManager] Failed to switch to ${targetType} storage:`, error.message);
      return { success: false, error: error.message, storageType: this.storageType };
    }
  }

  /**
   * Get comprehensive health check
   */
  async healthCheck() {
    const status = this.getStatus();
    
    if (!this.currentStorage) {
      return {
        healthy: false,
        storageType: 'none',
        error: 'No storage initialized',
        ...status
      };
    }

    try {
      const storageHealth = await this.currentStorage.healthCheck();
      return {
        ...storageHealth,
        ...status
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        ...status
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[StorageManager] Shutting down storage manager...');
    
    this.stopReconnectionMonitoring();
    
    if (this.currentStorage) {
      await this.currentStorage.disconnect();
    }
    
    if (this.inMemoryStorage && this.inMemoryStorage !== this.currentStorage) {
      await this.inMemoryStorage.disconnect();
    }
    
    if (this.redisConfig) {
      await this.redisConfig.disconnect();
    }
    
    this.isInitialized = false;
    console.log('[StorageManager] Storage manager shut down');
  }
}

// Singleton instance
let storageManager = null;

export const getStorageManager = () => {
  if (!storageManager) {
    storageManager = new StorageManager();
  }
  return storageManager;
};

export default StorageManager;