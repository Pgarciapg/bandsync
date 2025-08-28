/**
 * Real-time Synchronization Accuracy Validation Framework
 * Provides comprehensive tools for measuring and validating synchronization accuracy
 */

import { performance } from 'perf_hooks';

/**
 * High-precision synchronization accuracy validator
 */
export class SyncAccuracyValidator {
  constructor(options = {}) {
    this.targetSyncAccuracy = options.targetSyncAccuracy || 50; // 50ms target
    this.maxAcceptableDrift = options.maxAcceptableDrift || 100; // 100ms max
    this.measurements = [];
    this.realTimeCallbacks = [];
  }

  /**
   * Start a new synchronization measurement session
   */
  startMeasurement(sessionName, expectedInterval = 100) {
    const measurement = {
      sessionName,
      startTime: performance.now(),
      expectedInterval,
      events: [],
      devices: new Map(),
      completed: false,
      
      // Public methods for the measurement
      recordEvent: (deviceId, eventType, data = {}) => {
        const timestamp = performance.now();
        const event = {
          deviceId,
          eventType,
          timestamp,
          relativeTime: timestamp - measurement.startTime,
          data: { ...data }
        };
        
        measurement.events.push(event);
        
        // Update device-specific tracking
        if (!measurement.devices.has(deviceId)) {
          measurement.devices.set(deviceId, {
            deviceId,
            events: [],
            firstEventTime: timestamp,
            lastEventTime: timestamp,
            eventCount: 0
          });
        }
        
        const deviceData = measurement.devices.get(deviceId);
        deviceData.events.push(event);
        deviceData.lastEventTime = timestamp;
        deviceData.eventCount++;
        
        // Real-time analysis callbacks
        this.realTimeCallbacks.forEach(callback => {
          try {
            callback(event, measurement);
          } catch (error) {
            console.warn('Real-time callback error:', error);
          }
        });
      },
      
      complete: () => {
        measurement.completed = true;
        measurement.endTime = performance.now();
        measurement.totalDuration = measurement.endTime - measurement.startTime;
        
        const analysis = this.analyzeMeasurement(measurement);
        this.measurements.push({ ...measurement, analysis });
        
        return analysis;
      }
    };
    
    return measurement;
  }

  /**
   * Add real-time callback for immediate analysis
   */
  addRealTimeCallback(callback) {
    this.realTimeCallbacks.push(callback);
  }

  /**
   * Analyze completed measurement for synchronization accuracy
   */
  analyzeMeasurement(measurement) {
    const devices = Array.from(measurement.devices.values());
    const totalEvents = measurement.events.length;
    
    if (devices.length < 2) {
      return {
        error: 'Insufficient devices for synchronization analysis (minimum 2 required)',
        deviceCount: devices.length
      };
    }

    const analysis = {
      sessionName: measurement.sessionName,
      duration: measurement.totalDuration,
      deviceCount: devices.length,
      totalEvents,
      expectedInterval: measurement.expectedInterval,
      
      // Device-level analysis
      devices: this.analyzeDevices(devices),
      
      // Cross-device synchronization analysis
      synchronization: this.analyzeSynchronization(measurement),
      
      // Timing accuracy analysis
      timing: this.analyzeTimingAccuracy(measurement),
      
      // Performance grading
      grade: null // Will be calculated at the end
    };

    // Calculate overall performance grade
    analysis.grade = this.calculatePerformanceGrade(analysis);
    
    return analysis;
  }

  /**
   * Analyze individual device performance
   */
  analyzeDevices(devices) {
    return devices.map(device => {
      const eventIntervals = [];
      
      for (let i = 1; i < device.events.length; i++) {
        const interval = device.events[i].timestamp - device.events[i - 1].timestamp;
        eventIntervals.push(interval);
      }
      
      const avgInterval = eventIntervals.length > 0 
        ? eventIntervals.reduce((a, b) => a + b) / eventIntervals.length 
        : 0;
      
      const intervalDeviations = eventIntervals.map(i => Math.abs(i - 100)); // Expected 100ms
      const maxDeviation = intervalDeviations.length > 0 ? Math.max(...intervalDeviations) : 0;
      const avgDeviation = intervalDeviations.length > 0 
        ? intervalDeviations.reduce((a, b) => a + b) / intervalDeviations.length 
        : 0;

      return {
        deviceId: device.deviceId,
        eventCount: device.eventCount,
        avgInterval,
        maxDeviation,
        avgDeviation,
        consistency: this.gradeConsistency(maxDeviation, avgDeviation),
        reliability: device.eventCount > 0 ? 1.0 : 0.0
      };
    });
  }

  /**
   * Analyze cross-device synchronization
   */
  analyzeSynchronization(measurement) {
    const devices = Array.from(measurement.devices.values());
    const syncEvents = this.alignEventsByType(devices, 'scroll_tick');
    
    if (syncEvents.length === 0) {
      return {
        error: 'No synchronizable events found',
        alignedEvents: 0
      };
    }

    const syncAccuracyMeasurements = [];
    const positionAccuracy = [];
    
    // Analyze each synchronized event group
    syncEvents.forEach((eventGroup, index) => {
      if (eventGroup.length < 2) return; // Need at least 2 devices
      
      // Time synchronization analysis
      const timestamps = eventGroup.map(e => e.timestamp);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const timeSpread = maxTime - minTime;
      
      syncAccuracyMeasurements.push(timeSpread);
      
      // Position synchronization analysis
      const positions = eventGroup.map(e => e.data.position || 0);
      const uniquePositions = [...new Set(positions)];
      const positionSync = uniquePositions.length === 1;
      
      positionAccuracy.push({
        index,
        positionSync,
        positions,
        timeSpread
      });
    });

    const avgSyncAccuracy = syncAccuracyMeasurements.length > 0
      ? syncAccuracyMeasurements.reduce((a, b) => a + b) / syncAccuracyMeasurements.length
      : Infinity;
    
    const maxSyncDrift = syncAccuracyMeasurements.length > 0
      ? Math.max(...syncAccuracyMeasurements)
      : Infinity;

    const positionSyncRate = positionAccuracy.length > 0
      ? positionAccuracy.filter(p => p.positionSync).length / positionAccuracy.length
      : 0;

    return {
      alignedEvents: syncEvents.length,
      avgSyncAccuracy,
      maxSyncDrift,
      positionSyncRate,
      syncGrade: this.gradeSynchronization(avgSyncAccuracy, maxSyncDrift),
      meetsTarget: avgSyncAccuracy <= this.targetSyncAccuracy && maxSyncDrift <= this.maxAcceptableDrift,
      details: positionAccuracy.slice(0, 10) // First 10 for debugging
    };
  }

  /**
   * Analyze timing accuracy across all devices
   */
  analyzeTimingAccuracy(measurement) {
    const allEvents = measurement.events.filter(e => e.eventType === 'scroll_tick');
    
    if (allEvents.length < 10) {
      return {
        error: 'Insufficient events for timing analysis',
        eventCount: allEvents.length
      };
    }

    // Sort events by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    // Analyze overall timing consistency
    const intervals = [];
    for (let i = 1; i < allEvents.length; i++) {
      // Only compare events from the same device for interval accuracy
      if (allEvents[i].deviceId === allEvents[i - 1].deviceId) {
        intervals.push(allEvents[i].timestamp - allEvents[i - 1].timestamp);
      }
    }

    if (intervals.length === 0) {
      return {
        error: 'No valid intervals found for timing analysis',
        intervalCount: 0
      };
    }

    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const intervalDeviations = intervals.map(i => Math.abs(i - measurement.expectedInterval));
    const maxTimingError = Math.max(...intervalDeviations);
    const avgTimingError = intervalDeviations.reduce((a, b) => a + b) / intervalDeviations.length;
    
    // Calculate timing stability (coefficient of variation)
    const stdDev = Math.sqrt(intervalDeviations.reduce((sum, dev) => sum + dev * dev, 0) / intervalDeviations.length);
    const stability = stdDev / avgInterval;

    return {
      expectedInterval: measurement.expectedInterval,
      actualAvgInterval: avgInterval,
      maxTimingError,
      avgTimingError,
      stability,
      timingGrade: this.gradeTimingAccuracy(maxTimingError, avgTimingError),
      intervalCount: intervals.length
    };
  }

  /**
   * Align events by type across devices for synchronization analysis
   */
  alignEventsByType(devices, eventType) {
    // Get all events of the specified type from all devices
    const deviceEvents = devices.map(device => ({
      deviceId: device.deviceId,
      events: device.events.filter(e => e.eventType === eventType)
    }));

    // Find the minimum number of events across all devices
    const minEventCount = Math.min(...deviceEvents.map(d => d.events.length));
    
    const alignedGroups = [];
    
    // Create aligned groups of events (assuming they correspond by index)
    for (let i = 0; i < minEventCount; i++) {
      const eventGroup = deviceEvents.map(d => d.events[i]).filter(Boolean);
      if (eventGroup.length >= 2) { // Need at least 2 devices for sync analysis
        alignedGroups.push(eventGroup);
      }
    }

    return alignedGroups;
  }

  /**
   * Grade synchronization performance
   */
  gradeSynchronization(avgAccuracy, maxDrift) {
    if (avgAccuracy <= 25 && maxDrift <= 50) return 'A+'; // Excellent
    if (avgAccuracy <= 50 && maxDrift <= 100) return 'A';  // Very good
    if (avgAccuracy <= 75 && maxDrift <= 150) return 'B';  // Good
    if (avgAccuracy <= 100 && maxDrift <= 200) return 'C'; // Acceptable
    if (avgAccuracy <= 150 && maxDrift <= 300) return 'D'; // Poor
    return 'F'; // Unacceptable
  }

  /**
   * Grade timing accuracy
   */
  gradeTimingAccuracy(maxError, avgError) {
    if (maxError <= 10 && avgError <= 5) return 'A+';  // Excellent precision
    if (maxError <= 25 && avgError <= 10) return 'A';  // Very good precision
    if (maxError <= 50 && avgError <= 20) return 'B';  // Good precision
    if (maxError <= 75 && avgError <= 30) return 'C';  // Acceptable precision
    if (maxError <= 100 && avgError <= 50) return 'D'; // Poor precision
    return 'F'; // Unacceptable precision
  }

  /**
   * Grade consistency based on deviations
   */
  gradeConsistency(maxDeviation, avgDeviation) {
    if (maxDeviation <= 25 && avgDeviation <= 10) return 'Excellent';
    if (maxDeviation <= 50 && avgDeviation <= 20) return 'Good';
    if (maxDeviation <= 100 && avgDeviation <= 35) return 'Fair';
    return 'Poor';
  }

  /**
   * Calculate overall performance grade
   */
  calculatePerformanceGrade(analysis) {
    const grades = {
      'A+': 4.3, 'A': 4.0, 'B+': 3.3, 'B': 3.0, 'C+': 2.3, 'C': 2.0, 'D': 1.0, 'F': 0.0
    };

    const components = [];
    
    // Synchronization grade (40% weight)
    if (analysis.synchronization.syncGrade) {
      components.push({ grade: analysis.synchronization.syncGrade, weight: 0.4 });
    }
    
    // Timing grade (30% weight)
    if (analysis.timing.timingGrade) {
      components.push({ grade: analysis.timing.timingGrade, weight: 0.3 });
    }
    
    // Device consistency (30% weight)
    if (analysis.devices.length > 0) {
      const deviceGrades = analysis.devices.map(d => d.consistency);
      const avgDeviceGrade = this.averageConsistencyGrades(deviceGrades);
      const deviceGradeValue = this.consistencyToGradeValue(avgDeviceGrade);
      components.push({ grade: this.gradeValueToLetter(deviceGradeValue), weight: 0.3 });
    }

    if (components.length === 0) {
      return 'N/A';
    }

    // Calculate weighted average
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const weightedSum = components.reduce((sum, c) => {
      const gradeValue = grades[c.grade] || 0;
      return sum + (gradeValue * c.weight);
    }, 0);

    const avgGradeValue = weightedSum / totalWeight;
    
    return this.gradeValueToLetter(avgGradeValue);
  }

  /**
   * Helper methods for grade calculations
   */
  averageConsistencyGrades(grades) {
    const values = { 'Excellent': 4, 'Good': 3, 'Fair': 2, 'Poor': 1 };
    const avgValue = grades.reduce((sum, grade) => sum + (values[grade] || 0), 0) / grades.length;
    
    if (avgValue >= 3.5) return 'Excellent';
    if (avgValue >= 2.5) return 'Good';
    if (avgValue >= 1.5) return 'Fair';
    return 'Poor';
  }

  consistencyToGradeValue(consistency) {
    const mapping = { 'Excellent': 4.0, 'Good': 3.0, 'Fair': 2.0, 'Poor': 1.0 };
    return mapping[consistency] || 0;
  }

  gradeValueToLetter(value) {
    if (value >= 4.0) return 'A+';
    if (value >= 3.7) return 'A';
    if (value >= 3.3) return 'B+';
    if (value >= 3.0) return 'B';
    if (value >= 2.7) return 'C+';
    if (value >= 2.0) return 'C';
    if (value >= 1.0) return 'D';
    return 'F';
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    if (this.measurements.length === 0) {
      return {
        error: 'No measurements to report',
        measurementCount: 0
      };
    }

    const summary = this.calculateSummaryStatistics();
    const trends = this.analyzeTrends();
    const recommendations = this.generateRecommendations(summary);

    return {
      summary,
      trends,
      recommendations,
      measurements: this.measurements.map(m => ({
        sessionName: m.sessionName,
        duration: m.totalDuration,
        deviceCount: m.analysis.deviceCount,
        grade: m.analysis.grade,
        syncAccuracy: m.analysis.synchronization.avgSyncAccuracy,
        maxDrift: m.analysis.synchronization.maxSyncDrift
      })),
      totalMeasurements: this.measurements.length
    };
  }

  /**
   * Calculate summary statistics across all measurements
   */
  calculateSummaryStatistics() {
    const validMeasurements = this.measurements.filter(m => m.analysis && !m.analysis.error);
    
    if (validMeasurements.length === 0) {
      return { error: 'No valid measurements for summary' };
    }

    const syncAccuracies = validMeasurements
      .map(m => m.analysis.synchronization.avgSyncAccuracy)
      .filter(a => a !== Infinity);

    const maxDrifts = validMeasurements
      .map(m => m.analysis.synchronization.maxSyncDrift)
      .filter(d => d !== Infinity);

    const grades = validMeasurements.map(m => m.analysis.grade);

    return {
      totalMeasurements: validMeasurements.length,
      avgSyncAccuracy: syncAccuracies.length > 0 
        ? syncAccuracies.reduce((a, b) => a + b) / syncAccuracies.length 
        : null,
      avgMaxDrift: maxDrifts.length > 0 
        ? maxDrifts.reduce((a, b) => a + b) / maxDrifts.length 
        : null,
      bestSyncAccuracy: syncAccuracies.length > 0 ? Math.min(...syncAccuracies) : null,
      worstMaxDrift: maxDrifts.length > 0 ? Math.max(...maxDrifts) : null,
      gradeDistribution: this.calculateGradeDistribution(grades),
      overallGrade: this.calculateOverallGrade(grades),
      meetsTargetRate: validMeasurements.filter(m => m.analysis.synchronization.meetsTarget).length / validMeasurements.length
    };
  }

  /**
   * Analyze trends across measurements
   */
  analyzeTrends() {
    if (this.measurements.length < 3) {
      return { error: 'Insufficient data for trend analysis' };
    }

    const validMeasurements = this.measurements.filter(m => m.analysis && !m.analysis.error);
    
    // Calculate trends in sync accuracy over time
    const syncAccuracies = validMeasurements
      .map(m => m.analysis.synchronization.avgSyncAccuracy)
      .filter(a => a !== Infinity);

    const trend = this.calculateTrend(syncAccuracies);

    return {
      syncAccuracyTrend: trend,
      improving: trend < -1, // Decreasing accuracy values mean improvement
      degrading: trend > 1   // Increasing accuracy values mean degradation
    };
  }

  /**
   * Calculate simple linear trend
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b);
    const sumY = values.reduce((a, b) => a + b);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(summary) {
    const recommendations = [];

    if (summary.avgSyncAccuracy > this.targetSyncAccuracy) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        issue: 'Sync accuracy below target',
        recommendation: `Current average sync accuracy is ${summary.avgSyncAccuracy.toFixed(1)}ms, target is ${this.targetSyncAccuracy}ms. Consider optimizing server processing or reducing network latency.`,
        targetMetric: 'avgSyncAccuracy',
        currentValue: summary.avgSyncAccuracy,
        targetValue: this.targetSyncAccuracy
      });
    }

    if (summary.avgMaxDrift > this.maxAcceptableDrift) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        issue: 'Maximum drift exceeds threshold',
        recommendation: `Maximum sync drift is ${summary.avgMaxDrift.toFixed(1)}ms, acceptable limit is ${this.maxAcceptableDrift}ms. Check for network instability or server overload.`,
        targetMetric: 'maxDrift',
        currentValue: summary.avgMaxDrift,
        targetValue: this.maxAcceptableDrift
      });
    }

    if (summary.meetsTargetRate < 0.8) {
      recommendations.push({
        type: 'consistency',
        priority: 'medium',
        issue: 'Low target achievement rate',
        recommendation: `Only ${(summary.meetsTargetRate * 100).toFixed(1)}% of sessions meet sync targets. Consider implementing adaptive synchronization strategies.`,
        targetMetric: 'meetsTargetRate',
        currentValue: summary.meetsTargetRate,
        targetValue: 0.9
      });
    }

    return recommendations;
  }

  calculateGradeDistribution(grades) {
    return grades.reduce((dist, grade) => {
      dist[grade] = (dist[grade] || 0) + 1;
      return dist;
    }, {});
  }

  calculateOverallGrade(grades) {
    if (grades.length === 0) return 'N/A';
    
    const gradeValues = {
      'A+': 4.3, 'A': 4.0, 'B+': 3.3, 'B': 3.0, 'C+': 2.3, 'C': 2.0, 'D': 1.0, 'F': 0.0
    };
    
    const avgValue = grades.reduce((sum, grade) => sum + (gradeValues[grade] || 0), 0) / grades.length;
    return this.gradeValueToLetter(avgValue);
  }
}

/**
 * Real-time synchronization monitor
 */
export class RealTimeSyncMonitor {
  constructor(validator, options = {}) {
    this.validator = validator;
    this.alertThresholds = {
      syncDriftWarning: options.syncDriftWarning || 75,
      syncDriftCritical: options.syncDriftCritical || 150,
      timingErrorWarning: options.timingErrorWarning || 30,
      timingErrorCritical: options.timingErrorCritical || 75
    };
    this.alerts = [];
    this.isMonitoring = false;
    
    // Add real-time callback to validator
    this.validator.addRealTimeCallback((event, measurement) => {
      if (this.isMonitoring) {
        this.processRealTimeEvent(event, measurement);
      }
    });
  }

  startMonitoring() {
    this.isMonitoring = true;
    this.alerts = [];
    console.log('[SyncMonitor] Real-time monitoring started');
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('[SyncMonitor] Real-time monitoring stopped');
  }

  processRealTimeEvent(event, measurement) {
    // Check for synchronization issues in real-time
    if (event.eventType === 'scroll_tick') {
      this.checkSyncDrift(event, measurement);
      this.checkTimingAccuracy(event, measurement);
    }
  }

  checkSyncDrift(event, measurement) {
    const devices = Array.from(measurement.devices.values());
    
    if (devices.length < 2) return;

    // Find concurrent events from other devices
    const timeWindow = 50; // 50ms window for considering events concurrent
    const concurrentEvents = measurement.events.filter(e => 
      e.eventType === 'scroll_tick' && 
      e.deviceId !== event.deviceId &&
      Math.abs(e.timestamp - event.timestamp) <= timeWindow
    );

    if (concurrentEvents.length > 0) {
      const timestamps = [event.timestamp, ...concurrentEvents.map(e => e.timestamp)];
      const drift = Math.max(...timestamps) - Math.min(...timestamps);

      if (drift >= this.alertThresholds.syncDriftCritical) {
        this.addAlert('critical', 'sync_drift', `Critical sync drift detected: ${drift.toFixed(1)}ms`, { drift, event });
      } else if (drift >= this.alertThresholds.syncDriftWarning) {
        this.addAlert('warning', 'sync_drift', `High sync drift detected: ${drift.toFixed(1)}ms`, { drift, event });
      }
    }
  }

  checkTimingAccuracy(event, measurement) {
    const deviceData = measurement.devices.get(event.deviceId);
    
    if (deviceData.events.length >= 2) {
      const lastEvent = deviceData.events[deviceData.events.length - 2];
      const interval = event.timestamp - lastEvent.timestamp;
      const expectedInterval = measurement.expectedInterval || 100;
      const timingError = Math.abs(interval - expectedInterval);

      if (timingError >= this.alertThresholds.timingErrorCritical) {
        this.addAlert('critical', 'timing_error', `Critical timing error: ${timingError.toFixed(1)}ms deviation`, { timingError, interval, event });
      } else if (timingError >= this.alertThresholds.timingErrorWarning) {
        this.addAlert('warning', 'timing_error', `High timing error: ${timingError.toFixed(1)}ms deviation`, { timingError, interval, event });
      }
    }
  }

  addAlert(level, type, message, data = {}) {
    const alert = {
      timestamp: performance.now(),
      level,
      type,
      message,
      data
    };
    
    this.alerts.push(alert);
    console.log(`[SyncMonitor ${level.toUpperCase()}] ${message}`);
    
    // Limit alert history
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  getAlerts(level = null) {
    if (level) {
      return this.alerts.filter(alert => alert.level === level);
    }
    return [...this.alerts];
  }

  clearAlerts() {
    this.alerts = [];
  }

  generateAlertSummary() {
    const summary = {
      total: this.alerts.length,
      critical: this.alerts.filter(a => a.level === 'critical').length,
      warning: this.alerts.filter(a => a.level === 'warning').length,
      byType: {}
    };

    this.alerts.forEach(alert => {
      summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
    });

    return summary;
  }
}