# Socket.io Event Contracts

This document defines the Socket.io event contracts for BandSync real-time musical collaboration.

## 📡 Event Overview

All events are defined in `packages/shared/events.js` and must be imported using:

```javascript
import { EVENTS } from 'bandsync-shared';
```

## 🏗️ Event Categories

### Critical Events (Sub-100ms priority)
- `SYNC_REQUEST` / `SYNC_RESPONSE`
- `LATENCY_PROBE` / `LATENCY_RESPONSE`
- `POSITION_SYNC`
- `DRIFT_CORRECTION`
- `CLOCK_SYNC`

### Timing Events
- `SCROLL_TICK`
- `METRONOME_TICK`
- `BEAT_SYNC`
- `SET_TEMPO`
- `TEMPO_CHANGE`

### Transport Events
- `PLAY`
- `PAUSE`
- `STOP`
- `SEEK`

### Session Events
- `JOIN_SESSION`
- `LEAVE_SESSION`
- `SNAPSHOT`
- `SESSION_STATE`
- `SET_ROLE`
- `ROLE_CHANGED`

## 📋 Event Contracts

### Session Management

#### JOIN_SESSION
**Client → Server**
```javascript
socket.emit(EVENTS.JOIN_SESSION, {
  sessionId: string,
  displayName?: string,
  role?: 'leader' | 'follower'
});
```

**Server Response**
```javascript
// Success: SNAPSHOT event with session state
// Error: ERROR event with message
```

#### LEAVE_SESSION
**Client → Server**
```javascript
socket.emit(EVENTS.LEAVE_SESSION, {
  sessionId: string
});
```

#### SNAPSHOT (Session State)
**Server → Client**
```javascript
socket.on(EVENTS.SNAPSHOT, (sessionState) => {
  // sessionState: {
  //   message: string,
  //   tempo: number,
  //   tempoBpm: number,
  //   position: number, // milliseconds
  //   isPlaying: boolean,
  //   leaderSocketId: string | null,
  //   members: Array<{
  //     socketId: string,
  //     displayName: string,
  //     role: 'leader' | 'follower',
  //     joinedAt: number
  //   }>
  // }
});
```

### Transport Controls

#### PLAY
**Client → Server (Leader only)**
```javascript
socket.emit(EVENTS.PLAY, {
  sessionId: string
});
```

#### PAUSE
**Client → Server (Leader only)**
```javascript
socket.emit(EVENTS.PAUSE, {
  sessionId: string
});
```

#### STOP
**Client → Server (Leader only)**
```javascript
socket.emit(EVENTS.STOP, {
  sessionId: string
});
```

#### SEEK
**Client → Server (Leader only)**
```javascript
socket.emit(EVENTS.SEEK, {
  sessionId: string,
  position: number // milliseconds
});
```

### Tempo Management

#### SET_TEMPO
**Client → Server (Leader only)**
```javascript
socket.emit(EVENTS.SET_TEMPO, {
  sessionId: string,
  tempo: number // BPM (60-200)
});
```

#### TEMPO_CHANGE
**Server → All Clients**
```javascript
socket.on(EVENTS.TEMPO_CHANGE, (data) => {
  // data: {
  //   sessionId: string,
  //   oldTempo: number,
  //   newTempo: number,
  //   changeTime: number, // timestamp
  //   fadeTime?: number   // fade duration in ms
  // }
});
```

### Role Management

#### SET_ROLE
**Client → Server**
```javascript
socket.emit(EVENTS.SET_ROLE, {
  sessionId: string,
  role: 'leader' | 'follower'
});
```

#### ROLE_CHANGED
**Server → All Clients**
```javascript
socket.on(EVENTS.ROLE_CHANGED, (data) => {
  // data: {
  //   socketId: string,
  //   role: 'leader' | 'follower',
  //   previousRole: 'leader' | 'follower',
  //   timestamp: number,
  //   reason?: string // e.g., 'leader_disconnected'
  // }
});
```

### Synchronization Events

#### SYNC_REQUEST
**Client → Server**
```javascript
socket.emit(EVENTS.SYNC_REQUEST, {
  sessionId: string
});
```

#### SYNC_RESPONSE
**Server → Client**
```javascript
socket.on(EVENTS.SYNC_RESPONSE, (data) => {
  // data: {
  //   sessionId: string,
  //   positionMs: number,
  //   tempoBpm: number,
  //   isPlaying: boolean,
  //   serverTime: number // timestamp
  // }
});
```

#### LATENCY_PROBE
**Client → Server**
```javascript
socket.emit(EVENTS.LATENCY_PROBE, {
  timestamp: Date.now(),
  sessionId?: string
});
```

#### LATENCY_RESPONSE
**Server → Client**
```javascript
socket.on(EVENTS.LATENCY_RESPONSE, (data) => {
  // data: {
  //   clientTimestamp: number,
  //   serverTimestamp: number
  // }
  // Calculate RTT: Date.now() - data.clientTimestamp
});
```

### Real-time Scroll Events

#### SCROLL_TICK
**Server → All Clients (during playback)**
```javascript
socket.on(EVENTS.SCROLL_TICK, (data) => {
  // data: {
  //   sessionId: string,
  //   positionMs: number
  // }
  // Emitted every 100ms during playback
});
```

### Advanced Sync Events (Day 4+)

#### BEAT_SYNC
**Bidirectional**
```javascript
// Client → Server (Leader)
socket.emit(EVENTS.BEAT_SYNC, {
  sessionId: string,
  beatPosition: number,
  masterTime: number
});

// Server → All Clients
socket.on(EVENTS.BEAT_SYNC, (data) => {
  // data: {
  //   sessionId: string,
  //   masterTime: number,
  //   beatPosition: number,
  //   tempo: number,
  //   drift: number // ms
  // }
});
```

#### POSITION_SYNC
**Bidirectional**
```javascript
// Client → Server (Leader)
socket.emit(EVENTS.POSITION_SYNC, {
  sessionId: string,
  positionMs: number,
  timestamp: Date.now()
});

// Server → All Clients
socket.on(EVENTS.POSITION_SYNC, (data) => {
  // data: {
  //   sessionId: string,
  //   positionMs: number,
  //   serverTime: number,
  //   clientTimestamp: number
  // }
});
```

### Room Statistics

#### ROOM_STATS
**Server → All Clients**
```javascript
socket.on(EVENTS.ROOM_STATS, (stats) => {
  // stats: {
  //   sessionId: string,
  //   memberCount: number,
  //   connectedCount: number,
  //   isPlaying: boolean,
  //   tempo: number,
  //   position: number,
  //   leader: string, // socketId
  //   uptime: number  // ms
  // }
});
```

#### USER_JOINED / USER_LEFT
**Server → All Clients**
```javascript
socket.on(EVENTS.USER_JOINED, (data) => {
  // data: {
  //   member: MemberInfo,
  //   memberCount: number
  // }
});

socket.on(EVENTS.USER_LEFT, (data) => {
  // data: {
  //   socketId: string,
  //   memberCount: number,
  //   newLeader?: string // if leadership transferred
  // }
});
```

### Error Handling

#### ERROR
**Server → Client**
```javascript
socket.on(EVENTS.ERROR, (error) => {
  // error: {
  //   message: string,
  //   code?: string,
  //   context?: any
  // }
});
```

## 🔒 Authorization Rules

### Leader-only Events
These events require the socket to be the session leader:
- `PLAY`, `PAUSE`, `STOP`, `SEEK`
- `SET_TEMPO`, `TEMPO_CHANGE`
- `BEAT_SYNC`, `POSITION_SYNC` (outbound)

### Session Member Events
These events require the socket to be in the session:
- `LEAVE_SESSION`
- `SET_ROLE`, `ROLE_CHANGED`
- `SYNC_REQUEST`
- `CHAT_MESSAGE`

### Public Events
These events can be sent by any connected client:
- `JOIN_SESSION`
- `LATENCY_PROBE`
- `ERROR`

## 📊 Rate Limiting

Server implements rate limiting per event type:

```javascript
const RATE_LIMITS = {
  [EVENTS.POSITION_SYNC]: { maxPerSecond: 50 },
  [EVENTS.METRONOME_TICK]: { maxPerSecond: 20 },
  [EVENTS.TEMPO_CHANGE]: { maxPerSecond: 5 },
  [EVENTS.JOIN_SESSION]: { maxPerSecond: 2 },
  [EVENTS.CHAT_MESSAGE]: { maxPerSecond: 10 }
};
```

## 🚀 Client Implementation Examples

### Basic Session Join
```javascript
import { EVENTS } from 'bandsync-shared';

const socket = io('http://localhost:3001');

// Join session as follower
socket.emit(EVENTS.JOIN_SESSION, {
  sessionId: 'demo',
  displayName: 'John Doe',
  role: 'follower'
});

// Listen for session state
socket.on(EVENTS.SNAPSHOT, (sessionState) => {
  console.log('Session state:', sessionState);
});
```

### Leader Controls
```javascript
// Become leader
socket.emit(EVENTS.SET_ROLE, {
  sessionId: 'demo',
  role: 'leader'
});

// Set tempo
socket.emit(EVENTS.SET_TEMPO, {
  sessionId: 'demo',
  tempo: 120
});

// Start playback
socket.emit(EVENTS.PLAY, {
  sessionId: 'demo'
});
```

### Latency Measurement
```javascript
// Measure round-trip time
const startTime = Date.now();
socket.emit(EVENTS.LATENCY_PROBE, {
  timestamp: startTime,
  sessionId: 'demo'
});

socket.on(EVENTS.LATENCY_RESPONSE, (data) => {
  const rtt = Date.now() - data.clientTimestamp;
  console.log(`RTT: ${rtt}ms`);
});
```

## 🐛 Error Scenarios

### Common Error Messages
- `"Session not found"` - Invalid sessionId
- `"Session at capacity (8 members)"` - Too many members
- `"Only leader can control playbook"` - Authorization failed
- `"Invalid tempo range (60-200 BPM)"` - Validation failed
- `"Rate limit exceeded"` - Too many requests

### Connection Error Handling
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Implement reconnection logic
});

socket.on(EVENTS.ERROR, (error) => {
  console.error('Server error:', error);
  // Display user-friendly error message
});
```

---

**Ready for Day 4 Real-time Sync Implementation!** ✅

This event system provides the foundation for sub-100ms synchronization between multiple clients.