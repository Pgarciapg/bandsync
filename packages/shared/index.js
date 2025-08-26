/**
 * BandSync Shared Library
 * Main entry point for shared types and utilities
 */

// Re-export all types and interfaces
export * from './types/index.ts';

// Re-export timing utilities
export * from './utils/timing.ts';

// Re-export unified events
export * from './events.js';

// Version information
export const VERSION = '1.0.0';

// Library information
export const BANDSYNC_SHARED = {
  name: 'bandsync-shared',
  version: VERSION,
  description: 'Shared types and utilities for BandSync real-time musical collaboration',
  features: [
    'TypeScript message interfaces',
    'High-precision timing engine',
    'Beat calculation utilities',
    'Synchronization management',
    'Metronome scheduling',
    'Time format conversions',
    'Validation helpers'
  ]
};

// Common constants used across client and server
export const COMMON_CONSTANTS = {
  // Timing constraints
  MIN_TEMPO: 40,
  MAX_TEMPO: 300,
  DEFAULT_TEMPO: 120,
  
  // Synchronization parameters  
  SYNC_TOLERANCE_MS: 10,
  DRIFT_THRESHOLD_MS: 5,
  MAX_LATENCY_MS: 500,
  
  // Session limits
  MAX_SESSION_MEMBERS: 8,
  SESSION_TIMEOUT_MS: 3600000, // 1 hour
  
  // Network timing
  HEARTBEAT_INTERVAL_MS: 30000,  // 30 seconds
  SYNC_INTERVAL_MS: 5000,       // 5 seconds
  RECONNECT_DELAY_MS: 1000,     // 1 second
  
  // Performance thresholds
  HIGH_LATENCY_THRESHOLD_MS: 100,
  POOR_SYNC_QUALITY_THRESHOLD: 0.7,
  
  // Audio settings
  AUDIO_BUFFER_SIZE: 256,
  AUDIO_SAMPLE_RATE: 44100
};

// Default configurations
export const DEFAULT_CONFIG = {
  metronome: {
    tempo: COMMON_CONSTANTS.DEFAULT_TEMPO,
    timeSignature: { numerator: 4, denominator: 4 },
    volume: 0.8,
    isEnabled: true,
    visualIndicator: true,
    hapticFeedback: true,
    prerollMeasures: 1
  },
  
  sync: {
    maxLatency: COMMON_CONSTANTS.MAX_LATENCY_MS,
    syncTolerance: COMMON_CONSTANTS.SYNC_TOLERANCE_MS,
    driftThreshold: COMMON_CONSTANTS.DRIFT_THRESHOLD_MS,
    qualityThreshold: COMMON_CONSTANTS.POOR_SYNC_QUALITY_THRESHOLD
  },
  
  session: {
    maxMembers: COMMON_CONSTANTS.MAX_SESSION_MEMBERS,
    timeout: COMMON_CONSTANTS.SESSION_TIMEOUT_MS,
    heartbeatInterval: COMMON_CONSTANTS.HEARTBEAT_INTERVAL_MS
  }
};