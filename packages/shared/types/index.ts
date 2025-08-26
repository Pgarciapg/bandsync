/**
 * Comprehensive TypeScript interfaces and types for BandSync metronome messaging
 * Provides type-safe communication between client and server components
 */

// Export session-related types
export * from './session';

// Base event types
export enum EventType {
  // Session management
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  SESSION_STATE = 'session_state',
  
  // Transport controls
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
  SEEK = 'seek',
  
  // Tempo and timing
  SET_TEMPO = 'set_tempo',
  TEMPO_CHANGE = 'tempo_change',
  METRONOME_TICK = 'metronome_tick',
  BEAT_SYNC = 'beat_sync',
  
  // Synchronization
  SYNC_REQUEST = 'sync_request',
  SYNC_RESPONSE = 'sync_response',
  TIME_SYNC = 'time_sync',
  CLOCK_DRIFT = 'clock_drift',
  
  // Scrolling and navigation
  SCROLL_TICK = 'scroll_tick',
  SCROLL_POSITION = 'scroll_position',
  PAGE_TURN = 'page_turn',
  
  // User roles and permissions
  SET_ROLE = 'set_role',
  ROLE_CHANGED = 'role_changed',
  
  // Room and collaboration
  ROOM_STATS = 'room_stats',
  USER_LIST = 'user_list',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
  
  // Error handling
  ERROR = 'error',
  WARNING = 'warning',
  
  // Diagnostics and monitoring
  LATENCY_TEST = 'latency_test',
  PERFORMANCE_METRICS = 'performance_metrics'
}

// User roles in a session
export enum UserRole {
  CONDUCTOR = 'conductor',
  PERFORMER = 'performer',
  OBSERVER = 'observer'
}

// Transport states
export enum TransportState {
  STOPPED = 'stopped',
  PLAYING = 'playing',
  PAUSED = 'paused',
  SEEKING = 'seeking'
}

// Time signature definitions
export interface TimeSignature {
  numerator: number;    // beats per measure (e.g., 4 in 4/4)
  denominator: number;  // note value that gets the beat (e.g., 4 in 4/4)
}

// Beat subdivision types
export enum BeatSubdivision {
  QUARTER = 'quarter',
  EIGHTH = 'eighth',
  SIXTEENTH = 'sixteenth',
  TRIPLET = 'triplet'
}

// Metronome sound types
export enum MetronomeSound {
  CLICK = 'click',
  BEEP = 'beep',
  WOOD_BLOCK = 'wood_block',
  COWBELL = 'cowbell',
  SILENT = 'silent'
}

// Base message interface
export interface BaseMessage {
  type: EventType;
  timestamp: number;
  sessionId: string;
  userId: string;
  messageId: string;
}

// Session-related messages
export interface JoinSessionMessage extends BaseMessage {
  type: EventType.JOIN_SESSION;
  userRole: UserRole;
  userName: string;
  deviceInfo: {
    platform: string;
    version: string;
    capabilities: string[];
  };
}

export interface SessionStateMessage extends BaseMessage {
  type: EventType.SESSION_STATE;
  state: {
    transportState: TransportState;
    currentTempo: number;
    timeSignature: TimeSignature;
    currentBeat: number;
    currentMeasure: number;
    totalBeats: number;
    isMetronomeEnabled: boolean;
    metronomeSettings: MetronomeSettings;
    participants: SessionParticipant[];
  };
}

// Transport control messages
export interface PlayMessage extends BaseMessage {
  type: EventType.PLAY;
  startTime?: number;
  fromBeat?: number;
}

export interface PauseMessage extends BaseMessage {
  type: EventType.PAUSE;
  pauseTime: number;
  currentBeat: number;
}

export interface StopMessage extends BaseMessage {
  type: EventType.STOP;
  stopTime: number;
}

export interface SeekMessage extends BaseMessage {
  type: EventType.SEEK;
  targetBeat: number;
  targetMeasure: number;
  seekTime: number;
}

// Tempo and timing messages
export interface SetTempoMessage extends BaseMessage {
  type: EventType.SET_TEMPO;
  tempo: number;
  immediate: boolean;
  fadeTime?: number; // milliseconds for tempo transition
}

export interface TempoChangeMessage extends BaseMessage {
  type: EventType.TEMPO_CHANGE;
  oldTempo: number;
  newTempo: number;
  changeTime: number;
  fadeDuration?: number;
}

export interface MetronomeTickMessage extends BaseMessage {
  type: EventType.METRONOME_TICK;
  beatNumber: number;
  measureNumber: number;
  isDownbeat: boolean;
  isStrongBeat: boolean;
  anticipatedNextTick: number;
  actualTiming: {
    scheduledTime: number;
    actualTime: number;
    jitter: number;
  };
}

export interface BeatSyncMessage extends BaseMessage {
  type: EventType.BEAT_SYNC;
  masterTime: number;
  beatPosition: number;
  measurePosition: number;
  tempo: number;
  drift: number; // milliseconds of drift detected
}

// Synchronization messages
export interface SyncRequestMessage extends BaseMessage {
  type: EventType.SYNC_REQUEST;
  requestTime: number;
  clientTimeReference: number;
}

export interface SyncResponseMessage extends BaseMessage {
  type: EventType.SYNC_RESPONSE;
  requestTime: number;
  serverTime: number;
  responseTime: number;
  roundTripTime: number;
  clockOffset: number;
}

export interface TimeSyncMessage extends BaseMessage {
  type: EventType.TIME_SYNC;
  serverTime: number;
  clientTime: number;
  offset: number;
  confidence: number; // 0-1, how confident we are in the sync
}

// Metronome configuration
export interface MetronomeSettings {
  isEnabled: boolean;
  volume: number; // 0-1
  soundType: MetronomeSound;
  accentBeats: boolean;
  subdivision: BeatSubdivision;
  visualIndicator: boolean;
  hapticFeedback: boolean;
  preroll: {
    enabled: boolean;
    measures: number;
  };
}

// Session participant information
export interface SessionParticipant {
  userId: string;
  userName: string;
  role: UserRole;
  isConnected: boolean;
  lastActivity: number;
  deviceInfo: {
    platform: string;
    version: string;
  };
  networkStats: {
    latency: number;
    jitter: number;
    packetLoss: number;
  };
}

// Performance and diagnostic messages
export interface PerformanceMetrics {
  averageLatency: number;
  maxLatency: number;
  jitter: number;
  packetLoss: number;
  clockDrift: number;
  cpuUsage: number;
  memoryUsage: number;
  networkBandwidth: number;
}

export interface PerformanceMetricsMessage extends BaseMessage {
  type: EventType.PERFORMANCE_METRICS;
  metrics: PerformanceMetrics;
}

export interface LatencyTestMessage extends BaseMessage {
  type: EventType.LATENCY_TEST;
  testId: string;
  sendTime: number;
  receiveTime?: number;
  roundTripTime?: number;
}

// Error handling
export interface ErrorMessage extends BaseMessage {
  type: EventType.ERROR;
  errorCode: string;
  errorMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: any;
}

export interface WarningMessage extends BaseMessage {
  type: EventType.WARNING;
  warningCode: string;
  warningMessage: string;
  context?: any;
}

// Room statistics
export interface RoomStatsMessage extends BaseMessage {
  type: EventType.ROOM_STATS;
  stats: {
    participantCount: number;
    averageLatency: number;
    maxLatency: number;
    sessionDuration: number;
    messagesPerSecond: number;
    syncQuality: number; // 0-1 score
  };
}

// Utility types for message handling
export type AnyMessage = 
  | JoinSessionMessage
  | SessionStateMessage
  | PlayMessage
  | PauseMessage
  | StopMessage
  | SeekMessage
  | SetTempoMessage
  | TempoChangeMessage
  | MetronomeTickMessage
  | BeatSyncMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | TimeSyncMessage
  | PerformanceMetricsMessage
  | LatencyTestMessage
  | ErrorMessage
  | WarningMessage
  | RoomStatsMessage;

// Message type guards
export const isPlayMessage = (message: AnyMessage): message is PlayMessage => 
  message.type === EventType.PLAY;

export const isPauseMessage = (message: AnyMessage): message is PauseMessage => 
  message.type === EventType.PAUSE;

export const isTempoMessage = (message: AnyMessage): message is SetTempoMessage => 
  message.type === EventType.SET_TEMPO;

export const isMetronomeTickMessage = (message: AnyMessage): message is MetronomeTickMessage => 
  message.type === EventType.METRONOME_TICK;

export const isSyncMessage = (message: AnyMessage): message is SyncRequestMessage | SyncResponseMessage => 
  message.type === EventType.SYNC_REQUEST || message.type === EventType.SYNC_RESPONSE;

// Message factory functions
export const createBaseMessage = (
  type: EventType,
  sessionId: string,
  userId: string
): BaseMessage => ({
  type,
  timestamp: Date.now(),
  sessionId,
  userId,
  messageId: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
});

export const createPlayMessage = (
  sessionId: string,
  userId: string,
  startTime?: number,
  fromBeat?: number
): PlayMessage => ({
  ...createBaseMessage(EventType.PLAY, sessionId, userId),
  type: EventType.PLAY,
  startTime,
  fromBeat
});

export const createPauseMessage = (
  sessionId: string,
  userId: string,
  currentBeat: number
): PauseMessage => ({
  ...createBaseMessage(EventType.PAUSE, sessionId, userId),
  type: EventType.PAUSE,
  pauseTime: Date.now(),
  currentBeat
});

export const createSetTempoMessage = (
  sessionId: string,
  userId: string,
  tempo: number,
  immediate: boolean = true,
  fadeTime?: number
): SetTempoMessage => ({
  ...createBaseMessage(EventType.SET_TEMPO, sessionId, userId),
  type: EventType.SET_TEMPO,
  tempo,
  immediate,
  fadeTime
});

export const createMetronomeTickMessage = (
  sessionId: string,
  userId: string,
  beatNumber: number,
  measureNumber: number,
  isDownbeat: boolean,
  anticipatedNextTick: number,
  scheduledTime: number,
  actualTime: number
): MetronomeTickMessage => ({
  ...createBaseMessage(EventType.METRONOME_TICK, sessionId, userId),
  type: EventType.METRONOME_TICK,
  beatNumber,
  measureNumber,
  isDownbeat,
  isStrongBeat: isDownbeat || (beatNumber % 2 === 1), // Simple strong beat logic
  anticipatedNextTick,
  actualTiming: {
    scheduledTime,
    actualTime,
    jitter: Math.abs(actualTime - scheduledTime)
  }
});