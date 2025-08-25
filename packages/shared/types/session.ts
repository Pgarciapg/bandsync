/**
 * Session data interfaces shared between client and server
 * Provides consistent typing for real-time session state
 */

export interface SessionState {
  sessionId: string;
  message: string;
  tempo: number;
  tempoBpm: number;
  position: number;
  isPlaying: boolean;
  leaderSocketId: string | null;
  members: SessionMember[];
  createdAt: number;
  lastActiveAt: number;
}

export interface SessionMember {
  socketId: string;
  userId?: string;
  displayName?: string;
  role: 'leader' | 'follower';
  joinedAt: number;
  lastPingAt: number;
  isConnected: boolean;
}

export interface RoomStats {
  sessionId: string;
  memberCount: number;
  connectedCount: number;
  averageLatency?: number;
  syncQuality?: number;
}

export interface SyncState {
  positionMs: number;
  timestamp: number;
  serverTime: number;
  drift?: number;
}

// Socket.io event payload interfaces
export interface JoinSessionPayload {
  sessionId: string;
  userId?: string;
  displayName?: string;
  role?: 'leader' | 'follower';
}

export interface SetTempoPayload {
  sessionId: string;
  tempo: number;
}

export interface PlayPayload {
  sessionId: string;
  startTime?: number;
}

export interface PausePayload {
  sessionId: string;
}

export interface SeekPayload {
  sessionId: string;
  position: number;
}

export interface SetRolePayload {
  sessionId: string;
  role: 'leader' | 'follower';
}

export interface SyncRequestPayload {
  sessionId: string;
  timestamp: number;
}

export interface SyncResponsePayload {
  sessionId: string;
  positionMs: number;
  tempoBpm: number;
  isPlaying: boolean;
  serverTime: number;
  clientTimestamp: number;
}

export interface LatencyProbePayload {
  timestamp: number;
  sessionId?: string;
}

export interface LatencyResponsePayload {
  clientTimestamp: number;
  serverTimestamp: number;
}

// Type guards for runtime validation
export const isSessionState = (obj: any): obj is SessionState => {
  return obj && 
    typeof obj.sessionId === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.tempo === 'number' &&
    typeof obj.position === 'number' &&
    typeof obj.isPlaying === 'boolean';
};

export const isJoinSessionPayload = (obj: any): obj is JoinSessionPayload => {
  return obj && typeof obj.sessionId === 'string';
};

export const isSetTempoPayload = (obj: any): obj is SetTempoPayload => {
  return obj && 
    typeof obj.sessionId === 'string' && 
    typeof obj.tempo === 'number' &&
    obj.tempo >= 60 && 
    obj.tempo <= 200;
};