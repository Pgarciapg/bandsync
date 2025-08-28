#!/usr/bin/env node

/**
 * Quick Synchronization Test
 * Rapid validation of sync accuracy for development workflow
 */

import Client from 'socket.io-client';
import { spawn } from 'child_process';
import { SyncAccuracyValidator, RealTimeSyncMonitor } from '../utils/sync-validator.js';

const SERVER_PORT = 3010;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

class QuickSyncTest {
  constructor() {
    this.validator = new SyncAccuracyValidator({
      targetSyncAccuracy: 50,
      maxAcceptableDrift: 100
    });
    this.monitor = new RealTimeSyncMonitor(this.validator);
    this.serverProcess = null;
  }

  async run() {
    console.log('🔄 Quick Synchronization Test');
    console.log('============================');
    console.log('Testing 2-device sync accuracy...\n');

    try {
      // Start server
      await this.startTestServer();
      
      // Run quick sync test
      const result = await this.runSyncTest();
      
      // Report results
      this.reportResults(result);
      
      return result.grade !== 'F';
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async startTestServer() {
    console.log('🚀 Starting test server...');
    
    this.serverProcess = spawn('node', ['apps/server/server.js'], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);

      const checkConnection = async () => {
        try {
          const testClient = new Client(SERVER_URL, { transports: ['websocket'] });
          testClient.on('connect', () => {
            testClient.disconnect();
            clearTimeout(timeout);
            resolve();
          });
          testClient.on('connect_error', () => {
            setTimeout(checkConnection, 500);
          });
        } catch {
          setTimeout(checkConnection, 500);
        }
      };

      setTimeout(checkConnection, 1000);
    });

    console.log('✅ Server started successfully');
  }

  async runSyncTest() {
    const sessionId = `quick-test-${Date.now()}`;
    const measurement = this.validator.startMeasurement('QuickSyncTest', 100);
    
    console.log('📱 Creating test devices...');
    
    // Create two test clients
    const clients = await Promise.all([
      this.createClient('leader'),
      this.createClient('follower')
    ]);

    const [leader, follower] = clients;

    try {
      // Join session
      await Promise.all(clients.map(client => {
        return new Promise(resolve => {
          client.emit('join_session', { sessionId });
          client.once('snapshot', resolve);
        });
      }));

      console.log('👑 Setting up leader...');
      
      // Set leader
      leader.emit('set_role', { sessionId, role: 'leader' });
      await new Promise(resolve => {
        leader.on('snapshot', (data) => {
          if (data.leaderSocketId === leader.id) {
            measurement.recordEvent('leader', 'role_set');
            resolve();
          }
        });
      });

      // Start monitoring
      this.monitor.startMonitoring();

      console.log('🎵 Starting synchronization test...');
      
      // Setup event tracking
      clients.forEach((client, index) => {
        const deviceId = index === 0 ? 'leader' : 'follower';
        client.on('scroll_tick', (data) => {
          measurement.recordEvent(deviceId, 'scroll_tick', { position: data.positionMs });
        });
      });

      // Start playback
      leader.emit('play', { sessionId });
      measurement.recordEvent('leader', 'play_start');

      // Collect sync data for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Stop playback
      leader.emit('pause', { sessionId });
      measurement.recordEvent('leader', 'play_stop');
      
      this.monitor.stopMonitoring();

      console.log('📊 Analyzing results...');
      
      const analysis = measurement.complete();
      const alerts = this.monitor.generateAlertSummary();

      return {
        ...analysis,
        alerts,
        realTimeIssues: alerts.critical + alerts.warning
      };

    } finally {
      // Cleanup clients
      clients.forEach(client => {
        if (client.connected) {
          client.disconnect();
        }
      });
    }
  }

  async createClient(deviceId) {
    const client = new Client(SERVER_URL, { transports: ['websocket'] });
    
    await new Promise(resolve => {
      client.on('connect', resolve);
    });

    return client;
  }

  reportResults(result) {
    console.log('\n📋 QUICK SYNC TEST RESULTS');
    console.log('==========================');
    
    if (result.error) {
      console.log('❌ Test Error:', result.error);
      return;
    }

    const { synchronization, timing, grade, alerts } = result;
    
    // Sync accuracy results
    console.log(`🎯 Sync Accuracy: ${synchronization.avgSyncAccuracy?.toFixed(1) || 'N/A'}ms avg`);
    console.log(`📏 Max Drift: ${synchronization.maxSyncDrift?.toFixed(1) || 'N/A'}ms`);
    console.log(`⏱️  Timing Grade: ${timing?.timingGrade || 'N/A'}`);
    console.log(`📊 Overall Grade: ${grade}`);
    
    // Targets validation
    const syncTarget = synchronization.avgSyncAccuracy <= 50;
    const driftTarget = synchronization.maxSyncDrift <= 100;
    
    console.log('\n🎯 TARGET VALIDATION');
    console.log(`${syncTarget ? '✅' : '❌'} Sync accuracy under 50ms: ${syncTarget}`);
    console.log(`${driftTarget ? '✅' : '❌'} Max drift under 100ms: ${driftTarget}`);
    console.log(`${syncTarget && driftTarget ? '✅' : '❌'} Overall sync requirements: ${syncTarget && driftTarget ? 'PASSED' : 'FAILED'}`);

    // Real-time issues
    if (result.realTimeIssues > 0) {
      console.log(`\n⚠️  Real-time Issues: ${alerts.critical} critical, ${alerts.warning} warnings`);
    } else {
      console.log('\n✅ No real-time sync issues detected');
    }

    // Final verdict
    console.log('\n🏆 FINAL VERDICT');
    if (grade === 'A' || grade === 'A+') {
      console.log('🌟 EXCELLENT - Sync performance exceeds expectations');
    } else if (grade === 'B') {
      console.log('✅ GOOD - Sync performance meets requirements');
    } else if (grade === 'C') {
      console.log('⚠️  ACCEPTABLE - Sync performance is marginal');
    } else if (grade === 'D') {
      console.log('🔸 POOR - Sync performance needs improvement');
    } else {
      console.log('❌ FAILED - Sync performance unacceptable');
    }

    // Development recommendations
    if (grade === 'D' || grade === 'F') {
      console.log('\n🔧 RECOMMENDATIONS:');
      console.log('• Check server processing times');
      console.log('• Verify network conditions');
      console.log('• Review Socket.IO configuration');
      console.log('• Consider optimizing scroll tick intervals');
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.serverProcess) {
      this.serverProcess.kill();
      await new Promise(resolve => {
        this.serverProcess.on('close', resolve);
        setTimeout(resolve, 2000);
      });
    }
    
    console.log('✅ Cleanup complete');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const quickTest = new QuickSyncTest();
  
  quickTest.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}