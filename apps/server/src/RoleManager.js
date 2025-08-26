/**
 * RoleManager for Enhanced Leadership Transitions - Day 6
 * Handles role requests, approvals, and automatic leadership assignments
 */

import { sessionManager } from './SessionManager.js';

class RoleManager {
  constructor() {
    this.pendingRequests = new Map(); // sessionId -> Set of socketIds
  }

  /**
   * Request leader role for a session
   */
  async requestLeader(sessionId, socketId, io) {
    try {
      const session = await sessionManager.getSession(sessionId);
      const members = await sessionManager.getAllMembers(sessionId);
      const member = members.get(socketId);

      if (!session) {
        throw new Error('Session not found');
      }

      if (!member) {
        throw new Error('Member not found in session');
      }

      // Check if there's already a leader
      if (session.leaderSocketId && members.has(session.leaderSocketId)) {
        console.log(`[${new Date().toISOString()}] Leader request from ${socketId} - current leader exists: ${session.leaderSocketId}`);
        
        // Add to pending requests
        await sessionManager.addLeaderRequest(sessionId, socketId);
        
        // Notify current leader of the request
        const requesterMember = members.get(socketId);
        io.to(session.leaderSocketId).emit('leader_handoff_request', {
          sessionId,
          requesterId: socketId,
          requesterInfo: {
            displayName: requesterMember.displayName,
            joinedAt: requesterMember.joinedAt
          }
        });

        // Notify requester that request was sent
        io.to(socketId).emit('leader_request_sent', {
          sessionId,
          message: 'Leadership request sent to current leader',
          currentLeader: session.leaderSocketId
        });

        console.log(`[${new Date().toISOString()}] Leadership request sent from ${socketId} to ${session.leaderSocketId} in ${sessionId}`);
        return { success: true, pending: true };
      }

      // No current leader, assign immediately
      console.log(`[${new Date().toISOString()}] No current leader in ${sessionId}, assigning ${socketId} as leader`);
      return await this.assignLeader(sessionId, socketId, io);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in requestLeader:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Assign leader role to a specific member
   */
  async assignLeader(sessionId, socketId, io, skipValidation = false) {
    try {
      const session = await sessionManager.getSession(sessionId);
      const members = await sessionManager.getAllMembers(sessionId);
      const member = members.get(socketId);

      if (!session) {
        throw new Error('Session not found');
      }

      if (!member) {
        throw new Error('Member not found in session');
      }

      console.log(`[${new Date().toISOString()}] Assigning leadership in ${sessionId} to ${socketId}`);

      // Update previous leader to follower
      if (session.leaderSocketId && session.leaderSocketId !== socketId) {
        const previousLeader = members.get(session.leaderSocketId);
        if (previousLeader) {
          previousLeader.role = 'follower';
          await sessionManager.addMember(sessionId, session.leaderSocketId, previousLeader);
          console.log(`[${new Date().toISOString()}] Previous leader ${session.leaderSocketId} changed to follower`);
        }
      }

      // Update new leader
      member.role = 'leader';
      await sessionManager.addMember(sessionId, socketId, member);

      // Update session with new leader
      const updatedSession = await sessionManager.updateSession(sessionId, {
        leaderSocketId: socketId,
        message: `${member.displayName} is now leading`,
        // Stop playback during leadership transition for stability
        isPlaying: false
      });

      // Remove any pending leader requests for this member
      await sessionManager.removeLeaderRequest(sessionId, socketId);

      // Notify all members of leadership change
      io.to(sessionId).emit('leader_changed', {
        sessionId,
        newLeaderId: socketId,
        newLeaderInfo: {
          displayName: member.displayName,
          joinedAt: member.joinedAt
        },
        previousLeader: session.leaderSocketId !== socketId ? session.leaderSocketId : null
      });

      // Send updated session state
      const sessionState = {
        ...updatedSession,
        members: Array.from(members.values()),
        serverTimestamp: Date.now()
      };
      io.to(sessionId).emit('snapshot', sessionState);

      console.log(`[${new Date().toISOString()}] Leadership assigned: ${socketId} (${member.displayName}) in ${sessionId}`);
      return { success: true, session: updatedSession };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in assignLeader:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle approval of leadership request
   */
  async approveLeaderRequest(sessionId, currentLeaderId, requesterId, io) {
    try {
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Verify current leader is approving
      if (session.leaderSocketId !== currentLeaderId) {
        throw new Error('Only current leader can approve requests');
      }

      // Check if there's a pending request from this member
      const leaderRequests = await sessionManager.getLeaderRequests(sessionId);
      const pendingRequest = leaderRequests.find(req => req.socketId === requesterId);
      
      if (!pendingRequest) {
        throw new Error('No pending leadership request from this member');
      }

      console.log(`[${new Date().toISOString()}] Leader ${currentLeaderId} approving request from ${requesterId} in ${sessionId}`);

      // Transfer leadership
      const result = await this.assignLeader(sessionId, requesterId, io);
      
      if (result.success) {
        // Notify both parties
        io.to(currentLeaderId).emit('leader_handoff_completed', {
          sessionId,
          newLeaderId: requesterId,
          message: 'Leadership transferred successfully'
        });
        
        io.to(requesterId).emit('leader_request_approved', {
          sessionId,
          message: 'Your leadership request was approved. You are now the leader!'
        });

        // Clean up all pending requests for this session
        const allRequests = await sessionManager.getLeaderRequests(sessionId);
        for (const request of allRequests) {
          await sessionManager.removeLeaderRequest(sessionId, request.socketId);
          if (request.socketId !== requesterId) {
            // Notify other pending requesters that their request was superseded
            io.to(request.socketId).emit('leader_request_denied', {
              sessionId,
              reason: 'Leadership was granted to another member'
            });
          }
        }
      }

      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error approving leader request:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle denial of leadership request
   */
  async denyLeaderRequest(sessionId, currentLeaderId, requesterId, io) {
    try {
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      if (session.leaderSocketId !== currentLeaderId) {
        throw new Error('Only current leader can deny requests');
      }

      // Remove the request
      await sessionManager.removeLeaderRequest(sessionId, requesterId);

      // Notify requester of denial
      io.to(requesterId).emit('leader_request_denied', {
        sessionId,
        reason: 'Request denied by current leader'
      });

      console.log(`[${new Date().toISOString()}] Leader request from ${requesterId} denied by ${currentLeaderId} in ${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error denying leader request:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle leader disconnection - automatic leadership transition
   */
  async handleLeaderDisconnect(sessionId, disconnectedSocketId, io) {
    try {
      const session = await sessionManager.getSession(sessionId);
      
      if (!session || session.leaderSocketId !== disconnectedSocketId) {
        // Not the leader or session doesn't exist
        return { success: false, reason: 'Not the current leader' };
      }

      console.log(`[${new Date().toISOString()}] Leader ${disconnectedSocketId} disconnected from ${sessionId}, handling transition`);

      // Get remaining members
      const members = await sessionManager.getAllMembers(sessionId);
      const remainingMembers = Array.from(members.values())
        .filter(member => member.socketId !== disconnectedSocketId)
        .sort((a, b) => a.joinedAt - b.joinedAt); // Sort by join time (earliest first)

      // Update session to clear leader and stop playback
      const updatedSession = await sessionManager.updateSession(sessionId, {
        leaderSocketId: null,
        isPlaying: false,
        message: 'Leader disconnected - selecting new leader...'
      });

      if (remainingMembers.length > 0) {
        // Auto-promote the most senior member (earliest joined)
        const newLeader = remainingMembers[0];
        console.log(`[${new Date().toISOString()}] Auto-promoting ${newLeader.socketId} (${newLeader.displayName}) as new leader`);
        
        const result = await this.assignLeader(sessionId, newLeader.socketId, io, true);
        
        if (result.success) {
          // Notify room of the automatic leadership change
          io.to(sessionId).emit('leader_auto_assigned', {
            sessionId,
            newLeaderId: newLeader.socketId,
            newLeaderInfo: {
              displayName: newLeader.displayName,
              joinedAt: newLeader.joinedAt
            },
            reason: 'Previous leader disconnected'
          });
        }

        return result;
      } else {
        // No members left
        console.log(`[${new Date().toISOString()}] No members left in session ${sessionId}`);
        io.to(sessionId).emit('session_empty', { 
          sessionId,
          message: 'All members have left the session'
        });
        
        return { success: true, empty: true };
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error handling leader disconnect:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate if a member has permission to perform an action
   */
  async validateLeaderAction(sessionId, socketId) {
    try {
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        return { valid: false, error: 'Session not found' };
      }

      if (session.leaderSocketId !== socketId) {
        return { 
          valid: false, 
          error: 'Action requires leader role',
          currentLeader: session.leaderSocketId
        };
      }

      return { valid: true };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error validating leader action:`, error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Get role information for a member
   */
  async getMemberRole(sessionId, socketId) {
    try {
      const member = await sessionManager.getMember(sessionId, socketId);
      const session = await sessionManager.getSession(sessionId);
      
      if (!member || !session) {
        return { role: null, isLeader: false };
      }

      const isLeader = session.leaderSocketId === socketId;
      return { 
        role: member.role,
        isLeader,
        member: member
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting member role:`, error);
      return { role: null, isLeader: false };
    }
  }

  /**
   * Force assign leader (admin action)
   */
  async forceAssignLeader(sessionId, socketId, io) {
    try {
      console.log(`[${new Date().toISOString()}] Force assigning leader in ${sessionId} to ${socketId}`);
      return await this.assignLeader(sessionId, socketId, io, true);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error force assigning leader:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const roleManager = new RoleManager();
export { roleManager };
export default roleManager;