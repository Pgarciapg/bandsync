/**
 * Role Validation Middleware for BandSync Day 6
 * Validates user permissions for socket.io events
 */

import { roleManager } from '../RoleManager.js';
import { sessionManager } from '../SessionManager.js';

/**
 * Create role validation middleware
 */
export const validateRole = (requiredRole) => {
  return async (socket, data, next) => {
    const { sessionId } = data;
    
    if (!sessionId) {
      socket.emit('error', { 
        message: 'Session ID required',
        code: 'MISSING_SESSION_ID'
      });
      return;
    }

    try {
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        socket.emit('error', { 
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND'
        });
        return;
      }

      const member = await sessionManager.getMember(sessionId, socket.id);
      
      if (!member) {
        socket.emit('error', { 
          message: 'Member not found in session',
          code: 'MEMBER_NOT_FOUND'
        });
        return;
      }

      // Check if action requires leader role
      if (requiredRole === 'leader') {
        const validation = await roleManager.validateLeaderAction(sessionId, socket.id);
        
        if (!validation.valid) {
          socket.emit('error', { 
            message: validation.error,
            code: 'INSUFFICIENT_ROLE',
            requiredRole: 'leader',
            currentRole: member.role,
            currentLeader: validation.currentLeader
          });
          return;
        }
      }

      // Add session and member to socket data for use in handlers
      socket.currentSession = session;
      socket.currentMember = member;
      
      next();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Role validation error:`, error);
      socket.emit('error', { 
        message: 'Role validation failed',
        code: 'VALIDATION_ERROR'
      });
    }
  };
};

/**
 * Middleware for leader-only actions
 */
export const leaderOnly = validateRole('leader');

/**
 * Middleware for member-only actions (any authenticated member)
 */
export const memberOnly = validateRole('member');

/**
 * Enhanced socket middleware that applies to specific events
 */
export const createEventMiddleware = (leaderOnlyEvents = [], memberOnlyEvents = []) => {
  return async (socket, packet, next) => {
    const [event, data] = packet;
    
    try {
      if (leaderOnlyEvents.includes(event)) {
        return leaderOnly(socket, data, next);
      } else if (memberOnlyEvents.includes(event)) {
        return memberOnly(socket, data, next);
      } else {
        // No special role requirements
        next();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Event middleware error:`, error);
      socket.emit('error', { 
        message: 'Permission validation failed',
        code: 'MIDDLEWARE_ERROR',
        event
      });
    }
  };
};

/**
 * Rate limiting middleware for expensive operations
 */
export const rateLimitMiddleware = (maxRequests = 5, windowMs = 60000) => {
  const requests = new Map(); // socketId -> [timestamp, timestamp, ...]
  
  return (socket, data, next) => {
    const now = Date.now();
    const socketId = socket.id;
    
    // Clean up old requests outside the window
    if (requests.has(socketId)) {
      const socketRequests = requests.get(socketId);
      const validRequests = socketRequests.filter(timestamp => now - timestamp < windowMs);
      requests.set(socketId, validRequests);
    }
    
    const currentRequests = requests.get(socketId) || [];
    
    if (currentRequests.length >= maxRequests) {
      socket.emit('error', {
        message: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
      return;
    }
    
    // Add current request
    currentRequests.push(now);
    requests.set(socketId, currentRequests);
    
    next();
  };
};

/**
 * Session validation middleware - ensures session exists and is active
 */
export const validateSession = async (socket, data, next) => {
  const { sessionId } = data;
  
  if (!sessionId) {
    socket.emit('error', { 
      message: 'Session ID required',
      code: 'MISSING_SESSION_ID'
    });
    return;
  }

  try {
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      socket.emit('error', { 
        message: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND'
      });
      return;
    }

    // Add session to socket context
    socket.currentSession = session;
    socket.currentSessionId = sessionId;
    
    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Session validation error:`, error);
    socket.emit('error', { 
      message: 'Session validation failed',
      code: 'SESSION_VALIDATION_ERROR'
    });
  }
};

/**
 * Logging middleware for debugging
 */
export const loggingMiddleware = (socket, packet, next) => {
  const [event, data] = packet;
  console.log(`[${new Date().toISOString()}] Event: ${event} from ${socket.id}`, 
    JSON.stringify(data, null, 2).slice(0, 200) + (JSON.stringify(data).length > 200 ? '...' : ''));
  next();
};

/**
 * Error handling wrapper for socket handlers
 */
export const errorHandler = (handler) => {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      const socket = args[0];
      console.error(`[${new Date().toISOString()}] Socket handler error:`, error);
      socket.emit('error', {
        message: 'Internal server error',
        code: 'HANDLER_ERROR'
      });
    }
  };
};

/**
 * Combine multiple middleware functions
 */
export const combineMiddleware = (...middlewares) => {
  return async (socket, data, finalNext) => {
    let index = 0;
    
    const next = async () => {
      if (index >= middlewares.length) {
        return finalNext();
      }
      
      const middleware = middlewares[index++];
      await middleware(socket, data, next);
    };
    
    await next();
  };
};