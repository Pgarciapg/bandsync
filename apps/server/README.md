# BandSync High-Performance Server

A high-performance Node.js/Express server optimized for sub-100ms real-time synchronization targeting for musical collaboration.

## Performance Features

### Sub-100ms Synchronization Targeting
- **Target Latency**: <50ms for sync operations
- **High-Precision Timing**: 16ms scroll tick intervals (60 FPS)
- **Event Batching**: Optimized event queue processing every 5ms
- **Connection State Recovery**: Automatic reconnection with state preservation

### Redis Integration
- **Session Management**: Persistent session storage with Redis
- **Pub/Sub**: Real-time message broadcasting across multiple server instances
- **Connection Pooling**: Separate Redis connections for operations and pub/sub
- **Fallback Mode**: Graceful degradation to in-memory storage when Redis unavailable

### Performance Monitoring
- **Real-time Metrics**: Memory, CPU, latency, and connection statistics
- **Performance Alerts**: Automatic warnings for high latency/memory usage
- **Historical Data**: Time-series metrics storage in Redis
- **Health Endpoints**: `/health` and `/metrics` for monitoring

### Socket.IO Optimizations
- **WebSocket-Only Transport**: Eliminates polling overhead
- **Compression**: Per-message deflate with optimized thresholds
- **Connection Recovery**: Maintains state during brief disconnections
- **Rate Limiting**: Per-socket event rate limiting with violation tracking

### Security & Reliability
- **Helmet Security Headers**: Comprehensive security middleware
- **Rate Limiting**: Configurable per-endpoint and global rate limits
- **Input Validation**: Comprehensive input sanitization and validation
- **Graceful Shutdown**: Clean connection closure and resource cleanup
- **Error Handling**: Comprehensive error tracking and recovery

## Quick Start

### Installation

```bash
cd apps/server
npm install
```

### Configuration

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Set `REDIS_HOST` and `REDIS_PORT` if using Redis
- Adjust `SYNC_TARGET_LATENCY` for your latency requirements
- Configure `LOG_LEVEL` for debugging

### Development

```bash
npm run dev
```

### Production Deployment

Set production environment variables:
```bash
export NODE_ENV=production
export LOG_LEVEL=warn
export CORS_ORIGIN=https://your-domain.com
export SYNC_TARGET_LATENCY=25
```

## Architecture

### Core Components

1. **SyncEngine**: High-precision timing and session management
2. **SocketHandlers**: Optimized event handling with rate limiting
3. **PerformanceMonitor**: Real-time metrics collection and alerting
4. **RedisClient**: Connection pooling and session persistence

### Event Flow

1. **Connection**: Client connects with WebSocket-only transport
2. **Session Join**: Ultra-fast session initialization (target <5ms)
3. **Synchronization**: High-precision timing with 16ms tick intervals
4. **Event Processing**: Batched event processing every 5ms
5. **Broadcasting**: Efficient room-based event distribution

### Performance Targets

| Metric | Target | Description |
|--------|---------|-------------|
| Sync Latency | <50ms | End-to-end synchronization time |
| Connection Setup | <10ms | Socket connection establishment |
| Event Processing | <5ms | Event handling and validation |
| Memory Usage | <500MB | Heap memory consumption |
| CPU Usage | <80% | Server CPU utilization |

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status, uptime, and connection count.

### Performance Metrics
```
GET /metrics
```
Returns detailed performance metrics, connection statistics, and session data.

### Session Information
```
GET /sessions/:sessionId
```
Returns detailed information about a specific session.

## Socket Events

### Client -> Server

- `join_session`: Join a synchronization session
- `set_role`: Set client role (leader/follower)  
- `set_tempo`: Update tempo (leader only)
- `play`: Start playback (leader only)
- `pause`: Pause playback (leader only)
- `seek`: Change position (leader only)
- `sync_request`: Request current sync state
- `update_message`: Update session message
- `heartbeat`: Connection health check

### Server -> Client

- `snapshot`: Complete session state
- `scroll_tick`: High-precision position updates
- `sync_response`: Response to sync request
- `room_stats`: Session member count
- `heartbeat_response`: Heartbeat acknowledgment
- `error`: Error notifications
- `rate_limit_exceeded`: Rate limiting warnings

## Configuration Options

### Performance Tuning

```env
SYNC_TARGET_LATENCY=50          # Target sync latency (ms)
SCROLL_TICK_INTERVAL=16         # Update frequency (ms) 
MAX_EVENT_BATCH_SIZE=100        # Events per batch
METRICS_INTERVAL=10000          # Metrics collection (ms)
```

### Socket.IO Optimization

```env
SOCKET_PING_TIMEOUT=5000        # Connection timeout
SOCKET_PING_INTERVAL=2500       # Ping frequency
```

### Rate Limiting

```env
RATE_LIMIT_WINDOW_MS=1000       # Rate limit window
RATE_LIMIT_MAX_REQUESTS=100     # Max requests per window
```

## Monitoring

### Key Metrics

- **Active Connections**: Current WebSocket connections
- **Messages/Second**: Real-time message throughput
- **Average Latency**: End-to-end synchronization latency
- **Memory Usage**: Heap memory consumption
- **CPU Usage**: Server CPU utilization
- **Error Rate**: Failed requests and connection errors

### Performance Alerts

The server automatically generates alerts for:
- Latency >100ms (2x target)
- Memory usage >500MB
- High CPU usage >5s total
- Connection errors
- Rate limit violations

## Scaling

### Horizontal Scaling

With Redis adapter, the server supports horizontal scaling:
- Multiple server instances
- Shared session state via Redis
- Load balancing with session affinity
- Pub/sub message broadcasting

### Vertical Scaling

Single-instance optimizations:
- Memory-efficient data structures
- Event loop optimization
- Connection pooling
- Garbage collection tuning

## Development

### Testing

```bash
npm test
```

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

### Memory Profiling

```bash
node --inspect server.js
```

## Production Considerations

1. **Redis**: Use Redis cluster for high availability
2. **Load Balancing**: Configure sticky sessions
3. **SSL/TLS**: Terminate SSL at load balancer or reverse proxy
4. **Monitoring**: Integrate with APM tools (New Relic, DataDog, etc.)
5. **Logging**: Configure structured logging to centralized system
6. **Process Manager**: Use PM2 or similar for process management

## License

MIT License - see LICENSE file for details.