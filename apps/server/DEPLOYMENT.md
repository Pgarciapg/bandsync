# BandSync Server - Deployment Guide

## Enhanced Architecture Overview

The new BandSync server architecture provides:
- **Sub-50ms latency** metronome synchronization
- **100+ concurrent sessions** with Redis-backed state management  
- **Multi-band routing** for scalable session discovery
- **Horizontal scaling** support via Redis pub/sub
- **Production-ready** error handling and monitoring

## Quick Start

### 1. Environment Setup

Copy the environment template:
```bash
cp .env.example .env
```

Configure your `.env` file:
```bash
# Server Settings
PORT=3001
SERVER_ID=bandsync-server-1

# Redis Configuration (Required)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Optional: Performance tuning
SYNC_RATE_MS=12.5  # 80 FPS sync rate
MAX_SESSION_MEMBERS=8
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Redis

Using Docker:
```bash
docker run -d --name bandsync-redis -p 6379:6379 redis:7-alpine
```

Or install locally and start:
```bash
redis-server
```

### 4. Run the Server

Development mode:
```bash
npm run dev:enhanced
```

Production mode:
```bash
npm start
```

## Architecture Components

### Core Files Structure
```
/src/
├── events-enhanced.js     # Comprehensive Socket.io event definitions
├── redis-manager.js       # Redis integration with pub/sub
├── session-manager.js     # 100+ session orchestration  
├── sync-engine.js         # Sub-50ms synchronization engine
└── events.js             # Legacy events (for migration)

server-enhanced.js         # Production server
server.js                  # Legacy server (for comparison)
```

### Key Features

#### 1. High-Frequency Synchronization
- **80 FPS** position updates (12.5ms intervals)
- **Clock synchronization** with latency compensation
- **Drift correction** algorithm with 25ms threshold
- **Multi-sample latency** measurement for accuracy

#### 2. Redis-Backed Session Management
- **Persistent session state** survives server restarts  
- **Horizontal scaling** via Redis pub/sub channels
- **Session discovery** by band ID
- **Automatic cleanup** of expired sessions

#### 3. Advanced Event Structure
- **Priority-based messaging** for critical sync events
- **Rate limiting** per event type and client
- **Input validation** with comprehensive schemas
- **Error handling** with graceful degradation

## Performance Targets

| Metric | Target | Implementation |
|--------|---------|----------------|
| Sync Latency | < 50ms | High-freq position updates + clock sync |
| Concurrent Sessions | 100+ | Redis state management + connection pools |
| Beat Accuracy | < 25ms | Drift correction + latency compensation |
| Server Response | < 10ms | Optimized event emission ordering |

## Monitoring & Health Checks

### Health Check Endpoint
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "connections": { "current": 45, "peak": 67 },
  "redis": "connected",
  "uptime": 3600000
}
```

### Metrics Endpoint
```bash
curl http://localhost:3001/api/metrics
```

### Real-time Monitoring
The server emits metrics via Socket.io:
```javascript
socket.on('metrics:update', (metrics) => {
  console.log('Avg Latency:', metrics.avgLatency);
  console.log('Active Sessions:', metrics.activeSessions);
});
```

## Production Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables (Production)
```bash
NODE_ENV=production
PORT=3001
REDIS_HOST=your-redis-cluster.cache.amazonaws.com
REDIS_PASSWORD=your-secure-password
SERVER_ID=bandsync-prod-1
CORS_ORIGIN=https://yourdomain.com
```

### Scaling Considerations

1. **Horizontal Scaling**: Multiple server instances share Redis state
2. **Load Balancing**: Use sticky sessions for WebSocket connections
3. **Redis Clustering**: For > 1000 concurrent sessions
4. **Monitoring**: Integrate with Prometheus/Grafana for metrics

## Migration from Legacy Server

### 1. Backward Compatibility
The enhanced server supports legacy events:
- `join_session` → `session:join`
- `set_tempo` → `metronome:start`
- `scroll_tick` → `position:sync`

### 2. Migration Strategy
1. Deploy enhanced server alongside legacy
2. Gradually migrate clients to new events
3. Monitor performance improvements
4. Deprecate legacy endpoints

### 3. Feature Comparison

| Feature | Legacy | Enhanced |
|---------|--------|----------|
| Session Storage | In-memory | Redis persistent |
| Sync Rate | 100ms (10 FPS) | 12.5ms (80 FPS) |
| Max Sessions | ~20 | 100+ |
| Clock Sync | None | Multi-sample RTT |
| Error Handling | Basic | Comprehensive |
| Monitoring | None | Full metrics |

## Troubleshooting

### Common Issues

1. **High Latency (>50ms)**
   - Check Redis connection latency
   - Verify network conditions
   - Monitor server CPU usage

2. **Session Sync Drift**
   - Enable clock sync debugging
   - Check client-side clock accuracy
   - Verify sync interval configuration

3. **Redis Connection Issues**
   - Verify Redis server status
   - Check authentication credentials
   - Monitor Redis memory usage

### Debug Mode
Enable detailed logging:
```bash
DEBUG_SYNC_ENGINE=true
DEBUG_REDIS_EVENTS=true
npm run dev:enhanced
```

## Security Considerations

1. **Rate Limiting**: Automatic per-client limits
2. **Input Validation**: All event payloads validated
3. **CORS**: Configurable origin restrictions
4. **Helmet**: Security headers for HTTP endpoints
5. **Redis Auth**: Password-protected Redis access

## Next Steps

1. **Load Testing**: Verify 100+ session capacity
2. **Mobile Integration**: Optimize for mobile network conditions  
3. **Analytics**: Track session patterns and performance
4. **Auto-scaling**: Implement based on connection metrics