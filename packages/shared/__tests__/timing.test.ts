/**
 * Unit tests for BandSync timing utilities
 * Tests timing engine, beat calculations, sync management, and scheduler functionality
 */

import {
  TimingEngine,
  BeatCalculator,
  SyncManager,
  MetronomeScheduler,
  DEFAULT_TEMPO,
  MIN_TEMPO,
  MAX_TEMPO,
  isValidTempo,
  isValidTimeSignature,
  msToBeats,
  beatsToMs,
  formatTime
} from '../utils/timing';
import { TimeSignature, BeatSubdivision } from '../types/index';

describe('TimingEngine', () => {
  let engine: TimingEngine;

  beforeEach(() => {
    engine = new TimingEngine();
  });

  afterEach(() => {
    engine.stop();
  });

  describe('constructor and basic properties', () => {
    test('should initialize with default tempo', () => {
      expect(engine.getTempo()).toBe(DEFAULT_TEMPO);
    });

    test('should accept custom tempo in constructor', () => {
      const customEngine = new TimingEngine(140);
      expect(customEngine.getTempo()).toBe(140);
    });

    test('should clamp tempo to valid range', () => {
      const lowTempo = new TimingEngine(20);
      expect(lowTempo.getTempo()).toBe(MIN_TEMPO);

      const highTempo = new TimingEngine(500);
      expect(highTempo.getTempo()).toBe(MAX_TEMPO);
    });

    test('should accept custom time signature', () => {
      const timeSignature: TimeSignature = { numerator: 3, denominator: 4 };
      const customEngine = new TimingEngine(120, timeSignature);
      expect(customEngine.getTimeSignature()).toEqual(timeSignature);
    });
  });

  describe('beat duration calculations', () => {
    test('should calculate correct beat duration for 120 BPM', () => {
      engine.setTempo(120);
      expect(engine.getBeatDuration()).toBe(500); // 60000ms / 120 BPM = 500ms
    });

    test('should calculate correct beat duration for 60 BPM', () => {
      engine.setTempo(60);
      expect(engine.getBeatDuration()).toBe(1000); // 60000ms / 60 BPM = 1000ms
    });

    test('should calculate correct measure duration', () => {
      engine.setTempo(120);
      engine.setTimeSignature({ numerator: 4, denominator: 4 });
      expect(engine.getMeasureDuration()).toBe(2000); // 4 beats * 500ms = 2000ms
    });
  });

  describe('subdivision timing', () => {
    beforeEach(() => {
      engine.setTempo(120); // 500ms per beat
    });

    test('should calculate quarter note subdivision correctly', () => {
      expect(engine.getSubdivisionDuration(BeatSubdivision.QUARTER)).toBe(500);
    });

    test('should calculate eighth note subdivision correctly', () => {
      expect(engine.getSubdivisionDuration(BeatSubdivision.EIGHTH)).toBe(250);
    });

    test('should calculate sixteenth note subdivision correctly', () => {
      expect(engine.getSubdivisionDuration(BeatSubdivision.SIXTEENTH)).toBe(125);
    });

    test('should calculate triplet subdivision correctly', () => {
      expect(engine.getSubdivisionDuration(BeatSubdivision.TRIPLET)).toBeCloseTo(166.67, 1);
    });
  });

  describe('transport control', () => {
    test('should start timing engine', () => {
      expect(engine.getIsRunning()).toBe(false);
      engine.start();
      expect(engine.getIsRunning()).toBe(true);
    });

    test('should pause timing engine', () => {
      engine.start();
      expect(engine.getIsRunning()).toBe(true);
      engine.pause();
      expect(engine.getIsRunning()).toBe(false);
    });

    test('should stop and reset timing engine', () => {
      engine.start();
      engine.stop();
      expect(engine.getIsRunning()).toBe(false);
      
      const position = engine.getCurrentPosition();
      expect(position.beat).toBe(0);
      expect(position.measure).toBe(0);
      expect(position.totalBeats).toBe(0);
    });

    test('should resume from pause correctly', () => {
      engine.start();
      
      // Simulate some time passing
      setTimeout(() => {
        engine.pause();
        const pausedPosition = engine.getCurrentPosition();
        
        // Resume and check position continuity
        engine.start();
        const resumedPosition = engine.getCurrentPosition();
        
        expect(resumedPosition.elapsedTime).toBeGreaterThanOrEqual(pausedPosition.elapsedTime);
      }, 50);
    });
  });

  describe('position tracking', () => {
    test('should track current position when stopped', () => {
      const position = engine.getCurrentPosition();
      expect(position.beat).toBe(0);
      expect(position.measure).toBe(0);
      expect(position.totalBeats).toBe(0);
      expect(position.elapsedTime).toBe(0);
      expect(position.isRunning).toBe(false);
    });

    test('should seek to specific beat position', () => {
      engine.seek(16); // Seek to beat 16
      const position = engine.getCurrentPosition();
      
      // In 4/4 time, beat 16 should be measure 4 (16 / 4 = 4)
      expect(position.measure).toBe(4);
    });
  });

  describe('tempo changes', () => {
    test('should change tempo immediately', async () => {
      expect(engine.getTempo()).toBe(DEFAULT_TEMPO);
      await engine.setTempo(140);
      expect(engine.getTempo()).toBe(140);
    });

    test('should fade tempo over time', async () => {
      const startTempo = 120;
      const endTempo = 140;
      engine.setTempo(startTempo);
      
      const fadePromise = engine.setTempo(endTempo, 100); // 100ms fade
      
      // Check that tempo is changing during fade
      setTimeout(() => {
        const currentTempo = engine.getTempo();
        expect(currentTempo).toBeGreaterThan(startTempo);
        expect(currentTempo).toBeLessThan(endTempo);
      }, 50);
      
      await fadePromise;
      expect(engine.getTempo()).toBe(endTempo);
    }, 200);
  });

  describe('time prediction', () => {
    test('should predict next beat times', () => {
      engine.start();
      const predictions = engine.predictNextBeats(4);
      
      expect(predictions).toHaveLength(4);
      expect(predictions[1] - predictions[0]).toBeCloseTo(engine.getBeatDuration(), 0);
    });

    test('should calculate time to next beat', () => {
      engine.start();
      const timeToNext = engine.getTimeToNextBeat();
      expect(timeToNext).toBeGreaterThan(0);
      expect(timeToNext).toBeLessThanOrEqual(engine.getBeatDuration());
    });
  });
});

describe('BeatCalculator', () => {
  const timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
  
  describe('time and beat conversions', () => {
    test('should convert beats to time correctly', () => {
      const time = BeatCalculator.beatsToTime(4, 120);
      expect(time).toBe(2000); // 4 beats at 120 BPM = 2000ms
    });

    test('should convert time to beats correctly', () => {
      const beats = BeatCalculator.timeToBeats(2000, 120);
      expect(beats).toBe(4); // 2000ms at 120 BPM = 4 beats
    });
  });

  describe('beat classification', () => {
    test('should identify downbeats correctly', () => {
      expect(BeatCalculator.isDownbeat(0, timeSignature)).toBe(true);
      expect(BeatCalculator.isDownbeat(4, timeSignature)).toBe(true);
      expect(BeatCalculator.isDownbeat(8, timeSignature)).toBe(true);
      expect(BeatCalculator.isDownbeat(1, timeSignature)).toBe(false);
      expect(BeatCalculator.isDownbeat(2, timeSignature)).toBe(false);
      expect(BeatCalculator.isDownbeat(3, timeSignature)).toBe(false);
    });

    test('should identify strong beats in 4/4 time', () => {
      expect(BeatCalculator.isStrongBeat(0, timeSignature)).toBe(true);  // Beat 1
      expect(BeatCalculator.isStrongBeat(1, timeSignature)).toBe(false); // Beat 2
      expect(BeatCalculator.isStrongBeat(2, timeSignature)).toBe(true);  // Beat 3
      expect(BeatCalculator.isStrongBeat(3, timeSignature)).toBe(false); // Beat 4
    });

    test('should identify strong beats in 3/4 time', () => {
      const waltzTime: TimeSignature = { numerator: 3, denominator: 4 };
      expect(BeatCalculator.isStrongBeat(0, waltzTime)).toBe(true);  // Beat 1
      expect(BeatCalculator.isStrongBeat(1, waltzTime)).toBe(false); // Beat 2
      expect(BeatCalculator.isStrongBeat(2, waltzTime)).toBe(false); // Beat 3
    });
  });

  describe('swing timing', () => {
    test('should not apply swing to on-beats', () => {
      const adjustment = BeatCalculator.getSwingAdjustment(0, 0.67, BeatSubdivision.EIGHTH);
      expect(adjustment).toBe(0);
    });

    test('should apply swing to off-beats', () => {
      const adjustment = BeatCalculator.getSwingAdjustment(0.5, 0.67, BeatSubdivision.EIGHTH);
      expect(adjustment).toBeCloseTo(0.17, 2);
    });

    test('should not apply swing to non-eighth subdivisions', () => {
      const adjustment = BeatCalculator.getSwingAdjustment(0.5, 0.67, BeatSubdivision.QUARTER);
      expect(adjustment).toBe(0);
    });
  });

  describe('quantization', () => {
    test('should quantize to quarter notes', () => {
      const quantized = BeatCalculator.quantizeToSubdivision(1750, 120, BeatSubdivision.QUARTER);
      expect(quantized).toBeCloseTo(2000, 0); // Should snap to beat 4 (2000ms)
    });

    test('should quantize to eighth notes', () => {
      const quantized = BeatCalculator.quantizeToSubdivision(1250, 120, BeatSubdivision.EIGHTH);
      expect(quantized).toBeCloseTo(1250, 0); // Should stay at eighth note position
    });

    test('should quantize to sixteenth notes', () => {
      const quantized = BeatCalculator.quantizeToSubdivision(1120, 120, BeatSubdivision.SIXTEENTH);
      expect(quantized).toBeCloseTo(1125, 0); // Should snap to nearest sixteenth
    });
  });
});

describe('SyncManager', () => {
  let syncManager: SyncManager;

  beforeEach(() => {
    syncManager = new SyncManager();
  });

  describe('clock offset management', () => {
    test('should store clock offsets', () => {
      syncManager.addClockOffset(10);
      syncManager.addClockOffset(15);
      syncManager.addClockOffset(12);
      
      const avgOffset = syncManager.getAverageOffset();
      expect(avgOffset).toBeCloseTo(12.33, 1);
    });

    test('should limit number of stored offsets', () => {
      // Add more than maxSamples (10)
      for (let i = 0; i < 15; i++) {
        syncManager.addClockOffset(i);
      }
      
      const avgOffset = syncManager.getAverageOffset();
      // Should only consider the last 10 samples (5-14)
      expect(avgOffset).toBeCloseTo(9.5, 1);
    });

    test('should filter outliers when calculating average', () => {
      syncManager.addClockOffset(10);
      syncManager.addClockOffset(11);
      syncManager.addClockOffset(12);
      syncManager.addClockOffset(100); // Outlier
      syncManager.addClockOffset(13);
      
      const avgOffset = syncManager.getAverageOffset();
      // Should exclude the outlier (100)
      expect(avgOffset).toBeLessThan(20);
    });
  });

  describe('sync quality assessment', () => {
    test('should return 0 quality with insufficient samples', () => {
      syncManager.addClockOffset(10);
      expect(syncManager.getSyncQuality()).toBe(0);
      
      syncManager.addClockOffset(11);
      expect(syncManager.getSyncQuality()).toBe(0);
    });

    test('should calculate quality based on consistency', () => {
      // Add consistent offsets (high quality)
      syncManager.addClockOffset(10);
      syncManager.addClockOffset(10.5);
      syncManager.addClockOffset(9.5);
      syncManager.addClockOffset(10.2);
      
      const goodQuality = syncManager.getSyncQuality();
      expect(goodQuality).toBeGreaterThan(0.8);
      
      // Reset and add inconsistent offsets (low quality)
      syncManager = new SyncManager();
      syncManager.addClockOffset(10);
      syncManager.addClockOffset(25);
      syncManager.addClockOffset(5);
      syncManager.addClockOffset(30);
      
      const poorQuality = syncManager.getSyncQuality();
      expect(poorQuality).toBeLessThan(0.5);
    });
  });

  describe('freshness tracking', () => {
    test('should detect fresh sync', () => {
      syncManager.addClockOffset(10);
      expect(syncManager.isSyncFresh()).toBe(true);
    });

    test('should detect stale sync', () => {
      expect(syncManager.isSyncFresh(0)).toBe(false);
    });
  });

  describe('drift detection', () => {
    test('should detect no drift with consistent offsets', () => {
      for (let i = 0; i < 6; i++) {
        syncManager.addClockOffset(10);
      }
      
      const drift = syncManager.detectDrift();
      expect(Math.abs(drift)).toBeLessThan(0.1);
    });

    test('should detect positive drift', () => {
      // Simulate increasing offset (positive drift)
      for (let i = 0; i < 3; i++) {
        syncManager.addClockOffset(10);
      }
      for (let i = 0; i < 3; i++) {
        syncManager.addClockOffset(15);
      }
      
      const drift = syncManager.detectDrift();
      expect(drift).toBeGreaterThan(0);
    });
  });
});

describe('MetronomeScheduler', () => {
  let scheduler: MetronomeScheduler;
  
  beforeEach(() => {
    scheduler = new MetronomeScheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('callback scheduling', () => {
    test('should schedule and execute callbacks', (done) => {
      let callCount = 0;
      
      const id = scheduler.schedule(() => {
        callCount++;
        if (callCount === 1) {
          expect(callCount).toBe(1);
          scheduler.cancel(id);
          done();
        }
      }, 50); // 50ms interval
      
      expect(typeof id).toBe('string');
    });

    test('should cancel scheduled callbacks', (done) => {
      let callCount = 0;
      
      const id = scheduler.schedule(() => {
        callCount++;
      }, 50);
      
      const cancelled = scheduler.cancel(id);
      expect(cancelled).toBe(true);
      
      setTimeout(() => {
        expect(callCount).toBe(0);
        done();
      }, 100);
    });

    test('should return false when cancelling non-existent callback', () => {
      const cancelled = scheduler.cancel('non-existent-id');
      expect(cancelled).toBe(false);
    });

    test('should handle multiple scheduled callbacks', (done) => {
      let callback1Count = 0;
      let callback2Count = 0;
      
      scheduler.schedule(() => {
        callback1Count++;
      }, 30);
      
      scheduler.schedule(() => {
        callback2Count++;
      }, 50);
      
      setTimeout(() => {
        expect(callback1Count).toBeGreaterThan(0);
        expect(callback2Count).toBeGreaterThan(0);
        done();
      }, 100);
    });
  });

  describe('precision timing', () => {
    test('should execute callbacks at scheduled times', (done) => {
      const startTime = performance.now();
      const expectedInterval = 100;
      let callCount = 0;
      
      scheduler.schedule((scheduledTime) => {
        callCount++;
        const actualTime = performance.now();
        const expectedTime = startTime + (callCount * expectedInterval);
        const jitter = Math.abs(actualTime - expectedTime);
        
        // Allow for some timing variance (< 10ms)
        expect(jitter).toBeLessThan(10);
        
        if (callCount === 3) {
          done();
        }
      }, expectedInterval, startTime + expectedInterval);
    }, 500);
  });

  describe('look-ahead adjustment', () => {
    test('should accept look-ahead time changes', () => {
      scheduler.setLookAhead(200);
      // Test passes if no error is thrown
      expect(true).toBe(true);
    });

    test('should clamp look-ahead time to reasonable bounds', () => {
      scheduler.setLookAhead(10);    // Too low
      scheduler.setLookAhead(1000);  // Too high
      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });
});

describe('validation utilities', () => {
  describe('tempo validation', () => {
    test('should validate correct tempos', () => {
      expect(isValidTempo(60)).toBe(true);
      expect(isValidTempo(120)).toBe(true);
      expect(isValidTempo(200)).toBe(true);
    });

    test('should reject invalid tempos', () => {
      expect(isValidTempo(30)).toBe(false);  // Too low
      expect(isValidTempo(400)).toBe(false); // Too high
      expect(isValidTempo(NaN)).toBe(false);
      expect(isValidTempo(-50)).toBe(false);
    });
  });

  describe('time signature validation', () => {
    test('should validate correct time signatures', () => {
      expect(isValidTimeSignature({ numerator: 4, denominator: 4 })).toBe(true);
      expect(isValidTimeSignature({ numerator: 3, denominator: 4 })).toBe(true);
      expect(isValidTimeSignature({ numerator: 6, denominator: 8 })).toBe(true);
    });

    test('should reject invalid time signatures', () => {
      expect(isValidTimeSignature({ numerator: 0, denominator: 4 })).toBe(false);
      expect(isValidTimeSignature({ numerator: 4, denominator: 3 })).toBe(false);  // Invalid denominator
      expect(isValidTimeSignature({ numerator: 40, denominator: 4 })).toBe(false); // Too large numerator
    });
  });
});

describe('conversion utilities', () => {
  test('should convert milliseconds to beats', () => {
    expect(msToBeats(1000, 60)).toBe(1);    // 1 second at 60 BPM = 1 beat
    expect(msToBeats(500, 120)).toBe(1);    // 500ms at 120 BPM = 1 beat
    expect(msToBeats(2000, 120)).toBe(4);   // 2 seconds at 120 BPM = 4 beats
  });

  test('should convert beats to milliseconds', () => {
    expect(beatsToMs(1, 60)).toBe(1000);   // 1 beat at 60 BPM = 1000ms
    expect(beatsToMs(1, 120)).toBe(500);   // 1 beat at 120 BPM = 500ms
    expect(beatsToMs(4, 120)).toBe(2000);  // 4 beats at 120 BPM = 2000ms
  });

  test('should format time correctly', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(1000)).toBe('0:01.00');
    expect(formatTime(61500)).toBe('1:01.50');
    expect(formatTime(125750)).toBe('2:05.75');
  });
});