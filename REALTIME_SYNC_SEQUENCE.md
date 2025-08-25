# BandSync Real-Time Synchronization Sequence Diagram

## Metronome Event Flow Architecture

### Overview
This document outlines the real-time synchronization architecture for BandSync metronome events, including timing considerations, leader/follower roles, and error handling patterns.

### Core Synchronization Flow

```mermaid
sequenceDiagram
    participant L as Leader Client
    participant S as Server
    participant F1 as Follower Client 1
    participant F2 as Follower Client 2
    
    Note over L,F2: Session Initialization
    L->>S: JOIN_SESSION {sessionId}
    S->>L: SNAPSHOT {state}
    F1->>S: JOIN_SESSION {sessionId}
    S->>F1: SNAPSHOT {state}
    S->>L: ROOM_STATS {memberCount: 2}
    S->>F1: ROOM_STATS {memberCount: 2}
    
    Note over L,F2: Leader Role Establishment
    L->>S: SET_ROLE {role: "leader"}
    S->>S: Update session.leaderSocketId
    S->>L: SNAPSHOT {updated state}
    S->>F1: SNAPSHOT {updated state}
    
    Note over L,F2: Tempo Setting
    L->>S: SET_TEMPO {tempo: 120}
    S->>S: Validate leader authority
    S->>L: SNAPSHOT {tempo: 120}
    S->>F1: SNAPSHOT {tempo: 120}
    
    Note over L,F2: Metronome Start Sequence
    L->>S: PLAY {sessionId}
    S->>S: Validate leader authority
    S->>S: Set isPlaying: true
    S->>S: Start 100ms scroll interval
    S->>L: SNAPSHOT {isPlaying: true}
    S->>F1: SNAPSHOT {isPlaying: true}
    
    Note over L,F2: Real-time Sync Ticks (100ms intervals)
    loop Every 100ms while playing
        S->>S: session.position += 100ms
        S->>L: SCROLL_TICK {positionMs}
        S->>F1: SCROLL_TICK {positionMs}
        Note over L,F1: Clients update metronome position
    end
    
    Note over L,F2: Manual Sync Request (Error Recovery)
    F1->>S: SYNC_REQUEST {sessionId}
    S->>F1: SYNC_RESPONSE {positionMs, tempoBpm, isPlaying}
    
    Note over L,F2: Pause/Resume
    L->>S: PAUSE {sessionId}
    S->>S: Clear scroll interval
    S->>S: Set isPlaying: false
    S->>L: SNAPSHOT {isPlaying: false}
    S->>F1: SNAPSHOT {isPlaying: false}
```

### Timing Architecture Details

#### 1. Server-Side Timing Engine
```javascript
// Core timing mechanism (from server.js)
const scrollInterval = setInterval(() => {
  const session = sessions.get(sessionId);
  if (session && session.isPlaying) {
    session.position += 100; // 100ms precision
    io.to(sessionId).emit(EVENTS.SCROLL_TICK, { 
      sessionId, 
      positionMs: session.position 
    });
  }
}, 100);
```

**Timing Characteristics:**
- **Base Resolution**: 100ms ticks
- **Target Latency**: <100ms end-to-end
- **Synchronization Accuracy**: ±50ms across clients

#### 2. Client-Side Synchronization
```javascript
// Client sync handling (from useSocket.js)
socket.on("scroll_tick", (data) => {
  if (data.sessionId === sessionId) {
    setState(prevState => ({
      ...prevState,
      position: data.positionMs
    }));
  }
});
```

### Leader/Follower Role Architecture

#### Leader Authority Model
```mermaid
graph TD
    A[Client Connects] --> B{Set Role?}
    B -->|SET_ROLE: leader| C[Become Leader]
    B -->|No role set| D[Remain Follower]
    
    C --> E[Server stores leaderSocketId]
    E --> F[Leader can control:]
    F --> G[SET_TEMPO]
    F --> H[PLAY/PAUSE]
    F --> I[SEEK position]
    
    D --> J[Follower receives:]
    J --> K[SNAPSHOT updates]
    J --> L[SCROLL_TICK events]
    J --> M[Can request SYNC]
```

#### Authority Validation Pattern
```javascript
// Server-side authority check pattern
socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  // Authority validation
  if (session.leaderSocketId !== socket.id) {
    console.log(`BLOCKED SET_TEMPO: ${socket.id} not leader`);
    return;
  }
  
  // Execute authorized action
  session.tempo = tempo;
  io.to(sessionId).emit(EVENTS.SNAPSHOT, session);
});
```

### Error Handling & Resilience Patterns

#### 1. Leader Disconnection Recovery
```mermaid
sequenceDiagram
    participant L as Leader
    participant S as Server
    participant F as Followers
    
    L->>S: [Connection Lost]
    S->>S: Detect leader disconnect
    S->>S: Clear leaderSocketId
    S->>S: Stop all intervals
    S->>S: Set isPlaying: false
    S->>F: SNAPSHOT {message: "Leader disconnected"}
    S->>F: ROOM_STATS {updated memberCount}
    
    Note over S,F: Session in recovery state
    Note over S,F: Waiting for new leader
```

#### 2. Network Latency Compensation
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    
    Note over C,S: High latency detected
    C->>S: SYNC_REQUEST
    S->>C: SYNC_RESPONSE {current state}
    C->>C: Calculate time drift
    C->>C: Adjust local metronome position
    
    Note over C: Client synchronized
```

#### 3. Connection Recovery Pattern
```javascript
// Client-side reconnection handling
socket.on("connect", () => {
  setConnected(true);
  // Re-join session on reconnect
  socket.emit("join_session", { sessionId });
});

socket.on("disconnect", () => {
  setConnected(false);
  // UI should indicate disconnected state
});
```

### Performance Characteristics

#### Current Architecture Limits
- **Concurrent Sessions**: Limited by server memory (in-memory Map)
- **Members per Session**: Limited by Socket.IO room broadcasting
- **Timing Precision**: 100ms intervals with ±50ms accuracy
- **Network Requirements**: WebSocket persistent connection

#### Scaling Bottlenecks
1. **Single Server Instance**: No horizontal scaling
2. **In-Memory State**: No persistence or recovery
3. **Synchronous Broadcasting**: All events sent to all members
4. **No Load Balancing**: Single point of failure

### Recommended Improvements

#### 1. Enhanced Timing Precision
```javascript
// Proposed: Higher precision timing with drift correction
const TICK_INTERVAL = 50; // 50ms for better precision
const session = {
  startTimestamp: Date.now(),
  position: 0,
  tempo: 120,
  isPlaying: true
};

// Calculate position based on elapsed time
const getAccuratePosition = (session) => {
  if (!session.isPlaying) return session.position;
  const elapsed = Date.now() - session.startTimestamp;
  return session.position + elapsed;
};
```

#### 2. Connection Quality Monitoring
```javascript
// Proposed: RTT monitoring for sync quality
socket.on('ping', (callback) => {
  const start = Date.now();
  callback();
  const rtt = Date.now() - start;
  
  if (rtt > 200) {
    // High latency - request sync
    socket.emit(EVENTS.SYNC_REQUEST, { sessionId });
  }
});
```

#### 3. Predictive Synchronization
```javascript
// Proposed: Client-side prediction with server correction
const predictPosition = (lastKnownPosition, tempo, elapsedMs) => {
  const beatsPerMs = tempo / 60000;
  const predictedBeats = elapsedMs * beatsPerMs;
  return lastKnownPosition + (predictedBeats * (60000 / tempo));
};
```

### Event Message Specifications

#### Core Events
```typescript
interface JoinSessionEvent {
  sessionId: string;
}

interface SnapshotEvent {
  message: string;
  tempo: number;
  position: number; // milliseconds
  isPlaying: boolean;
  leaderSocketId: string | null;
  tempoBpm: number;
}

interface ScrollTickEvent {
  sessionId: string;
  positionMs: number;
}

interface SyncResponseEvent {
  sessionId: string;
  positionMs: number;
  tempoBpm: number;
  isPlaying: boolean;
}
```

### Implementation Status
- ✅ Basic leader/follower architecture implemented
- ✅ 100ms tick-based synchronization active
- ✅ Leader authority validation in place
- ✅ Disconnect recovery handling working
- ⚠️ No drift correction or latency compensation
- ⚠️ No performance monitoring or quality metrics
- ⚠️ Limited to single server instance