import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || "",
    db: Number(process.env.REDIS_DB || 0),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000
  },
  performance: {
    syncTargetLatency: Number(process.env.SYNC_TARGET_LATENCY || 50), // Target <50ms
    scrollTickInterval: Number(process.env.SCROLL_TICK_INTERVAL || 16), // 60 FPS
    heartbeatInterval: Number(process.env.HEARTBEAT_INTERVAL || 5000),
    connectionTimeout: Number(process.env.CONNECTION_TIMEOUT || 10000),
    maxEventBatchSize: Number(process.env.MAX_EVENT_BATCH_SIZE || 100),
    metricsInterval: Number(process.env.METRICS_INTERVAL || 10000)
  },
  rateLimiting: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 1000),
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
    skipSuccessfulRequests: true
  },
  socketio: {
    pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT || 5000),
    pingInterval: Number(process.env.SOCKET_PING_INTERVAL || 2500),
    transports: ['websocket'],
    allowEIO3: true,
    maxHttpBufferSize: 1e6, // 1MB
    compression: true,
    perMessageDeflate: {
      threshold: 1024,
      zlibDeflateOptions: {
        level: 3,
        chunkSize: 16 * 1024
      }
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production'
  }
};