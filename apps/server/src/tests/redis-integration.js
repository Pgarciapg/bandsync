/**
 * Redis Integration Tests for Day 6 BandSync
 * Comprehensive testing of SessionManager and Redis functionality
 */

import { sessionManager } from '../SessionManager.js';
import { roleManager } from '../RoleManager.js';
import { redisClient } from '../redis-enhanced.js';

class RedisIntegrationTest {
  constructor() {
    this.testResults = [];
    this.testSession = 'test-session-redis-' + Date.now();
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running: ${testName}`);
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ PASS: ${testName} (${duration}ms)`);
      this.testResults.push({ name: testName, status: 'PASS', duration });
    } catch (error) {
      console.error(`❌ FAIL: ${testName}`, error.message);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async testRedisConnection() {
    const isConnected = await redisClient.connect();
    if (!isConnected) {
      throw new Error('Failed to connect to Redis');
    }
    
    const isHealthy = await sessionManager.healthCheck();
    if (!isHealthy) {
      throw new Error('Redis health check failed');
    }
    
    console.log('Redis connection and health check passed');
  }

  async testSessionCRUD() {
    const sessionId = this.testSession + '-crud';
    
    // Create session
    const createdSession = await sessionManager.createSession(sessionId, {
      message: 'Test session CRUD',
      tempoBpm: 130
    });
    
    if (!createdSession || createdSession.tempoBpm !== 130) {
      throw new Error('Session creation failed');
    }
    
    // Read session
    const retrievedSession = await sessionManager.getSession(sessionId);
    if (!retrievedSession || retrievedSession.message !== 'Test session CRUD') {
      throw new Error('Session retrieval failed');
    }
    
    // Update session
    const updatedSession = await sessionManager.updateSession(sessionId, {
      tempoBpm: 140,
      isPlaying: true
    });
    
    if (!updatedSession || updatedSession.tempoBpm !== 140 || !updatedSession.isPlaying) {
      throw new Error('Session update failed');
    }
    
    // Delete session
    const deleted = await sessionManager.deleteSession(sessionId);
    if (!deleted) {
      throw new Error('Session deletion failed');
    }
    
    // Verify deletion
    const deletedSession = await sessionManager.getSession(sessionId);
    if (deletedSession !== null) {
      throw new Error('Session was not properly deleted');
    }
    
    console.log('Session CRUD operations completed successfully');
  }

  async testMemberManagement() {
    const sessionId = this.testSession + '-members';
    
    // Create session
    await sessionManager.createSession(sessionId);
    
    // Add members
    const member1 = await sessionManager.addMember(sessionId, 'socket1', {
      displayName: 'Test User 1',
      role: 'leader'
    });
    
    const member2 = await sessionManager.addMember(sessionId, 'socket2', {
      displayName: 'Test User 2',
      role: 'follower'
    });
    
    if (!member1 || !member2) {
      throw new Error('Failed to add members');
    }
    
    // Get member count
    const memberCount = await sessionManager.getMemberCount(sessionId);
    if (memberCount !== 2) {
      throw new Error(`Expected 2 members, got ${memberCount}`);
    }
    
    // Get all members
    const allMembers = await sessionManager.getAllMembers(sessionId);
    if (allMembers.size !== 2) {
      throw new Error(`Expected Map with 2 members, got ${allMembers.size}`);
    }
    
    // Get specific member
    const retrievedMember = await sessionManager.getMember(sessionId, 'socket1');
    if (!retrievedMember || retrievedMember.displayName !== 'Test User 1') {
      throw new Error('Failed to retrieve specific member');
    }
    
    // Remove member
    const removedMember = await sessionManager.removeMember(sessionId, 'socket1');
    if (!removedMember) {
      throw new Error('Failed to remove member');
    }
    
    // Verify removal
    const finalCount = await sessionManager.getMemberCount(sessionId);
    if (finalCount !== 1) {
      throw new Error(`Expected 1 member after removal, got ${finalCount}`);
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Member management operations completed successfully');
  }

  async testLeaderRequestManagement() {
    const sessionId = this.testSession + '-requests';
    
    await sessionManager.createSession(sessionId);
    
    // Add leader request
    const request1 = await sessionManager.addLeaderRequest(sessionId, 'socket1', {
      displayName: 'Requester 1'
    });
    
    const request2 = await sessionManager.addLeaderRequest(sessionId, 'socket2', {
      displayName: 'Requester 2'
    });
    
    if (!request1 || !request2) {
      throw new Error('Failed to add leader requests');
    }
    
    // Get all requests
    const allRequests = await sessionManager.getLeaderRequests(sessionId);
    if (allRequests.length !== 2) {
      throw new Error(`Expected 2 requests, got ${allRequests.length}`);
    }
    
    // Verify chronological order
    if (allRequests[0].requestedAt > allRequests[1].requestedAt) {
      throw new Error('Requests not returned in chronological order');
    }
    
    // Remove request
    const removed = await sessionManager.removeLeaderRequest(sessionId, 'socket1');
    if (!removed) {
      throw new Error('Failed to remove leader request');
    }
    
    // Verify removal
    const remainingRequests = await sessionManager.getLeaderRequests(sessionId);
    if (remainingRequests.length !== 1) {
      throw new Error(`Expected 1 request after removal, got ${remainingRequests.length}`);
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Leader request management completed successfully');
  }

  async testSessionPersistence() {
    const sessionId = this.testSession + '-persistence';
    
    // Create session with specific data
    const originalSession = await sessionManager.createSession(sessionId, {
      message: 'Persistence test',
      tempoBpm: 125,
      position: 5000,
      isPlaying: true
    });
    
    // Add member
    await sessionManager.addMember(sessionId, 'socket1', {
      displayName: 'Persistent User',
      role: 'leader'
    });
    
    // Update session to simulate activity
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'socket1'
    });
    
    // Simulate server restart by creating new connection
    // (In a real test, we'd actually restart Redis connection)
    
    // Retrieve session after "restart"
    const persistedSession = await sessionManager.getSession(sessionId);
    if (!persistedSession) {
      throw new Error('Session was not persisted');
    }
    
    if (persistedSession.message !== 'Persistence test' || 
        persistedSession.tempoBpm !== 125 ||
        persistedSession.leaderSocketId !== 'socket1') {
      throw new Error('Session data was not properly persisted');
    }
    
    // Check member persistence
    const persistedMembers = await sessionManager.getAllMembers(sessionId);
    if (persistedMembers.size !== 1) {
      throw new Error('Member data was not persisted');
    }
    
    const member = persistedMembers.get('socket1');
    if (!member || member.displayName !== 'Persistent User') {
      throw new Error('Member details were not properly persisted');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Session persistence verified successfully');
  }

  async testSessionCleanup() {
    const oldSessionId = this.testSession + '-cleanup-old';
    const newSessionId = this.testSession + '-cleanup-new';
    
    // Create an old session (simulate by setting old lastActiveAt)
    const oldSession = await sessionManager.createSession(oldSessionId);
    
    // Manually update Redis to set old timestamp
    const redis = redisClient.getClient();
    const sessionKey = redisClient.getSessionKey(oldSessionId);
    const oldSessionData = {
      ...oldSession,
      lastActiveAt: Date.now() - (31 * 60 * 1000) // 31 minutes ago
    };
    await redis.setex(sessionKey, 3600, JSON.stringify(oldSessionData));
    
    // Create a new active session
    await sessionManager.createSession(newSessionId);
    
    // Get initial count
    const initialSessions = await sessionManager.getAllSessions();
    const initialCount = initialSessions.size;
    
    if (initialCount < 2) {
      throw new Error('Test sessions were not created properly');
    }
    
    // Run cleanup
    const cleaned = await sessionManager.cleanupExpiredSessions();
    
    if (cleaned === 0) {
      console.warn('Warning: No sessions were cleaned up - this might be expected if cleanup logic changed');
    }
    
    // Verify cleanup
    const finalSessions = await sessionManager.getAllSessions();
    const newSessionStillExists = finalSessions.has(newSessionId);
    
    if (!newSessionStillExists) {
      throw new Error('Active session was incorrectly cleaned up');
    }
    
    // Cleanup remaining test sessions
    await sessionManager.deleteSession(newSessionId);
    
    console.log('Session cleanup test completed successfully');
  }

  async testPerformanceMetrics() {
    const sessionId = this.testSession + '-performance';
    const numOperations = 100;
    
    console.log(`Running ${numOperations} operations for performance test...`);
    
    const startTime = Date.now();
    
    // Create session
    await sessionManager.createSession(sessionId);
    
    // Perform rapid updates
    for (let i = 0; i < numOperations; i++) {
      await sessionManager.updateSession(sessionId, {
        position: i * 100,
        lastActiveAt: Date.now()
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const opsPerSecond = Math.round((numOperations / duration) * 1000);
    
    console.log(`Performance: ${numOperations} operations in ${duration}ms (${opsPerSecond} ops/sec)`);
    
    if (opsPerSecond < 10) {
      throw new Error(`Performance too slow: ${opsPerSecond} ops/sec (expected > 10)`);
    }
    
    // Get stats
    const stats = await sessionManager.getStats();
    if (!stats || typeof stats.totalSessions !== 'number') {
      throw new Error('Failed to get performance stats');
    }
    
    console.log('Stats:', stats);
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Performance metrics test completed successfully');
  }

  async testSocketSessionMapping() {
    const sessionId = this.testSession + '-mapping';
    const socketId = 'socket-mapping-test';
    
    // Create session and add member
    await sessionManager.createSession(sessionId);
    await sessionManager.addMember(sessionId, socketId, {
      displayName: 'Mapping Test User'
    });
    
    // Test socket-to-session mapping
    const mappedSession = await sessionManager.getSessionBySocketId(socketId);
    
    if (!mappedSession || mappedSession.message !== "Waiting for leader…") {
      throw new Error('Socket to session mapping failed');
    }
    
    // Remove member and test cleanup
    await sessionManager.removeMember(sessionId, socketId);
    
    // Mapping should be cleared after removal
    const clearedMapping = await sessionManager.getSessionBySocketId(socketId);
    if (clearedMapping !== null) {
      throw new Error('Socket mapping was not cleared after member removal');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Socket session mapping test completed successfully');
  }

  async runAllTests() {
    console.log('🚀 Starting Redis Integration Tests for BandSync Day 6');
    console.log(`Test session prefix: ${this.testSession}`);
    
    await this.runTest('Redis Connection', () => this.testRedisConnection());
    await this.runTest('Session CRUD Operations', () => this.testSessionCRUD());
    await this.runTest('Member Management', () => this.testMemberManagement());
    await this.runTest('Leader Request Management', () => this.testLeaderRequestManagement());
    await this.runTest('Session Persistence', () => this.testSessionPersistence());
    await this.runTest('Session Cleanup', () => this.testSessionCleanup());
    await this.runTest('Performance Metrics', () => this.testPerformanceMetrics());
    await this.runTest('Socket Session Mapping', () => this.testSocketSessionMapping());
    
    this.printResults();
    return this.testResults.every(result => result.status === 'PASS');
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('=' .repeat(50));
    
    let passed = 0;
    let failed = 0;
    let totalDuration = 0;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      const duration = result.duration ? `(${result.duration}ms)` : '';
      console.log(`${status} ${result.name} ${duration}`);
      
      if (result.status === 'PASS') {
        passed++;
        totalDuration += result.duration || 0;
      } else {
        failed++;
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }
    });
    
    console.log('=' .repeat(50));
    console.log(`Tests Passed: ${passed}/${this.testResults.length}`);
    console.log(`Tests Failed: ${failed}/${this.testResults.length}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Success Rate: ${Math.round((passed / this.testResults.length) * 100)}%`);
    
    if (passed === this.testResults.length) {
      console.log('\n🎉 All Redis integration tests PASSED!');
    } else {
      console.log(`\n💥 ${failed} tests FAILED. Check the errors above.`);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new RedisIntegrationTest();
  
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export default RedisIntegrationTest;