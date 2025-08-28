import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from './logger.js';
import { redisClient } from './redis-client.js';
import { config } from './config.js';

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      socketConnections: 0,
      activeConnections: 0,
      totalMessages: 0,
      messagesPerSecond: 0,
      avgLatency: 0,
      memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
      cpuUsage: { user: 0, system: 0 },
      eventQueue: 0,
      syncLatencies: []
    };
    
    this.lastMessageCount = 0;
    this.lastCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    this.latencyMeasurements = [];
    
    // Start monitoring
    this.startMetricsCollection();
  }

  startMetricsCollection() {
    setInterval(() => {
      this.collectMetrics();
    }, config.performance.metricsInterval);

    // Collect sync latencies every second
    setInterval(() => {
      this.processSyncLatencies();
    }, 1000);
  }

  collectMetrics() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
    };

    // CPU usage
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.metrics.cpuUsage = {
      user: Math.round((cpuUsage.user / 1000000) * 100) / 100, // Convert to seconds
      system: Math.round((cpuUsage.system / 1000000) * 100) / 100
    };
    this.lastCpuUsage = process.cpuUsage();

    // Messages per second
    const currentMessageCount = this.metrics.totalMessages;
    this.metrics.messagesPerSecond = currentMessageCount - this.lastMessageCount;
    this.lastMessageCount = currentMessageCount;

    // Average latency calculation
    if (this.latencyMeasurements.length > 0) {
      const sum = this.latencyMeasurements.reduce((a, b) => a + b, 0);
      this.metrics.avgLatency = Math.round((sum / this.latencyMeasurements.length) * 100) / 100;
    }

    // Store metrics in Redis for historical analysis
    this.storeMetrics();

    // Log metrics
    this.logMetrics();

    // Emit metrics event
    this.emit('metrics', this.metrics);

    // Alert on performance issues
    this.checkPerformanceThresholds();
  }

  async storeMetrics() {
    const timestamp = Date.now();
    const metricsToStore = [
      ['connections', this.metrics.activeConnections],
      ['messages_per_second', this.metrics.messagesPerSecond],
      ['avg_latency', this.metrics.avgLatency],
      ['heap_used', this.metrics.memoryUsage.heapUsed],
      ['cpu_user', this.metrics.cpuUsage.user]
    ];

    for (const [metric, value] of metricsToStore) {
      await redisClient.recordMetric(metric, value, timestamp);
    }
  }

  logMetrics() {
    logger.info({
      connections: this.metrics.activeConnections,
      messagesPerSecond: this.metrics.messagesPerSecond,
      avgLatency: `${this.metrics.avgLatency}ms`,
      memory: `${this.metrics.memoryUsage.heapUsed}MB`,
      cpu: `${this.metrics.cpuUsage.user + this.metrics.cpuUsage.system}s`
    }, 'Performance metrics');
  }

  checkPerformanceThresholds() {
    const warnings = [];

    // High latency warning
    if (this.metrics.avgLatency > config.performance.syncTargetLatency * 2) {
      warnings.push(`High average latency: ${this.metrics.avgLatency}ms`);
    }

    // High memory usage warning
    if (this.metrics.memoryUsage.heapUsed > 500) {
      warnings.push(`High memory usage: ${this.metrics.memoryUsage.heapUsed}MB`);
    }

    // High CPU usage warning
    const totalCpu = this.metrics.cpuUsage.user + this.metrics.cpuUsage.system;
    if (totalCpu > 5) {
      warnings.push(`High CPU usage: ${totalCpu}s`);
    }

    if (warnings.length > 0) {
      logger.warn({ warnings }, 'Performance warnings detected');
      this.emit('performance-warning', warnings);
    }
  }

  // High-precision latency measurement
  measureLatency(startTime) {
    const latency = performance.now() - startTime;
    this.latencyMeasurements.push(latency);
    
    // Keep only last 100 measurements for moving average
    if (this.latencyMeasurements.length > 100) {
      this.latencyMeasurements.shift();
    }

    return latency;
  }

  // Socket event tracking
  trackSocketConnection() {
    this.metrics.socketConnections++;
    this.metrics.activeConnections++;
  }

  trackSocketDisconnection() {
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
  }

  trackMessage() {
    this.metrics.totalMessages++;
  }

  trackSyncLatency(latency) {
    this.metrics.syncLatencies.push({
      latency,
      timestamp: Date.now()
    });
  }

  processSyncLatencies() {
    if (this.metrics.syncLatencies.length === 0) return;

    // Calculate sync latency statistics
    const latencies = this.metrics.syncLatencies.map(item => item.latency);
    const avgSyncLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxSyncLatency = Math.max(...latencies);
    const minSyncLatency = Math.min(...latencies);

    logger.debug({
      avgSyncLatency: `${Math.round(avgSyncLatency * 100) / 100}ms`,
      maxSyncLatency: `${Math.round(maxSyncLatency * 100) / 100}ms`,
      minSyncLatency: `${Math.round(minSyncLatency * 100) / 100}ms`,
      syncCount: latencies.length
    }, 'Sync latency statistics');

    // Clear processed latencies
    this.metrics.syncLatencies = [];
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime
    };
  }

  async getHistoricalMetrics(metricName, limit = 100) {
    return await redisClient.getMetrics(metricName, limit);
  }
}

export const performanceMonitor = new PerformanceMonitor();