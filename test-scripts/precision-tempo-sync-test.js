/**
 * Enhanced Tempo Synchronization Precision Test
 * Measures sync accuracy with high-resolution timing and statistical analysis
 */

import io from 'socket.io-client';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const SERVER_URL = process.env.BANDSYNC_SERVER_URL || 'http://localhost:3001';

class PrecisionTempoSyncTest {
  constructor() {
    this.testResults = [];
    this.devices = [];
    this.measurementData = [];
    this.testStartTime = null;
  }

  async runPrecisionSyncTest(deviceCount = 4, testDurationMs = 60000) {
    console.log(`🎯 Starting Enhanced Tempo Sync Precision Test`);
    console.log(`   Devices: ${deviceCount}`);
    console.log(`   Duration: ${testDurationMs / 1000} seconds`);
    console.log(`   Target: <50ms average deviation`);
    
    this.testStartTime = performance.now();
    
    try {
      await this.setupPrecisionDevices(deviceCount);
      await this.runPrecisionMeasurement(testDurationMs);
      await this.runTempoChangeAccuracyTest();
      
      const results = this.analyzePrecisionResults();
      await this.generateDetailedReport(results);
      
      return results;
      
    } catch (error) {
      console.error('Precision test failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async setupPrecisionDevices(deviceCount) {
    console.log(`📱 Setting up ${deviceCount} precision measurement devices...`);
    
    const sessionId = `precision-test-${Date.now()}`;
    
    for (let i = 0; i < deviceCount; i++) {
      const device = {
        id: i,
        socket: io(SERVER_URL, {
          transports: ['websocket'], // Force websocket for precision
          timeout: 5000
        }),
        scrollTickData: [],
        latencyMeasurements: [],
        beatTimings: [],
        tempoChanges: []
      };
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        
        device.socket.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        device.socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Setup high-precision event listeners
      device.socket.on('scroll_tick', (data) => {
        const receiveTime = performance.now();
        
        device.scrollTickData.push({
          positionMs: data.positionMs,
          serverTimestamp: data.serverTimestamp,
          clientReceiveTime: receiveTime,
          serverClientDelta: receiveTime - data.serverTimestamp
        });
        
        // Calculate beat timing relative to expected interval
        if (device.scrollTickData.length > 1) {
          const previousTick = device.scrollTickData[device.scrollTickData.length - 2];
          const actualInterval = receiveTime - previousTick.clientReceiveTime;
          const expectedInterval = 100; // 100ms server interval
          const intervalError = actualInterval - expectedInterval;
          
          device.beatTimings.push({
            expected: expectedInterval,
            actual: actualInterval,
            error: intervalError,
            timestamp: receiveTime
          });
        }
      });

      // Latency probe responses
      device.socket.on('latency_response', (data) => {
        const rtt = performance.now() - data.clientTimestamp;
        device.latencyMeasurements.push({
          rtt: rtt,
          timestamp: performance.now(),
          serverProcessingTime: data.serverTimestamp - data.clientTimestamp
        });
      });

      // Tempo change detection
      device.socket.on('snapshot', (data) => {
        if (data.tempo !== undefined) {
          device.tempoChanges.push({
            tempo: data.tempo,
            timestamp: performance.now(),
            isPlaying: data.isPlaying
          });
        }
      });

      // Join session
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Join timeout')), 5000);
        
        device.socket.once('snapshot', (data) => {
          clearTimeout(timeout);
          console.log(`  Device ${i + 1} joined session`);
          resolve(data);
        });
        
        device.socket.emit('join_session', {
          sessionId: sessionId,
          displayName: `Precision Test Device ${i + 1}`
        });
      });

      this.devices.push(device);
    }

    // Make first device leader
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Leadership timeout')), 3000);
      
      this.devices[0].socket.once('snapshot', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      
      this.devices[0].socket.emit('set_role', {
        sessionId: sessionId,
        role: 'leader'
      });
    });

    console.log(`✅ All devices connected and leader established`);
  }

  async runPrecisionMeasurement(durationMs) {
    console.log(`⏱️ Starting precision measurement (${durationMs / 1000}s)...`);
    
    const leader = this.devices[0];
    
    // Start latency monitoring
    const latencyInterval = setInterval(() => {
      this.devices.forEach(device => {
        device.socket.emit('latency_probe', {
          timestamp: performance.now(),
          sessionId: 'precision-test'
        });
      });
    }, 2000);

    // Set precise tempo for measurement
    const testTempo = 120; // 120 BPM = 500ms per beat
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tempo set timeout')), 3000);
      
      leader.socket.once('snapshot', (data) => {
        clearTimeout(timeout);
        console.log(`  Tempo set to ${testTempo} BPM`);
        resolve(data);
      });
      
      leader.socket.emit('set_tempo', {
        sessionId: 'precision-test',
        tempo: testTempo
      });
    });

    // Start synchronized playback
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Play timeout')), 3000);
      
      leader.socket.once('snapshot', (data) => {
        clearTimeout(timeout);
        console.log(`  Playback started for precision measurement`);
        resolve(data);
      });
      
      leader.socket.emit('play', {
        sessionId: 'precision-test'
      });
    });

    // Run precision measurement
    const measurementStart = performance.now();
    await new Promise(resolve => setTimeout(resolve, durationMs));
    const measurementEnd = performance.now();
    
    clearInterval(latencyInterval);

    // Stop playback
    leader.socket.emit('pause', { sessionId: 'precision-test' });
    
    console.log(`✅ Precision measurement completed (${((measurementEnd - measurementStart) / 1000).toFixed(1)}s)`);
  }

  async runTempoChangeAccuracyTest() {
    console.log(`🎵 Testing tempo change propagation accuracy...`);
    
    const leader = this.devices[0];
    const tempoSequence = [60, 90, 120, 150, 180, 100]; // Various BPM values
    
    // Clear previous tempo changes
    this.devices.forEach(device => {
      device.tempoChanges = [];
    });

    for (const targetTempo of tempoSequence) {
      console.log(`  Testing tempo change to ${targetTempo} BPM...`);
      
      const changeStartTime = performance.now();
      
      // Set up propagation measurement for followers
      const propagationPromises = this.devices.slice(1).map(device => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ deviceId: device.id, propagationTime: null, timedOut: true });
          }, 2000);
          
          const handler = (data) => {
            if (data.tempo === targetTempo) {
              clearTimeout(timeout);
              const propagationTime = performance.now() - changeStartTime;
              resolve({
                deviceId: device.id,
                propagationTime: propagationTime,
                tempo: targetTempo,
                timedOut: false
              });
              device.socket.off('snapshot', handler);
            }
          };
          
          device.socket.on('snapshot', handler);
        });
      });

      // Execute tempo change
      leader.socket.emit('set_tempo', {
        sessionId: 'precision-test',
        tempo: targetTempo
      });

      // Wait for all followers to receive change
      const propagationResults = await Promise.all(propagationPromises);
      
      this.measurementData.push({
        type: 'tempo_change',
        targetTempo: targetTempo,
        changeStartTime: changeStartTime,
        propagationResults: propagationResults
      });

      // Brief pause between tempo changes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  analyzePrecisionResults() {
    console.log(`\n📊 Analyzing precision measurement results...`);
    
    const analysis = {
      overallSyncQuality: {},
      tempoChangeAnalysis: {},
      devicePerformance: [],
      networkAnalysis: {},
      recommendations: []
    };

    // Analyze scroll tick precision for each device
    const allIntervalErrors = [];
    const deviceAnalyses = [];
    
    this.devices.forEach((device, index) => {
      const intervals = device.beatTimings.map(bt => bt.error);
      if (intervals.length === 0) {
        console.warn(`  No beat timing data for device ${index + 1}`);
        return;
      }
      
      const avgError = intervals.reduce((sum, error) => sum + Math.abs(error), 0) / intervals.length;
      const maxError = Math.max(...intervals.map(Math.abs));
      const excellentBeats = intervals.filter(error => Math.abs(error) < 30).length;
      const goodBeats = intervals.filter(error => Math.abs(error) < 50).length;
      
      const deviceAnalysis = {
        deviceId: index + 1,
        totalBeats: intervals.length,
        averageDeviationMs: avgError,
        maxDeviationMs: maxError,
        excellentBeatsPercentage: (excellentBeats / intervals.length) * 100,
        goodBeatsPercentage: (goodBeats / intervals.length) * 100,
        qualityRating: avgError < 30 ? 'Excellent' : 
                       avgError < 50 ? 'Good' : 
                       avgError < 100 ? 'Acceptable' : 'Poor'
      };
      
      allIntervalErrors.push(...intervals.map(Math.abs));
      deviceAnalyses.push(deviceAnalysis);
      
      console.log(`  Device ${index + 1}: ${deviceAnalysis.averageDeviationMs.toFixed(1)}ms avg, ${deviceAnalysis.qualityRating}`);
    });

    analysis.devicePerformance = deviceAnalyses;

    // Overall sync quality analysis
    if (allIntervalErrors.length > 0) {
      const overallAvgError = allIntervalErrors.reduce((sum, error) => sum + error, 0) / allIntervalErrors.length;
      const overallMaxError = Math.max(...allIntervalErrors);
      const excellentOverall = allIntervalErrors.filter(error => error < 30).length / allIntervalErrors.length;
      const goodOverall = allIntervalErrors.filter(error => error < 50).length / allIntervalErrors.length;
      
      analysis.overallSyncQuality = {
        averageDeviationMs: overallAvgError,
        maxDeviationMs: overallMaxError,
        excellentSyncPercentage: excellentOverall * 100,
        goodSyncPercentage: goodOverall * 100,
        totalMeasurements: allIntervalErrors.length,
        targetMet: overallAvgError < 50,
        qualityRating: overallAvgError < 30 ? 'Excellent' : 
                      overallAvgError < 50 ? 'Good' : 
                      overallAvgError < 100 ? 'Acceptable' : 'Poor'
      };
      
      console.log(`  Overall Sync Quality: ${analysis.overallSyncQuality.qualityRating} (${overallAvgError.toFixed(1)}ms avg)`);
    }

    // Analyze tempo change propagation
    const tempoChangeData = this.measurementData.filter(m => m.type === 'tempo_change');
    if (tempoChangeData.length > 0) {
      const allPropagationTimes = tempoChangeData.flatMap(tc => 
        tc.propagationResults.filter(pr => !pr.timedOut).map(pr => pr.propagationTime)
      );
      
      if (allPropagationTimes.length > 0) {
        const avgPropagation = allPropagationTimes.reduce((sum, time) => sum + time, 0) / allPropagationTimes.length;
        const maxPropagation = Math.max(...allPropagationTimes);
        const fastPropagations = allPropagationTimes.filter(time => time < 200).length / allPropagationTimes.length;
        
        analysis.tempoChangeAnalysis = {
          averagePropagationMs: avgPropagation,
          maxPropagationMs: maxPropagation,
          fastPropagationPercentage: fastPropagations * 100,
          totalTempoChanges: allPropagationTimes.length,
          targetMet: avgPropagation < 200
        };
        
        console.log(`  Tempo Change Propagation: ${avgPropagation.toFixed(1)}ms avg`);
      }
    }

    // Network analysis from latency measurements
    const allLatencies = this.devices.flatMap(device => device.latencyMeasurements.map(lm => lm.rtt));
    if (allLatencies.length > 0) {
      const avgLatency = allLatencies.reduce((sum, rtt) => sum + rtt, 0) / allLatencies.length;
      const maxLatency = Math.max(...allLatencies);
      const jitter = this.calculateJitter(allLatencies);
      
      analysis.networkAnalysis = {
        averageLatencyMs: avgLatency,
        maxLatencyMs: maxLatency,
        jitterMs: jitter,
        totalMeasurements: allLatencies.length
      };
      
      console.log(`  Network: ${avgLatency.toFixed(1)}ms avg latency, ${jitter.toFixed(1)}ms jitter`);
    }

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  calculateJitter(values) {
    if (values.length < 2) return 0;
    
    let jitterSum = 0;
    for (let i = 1; i < values.length; i++) {
      jitterSum += Math.abs(values[i] - values[i-1]);
    }
    
    return jitterSum / (values.length - 1);
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.overallSyncQuality.averageDeviationMs > 50) {
      recommendations.push('🔧 Sync accuracy below target - consider server timing optimizations');
    }
    
    if (analysis.overallSyncQuality.excellentSyncPercentage < 70) {
      recommendations.push('📡 Low excellent sync percentage - check network conditions');
    }
    
    if (analysis.tempoChangeAnalysis.averagePropagationMs > 200) {
      recommendations.push('⚡ Tempo change propagation slow - optimize event handling');
    }
    
    if (analysis.networkAnalysis.averageLatencyMs > 100) {
      recommendations.push('🌐 High network latency detected - consider local testing');
    }
    
    if (analysis.networkAnalysis.jitterMs > 50) {
      recommendations.push('📶 High network jitter - implement adaptive buffering');
    }
    
    if (analysis.devicePerformance.some(dp => dp.qualityRating === 'Poor')) {
      recommendations.push('📱 Some devices showing poor performance - check device capabilities');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ All metrics meeting targets - excellent synchronization quality');
    }
    
    return recommendations;
  }

  async generateDetailedReport(analysis) {
    const reportPath = `/Users/pablogarciapizano/bandsync/test-results/tempo-sync-precision-report-${Date.now()}.json`;
    const reportDir = path.dirname(reportPath);
    
    // Ensure directory exists
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const detailedReport = {
      testMetadata: {
        timestamp: new Date().toISOString(),
        testDurationMs: performance.now() - this.testStartTime,
        deviceCount: this.devices.length,
        serverUrl: SERVER_URL
      },
      results: analysis,
      rawData: {
        measurementData: this.measurementData,
        deviceScrollTickSamples: this.devices.map(device => ({
          deviceId: device.id,
          scrollTickCount: device.scrollTickData.length,
          latencyMeasurements: device.latencyMeasurements.length,
          sampleData: device.scrollTickData.slice(-10) // Last 10 samples
        }))
      }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}`);
    
    return reportPath;
  }

  async cleanup() {
    console.log(`🧹 Cleaning up precision test resources...`);
    
    this.devices.forEach(device => {
      if (device.socket && device.socket.connected) {
        device.socket.disconnect();
      }
    });
    
    this.devices = [];
    this.measurementData = [];
  }
}

// Export for use in test suites
export { PrecisionTempoSyncTest };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new PrecisionTempoSyncTest();
  
  const deviceCount = parseInt(process.argv[2]) || 4;
  const durationSeconds = parseInt(process.argv[3]) || 60;
  
  test.runPrecisionSyncTest(deviceCount, durationSeconds * 1000)
    .then(results => {
      console.log('\n🎯 Precision Test Completed Successfully');
      console.log(`Overall Quality: ${results.overallSyncQuality?.qualityRating || 'Unknown'}`);
      console.log(`Average Deviation: ${(results.overallSyncQuality?.averageDeviationMs || 0).toFixed(1)}ms`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Precision test failed:', error);
      process.exit(1);
    });
}