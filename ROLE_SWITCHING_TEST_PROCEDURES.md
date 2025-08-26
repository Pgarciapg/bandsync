# BandSync Role Switching Test Procedures

## Overview
This document provides comprehensive testing procedures for validating leader/follower role management in BandSync, including role transitions, permission enforcement, and recovery scenarios.

## Role Management Architecture

### Role States
- **Leader (👑)**: Can control tempo, playback, and session parameters
- **Follower (👥)**: Receives updates, can request sync, can become leader
- **No Role**: Default state before role assignment

### Permission Matrix
| Action | Leader | Follower | No Role |
|--------|--------|----------|---------|
| Set Tempo | ✅ | ❌ | ❌ |
| Play/Pause | ✅ | ❌ | ❌ |
| Seek Position | ✅ | ❌ | ❌ |
| Join Session | ✅ | ✅ | ✅ |
| Become Leader | N/A | ✅ | ✅ |
| Request Sync | ✅ | ✅ | ✅ |
| Leave Session | ✅ | ✅ | ✅ |

## Test Scenarios

### Scenario 1: Initial Role Assignment

#### Test Case 1.1: First Device Becomes Leader
**Objective**: Verify first device can establish leadership

**Setup**:
- Single device connected to session "role-test-1"
- Device has no role initially

**Steps**:
1. Join session as Device A
2. Verify initial state shows no leader (leaderSocketId: null)
3. Tap "Become Leader" button
4. Verify crown (👑) icon appears
5. Verify session state shows Device A as leader
6. Test leader controls (set tempo, play/pause)

**Expected Results**:
```json
{
  "leaderSocketId": "device-a-socket-id",
  "message": "Device A is now the leader",
  "members": [
    {
      "socketId": "device-a-socket-id", 
      "role": "leader",
      "displayName": "Device A"
    }
  ]
}
```

**Validation Points**:
- Crown icon (👑) visible on Device A
- Tempo controls enabled
- Play/Pause buttons enabled
- "Become Leader" button hidden or disabled

#### Test Case 1.2: Second Device Joins as Follower
**Objective**: Verify automatic follower assignment

**Setup**:
- Device A already leader in session
- Device B joins same session

**Steps**:
1. Device B joins session "role-test-1"
2. Verify Device B automatically becomes follower
3. Verify follower UI shows correctly
4. Verify follower controls are disabled
5. Check member list shows both devices with correct roles

**Expected Results**:
- Device B shows follower (👥) icon
- Tempo controls disabled on Device B
- "Become Leader" button available on Device B
- Member count shows 2 devices
- Session state consistent across both devices

### Scenario 2: Role Transitions

#### Test Case 2.1: Voluntary Leader Handoff
**Objective**: Test seamless leadership transfer between willing participants

**Setup**:
- Device A (current leader) with active playback at 120 BPM
- Device B (follower) ready to take leadership
- Device C (follower) observing

**Detailed Steps**:
1. **Pre-transition state verification**:
   - Device A shows crown (👑)
   - Devices B&C show follower (👥) icons
   - Playback active at 120 BPM
   - Record current playback position

2. **Leadership transition**:
   - Device B taps "Become Leader"
   - Monitor all devices for UI updates
   - Time the transition duration
   - Verify playback continuity

3. **Post-transition verification**:
   - Crown (👑) moves to Device B
   - Device A shows follower (👥) icon
   - Device C remains follower
   - Playback position matches pre-transition
   - Tempo remains at 120 BPM

4. **New leader functionality test**:
   - Device B changes tempo to 100 BPM
   - Verify tempo change on Devices A&C
   - Device B pauses playback
   - Verify pause on all devices

**Success Criteria**:
- Transition completes within 200ms
- No playback interruption or glitches
- All devices reflect new leader state
- Previous leader loses control privileges
- New leader gains full control privileges

**Measurement Points**:
- Transition time: Start = "Become Leader" tap, End = Crown appears
- Synchronization drift: Compare beat positions before/after
- UI responsiveness: Time for all devices to show new state

#### Test Case 2.2: Multiple Leadership Requests
**Objective**: Test system behavior with simultaneous leadership requests

**Setup**:
- Device A (current leader)
- Devices B, C, D (all followers)
- All devices attempt leadership simultaneously

**Steps**:
1. Coordinate simultaneous "Become Leader" taps on B, C, D
2. Record which device becomes leader
3. Verify other devices remain followers
4. Test that only one leader exists
5. Validate session consistency

**Expected Behavior**:
- Only one device becomes leader (first request processed)
- Other requests ignored or queued
- No split leadership scenarios
- Session state remains consistent
- Error handling for rejected requests

#### Test Case 2.3: Rapid Leadership Changes
**Objective**: Test system stability under rapid role switching

**Setup**:
- 4 devices in session (A=leader, B,C,D=followers)
- Scripted rapid leadership changes

**Sequence**:
1. Device B becomes leader (A→B transition)
2. Wait 2 seconds
3. Device C becomes leader (B→C transition)  
4. Wait 2 seconds
5. Device D becomes leader (C→D transition)
6. Wait 2 seconds
7. Device A becomes leader (D→A transition)

**Monitoring**:
- Session state consistency after each transition
- UI responsiveness throughout sequence
- No stuck states or invalid configurations
- Playback continuity (if active)
- Server resource usage

### Scenario 3: Leader Disconnection Recovery

#### Test Case 3.1: Graceful Leader Disconnection
**Objective**: Test system response to planned leader departure

**Setup**:
- 4 devices: A=leader, B,C,D=followers
- Active playback session at 130 BPM

**Steps**:
1. **Pre-disconnection state**:
   - Record playback position and tempo
   - Note follower device states
   - Document session member count

2. **Leader disconnection**:
   - Device A gracefully leaves session (proper LEAVE_SESSION event)
   - Monitor immediate system response
   - Check follower device reactions

3. **Recovery observation**:
   - Wait for automatic recovery mechanisms
   - Monitor for new leader selection
   - Check session state updates

4. **Manual recovery**:
   - If no automatic leader, Device B manually becomes leader
   - Resume playback control
   - Verify session functionality

**Expected Results**:
```json
// Immediate response to leader disconnect
{
  "leaderSocketId": null,
  "isPlaying": false,
  "message": "Leader disconnected. Session paused.",
  "members": [
    {"socketId": "device-b", "role": "follower"},
    {"socketId": "device-c", "role": "follower"}, 
    {"socketId": "device-d", "role": "follower"}
  ]
}
```

**Recovery Validation**:
- Playback stops automatically
- All followers notified of leader departure
- Session remains active for followers
- No data corruption or state inconsistency
- Smooth transition to new leader when assigned

#### Test Case 3.2: Abrupt Leader Disconnection
**Objective**: Test resilience to unexpected leader network failure

**Simulation Method**:
- Force quit BandSync app on leader device
- Or simulate network disconnection (airplane mode)
- Or kill network process

**Monitoring Points**:
- Time to detect disconnection
- Automatic cleanup procedures
- Follower notification mechanism
- Session state preservation
- Recovery time measurements

#### Test Case 3.3: Leader Reconnection Scenarios
**Objective**: Test behavior when original leader rejoins session

**Scenarios to Test**:

**A. Immediate Reconnection (within 30 seconds)**:
1. Leader disconnects
2. No new leader assigned yet
3. Original leader reconnects
4. Should resume leadership automatically?

**B. Delayed Reconnection (new leader exists)**:
1. Leader disconnects  
2. Follower becomes new leader
3. Original leader reconnects
4. Should become follower, not automatically reclaim leadership

**C. Multiple Reconnection Attempts**:
1. Unstable connection causes multiple disconnect/reconnect cycles
2. System should handle gracefully without role confusion

### Scenario 4: Permission Enforcement Testing

#### Test Case 4.1: Follower Control Attempt Validation
**Objective**: Verify followers cannot execute leader-only actions

**Setup**:
- Device A = leader, Device B = follower
- Session with tempo = 120 BPM, isPlaying = false

**Unauthorized Actions to Test**:

1. **Tempo Change Attempt**:
   ```javascript
   // Simulate follower trying to change tempo directly
   followerSocket.emit('SET_TEMPO', {
     sessionId: 'test-session',
     tempo: 140
   });
   ```
   **Expected**: Server ignores request, tempo remains 120

2. **Playback Control Attempt**:
   ```javascript
   // Follower attempts to start playback
   followerSocket.emit('PLAY', {
     sessionId: 'test-session'
   });
   ```
   **Expected**: Server ignores request, isPlaying remains false

3. **Seek Position Attempt**:
   ```javascript
   // Follower attempts to change position
   followerSocket.emit('SEEK', {
     sessionId: 'test-session',
     position: 5000
   });
   ```
   **Expected**: Server ignores request, position unchanged

**Validation Methods**:
- Monitor server logs for blocked requests
- Verify session state unchanged after attempts
- Check for appropriate error responses
- Ensure UI remains consistent

#### Test Case 4.2: Role-Based UI Control States
**Objective**: Verify UI correctly enables/disables controls based on role

**Test Matrix**:

| UI Control | Leader State | Follower State | No Role State |
|------------|-------------|----------------|---------------|
| Tempo Slider | Enabled | Disabled/Hidden | Disabled/Hidden |
| Play Button | Enabled | Disabled/Hidden | Disabled/Hidden |
| Pause Button | Enabled | Disabled/Hidden | Disabled/Hidden |
| Stop Button | Enabled | Disabled/Hidden | Disabled/Hidden |
| Seek Bar | Enabled | Disabled | Disabled |
| "Become Leader" | Hidden | Visible | Visible |
| Role Indicator | "👑 Leader" | "👥 Follower" | "No Role" |

**Testing Approach**:
1. Screenshot UI in each role state
2. Attempt to interact with disabled controls
3. Verify visual indicators match role status
4. Test accessibility features (screen reader support)

### Scenario 5: Edge Cases and Error Conditions

#### Test Case 5.1: Simultaneous Session Join and Role Request
**Objective**: Test race conditions in role assignment

**Simulation**:
1. Device connects to session
2. Immediately requests leader role before join complete
3. Monitor for timing-related issues

**Expected Handling**:
- Join completes before role assignment
- Or role request queued until join complete
- No invalid states or crashes

#### Test Case 5.2: Invalid Role Transitions
**Objective**: Test system robustness against invalid requests

**Invalid Scenarios**:
1. Request same role already held
2. Request invalid role ("admin", "moderator", etc.)
3. Request role for different session
4. Request role with malformed data

**Expected Responses**:
- Graceful error handling
- Appropriate error messages
- No state corruption
- Session stability maintained

#### Test Case 5.3: Network Partition During Role Change
**Objective**: Test behavior when network splits during role transition

**Simulation**:
1. Start role transition from A to B
2. Simulate network partition that separates A from server
3. B completes role transition
4. A reconnects later

**Expected Resolution**:
- B successfully becomes leader
- A becomes follower upon reconnection
- No conflicting leadership states
- Consistent session recovery

## Automated Role Testing Script

Create `/Users/pablogarciapizano/bandsync/test-scripts/role-management-test.js`:

```javascript
/**
 * BandSync Role Management Automated Test Suite
 * Tests role assignment, transitions, and permission enforcement
 */

import io from 'socket.io-client';
import { EVENTS } from 'bandsync-shared';

const SERVER_URL = 'http://localhost:3001';
const TEST_SESSION = 'role-test-session';

class RoleManagementTest {
  constructor() {
    this.devices = [];
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🎭 Starting Role Management Tests');
    
    try {
      await this.setupDevices(4);
      await this.testInitialRoleAssignment();
      await this.testVoluntaryHandoff();
      await this.testLeaderDisconnection();
      await this.testPermissionEnforcement();
      await this.testEdgeCases();
      
      this.generateReport();
    } catch (error) {
      console.error('Test suite failed:', error);
    } finally {
      this.cleanup();
    }
  }

  async setupDevices(count) {
    console.log(`📱 Setting up ${count} test devices...`);
    
    for (let i = 0; i < count; i++) {
      const device = {
        id: `device-${i}`,
        socket: io(SERVER_URL),
        role: null,
        isLeader: false
      };
      
      device.socket.on(EVENTS.SNAPSHOT, (data) => {
        device.role = data.members?.find(m => m.socketId === device.socket.id)?.role;
        device.isLeader = data.leaderSocketId === device.socket.id;
      });
      
      this.devices.push(device);
    }
    
    // Join all devices to session
    for (const device of this.devices) {
      device.socket.emit(EVENTS.JOIN_SESSION, {
        sessionId: TEST_SESSION,
        displayName: device.id
      });
    }
    
    await this.waitForSetup(2000);
  }

  async testInitialRoleAssignment() {
    console.log('\n👑 Testing Initial Role Assignment...');
    
    // Device 0 becomes leader
    const device0 = this.devices[0];
    
    return new Promise((resolve) => {
      device0.socket.once(EVENTS.SNAPSHOT, (data) => {
        const success = data.leaderSocketId === device0.socket.id;
        this.testResults.push({
          test: 'Initial Role Assignment',
          success,
          message: success ? 'Device 0 became leader successfully' : 'Failed to assign leader role'
        });
        resolve();
      });
      
      device0.socket.emit(EVENTS.SET_ROLE, {
        sessionId: TEST_SESSION,
        role: 'leader'
      });
    });
  }

  async testVoluntaryHandoff() {
    console.log('\n🤝 Testing Voluntary Leadership Handoff...');
    
    const device0 = this.devices[0]; // Current leader
    const device1 = this.devices[1]; // Will become leader
    
    return new Promise((resolve) => {
      let transitionStartTime;
      
      device1.socket.once(EVENTS.SNAPSHOT, (data) => {
        const transitionTime = Date.now() - transitionStartTime;
        const success = data.leaderSocketId === device1.socket.id;
        
        this.testResults.push({
          test: 'Voluntary Handoff',
          success,
          transitionTime,
          message: success ? `Leadership transferred in ${transitionTime}ms` : 'Handoff failed'
        });
        resolve();
      });
      
      transitionStartTime = Date.now();
      device1.socket.emit(EVENTS.SET_ROLE, {
        sessionId: TEST_SESSION,
        role: 'leader'
      });
    });
  }

  async testLeaderDisconnection() {
    console.log('\n🔌 Testing Leader Disconnection Recovery...');
    
    const currentLeader = this.devices.find(d => d.isLeader);
    if (!currentLeader) {
      console.log('No leader found, skipping disconnection test');
      return;
    }
    
    return new Promise((resolve) => {
      let recoveryTime = Date.now();
      
      // Listen for leader disconnection on remaining devices
      this.devices.forEach(device => {
        if (device !== currentLeader) {
          device.socket.once(EVENTS.SNAPSHOT, (data) => {
            if (!data.leaderSocketId) { // Leader is gone
              const detectionTime = Date.now() - recoveryTime;
              this.testResults.push({
                test: 'Leader Disconnection Detection',
                success: true,
                detectionTime,
                message: `Leader disconnection detected in ${detectionTime}ms`
              });
              resolve();
            }
          });
        }
      });
      
      // Simulate leader disconnection
      currentLeader.socket.disconnect();
      this.devices = this.devices.filter(d => d !== currentLeader);
    });
  }

  async testPermissionEnforcement() {
    console.log('\n🚫 Testing Permission Enforcement...');
    
    // Ensure we have a leader and follower
    if (this.devices.length < 2) {
      console.log('Insufficient devices for permission test');
      return;
    }
    
    // Make device 0 leader if no leader exists
    if (!this.devices.some(d => d.isLeader)) {
      await new Promise(resolve => {
        this.devices[0].socket.once(EVENTS.SNAPSHOT, resolve);
        this.devices[0].socket.emit(EVENTS.SET_ROLE, {
          sessionId: TEST_SESSION,
          role: 'leader'
        });
      });
      await this.waitForSetup(1000);
    }
    
    const leader = this.devices.find(d => d.isLeader);
    const follower = this.devices.find(d => !d.isLeader);
    
    if (!leader || !follower) {
      console.log('Could not establish leader/follower for permission test');
      return;
    }
    
    // Test unauthorized tempo change by follower
    return new Promise((resolve) => {
      let originalTempo;
      
      // Get current tempo
      leader.socket.emit(EVENTS.SYNC_REQUEST, { sessionId: TEST_SESSION });
      
      leader.socket.once(EVENTS.SYNC_RESPONSE, (data) => {
        originalTempo = data.tempoBpm;
        
        // Follower attempts unauthorized tempo change
        follower.socket.emit(EVENTS.SET_TEMPO, {
          sessionId: TEST_SESSION,
          tempo: originalTempo + 20
        });
        
        // Check if tempo actually changed (it shouldn't)
        setTimeout(() => {
          leader.socket.emit(EVENTS.SYNC_REQUEST, { sessionId: TEST_SESSION });
          
          leader.socket.once(EVENTS.SYNC_RESPONSE, (checkData) => {
            const tempoUnchanged = checkData.tempoBpm === originalTempo;
            
            this.testResults.push({
              test: 'Permission Enforcement',
              success: tempoUnchanged,
              message: tempoUnchanged 
                ? 'Follower tempo change correctly blocked' 
                : 'SECURITY ISSUE: Follower was able to change tempo'
            });
            resolve();
          });
        }, 1000);
      });
    });
  }

  async testEdgeCases() {
    console.log('\n🎯 Testing Edge Cases...');
    
    // Test multiple simultaneous role requests
    const testDevices = this.devices.slice(0, 3);
    
    return new Promise((resolve) => {
      let responseCount = 0;
      const startTime = Date.now();
      
      testDevices.forEach(device => {
        device.socket.once(EVENTS.SNAPSHOT, () => {
          responseCount++;
          if (responseCount === testDevices.length) {
            // Check that only one leader exists
            const leaderCount = this.devices.filter(d => d.isLeader).length;
            
            this.testResults.push({
              test: 'Simultaneous Role Requests',
              success: leaderCount === 1,
              responseTime: Date.now() - startTime,
              message: leaderCount === 1 
                ? 'Only one leader exists after simultaneous requests' 
                : `RACE CONDITION: ${leaderCount} leaders exist`
            });
            resolve();
          }
        });
      });
      
      // All devices request leadership simultaneously
      testDevices.forEach(device => {
        device.socket.emit(EVENTS.SET_ROLE, {
          sessionId: TEST_SESSION,
          role: 'leader'
        });
      });
    });
  }

  async waitForSetup(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateReport() {
    console.log('\n📊 Role Management Test Results');
    console.log('=' .repeat(50));
    
    let passCount = 0;
    let totalTests = this.testResults.length;
    
    this.testResults.forEach(result => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.test}`);
      console.log(`    ${result.message}`);
      
      if (result.transitionTime) {
        console.log(`    Transition Time: ${result.transitionTime}ms`);
      }
      if (result.detectionTime) {
        console.log(`    Detection Time: ${result.detectionTime}ms`);
      }
      if (result.responseTime) {
        console.log(`    Response Time: ${result.responseTime}ms`);
      }
      
      if (result.success) passCount++;
      console.log('');
    });
    
    console.log(`Overall Results: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All role management tests passed!');
    } else {
      console.log('⚠️  Some tests failed - review role management implementation');
    }
  }

  cleanup() {
    console.log('\n🧹 Cleaning up test devices...');
    this.devices.forEach(device => {
      if (device.socket && device.socket.connected) {
        device.socket.disconnect();
      }
    });
  }
}

// Export for use in test suites
export { RoleManagementTest };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new RoleManagementTest();
  test.runAllTests().catch(console.error);
}
```

## Manual Testing Checklist

### Role Assignment Testing
- [ ] First device can become leader
- [ ] Subsequent devices default to follower
- [ ] Crown (👑) and follower (👥) icons display correctly
- [ ] Member list shows accurate role assignments
- [ ] Role changes propagate to all session members

### Leadership Transition Testing  
- [ ] Voluntary handoff completes within 200ms
- [ ] Previous leader loses control privileges
- [ ] New leader gains full control privileges
- [ ] Playback continuity maintained during transition
- [ ] All devices reflect new leadership state

### Permission Enforcement Testing
- [ ] Followers cannot change tempo
- [ ] Followers cannot control playback
- [ ] Followers cannot seek position
- [ ] UI controls properly disabled for followers
- [ ] Server blocks unauthorized requests

### Disconnection Recovery Testing
- [ ] Leader disconnect stops playback
- [ ] Followers notified of leader departure  
- [ ] Session remains active for followers
- [ ] New leader can be assigned
- [ ] System recovers to functional state

### Edge Case Testing
- [ ] Simultaneous role requests handled correctly
- [ ] Invalid role requests rejected gracefully
- [ ] Race conditions avoided
- [ ] Network partitions handled appropriately
- [ ] Session state remains consistent

## Success Metrics

### Performance Targets
- Role transition time: <200ms
- Disconnection detection: <5 seconds  
- Recovery to functional state: <10 seconds
- Permission check response: <50ms
- UI state update propagation: <100ms

### Quality Assurance
- No split leadership scenarios possible
- Consistent session state across all devices
- Graceful error handling and recovery
- Clear user feedback for role changes
- Accessible interface for all role states

### Security Validation
- Unauthorized actions properly blocked
- Role-based permissions strictly enforced
- Session integrity maintained under all conditions
- No privilege escalation vulnerabilities
- Audit trail of role changes available

This comprehensive role switching test suite ensures robust and secure leadership management in BandSync's multi-device environment.