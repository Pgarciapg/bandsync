/**
 * Advanced timing utilities for BandSync metronome functionality
 * Provides high-precision timing, synchronization, and beat calculation
 */

import { TimeSignature, BeatSubdivision, TransportState } from '../types/index';

// High-precision timing constants
export const TIMING_PRECISION = 1; // milliseconds
export const MAX_TEMPO = 300;      // BPM
export const MIN_TEMPO = 40;       // BPM
export const DEFAULT_TEMPO = 120;   // BPM
export const SYNC_TOLERANCE = 10;  // milliseconds
export const DRIFT_THRESHOLD = 5;  // milliseconds before correction

/**
 * Represents a precise timing engine for metronome functionality
 */
export class TimingEngine {
  private tempo: number = DEFAULT_TEMPO;
  private timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
  private isRunning: boolean = false;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private currentBeat: number = 0;
  private clockOffset: number = 0; // Server time offset
  
  constructor(initialTempo: number = DEFAULT_TEMPO, timeSignature?: TimeSignature) {
    this.tempo = this.clampTempo(initialTempo);
    if (timeSignature) {
      this.timeSignature = timeSignature;
    }
  }

  /**
   * Clamps tempo to valid range
   */
  private clampTempo(tempo: number): number {
    return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, tempo));
  }

  /**
   * Gets the current high-precision time
   */
  public now(): number {
    return performance.now();
  }

  /**
   * Gets server-synchronized time
   */
  public serverTime(): number {
    return this.now() + this.clockOffset;
  }

  /**
   * Sets the clock offset for server synchronization
   */
  public setClockOffset(offset: number): void {
    this.clockOffset = offset;
  }

  /**
   * Gets the duration of one beat in milliseconds
   */
  public getBeatDuration(): number {
    return 60000 / this.tempo;
  }

  /**
   * Gets the duration of one measure in milliseconds
   */
  public getMeasureDuration(): number {
    return this.getBeatDuration() * this.timeSignature.numerator;
  }

  /**
   * Gets the duration for a subdivision
   */
  public getSubdivisionDuration(subdivision: BeatSubdivision): number {
    const beatDuration = this.getBeatDuration();
    
    switch (subdivision) {
      case BeatSubdivision.QUARTER:
        return beatDuration;
      case BeatSubdivision.EIGHTH:
        return beatDuration / 2;
      case BeatSubdivision.SIXTEENTH:
        return beatDuration / 4;
      case BeatSubdivision.TRIPLET:
        return beatDuration / 3;
      default:
        return beatDuration;
    }
  }

  /**
   * Starts the timing engine
   */
  public start(fromBeat?: number): void {
    const now = this.now();
    
    if (fromBeat !== undefined) {
      this.currentBeat = fromBeat;
    }
    
    if (!this.isRunning) {
      if (this.pausedTime > 0) {
        // Resuming from pause
        this.totalPausedDuration += now - this.pausedTime;
        this.pausedTime = 0;
      } else {
        // Fresh start
        this.startTime = now;
        this.totalPausedDuration = 0;
      }
    }
    
    this.isRunning = true;
  }

  /**
   * Pauses the timing engine
   */
  public pause(): void {
    if (this.isRunning) {
      this.pausedTime = this.now();
      this.isRunning = false;
    }
  }

  /**
   * Stops the timing engine and resets position
   */
  public stop(): void {
    this.isRunning = false;
    this.startTime = 0;
    this.pausedTime = 0;
    this.totalPausedDuration = 0;
    this.currentBeat = 0;
  }

  /**
   * Seeks to a specific beat position
   */
  public seek(beat: number): void {
    const now = this.now();
    this.currentBeat = Math.max(0, beat);
    
    if (this.isRunning) {
      // Adjust start time to maintain the new position
      const elapsedBeats = this.currentBeat;
      const elapsedTime = elapsedBeats * this.getBeatDuration();
      this.startTime = now - elapsedTime;
      this.totalPausedDuration = 0;
    }
  }

  /**
   * Gets the current playback position
   */
  public getCurrentPosition(): {
    beat: number;
    measure: number;
    totalBeats: number;
    elapsedTime: number;
    isRunning: boolean;
  } {
    let elapsedTime = 0;
    let totalBeats = 0;

    if (this.isRunning && this.startTime > 0) {
      elapsedTime = this.now() - this.startTime - this.totalPausedDuration;
      totalBeats = Math.floor(elapsedTime / this.getBeatDuration());
    } else if (this.pausedTime > 0) {
      elapsedTime = this.pausedTime - this.startTime - this.totalPausedDuration;
      totalBeats = Math.floor(elapsedTime / this.getBeatDuration());
    }

    const currentBeat = totalBeats % this.timeSignature.numerator;
    const currentMeasure = Math.floor(totalBeats / this.timeSignature.numerator);

    return {
      beat: currentBeat,
      measure: currentMeasure,
      totalBeats,
      elapsedTime,
      isRunning: this.isRunning
    };
  }

  /**
   * Calculates the time until the next beat
   */
  public getTimeToNextBeat(): number {
    if (!this.isRunning) return 0;
    
    const position = this.getCurrentPosition();
    const beatDuration = this.getBeatDuration();
    const timeInCurrentBeat = position.elapsedTime % beatDuration;
    
    return beatDuration - timeInCurrentBeat;
  }

  /**
   * Predicts the exact time of the next N beats
   */
  public predictNextBeats(count: number): number[] {
    const now = this.now();
    const timeToNext = this.getTimeToNextBeat();
    const beatDuration = this.getBeatDuration();
    const predictions: number[] = [];
    
    for (let i = 0; i < count; i++) {
      predictions.push(now + timeToNext + (i * beatDuration));
    }
    
    return predictions;
  }

  /**
   * Sets a new tempo with optional fade transition
   */
  public setTempo(newTempo: number, fadeTimeMs?: number): Promise<void> {
    const clampedTempo = this.clampTempo(newTempo);
    
    if (!fadeTimeMs || fadeTimeMs <= 0) {
      this.tempo = clampedTempo;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startTempo = this.tempo;
      const tempoRange = clampedTempo - startTempo;
      const startTime = this.now();
      
      const fadeInterval = setInterval(() => {
        const elapsed = this.now() - startTime;
        const progress = Math.min(elapsed / fadeTimeMs, 1);
        
        // Smooth transition using ease-in-out curve
        const easedProgress = progress < 0.5 
          ? 2 * progress * progress 
          : -1 + (4 - 2 * progress) * progress;
        
        this.tempo = startTempo + (tempoRange * easedProgress);
        
        if (progress >= 1) {
          clearInterval(fadeInterval);
          this.tempo = clampedTempo;
          resolve();
        }
      }, TIMING_PRECISION);
    });
  }

  /**
   * Gets current tempo
   */
  public getTempo(): number {
    return this.tempo;
  }

  /**
   * Sets time signature
   */
  public setTimeSignature(timeSignature: TimeSignature): void {
    this.timeSignature = { ...timeSignature };
  }

  /**
   * Gets current time signature
   */
  public getTimeSignature(): TimeSignature {
    return { ...this.timeSignature };
  }

  /**
   * Checks if the engine is currently running
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Utility functions for beat and timing calculations
 */
export class BeatCalculator {
  /**
   * Converts beats to time position
   */
  static beatsToTime(beats: number, tempo: number): number {
    return (beats * 60000) / tempo;
  }

  /**
   * Converts time position to beats
   */
  static timeToBeats(timeMs: number, tempo: number): number {
    return (timeMs * tempo) / 60000;
  }

  /**
   * Determines if a beat is a downbeat (first beat of measure)
   */
  static isDownbeat(beat: number, timeSignature: TimeSignature): boolean {
    return (beat % timeSignature.numerator) === 0;
  }

  /**
   * Determines if a beat is a strong beat
   */
  static isStrongBeat(beat: number, timeSignature: TimeSignature): boolean {
    const beatInMeasure = beat % timeSignature.numerator;
    
    // Different strong beat patterns based on time signature
    if (timeSignature.numerator === 4) {
      return beatInMeasure === 0 || beatInMeasure === 2; // 1 and 3 are strong
    } else if (timeSignature.numerator === 3) {
      return beatInMeasure === 0; // Only 1 is strong
    } else if (timeSignature.numerator === 2) {
      return beatInMeasure === 0; // Only 1 is strong
    } else {
      return beatInMeasure === 0; // Default: only downbeat is strong
    }
  }

  /**
   * Calculates swing timing adjustment
   */
  static getSwingAdjustment(
    beatPosition: number, 
    swingRatio: number = 0.67, 
    subdivision: BeatSubdivision = BeatSubdivision.EIGHTH
  ): number {
    if (subdivision !== BeatSubdivision.EIGHTH) return 0;
    
    const isOffBeat = (beatPosition * 2) % 2 !== 0;
    if (!isOffBeat) return 0;
    
    // Apply swing to off-beats
    const standardEighthDuration = 0.5;
    const swingEighthDuration = swingRatio;
    return (swingEighthDuration - standardEighthDuration);
  }

  /**
   * Quantizes a time position to the nearest beat subdivision
   */
  static quantizeToSubdivision(
    timeMs: number, 
    tempo: number, 
    subdivision: BeatSubdivision
  ): number {
    const beatsPerMs = tempo / 60000;
    const currentBeat = timeMs * beatsPerMs;
    
    let subdivisionSize: number;
    switch (subdivision) {
      case BeatSubdivision.QUARTER:
        subdivisionSize = 1;
        break;
      case BeatSubdivision.EIGHTH:
        subdivisionSize = 0.5;
        break;
      case BeatSubdivision.SIXTEENTH:
        subdivisionSize = 0.25;
        break;
      case BeatSubdivision.TRIPLET:
        subdivisionSize = 1 / 3;
        break;
      default:
        subdivisionSize = 1;
    }
    
    const quantizedBeat = Math.round(currentBeat / subdivisionSize) * subdivisionSize;
    return quantizedBeat / beatsPerMs;
  }
}

/**
 * Synchronization utilities for multi-client timing
 */
export class SyncManager {
  private clockOffsets: number[] = [];
  private maxSamples = 10;
  private lastSyncTime = 0;
  
  /**
   * Adds a clock offset sample
   */
  public addClockOffset(offset: number): void {
    this.clockOffsets.push(offset);
    
    // Keep only the most recent samples
    if (this.clockOffsets.length > this.maxSamples) {
      this.clockOffsets.shift();
    }
    
    this.lastSyncTime = performance.now();
  }

  /**
   * Gets the average clock offset
   */
  public getAverageOffset(): number {
    if (this.clockOffsets.length === 0) return 0;
    
    // Remove outliers (basic approach)
    const sorted = [...this.clockOffsets].sort((a, b) => a - b);
    const q1 = Math.floor(sorted.length * 0.25);
    const q3 = Math.floor(sorted.length * 0.75);
    const filtered = sorted.slice(q1, q3 + 1);
    
    return filtered.reduce((sum, offset) => sum + offset, 0) / filtered.length;
  }

  /**
   * Gets the sync quality score (0-1)
   */
  public getSyncQuality(): number {
    if (this.clockOffsets.length < 3) return 0;
    
    const avgOffset = this.getAverageOffset();
    const variance = this.clockOffsets.reduce((sum, offset) => {
      const diff = offset - avgOffset;
      return sum + diff * diff;
    }, 0) / this.clockOffsets.length;
    
    const standardDeviation = Math.sqrt(variance);
    
    // Convert standard deviation to quality score (lower is better)
    const maxAcceptableStdDev = 20; // milliseconds
    return Math.max(0, 1 - (standardDeviation / maxAcceptableStdDev));
  }

  /**
   * Checks if synchronization is recent enough
   */
  public isSyncFresh(maxAgeMs: number = 30000): boolean {
    return (performance.now() - this.lastSyncTime) < maxAgeMs;
  }

  /**
   * Detects clock drift
   */
  public detectDrift(): number {
    if (this.clockOffsets.length < 2) return 0;
    
    const recent = this.clockOffsets.slice(-3);
    const older = this.clockOffsets.slice(-6, -3);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
    
    return recentAvg - olderAvg;
  }
}

/**
 * High-precision scheduler for metronome events
 */
export class MetronomeScheduler {
  private callbacks: Array<{
    callback: (time: number) => void;
    nextTime: number;
    interval: number;
    id: string;
  }> = [];
  
  private isRunning = false;
  private scheduleInterval: number | null = null;
  private lookAheadMs = 100; // How far ahead to schedule
  private scheduleFrequencyMs = 25; // How often to check schedule
  
  /**
   * Schedules a recurring callback
   */
  public schedule(
    callback: (time: number) => void,
    intervalMs: number,
    startTime?: number
  ): string {
    const id = `schedule-${Date.now()}-${Math.random()}`;
    const nextTime = startTime || (performance.now() + intervalMs);
    
    this.callbacks.push({
      callback,
      nextTime,
      interval: intervalMs,
      id
    });
    
    if (!this.isRunning) {
      this.start();
    }
    
    return id;
  }

  /**
   * Cancels a scheduled callback
   */
  public cancel(id: string): boolean {
    const index = this.callbacks.findIndex(cb => cb.id === id);
    if (index >= 0) {
      this.callbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Starts the scheduler
   */
  private start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.scheduleInterval = setInterval(() => {
      this.processSchedule();
    }, this.scheduleFrequencyMs) as unknown as number;
  }

  /**
   * Stops the scheduler
   */
  public stop(): void {
    this.isRunning = false;
    if (this.scheduleInterval !== null) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }
    this.callbacks = [];
  }

  /**
   * Processes scheduled callbacks
   */
  private processSchedule(): void {
    const now = performance.now();
    const horizon = now + this.lookAheadMs;
    
    this.callbacks.forEach(item => {
      while (item.nextTime <= horizon) {
        // Schedule the callback to run at the precise time
        const delay = Math.max(0, item.nextTime - now);
        
        setTimeout(() => {
          item.callback(item.nextTime);
        }, delay);
        
        // Schedule next occurrence
        item.nextTime += item.interval;
      }
    });
  }

  /**
   * Updates the look-ahead time
   */
  public setLookAhead(ms: number): void {
    this.lookAheadMs = Math.max(50, Math.min(500, ms));
  }
}

// Export commonly used utilities
export const createTimingEngine = (tempo?: number, timeSignature?: TimeSignature) => 
  new TimingEngine(tempo, timeSignature);

export const createSyncManager = () => new SyncManager();

export const createMetronomeScheduler = () => new MetronomeScheduler();

// Validation utilities
export const isValidTempo = (tempo: number): boolean => 
  typeof tempo === 'number' && tempo >= MIN_TEMPO && tempo <= MAX_TEMPO;

export const isValidTimeSignature = (sig: TimeSignature): boolean =>
  typeof sig.numerator === 'number' && 
  typeof sig.denominator === 'number' &&
  sig.numerator > 0 && 
  sig.numerator <= 32 &&
  [1, 2, 4, 8, 16].includes(sig.denominator);

export const isValidBeat = (beat: number): boolean =>
  typeof beat === 'number' && beat >= 0 && Number.isInteger(beat);

// Time conversion utilities
export const msToBeats = (ms: number, tempo: number): number => 
  (ms * tempo) / 60000;

export const beatsToMs = (beats: number, tempo: number): number => 
  (beats * 60000) / tempo;

export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${Math.floor(milliseconds / 10).toString().padStart(2, '0')}`;
};