/**
 * BandSync Low-Latency Synchronization Engine
 * Designed for sub-50ms metronome coordination with drift correction
 */

import { EVENTS, EVENT_PRIORITIES } from './events-enhanced.js';

export class SyncEngine {
  constructor(redisManager, io) {
    this.redis = redisManager;
    this.io = io;
    
    // High-precision timing
    this.syncIntervals = new Map(); // sessionId -> interval
    this.latencyTrackers = new Map(); // socketId -> latency stats
    this.clockSyncOffsets = new Map(); // socketId -> time offset
    
    // Performance monitoring
    this.metrics = {
      avgLatency: 0,
      syncDrift: 0,
      beatAccuracy: 0,
      lastMetricsUpdate: Date.now()
    };
    
    this.setupPerformanceMonitoring();
  }

  /**
   * CLOCK SYNCHRONIZATION
   * Critical for sub-50ms accuracy
   */
  
  async initializeClockSync(socket) {
    const socketId = socket.id;
    this.latencyTrackers.set(socketId, {
      samples: [],
      avgLatency: 0,
      minLatency: Infinity,
      clockOffset: 0,
      lastSync: Date.now()
    });

    // Perform initial clock sync with multiple samples
    await this.performClockSync(socket, 5);
    
    // Schedule regular sync maintenance
    const syncInterval = setInterval(() => {
      this.performClockSync(socket, 1);
    }, 30000); // Every 30 seconds
    
    socket.on('disconnect', () => {
      clearInterval(syncInterval);
      this.latencyTrackers.delete(socketId);
      this.clockSyncOffsets.delete(socketId);
    });
  }

  async performClockSync(socket, sampleCount = 3) {
    const socketId = socket.id;
    const tracker = this.latencyTrackers.get(socketId);
    if (!tracker) return;

    const samples = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const t0 = this.getHighResTimestamp();
      
      // Send sync request and wait for response
      const syncPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        
        socket.emit(EVENTS.CLOCK_SYNC_REQUEST, { t0 }, (response) => {
          clearTimeout(timeout);
          const t3 = this.getHighResTimestamp();
          
          if (response && response.t1 && response.t2) {
            const roundTrip = t3 - t0;
            const networkLatency = roundTrip / 2;
            const clockOffset = response.t2 - t0 - networkLatency;
            
            resolve({
              roundTrip,
              networkLatency, 
              clockOffset,
              timestamp: t0
            });
          } else {
            resolve(null);
          }
        });
      });
      
      const sample = await syncPromise;
      if (sample) samples.push(sample);
      
      // Small delay between samples
      if (i < sampleCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (samples.length === 0) return;

    // Update latency statistics
    const latencies = samples.map(s => s.networkLatency);
    const offsets = samples.map(s => s.clockOffset);
    
    tracker.samples = tracker.samples.concat(samples).slice(-20); // Keep last 20
    tracker.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    tracker.minLatency = Math.min(tracker.minLatency, ...latencies);
    tracker.clockOffset = this.median(offsets);
    tracker.lastSync = Date.now();

    this.clockSyncOffsets.set(socketId, tracker.clockOffset);
    
    console.log(`Clock sync for ${socketId}: latency=${tracker.avgLatency.toFixed(2)}ms, offset=${tracker.clockOffset.toFixed(2)}ms`);
  }

  /**
   * HIGH-FREQUENCY METRONOME SYNC
   * Target: sub-50ms beat accuracy
   */
  
  async startMetronomeSync(sessionId, tempo, timeSignature = '4/4') {
    const session = await this.redis.getSession(sessionId);
    if (!session) return false;

    // Calculate precise timing intervals
    const bpm = tempo;
    const beatsPerSecond = bpm / 60;
    const beatIntervalMs = 1000 / beatsPerSecond;
    
    // Use 4x higher resolution for position tracking
    const syncIntervalMs = Math.min(beatIntervalMs / 4, 12.5); // Max 12.5ms (80 FPS)
    
    console.log(`Starting metronome sync: ${bpm} BPM, beat interval: ${beatIntervalMs}ms, sync interval: ${syncIntervalMs}ms`);

    // Clear any existing interval
    this.stopMetronomeSync(sessionId);

    const startTime = this.getHighResTimestamp();
    let beatCount = 0;
    let lastBeatTime = startTime;
    
    const interval = setInterval(async () => {
      const currentTime = this.getHighResTimestamp();
      const elapsedMs = currentTime - startTime;
      const expectedBeatCount = Math.floor(elapsedMs / beatIntervalMs);
      
      // Check if we should emit a beat
      if (expectedBeatCount > beatCount) {
        beatCount = expectedBeatCount;
        const beatTime = startTime + (beatCount * beatIntervalMs);
        lastBeatTime = beatTime;
        
        const beatInfo = {
          beatNumber: (beatCount % 4) + 1, // Assuming 4/4 time
          measureNumber: Math.floor(beatCount / 4) + 1,
          exactBeatTime: beatTime,
          tempo: bpm
        };

        // Emit beat with high priority
        await this.emitTimed(sessionId, EVENTS.METRONOME_BEAT, {
          sessionId,
          beatInfo,
          timestamp: beatTime
        }, EVENT_PRIORITIES[EVENTS.METRONOME_BEAT]);
      }

      // High-frequency position sync
      const positionMs = elapsedMs;
      await this.emitTimed(sessionId, EVENTS.POSITION_SYNC, {
        sessionId,
        positionMs,
        timestamp: currentTime,
        beatProgress: (elapsedMs % beatIntervalMs) / beatIntervalMs
      }, EVENT_PRIORITIES[EVENTS.POSITION_SYNC]);

      // Store position in Redis for recovery
      if (beatCount % 4 === 0) { // Every 4th beat
        await this.redis.updatePosition(sessionId, positionMs, currentTime, {
          beatNumber: beatInfo?.beatNumber,
          measureNumber: beatInfo?.measureNumber
        });
      }

    }, syncIntervalMs);

    this.syncIntervals.set(sessionId, {
      interval,
      startTime,
      tempo: bpm,
      beatIntervalMs
    });

    return true;
  }

  async stopMetronomeSync(sessionId) {
    const syncData = this.syncIntervals.get(sessionId);
    if (!syncData) return;

    clearInterval(syncData.interval);
    this.syncIntervals.delete(sessionId);

    // Emit stop event
    await this.emitTimed(sessionId, EVENTS.METRONOME_STOP, {
      sessionId,
      timestamp: this.getHighResTimestamp()
    });

    console.log(`Stopped metronome sync for session ${sessionId}`);
  }

  /**
   * DRIFT CORRECTION & ERROR HANDLING
   */
  
  async correctSyncDrift(sessionId, reportedPosition, clientTimestamp, socketId) {
    const syncData = this.syncIntervals.get(sessionId);
    if (!syncData) return;

    const serverTime = this.getHighResTimestamp();
    const clientOffset = this.clockSyncOffsets.get(socketId) || 0;
    const adjustedClientTime = clientTimestamp + clientOffset;
    
    const serverPosition = serverTime - syncData.startTime;
    const drift = Math.abs(reportedPosition - serverPosition);
    
    // If drift exceeds threshold, send correction
    if (drift > 25) { // 25ms threshold
      console.log(`Sync drift detected: ${drift.toFixed(2)}ms for ${socketId}`);
      
      const correction = {
        sessionId,
        correctPosition: serverPosition,
        reportedPosition,
        drift,
        timestamp: serverTime
      };

      // Send correction to specific client
      const socket = this.getSocketById(socketId);
      if (socket) {
        socket.emit(EVENTS.POSITION_CORRECTION, correction);
      }
      
      // Update metrics
      this.metrics.syncDrift = Math.max(this.metrics.syncDrift, drift);
    }
  }

  /**
   * OPTIMIZED EVENT EMISSION
   */
  
  async emitTimed(sessionId, event, data, priority = 2) {
    const room = this.io.sockets.adapter.rooms.get(sessionId);
    if (!room) return;

    // Get latency-optimized member list
    const members = Array.from(room);
    const sortedMembers = this.sortMembersByLatency(members);
    
    // Emit to lowest latency members first
    for (const socketId of sortedMembers) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        // Adjust timing for individual client latency
        const tracker = this.latencyTrackers.get(socketId);
        const adjustedData = tracker ? {
          ...data,
          latencyCompensation: tracker.avgLatency
        } : data;
        
        socket.emit(event, adjustedData);
      }
    }

    // Also publish to Redis for horizontal scaling
    await this.redis.publishToSession(sessionId, event, data);
  }

  sortMembersByLatency(socketIds) {
    return socketIds.sort((a, b) => {
      const latencyA = this.latencyTrackers.get(a)?.avgLatency || 999;
      const latencyB = this.latencyTrackers.get(b)?.avgLatency || 999;
      return latencyA - latencyB;
    });
  }

  /**
   * PERFORMANCE MONITORING
   */
  
  setupPerformanceMonitoring() {
    setInterval(() => {
      this.updateMetrics();
    }, 5000); // Every 5 seconds
  }

  updateMetrics() {
    const now = Date.now();
    const allTrackers = Array.from(this.latencyTrackers.values());
    
    if (allTrackers.length === 0) return;
    
    const avgLatency = allTrackers.reduce((sum, t) => sum + t.avgLatency, 0) / allTrackers.length;
    
    this.metrics = {
      avgLatency,
      syncDrift: this.metrics.syncDrift, // Persistent until next drift event
      activeSessions: this.syncIntervals.size,
      connectedClients: allTrackers.length,
      lastMetricsUpdate: now
    };
    
    // Emit metrics to monitoring systems
    this.io.emit(EVENTS.METRICS_UPDATE, this.metrics);
    
    // Reset drift counter
    this.metrics.syncDrift = 0;
    
    console.log(`Metrics - Avg Latency: ${avgLatency.toFixed(2)}ms, Active Sessions: ${this.syncIntervals.size}`);
  }

  /**
   * UTILITY METHODS
   */
  
  getHighResTimestamp() {
    return performance.now() + performance.timeOrigin;
  }
  
  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  getSocketById(socketId) {
    return this.io.sockets.sockets.get(socketId);
  }

  /**
   * CLEANUP
   */
  
  cleanup() {
    // Clear all intervals
    for (const [sessionId, syncData] of this.syncIntervals) {
      clearInterval(syncData.interval);
    }
    this.syncIntervals.clear();
    this.latencyTrackers.clear();
    this.clockSyncOffsets.clear();
  }
}