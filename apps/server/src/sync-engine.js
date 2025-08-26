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
    
    // Use 4x higher resolution for position tracking (optimized for sub-50ms latency)
    const syncIntervalMs = Math.min(beatIntervalMs / 4, 10); // Max 10ms (100 FPS) for better precision
    
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

        // Emit beat with high priority (minimal payload for performance)
        await this.emitTimed(sessionId, EVENTS.METRONOME_BEAT, {
          s: sessionId,
          b: beatInfo.beatNumber,
          m: beatInfo.measureNumber,
          t: beatTime,
          bpm: bpm
        }, EVENT_PRIORITIES[EVENTS.METRONOME_BEAT]);
      }

      // High-frequency position sync (optimized payload)
      const positionMs = elapsedMs;
      await this.emitTimed(sessionId, EVENTS.POSITION_SYNC, {
        s: sessionId,
        p: Math.round(positionMs), // Round to reduce JSON size
        t: currentTime,
        bp: Math.round((elapsedMs % beatIntervalMs) / beatIntervalMs * 100) / 100 // 2 decimal places
      }, EVENT_PRIORITIES[EVENTS.POSITION_SYNC]);

      // Store position in Redis for recovery (less frequent to reduce Redis load)
      if (beatCount % 8 === 0) { // Every 8th beat (every 2 measures)
        // Use fire-and-forget to not block sync loop
        setImmediate(async () => {
          await this.redis.updatePosition(sessionId, positionMs, currentTime, {
            beatNumber: beatInfo?.beatNumber,
            measureNumber: beatInfo?.measureNumber
          });
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
    if (!room || room.size === 0) return;

    // For high-frequency events, use bulk emission for better performance
    if (priority === EVENT_PRIORITIES.HIGH || priority === EVENT_PRIORITIES.CRITICAL) {
      return this.emitBulkOptimized(sessionId, event, data, room);
    }

    // Get latency-optimized member list
    const members = Array.from(room);
    const sortedMembers = this.sortMembersByLatency(members);
    
    // Emit to lowest latency members first (batched for performance)
    const batchSize = 10; // Process in batches to prevent blocking
    for (let i = 0; i < sortedMembers.length; i += batchSize) {
      const batch = sortedMembers.slice(i, i + batchSize);
      
      // Process batch with minimal delay
      setImmediate(() => {
        for (const socketId of batch) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket && socket.connected) {
            // For high-frequency events, skip latency compensation to reduce CPU
            if (event === EVENTS.POSITION_SYNC || event === EVENTS.METRONOME_BEAT) {
              socket.volatile.emit(event, data);
            } else {
              const tracker = this.latencyTrackers.get(socketId);
              const adjustedData = tracker ? {
                ...data,
                lc: Math.round(tracker.avgLatency) // Shortened key for performance
              } : data;
              
              socket.emit(event, adjustedData);
            }
          }
        }
      });
    }

    // Publish to Redis for horizontal scaling (fire and forget for high-freq events)
    if (priority !== EVENT_PRIORITIES.HIGH) {
      await this.redis.publishToSession(sessionId, event, data);
    } else {
      // Non-blocking Redis publish for high-frequency events
      setImmediate(() => {
        this.redis.publishToSession(sessionId, event, data).catch(err => {
          console.warn('Redis publish failed for high-freq event:', err.message);
        });
      });
    }
  }
  
  emitBulkOptimized(sessionId, event, data, room) {
    // Ultra-fast emission for critical timing events
    const socketIds = Array.from(room);
    
    // Use Socket.io's built-in room emission for maximum performance
    this.io.to(sessionId).volatile.emit(event, data);
    
    // Count successful emissions for metrics
    let successCount = 0;
    for (const socketId of socketIds) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        successCount++;
      }
    }
    
    return successCount;
  }

  sortMembersByLatency(socketIds) {
    // Cache sorted results for performance
    const cacheKey = socketIds.join(',');
    const now = Date.now();
    
    if (this._sortCache && this._sortCache.key === cacheKey && (now - this._sortCache.timestamp) < 5000) {
      return this._sortCache.result;
    }
    
    const sorted = socketIds.sort((a, b) => {
      const latencyA = this.latencyTrackers.get(a)?.avgLatency || 999;
      const latencyB = this.latencyTrackers.get(b)?.avgLatency || 999;
      return latencyA - latencyB;
    });
    
    // Cache result for 5 seconds
    this._sortCache = {
      key: cacheKey,
      result: sorted,
      timestamp: now
    };
    
    return sorted;
  }

  /**
   * PERFORMANCE MONITORING
   */
  
  setupPerformanceMonitoring() {
    setInterval(() => {
      this.updateMetrics();
      this.performHealthChecks();
    }, 5000); // Every 5 seconds
    
    // More frequent heartbeat check
    setInterval(() => {
      this.checkConnectionHealth();
    }, 1000); // Every 1 second
  }

  updateMetrics() {
    const now = Date.now();
    const allTrackers = Array.from(this.latencyTrackers.values());
    
    if (allTrackers.length === 0) {
      this.metrics = {
        avgLatency: 0,
        syncDrift: 0,
        activeSessions: this.syncIntervals.size,
        connectedClients: 0,
        lastMetricsUpdate: now,
        performance: 'no-connections'
      };
      return;
    }
    
    const avgLatency = allTrackers.reduce((sum, t) => sum + t.avgLatency, 0) / allTrackers.length;
    const maxLatency = Math.max(...allTrackers.map(t => t.avgLatency));
    const minLatency = Math.min(...allTrackers.map(t => t.avgLatency));
    
    // Calculate performance rating
    let performance = 'excellent';
    if (avgLatency > 25) performance = 'good';
    if (avgLatency > 50) performance = 'fair';
    if (avgLatency > 100) performance = 'poor';
    
    this.metrics = {
      avgLatency,
      maxLatency,
      minLatency,
      syncDrift: this.metrics.syncDrift, // Persistent until next drift event
      activeSessions: this.syncIntervals.size,
      connectedClients: allTrackers.length,
      lastMetricsUpdate: now,
      performance,
      targetLatency: 50
    };
    
    // Emit metrics to monitoring systems
    this.io.emit(EVENTS.METRICS_UPDATE, this.metrics);
    
    // Log performance issues
    if (avgLatency > 50) {
      console.warn(`Performance Warning - Avg Latency: ${avgLatency.toFixed(2)}ms (target: <50ms)`);
    }
    
    // Reset drift counter
    this.metrics.syncDrift = 0;
    
    console.log(`Metrics - Avg Latency: ${avgLatency.toFixed(2)}ms, Active Sessions: ${this.syncIntervals.size}, Performance: ${performance}`);
  }

  /**
   * CONNECTION HEALTH MONITORING
   */
  
  async checkConnectionHealth() {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    const disconnectThreshold = 60000; // 60 seconds
    
    for (const [socketId, tracker] of this.latencyTrackers) {
      const timeSinceLastSync = now - tracker.lastSync;
      
      // Check if connection is stale
      if (timeSinceLastSync > staleThreshold && timeSinceLastSync < disconnectThreshold) {
        const socket = this.getSocketById(socketId);
        if (socket) {
          // Send health probe
          socket.emit(EVENTS.LATENCY_PROBE, { 
            timestamp: now, 
            healthCheck: true 
          });
        }
      }
      
      // Remove very stale connections
      if (timeSinceLastSync > disconnectThreshold) {
        console.log(`Removing stale connection: ${socketId}`);
        this.latencyTrackers.delete(socketId);
        this.clockSyncOffsets.delete(socketId);
        
        // Notify about connection quality issue
        const socket = this.getSocketById(socketId);
        if (socket) {
          socket.emit(EVENTS.ERROR_CONNECTION_LOST, {
            reason: 'health_check_failed',
            lastSeen: tracker.lastSync,
            shouldReconnect: true
          });
        }
      }
    }
  }
  
  async performHealthChecks() {
    const healthyConnections = [];
    const unhealthyConnections = [];
    const targetLatency = 50; // ms
    
    for (const [socketId, tracker] of this.latencyTrackers) {
      if (tracker.avgLatency <= targetLatency && tracker.samples.length >= 3) {
        healthyConnections.push({ socketId, latency: tracker.avgLatency });
      } else {
        unhealthyConnections.push({ 
          socketId, 
          latency: tracker.avgLatency,
          issues: this.diagnoseConnectionIssues(tracker)
        });
      }
    }
    
    // Emit health report
    const healthReport = {
      timestamp: Date.now(),
      healthy: healthyConnections.length,
      unhealthy: unhealthyConnections.length,
      targetLatency,
      avgLatency: this.metrics.avgLatency,
      activeSessions: this.syncIntervals.size
    };
    
    this.io.emit(EVENTS.HEALTH_CHECK, healthReport);
    
    // Log health issues
    if (unhealthyConnections.length > 0) {
      console.warn(`Health check: ${unhealthyConnections.length} connections with issues`);
      unhealthyConnections.forEach(conn => {
        console.warn(`  ${conn.socketId}: ${conn.latency.toFixed(2)}ms - ${conn.issues.join(', ')}`);
      });
    }
  }
  
  diagnoseConnectionIssues(tracker) {
    const issues = [];
    
    if (tracker.avgLatency > 100) {
      issues.push('high_latency');
    }
    
    if (tracker.samples.length < 3) {
      issues.push('insufficient_samples');
    }
    
    const now = Date.now();
    if (now - tracker.lastSync > 30000) {
      issues.push('stale_connection');
    }
    
    const latencyVariance = this.calculateLatencyVariance(tracker.samples);
    if (latencyVariance > 50) {
      issues.push('unstable_connection');
    }
    
    return issues.length > 0 ? issues : ['unknown'];
  }
  
  calculateLatencyVariance(samples) {
    if (samples.length < 2) return 0;
    
    const latencies = samples.map(s => s.networkLatency);
    const mean = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const squaredDiffs = latencies.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / latencies.length;
    
    return Math.sqrt(variance); // Standard deviation
  }
  
  /**
   * PERFORMANCE OPTIMIZATION
   */
  
  async updateTempo(sessionId, newTempo, rampDurationMs = 0) {
    const syncData = this.syncIntervals.get(sessionId);
    if (!syncData) return false;
    
    console.log(`Updating tempo for session ${sessionId}: ${syncData.tempo} -> ${newTempo} BPM`);
    
    // Calculate new timing intervals
    const newBeatIntervalMs = (60 / newTempo) * 1000;
    const newSyncIntervalMs = Math.min(newBeatIntervalMs / 4, 12.5);
    
    // If ramping, implement gradual change
    if (rampDurationMs > 0) {
      return await this.performTempoRamp(sessionId, syncData.tempo, newTempo, rampDurationMs);
    }
    
    // Immediate tempo change
    syncData.tempo = newTempo;
    syncData.beatIntervalMs = newBeatIntervalMs;
    
    // Restart interval with new timing
    clearInterval(syncData.interval);
    
    const currentTime = this.getHighResTimestamp();
    const elapsedMs = currentTime - syncData.startTime;
    let beatCount = Math.floor(elapsedMs / syncData.beatIntervalMs);
    
    const interval = setInterval(async () => {
      const now = this.getHighResTimestamp();
      const elapsed = now - syncData.startTime;
      const expectedBeatCount = Math.floor(elapsed / newBeatIntervalMs);
      
      if (expectedBeatCount > beatCount) {
        beatCount = expectedBeatCount;
        const beatTime = syncData.startTime + (beatCount * newBeatIntervalMs);
        
        await this.emitTimed(sessionId, EVENTS.METRONOME_BEAT, {
          sessionId,
          beatInfo: {
            beatNumber: (beatCount % 4) + 1,
            measureNumber: Math.floor(beatCount / 4) + 1,
            exactBeatTime: beatTime,
            tempo: newTempo
          },
          timestamp: beatTime
        }, EVENT_PRIORITIES[EVENTS.METRONOME_BEAT]);
      }
      
      // High-frequency position sync
      await this.emitTimed(sessionId, EVENTS.POSITION_SYNC, {
        sessionId,
        positionMs: elapsed,
        timestamp: now,
        beatProgress: (elapsed % newBeatIntervalMs) / newBeatIntervalMs
      }, EVENT_PRIORITIES[EVENTS.POSITION_SYNC]);
      
    }, newSyncIntervalMs);
    
    syncData.interval = interval;
    this.syncIntervals.set(sessionId, syncData);
    
    return true;
  }
  
  async performTempoRamp(sessionId, fromTempo, toTempo, durationMs) {
    const syncData = this.syncIntervals.get(sessionId);
    if (!syncData) return false;
    
    console.log(`Performing tempo ramp for session ${sessionId}: ${fromTempo} -> ${toTempo} over ${durationMs}ms`);
    
    const startTime = this.getHighResTimestamp();
    const tempoDifference = toTempo - fromTempo;
    const rampSteps = Math.max(10, Math.floor(durationMs / 100)); // At least 10 steps
    const stepDuration = durationMs / rampSteps;
    
    for (let step = 0; step <= rampSteps; step++) {
      const progress = step / rampSteps;
      const currentTempo = fromTempo + (tempoDifference * progress);
      
      // Emit tempo ramp update
      this.io.to(sessionId).emit(EVENTS.TEMPO_RAMP, {
        sessionId,
        currentTempo,
        targetTempo: toTempo,
        progress,
        timestamp: this.getHighResTimestamp()
      });
      
      // Update sync intervals for current tempo
      syncData.tempo = currentTempo;
      syncData.beatIntervalMs = (60 / currentTempo) * 1000;
      
      if (step < rampSteps) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    }
    
    // Final update with exact target tempo
    return await this.updateTempo(sessionId, toTempo, 0);
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