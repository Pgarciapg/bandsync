/**
 * Unified Socket.io Events for BandSync
 * Used by both client and server for type-safe event communication
 */

export const EVENTS = {
  // Core session management
  JOIN_SESSION: "join_session",
  LEAVE_SESSION: "leave_session",
  SNAPSHOT: "snapshot",
  
  // Transport controls
  PLAY: "play",
  PAUSE: "pause",
  STOP: "stop",
  SEEK: "seek",
  
  // Tempo and timing
  SET_TEMPO: "set_tempo",
  TEMPO_CHANGE: "tempo_change",
  TEMPO_CHANGED: "tempo_changed",
  
  // Real-time synchronization  
  SCROLL_TICK: "scroll_tick",
  METRONOME_TICK: "metronome_tick",
  BEAT_SYNC: "beat_sync",
  
  // Sync and latency management
  SYNC_REQUEST: "sync_request",
  SYNC_RESPONSE: "sync_response",
  LATENCY_PROBE: "latency_probe",
  LATENCY_RESPONSE: "latency_response",
  
  // Role and user management
  SET_ROLE: "set_role",
  ROLE_CHANGED: "role_changed",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  
  // Room and session info
  ROOM_STATS: "room_stats",
  SESSION_STATE: "session_state",
  
  // Message and communication
  UPDATE_MESSAGE: "update_message",
  CHAT_MESSAGE: "chat_message",
  
  // Error and connection handling
  ERROR: "error",
  CONNECTION_LOST: "connection_lost",
  RECONNECTED: "reconnected",
  
  // Enhanced sync events (for Day 4+)
  POSITION_SYNC: "position_sync",
  DRIFT_CORRECTION: "drift_correction",
  CLOCK_SYNC: "clock_sync"
};

// Event validation helpers
export const isValidEvent = (eventName) => {
  return Object.values(EVENTS).includes(eventName);
};

// Event categories for processing priorities
export const EVENT_CATEGORIES = {
  CRITICAL: [
    EVENTS.SYNC_REQUEST,
    EVENTS.SYNC_RESPONSE, 
    EVENTS.LATENCY_PROBE,
    EVENTS.LATENCY_RESPONSE,
    EVENTS.POSITION_SYNC,
    EVENTS.DRIFT_CORRECTION,
    EVENTS.CLOCK_SYNC,
    EVENTS.TEMPO_CHANGED
  ],
  TIMING: [
    EVENTS.SCROLL_TICK,
    EVENTS.METRONOME_TICK,
    EVENTS.BEAT_SYNC,
    EVENTS.SET_TEMPO,
    EVENTS.TEMPO_CHANGE,
    EVENTS.TEMPO_CHANGED
  ],
  TRANSPORT: [
    EVENTS.PLAY,
    EVENTS.PAUSE,
    EVENTS.STOP,
    EVENTS.SEEK
  ],
  SESSION: [
    EVENTS.JOIN_SESSION,
    EVENTS.LEAVE_SESSION,
    EVENTS.SNAPSHOT,
    EVENTS.SESSION_STATE,
    EVENTS.SET_ROLE,
    EVENTS.ROLE_CHANGED
  ],
  COMMUNICATION: [
    EVENTS.UPDATE_MESSAGE,
    EVENTS.CHAT_MESSAGE,
    EVENTS.ROOM_STATS,
    EVENTS.USER_JOINED,
    EVENTS.USER_LEFT
  ],
  ERROR_HANDLING: [
    EVENTS.ERROR,
    EVENTS.CONNECTION_LOST,
    EVENTS.RECONNECTED
  ]
};

// Get event category
export const getEventCategory = (eventName) => {
  for (const [category, events] of Object.entries(EVENT_CATEGORIES)) {
    if (events.includes(eventName)) {
      return category;
    }
  }
  return 'UNKNOWN';
};