# Redis Integration Foundation for BandSync

This document outlines the Redis integration foundation prepared for BandSync session persistence and horizontal scaling capabilities.

## Overview

The Redis integration provides:
- **Session Persistence**: Store session data in Redis for recovery across server restarts
- **Horizontal Scaling**: Support multiple server instances with shared session state
- **Real-time Pub/Sub**: Broadcast events across server instances
- **Graceful Fallback**: Automatic fallback to in-memory storage when Redis is unavailable
- **Zero Disruption**: Existing functionality remains unchanged during integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BandSync Server                          │
├─────────────────────────────────────────────────────────────┤
│  StorageManager                                             │
│  ├── Redis Storage (Primary)                               │
│  │   ├── Session Persistence                               │
│  │   ├── Pub/Sub Events                                    │
│  │   └── Horizontal Scaling                                │
│  └── In-Memory Storage (Fallback)                          │
│      ├── Existing Session Logic                            │
│      ├── Zero External Dependencies                        │
│      └── Automatic Migration                               │
├─────────────────────────────────────────────────────────────┤
│  RedisConfig                                               │
│  ├── Connection Management                                  │
│  ├── Health Monitoring                                     │
│  ├── Automatic Reconnection                                │
│  └── Fallback Detection                                    │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/server/src/
├── redis-config.js          # Redis connection with fallback logic
├── storage-interface.js     # Unified storage abstraction
├── storage-manager.js       # Storage backend management with migration
├── redis-manager.js         # Existing Redis operations (enhanced)
├── session-manager.js       # Existing session management (enhanced)
└── sync-engine.js          # Existing sync engine (enhanced)
```

## Configuration

### Environment Variables (Added to .env.example)

```bash
# Redis Configuration (Optional - falls back to in-memory if not available)
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=bandsync:
REDIS_TTL=3600

# Redis Connection Options
REDIS_MAX_RETRIES=5
REDIS_RETRY_DELAY_ON_FAILURE=100
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000

# Server Identification for horizontal scaling
SERVER_ID=bandsync-server-1
```

### Development Environment
```bash
# Minimal setup for development (Redis optional)
cp .env.example .env
# Edit .env to set REDIS_ENABLED=false for in-memory only
```

### Production Environment
```bash
# Production setup with Redis
REDIS_ENABLED=true
REDIS_URL=redis://your-redis-instance:6379
REDIS_PASSWORD=your-secure-password
SERVER_ID=bandsync-server-prod-1
```

## Integration Points

### 1. Storage Interface Abstraction

All storage operations go through a unified interface:

```javascript
// Both Redis and in-memory storage implement these methods:
await storage.createSession(sessionData)
await storage.getSession(sessionId)
await storage.updateSession(sessionId, updates)
await storage.addMember(sessionId, memberData)
await storage.removeMember(sessionId, socketId)
```

### 2. Graceful Fallback System

The system automatically handles Redis connectivity issues:

```javascript
// Automatic fallback scenarios:
// 1. Redis server unavailable at startup → Use in-memory
// 2. Redis connection lost during operation → Migrate to in-memory
// 3. Redis reconnects → Migrate back to Redis (optional)
```

### 3. Session Migration

Seamless session migration between storage backends:

```javascript
// During fallback: Redis → In-Memory
// - Export all active sessions from Redis
// - Import into in-memory storage
// - Switch backend atomically
// - Continue operation without disruption

// During recovery: In-Memory → Redis  
// - Export all active sessions from in-memory
// - Import into Redis storage
// - Switch backend atomically
// - Resume Redis persistence
```

## Implementation Plan

### Day 5: Redis Integration (Tomorrow)

1. **Update server.js** - Replace direct session Map with StorageManager
2. **Initialize StorageManager** - Add initialization in server startup
3. **Update Event Handlers** - Use storage.* methods instead of sessions.get()
4. **Add Health Endpoints** - Expose storage status via API
5. **Testing** - Verify fallback behavior and migration

### Changes Required in server.js

```javascript
// BEFORE (current):
const sessions = new Map();
const memberInfo = new Map();

// AFTER (Day 5):
import { getStorageManager } from './src/storage-manager.js';
const storageManager = getStorageManager();
await storageManager.initialize();
const storage = storageManager.getStorage();
```

### Event Handler Updates

```javascript
// BEFORE:
socket.on(EVENTS.JOIN_SESSION, ({ sessionId, displayName, role }) => {
  let session = sessions.get(sessionId);
  if (!session) {
    session = createSession(sessionId, socket.id);
  }
  // ...
});

// AFTER:
socket.on(EVENTS.JOIN_SESSION, async ({ sessionId, displayName, role }) => {
  let session = await storage.getSession(sessionId);
  if (!session) {
    session = await storage.createSession({
      sessionId, 
      creatorSocketId: socket.id
    });
  }
  // ...
});
```

## Benefits

### Immediate Benefits (Day 5)
- **Session Persistence**: Sessions survive server restarts
- **Reliability**: Automatic fallback prevents data loss
- **Zero Disruption**: Existing functionality unchanged

### Future Benefits (Horizontal Scaling)
- **Multi-Server Support**: Run multiple BandSync server instances
- **Load Distribution**: Distribute sessions across servers
- **Pub/Sub Events**: Real-time communication between servers
- **High Availability**: Server failure doesn't lose session data

## Monitoring and Observability

### Health Check Endpoint
```javascript
app.get('/api/health', async (req, res) => {
  const health = await storageManager.healthCheck();
  res.json(health);
});

// Response example:
{
  "healthy": true,
  "storageType": "redis",
  "initialized": true,
  "fallbackReason": null,
  "totalSessions": 15,
  "redisStatus": {
    "connected": true,
    "connectionAttempts": 0
  }
}
```

### Storage Status Endpoint
```javascript
app.get('/api/storage/status', (req, res) => {
  const status = storageManager.getStatus();
  res.json(status);
});
```

### Metrics and Logging

All storage operations include comprehensive logging:
- Connection status changes
- Fallback triggers and reasons  
- Session migration events
- Performance metrics
- Error conditions

## Testing Strategy

### Unit Tests
- Storage interface compliance
- Fallback logic verification
- Session migration accuracy
- Error handling robustness

### Integration Tests  
- Redis connection scenarios
- Fallback and recovery flows
- Multi-server pub/sub communication
- Session persistence across restarts

### Load Testing
- High concurrent session creation
- Rapid member join/leave cycles
- Network partition simulation
- Memory usage under load

## Security Considerations

### Redis Security
- **Authentication**: Use REDIS_PASSWORD for protected instances
- **Encryption**: Configure Redis with TLS for production
- **Network**: Restrict Redis access to server subnet only
- **Key Expiration**: Automatic session cleanup via TTL

### Data Privacy
- **Session Data**: Only essential session state stored
- **Member Data**: No sensitive user information in Redis
- **Cleanup**: Expired sessions automatically removed

## Deployment Notes

### Docker Compose Example
```yaml
services:
  bandsync-server:
    build: .
    environment:
      - REDIS_ENABLED=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### Kubernetes Deployment
```yaml
# Redis can be deployed as:
# 1. Managed service (AWS ElastiCache, GCP Memorystore)
# 2. Redis Operator (Redis Enterprise, etc.)  
# 3. StatefulSet with persistent volumes

# BandSync servers as Deployment with Redis connection
```

## Performance Considerations

### Redis Performance
- **Connection Pooling**: ioredis handles connection pooling
- **Pipeline Operations**: Batch Redis operations when possible
- **Memory Management**: Configure Redis max memory policies
- **Persistence**: Choose appropriate Redis persistence strategy

### Session Data Optimization
- **Minimal Data**: Store only essential session state
- **Efficient Serialization**: Use JSON for human-readable debugging
- **TTL Management**: Automatic cleanup prevents memory leaks
- **Indexing**: Use Redis data structures for fast lookups

## Troubleshooting Guide

### Common Issues

1. **Redis Connection Failed**
   ```
   Error: connect ECONNREFUSED 127.0.0.1:6379
   Solution: Verify Redis server is running and accessible
   Fallback: System automatically uses in-memory storage
   ```

2. **Session Migration Failures**  
   ```
   Error: Failed to migrate session to Redis
   Solution: Check Redis memory limits and connection stability
   Fallback: System continues with in-memory storage
   ```

3. **High Memory Usage**
   ```
   Issue: Redis memory usage growing
   Solution: Check TTL settings and cleanup intervals
   Monitoring: Use Redis INFO memory command
   ```

### Debug Commands

```bash
# Check Redis connection
redis-cli -h localhost -p 6379 ping

# View session keys
redis-cli -h localhost -p 6379 --scan --pattern "bandsync:session:*"

# Monitor Redis operations
redis-cli -h localhost -p 6379 monitor

# Check memory usage
redis-cli -h localhost -p 6379 info memory
```

## Next Steps

After Day 5 implementation:
1. **Monitor Performance**: Track Redis operations and fallback events
2. **Optimize Queries**: Profile Redis operations for efficiency
3. **Scale Testing**: Test multi-server scenarios
4. **Production Deployment**: Deploy with managed Redis service
5. **Advanced Features**: Implement cross-server pub/sub for horizontal scaling

---

This Redis integration foundation provides a robust, scalable, and reliable persistence layer for BandSync while maintaining backward compatibility and zero-disruption operation.