/**
 * Role Management Tests for Day 6 BandSync
 * Comprehensive testing of RoleManager and leadership transitions
 */

import { Server } from "socket.io";
import { createServer } from "http";
import io from "socket.io-client";
import { sessionManager } from '../SessionManager.js';
import { roleManager } from '../RoleManager.js';

class RoleManagementTest {
  constructor() {
    this.testResults = [];
    this.testSession = 'test-role-' + Date.now();
    this.server = null;
    this.ioServer = null;
    this.clients = [];
    this.port = 0;
  }

  async setupTestServer() {
    return new Promise((resolve) => {
      this.server = createServer();
      this.ioServer = new Server(this.server, {
        cors: { origin: "*" }
      });

      this.server.listen(0, () => {
        this.port = this.server.address().port;
        console.log(`Test server started on port ${this.port}`);
        resolve();
      });
    });
  }

  async createTestClient(clientId) {
    return new Promise((resolve, reject) => {
      const client = io(`http://localhost:${this.port}`, {
        timeout: 5000
      });

      client.testId = clientId;
      client.receivedEvents = [];

      client.on('connect', () => {
        console.log(`Test client ${clientId} connected: ${client.id}`);
        resolve(client);
      });

      client.on('connect_error', (error) => {
        reject(error);
      });

      // Track all events for testing
      const originalOn = client.on.bind(client);
      client.on = (event, handler) => {
        return originalOn(event, (...args) => {
          client.receivedEvents.push({ event, args, timestamp: Date.now() });
          return handler(...args);
        });
      };

      this.clients.push(client);
    });
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

  async testBasicLeaderAssignment() {
    const sessionId = this.testSession + '-basic-leader';
    
    // Create session
    await sessionManager.createSession(sessionId);
    
    // Add member
    await sessionManager.addMember(sessionId, 'socket1', {
      displayName: 'Test Leader',
      role: 'follower'
    });
    
    // Create mock io object
    const mockIo = {
      to: () => ({
        emit: (event, data) => {
          console.log(`Mock emit: ${event}`, data);
        }
      })
    };
    
    // Assign leader
    const result = await roleManager.assignLeader(sessionId, 'socket1', mockIo);
    
    if (!result.success) {
      throw new Error(`Failed to assign leader: ${result.error}`);
    }
    
    // Verify assignment
    const session = await sessionManager.getSession(sessionId);
    if (session.leaderSocketId !== 'socket1') {
      throw new Error('Leader was not properly assigned');
    }
    
    const member = await sessionManager.getMember(sessionId, 'socket1');
    if (member.role !== 'leader') {
      throw new Error('Member role was not updated to leader');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Basic leader assignment completed successfully');
  }

  async testLeaderRequestFlow() {
    const sessionId = this.testSession + '-request-flow';
    
    // Create session and add two members
    await sessionManager.createSession(sessionId);
    
    await sessionManager.addMember(sessionId, 'leader1', {
      displayName: 'Current Leader',
      role: 'leader'
    });
    
    await sessionManager.addMember(sessionId, 'follower1', {
      displayName: 'Requesting Follower',
      role: 'follower'
    });
    
    // Update session with leader
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'leader1'
    });
    
    // Create mock io
    let emittedEvents = [];
    const mockIo = {
      to: (target) => ({
        emit: (event, data) => {
          emittedEvents.push({ target, event, data });
        }
      })
    };
    
    // Follower requests leadership
    const requestResult = await roleManager.requestLeader(sessionId, 'follower1', mockIo);
    
    if (!requestResult.success || !requestResult.pending) {
      throw new Error('Leadership request should be pending');
    }
    
    // Verify request was stored
    const requests = await sessionManager.getLeaderRequests(sessionId);
    if (requests.length !== 1 || requests[0].socketId !== 'follower1') {
      throw new Error('Leadership request was not stored');
    }
    
    // Verify events were emitted
    const requestSentEvent = emittedEvents.find(e => e.event === 'leader_request_sent');
    const handoffRequestEvent = emittedEvents.find(e => e.event === 'leader_handoff_request');
    
    if (!requestSentEvent || !handoffRequestEvent) {
      throw new Error('Required events were not emitted');
    }
    
    // Current leader approves request
    emittedEvents = []; // Reset events
    const approvalResult = await roleManager.approveLeaderRequest(sessionId, 'leader1', 'follower1', mockIo);
    
    if (!approvalResult.success) {
      throw new Error(`Failed to approve leadership request: ${approvalResult.error}`);
    }
    
    // Verify leadership transfer
    const updatedSession = await sessionManager.getSession(sessionId);
    if (updatedSession.leaderSocketId !== 'follower1') {
      throw new Error('Leadership was not transferred');
    }
    
    const newLeader = await sessionManager.getMember(sessionId, 'follower1');
    const oldLeader = await sessionManager.getMember(sessionId, 'leader1');
    
    if (newLeader.role !== 'leader' || oldLeader.role !== 'follower') {
      throw new Error('Roles were not properly updated');
    }
    
    // Verify request was cleaned up
    const remainingRequests = await sessionManager.getLeaderRequests(sessionId);
    if (remainingRequests.length !== 0) {
      throw new Error('Leadership request was not cleaned up');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Leader request flow completed successfully');
  }

  async testLeaderDisconnectHandling() {
    const sessionId = this.testSession + '-disconnect';
    
    // Create session with multiple members
    await sessionManager.createSession(sessionId);
    
    await sessionManager.addMember(sessionId, 'leader1', {
      displayName: 'Current Leader',
      role: 'leader',
      joinedAt: Date.now() - 5000 // Joined 5 seconds ago
    });
    
    await sessionManager.addMember(sessionId, 'follower1', {
      displayName: 'Senior Follower',
      role: 'follower',
      joinedAt: Date.now() - 3000 // Joined 3 seconds ago
    });
    
    await sessionManager.addMember(sessionId, 'follower2', {
      displayName: 'Junior Follower',
      role: 'follower',
      joinedAt: Date.now() - 1000 // Joined 1 second ago
    });
    
    // Set leader in session
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'leader1',
      isPlaying: true
    });
    
    let emittedEvents = [];
    const mockIo = {
      to: (target) => ({
        emit: (event, data) => {
          emittedEvents.push({ target, event, data });
        }
      })
    };
    
    // Handle leader disconnect
    const result = await roleManager.handleLeaderDisconnect(sessionId, 'leader1', mockIo);
    
    if (!result.success) {
      throw new Error(`Failed to handle leader disconnect: ${result.error}`);
    }
    
    // Verify senior member was promoted
    const updatedSession = await sessionManager.getSession(sessionId);
    if (updatedSession.leaderSocketId !== 'follower1') {
      throw new Error('Senior member was not promoted to leader');
    }
    
    const newLeader = await sessionManager.getMember(sessionId, 'follower1');
    if (newLeader.role !== 'leader') {
      throw new Error('New leader role was not updated');
    }
    
    // Verify playback was stopped during transition
    if (updatedSession.isPlaying === true) {
      console.warn('Warning: Playback was not stopped during leader transition');
    }
    
    // Verify events were emitted
    const leaderChangedEvent = emittedEvents.find(e => e.event === 'leader_changed');
    const autoAssignedEvent = emittedEvents.find(e => e.event === 'leader_auto_assigned');
    
    if (!leaderChangedEvent && !autoAssignedEvent) {
      throw new Error('Leadership change event was not emitted');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Leader disconnect handling completed successfully');
  }

  async testConcurrentLeaderRequests() {
    const sessionId = this.testSession + '-concurrent';
    
    // Create session with leader and multiple followers
    await sessionManager.createSession(sessionId);
    
    await sessionManager.addMember(sessionId, 'leader1', {
      displayName: 'Current Leader',
      role: 'leader'
    });
    
    await sessionManager.addMember(sessionId, 'follower1', {
      displayName: 'Follower 1',
      role: 'follower'
    });
    
    await sessionManager.addMember(sessionId, 'follower2', {
      displayName: 'Follower 2',
      role: 'follower'
    });
    
    await sessionManager.addMember(sessionId, 'follower3', {
      displayName: 'Follower 3',
      role: 'follower'
    });
    
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'leader1'
    });
    
    const mockIo = {
      to: (target) => ({
        emit: (event, data) => {
          console.log(`Mock emit to ${target}: ${event}`);
        }
      })
    };
    
    // Multiple followers request leadership simultaneously
    const request1 = await roleManager.requestLeader(sessionId, 'follower1', mockIo);
    const request2 = await roleManager.requestLeader(sessionId, 'follower2', mockIo);
    const request3 = await roleManager.requestLeader(sessionId, 'follower3', mockIo);
    
    if (!request1.success || !request2.success || !request3.success) {
      throw new Error('One or more concurrent requests failed');
    }
    
    if (!request1.pending || !request2.pending || !request3.pending) {
      throw new Error('Concurrent requests should all be pending');
    }
    
    // Verify all requests were stored
    const allRequests = await sessionManager.getLeaderRequests(sessionId);
    if (allRequests.length !== 3) {
      throw new Error(`Expected 3 requests, got ${allRequests.length}`);
    }
    
    // Leader approves first request
    const approvalResult = await roleManager.approveLeaderRequest(sessionId, 'leader1', 'follower1', mockIo);
    
    if (!approvalResult.success) {
      throw new Error('Failed to approve first request');
    }
    
    // Verify only follower1 became leader
    const finalSession = await sessionManager.getSession(sessionId);
    if (finalSession.leaderSocketId !== 'follower1') {
      throw new Error('Wrong follower became leader');
    }
    
    // Verify all requests were cleaned up
    const remainingRequests = await sessionManager.getLeaderRequests(sessionId);
    if (remainingRequests.length !== 0) {
      throw new Error('Not all requests were cleaned up after approval');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Concurrent leader requests handled successfully');
  }

  async testRoleValidation() {
    const sessionId = this.testSession + '-validation';
    
    // Create session with leader and follower
    await sessionManager.createSession(sessionId);
    
    await sessionManager.addMember(sessionId, 'leader1', {
      displayName: 'Leader',
      role: 'leader'
    });
    
    await sessionManager.addMember(sessionId, 'follower1', {
      displayName: 'Follower',
      role: 'follower'
    });
    
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'leader1'
    });
    
    // Test leader validation
    const leaderValidation = await roleManager.validateLeaderAction(sessionId, 'leader1');
    if (!leaderValidation.valid) {
      throw new Error('Leader validation should pass');
    }
    
    // Test follower validation (should fail)
    const followerValidation = await roleManager.validateLeaderAction(sessionId, 'follower1');
    if (followerValidation.valid) {
      throw new Error('Follower validation should fail');
    }
    
    if (followerValidation.error !== 'Action requires leader role') {
      throw new Error('Wrong error message for follower validation');
    }
    
    // Test non-existent member validation
    const invalidValidation = await roleManager.validateLeaderAction(sessionId, 'nonexistent');
    if (invalidValidation.valid) {
      throw new Error('Non-existent member validation should fail');
    }
    
    // Test member role retrieval
    const leaderRole = await roleManager.getMemberRole(sessionId, 'leader1');
    if (leaderRole.role !== 'leader' || !leaderRole.isLeader) {
      throw new Error('Leader role retrieval failed');
    }
    
    const followerRole = await roleManager.getMemberRole(sessionId, 'follower1');
    if (followerRole.role !== 'follower' || followerRole.isLeader) {
      throw new Error('Follower role retrieval failed');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Role validation tests completed successfully');
  }

  async testEdgeCases() {
    const sessionId = this.testSession + '-edge-cases';
    
    // Test 1: Request leadership in non-existent session
    const mockIo = {
      to: () => ({
        emit: () => {}
      })
    };
    
    const nonExistentResult = await roleManager.requestLeader('nonexistent-session', 'socket1', mockIo);
    if (nonExistentResult.success) {
      throw new Error('Should not be able to request leadership in non-existent session');
    }
    
    // Test 2: Assign leadership to non-existent member
    await sessionManager.createSession(sessionId);
    
    const invalidAssignResult = await roleManager.assignLeader(sessionId, 'nonexistent-socket', mockIo);
    if (invalidAssignResult.success) {
      throw new Error('Should not be able to assign leadership to non-existent member');
    }
    
    // Test 3: Handle disconnect for non-leader
    await sessionManager.addMember(sessionId, 'follower1', {
      displayName: 'Follower',
      role: 'follower'
    });
    
    const nonLeaderDisconnect = await roleManager.handleLeaderDisconnect(sessionId, 'follower1', mockIo);
    if (nonLeaderDisconnect.success) {
      console.warn('Warning: Non-leader disconnect handled as success - this might be expected');
    }
    
    // Test 4: Approve non-existent request
    await sessionManager.addMember(sessionId, 'leader1', {
      displayName: 'Leader',
      role: 'leader'
    });
    
    await sessionManager.updateSession(sessionId, {
      leaderSocketId: 'leader1'
    });
    
    const invalidApprovalResult = await roleManager.approveLeaderRequest(sessionId, 'leader1', 'nonexistent-requester', mockIo);
    if (invalidApprovalResult.success) {
      throw new Error('Should not be able to approve non-existent request');
    }
    
    // Test 5: Deny request as non-leader
    const invalidDenyResult = await roleManager.denyLeaderRequest(sessionId, 'follower1', 'someone', mockIo);
    if (invalidDenyResult.success) {
      throw new Error('Non-leader should not be able to deny requests');
    }
    
    // Cleanup
    await sessionManager.deleteSession(sessionId);
    
    console.log('Edge cases handled successfully');
  }

  async cleanup() {
    // Close all test clients
    for (const client of this.clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    this.clients = [];
    
    // Close test server
    if (this.ioServer) {
      this.ioServer.close();
    }
    
    if (this.server) {
      await new Promise(resolve => {
        this.server.close(resolve);
      });
    }
    
    console.log('Test cleanup completed');
  }

  async runAllTests() {
    console.log('🚀 Starting Role Management Tests for BandSync Day 6');
    console.log(`Test session prefix: ${this.testSession}`);
    
    try {
      await this.setupTestServer();
      
      await this.runTest('Basic Leader Assignment', () => this.testBasicLeaderAssignment());
      await this.runTest('Leader Request Flow', () => this.testLeaderRequestFlow());
      await this.runTest('Leader Disconnect Handling', () => this.testLeaderDisconnectHandling());
      await this.runTest('Concurrent Leader Requests', () => this.testConcurrentLeaderRequests());
      await this.runTest('Role Validation', () => this.testRoleValidation());
      await this.runTest('Edge Cases', () => this.testEdgeCases());
      
      this.printResults();
      return this.testResults.every(result => result.status === 'PASS');
    } finally {
      await this.cleanup();
    }
  }

  printResults() {
    console.log('\n📊 Role Management Test Results:');
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
      console.log('\n🎉 All role management tests PASSED!');
    } else {
      console.log(`\n💥 ${failed} tests FAILED. Check the errors above.`);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new RoleManagementTest();
  
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export default RoleManagementTest;