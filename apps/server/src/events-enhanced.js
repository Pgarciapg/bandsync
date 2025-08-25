/**
 * Enhanced BandSync Socket.io Event Structure
 * Designed for sub-50ms latency and 100+ concurrent sessions
 */

export const EVENTS = {
  // === SESSION LIFECYCLE ===
  SESSION_CREATE: "session:create",
  SESSION_JOIN: "session:join", 
  SESSION_LEAVE: "session:leave",
  SESSION_DESTROY: "session:destroy",
  SESSION_STATE_SYNC: "session:state_sync",
  SESSION_MEMBER_UPDATE: "session:member_update",
  
  // === AUTHENTICATION & ROLES ===
  AUTH_HANDSHAKE: "auth:handshake",
  ROLE_REQUEST: "role:request",
  ROLE_ASSIGNED: "role:assigned", 
  ROLE_TRANSFER: "role:transfer",
  LEADER_ELECTION: "leader:election",
  
  // === METRONOME COORDINATION ===
  METRONOME_START: "metronome:start",
  METRONOME_STOP: "metronome:stop", 
  METRONOME_SYNC: "metronome:sync",
  METRONOME_BEAT: "metronome:beat",
  TEMPO_CHANGE: "tempo:change",
  TEMPO_RAMP: "tempo:ramp", // Gradual tempo changes
  
  // === HIGH-FREQUENCY SYNC ===
  POSITION_SYNC: "position:sync", // High-freq position updates
  POSITION_CORRECTION: "position:correction", // Drift correction
  CLOCK_SYNC_REQUEST: "clock:sync_request",
  CLOCK_SYNC_RESPONSE: "clock:sync_response", 
  LATENCY_PROBE: "latency:probe",
  LATENCY_RESPONSE: "latency:response",
  
  // === MUSICAL CONTENT ===
  SHEET_MUSIC_LOAD: "sheet:load",
  SHEET_MUSIC_SCROLL: "sheet:scroll",
  ANNOTATION_ADD: "annotation:add",
  ANNOTATION_UPDATE: "annotation:update",
  ANNOTATION_REMOVE: "annotation:remove",
  
  // === MULTI-BAND ROUTING ===
  BAND_REGISTER: "band:register",
  BAND_SESSION_LIST: "band:session_list", 
  BAND_SWITCH: "band:switch",
  CROSS_BAND_MESSAGE: "cross_band:message",
  
  // === ERROR HANDLING & MONITORING ===
  ERROR_SYNC_DRIFT: "error:sync_drift",
  ERROR_CONNECTION_LOST: "error:connection_lost", 
  ERROR_VALIDATION: "error:validation",
  HEALTH_CHECK: "health:check",
  METRICS_UPDATE: "metrics:update",
  
  // === LEGACY SUPPORT (for migration) ===
  JOIN_SESSION: "join_session", // Legacy
  SNAPSHOT: "snapshot", // Legacy
  SCROLL_TICK: "scroll_tick", // Legacy
  
  // === BROADCAST EVENTS ===
  BROADCAST_SESSION_STATE: "broadcast:session_state",
  BROADCAST_METRONOME_BEAT: "broadcast:metronome_beat",
  BROADCAST_MEMBER_COUNT: "broadcast:member_count"
};

/**
 * Event payload validation schemas
 */
export const EVENT_SCHEMAS = {
  [EVENTS.SESSION_CREATE]: {
    required: ['bandId', 'sessionName', 'creatorId'],
    optional: ['tempo', 'timeSignature', 'sheetMusicId', 'maxMembers']
  },
  
  [EVENTS.SESSION_JOIN]: {
    required: ['sessionId', 'userId', 'displayName'],
    optional: ['instrument', 'preferredRole']
  },
  
  [EVENTS.METRONOME_START]: {
    required: ['sessionId', 'startTimestamp', 'tempo'],
    optional: ['timeSignature', 'clickTrack']
  },
  
  [EVENTS.POSITION_SYNC]: {
    required: ['sessionId', 'positionMs', 'timestamp'],
    optional: ['beatNumber', 'measureNumber']
  },
  
  [EVENTS.TEMPO_CHANGE]: {
    required: ['sessionId', 'newTempo', 'effectiveTimestamp'],
    optional: ['rampDurationMs', 'oldTempo']
  }
};

/**
 * Event priority levels for message ordering
 */
export const EVENT_PRIORITY = {
  CRITICAL: 0,    // Clock sync, position corrections
  HIGH: 1,        // Metronome beats, tempo changes  
  MEDIUM: 2,      // Session state, role changes
  LOW: 3,         // Annotations, chat messages
  BACKGROUND: 4   // Metrics, health checks
};

/**
 * Event-to-priority mapping
 */
export const EVENT_PRIORITIES = {
  [EVENTS.CLOCK_SYNC_REQUEST]: EVENT_PRIORITY.CRITICAL,
  [EVENTS.CLOCK_SYNC_RESPONSE]: EVENT_PRIORITY.CRITICAL,
  [EVENTS.POSITION_CORRECTION]: EVENT_PRIORITY.CRITICAL,
  [EVENTS.METRONOME_BEAT]: EVENT_PRIORITY.HIGH,
  [EVENTS.POSITION_SYNC]: EVENT_PRIORITY.HIGH,
  [EVENTS.TEMPO_CHANGE]: EVENT_PRIORITY.HIGH,
  [EVENTS.METRONOME_START]: EVENT_PRIORITY.MEDIUM,
  [EVENTS.METRONOME_STOP]: EVENT_PRIORITY.MEDIUM,
  [EVENTS.ROLE_ASSIGNED]: EVENT_PRIORITY.MEDIUM,
  [EVENTS.SESSION_STATE_SYNC]: EVENT_PRIORITY.MEDIUM,
  [EVENTS.HEALTH_CHECK]: EVENT_PRIORITY.BACKGROUND,
  [EVENTS.METRICS_UPDATE]: EVENT_PRIORITY.BACKGROUND
};

/**
 * Rate limiting configuration per event type
 */
export const RATE_LIMITS = {
  [EVENTS.POSITION_SYNC]: { maxPerSecond: 50, burstSize: 10 },
  [EVENTS.METRONOME_BEAT]: { maxPerSecond: 20, burstSize: 5 },
  [EVENTS.TEMPO_CHANGE]: { maxPerSecond: 5, burstSize: 2 },
  [EVENTS.SESSION_JOIN]: { maxPerSecond: 2, burstSize: 1 },
  [EVENTS.ANNOTATION_ADD]: { maxPerSecond: 10, burstSize: 3 }
};