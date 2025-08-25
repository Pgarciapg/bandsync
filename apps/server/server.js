import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { EVENTS } from "./src/events.js";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || "*" } });

/** Enhanced session state management:
 * sessions: Map<sessionId, {
 *   message: string,
 *   tempo: number,
 *   position: number, // ms
 *   isPlaying: boolean,
 *   leaderSocketId: string | null,
 *   tempoBpm: number,
 *   members: Map<socketId, memberInfo>,
 *   createdAt: number,
 *   lastActiveAt: number,
 *   settings: { maxMembers: number }
 * }>
 */
const sessions = new Map();
const scrollIntervals = new Map(); // sessionId -> intervalId
const memberInfo = new Map(); // socketId -> { sessionId, role, joinedAt, lastPingAt }

// Session state management helpers
function createSession(sessionId, creatorSocketId) {
  const session = {
    message: "Waiting for members…",
    tempo: 120,
    position: 0,
    isPlaying: false,
    leaderSocketId: null,
    tempoBpm: 120,
    members: new Map(),
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    settings: { maxMembers: 8 }
  };
  sessions.set(sessionId, session);
  console.log(`[${new Date().toISOString()}] Created session ${sessionId}`);
  return session;
}

function addMemberToSession(sessionId, socketId, memberData = {}) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const member = {
    socketId,
    joinedAt: Date.now(),
    lastPingAt: Date.now(),
    role: memberData.role || 'follower',
    displayName: memberData.displayName || `User ${socketId.substr(-4)}`,
    ...memberData
  };
  
  session.members.set(socketId, member);
  session.lastActiveAt = Date.now();
  memberInfo.set(socketId, { sessionId, ...member });
  
  console.log(`[${new Date().toISOString()}] Added member ${socketId} to session ${sessionId} (${session.members.size}/${session.settings.maxMembers})`);
  return member;
}

function removeMemberFromSession(sessionId, socketId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  const member = session.members.get(socketId);
  if (member) {
    session.members.delete(socketId);
    memberInfo.delete(socketId);
    session.lastActiveAt = Date.now();
    
    console.log(`[${new Date().toISOString()}] Removed member ${socketId} from session ${sessionId} (${session.members.size} remaining)`);
    
    // If leader left, elect new leader
    if (session.leaderSocketId === socketId && session.members.size > 0) {
      const newLeader = Array.from(session.members.keys())[0];
      session.leaderSocketId = newLeader;
      session.members.get(newLeader).role = 'leader';
      console.log(`[${new Date().toISOString()}] Elected new leader: ${newLeader} for session ${sessionId}`);
      
      return { member, newLeader };
    }
    
    return { member };
  }
  return false;
}

function getSessionStats(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
  return {
    sessionId,
    memberCount: roomSize,
    connectedCount: session.members.size,
    isPlaying: session.isPlaying,
    tempo: session.tempoBpm,
    position: session.position,
    leader: session.leaderSocketId,
    uptime: Date.now() - session.createdAt
  };
}

// Cleanup inactive sessions (run periodically)
function cleanupInactiveSessions() {
  const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  
  sessions.forEach((session, sessionId) => {
    if (now - session.lastActiveAt > INACTIVE_THRESHOLD && session.members.size === 0) {
      console.log(`[${new Date().toISOString()}] Cleaning up inactive session: ${sessionId}`);
      sessions.delete(sessionId);
      if (scrollIntervals.has(sessionId)) {
        clearInterval(scrollIntervals.get(sessionId));
        scrollIntervals.delete(sessionId);
      }
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);

io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  
  socket.on(EVENTS.JOIN_SESSION, ({ sessionId, displayName, role }) => {
    try {
      console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId} as ${role || 'follower'}`);
      
      // Create session if it doesn't exist
      let session = sessions.get(sessionId);
      if (!session) {
        session = createSession(sessionId, socket.id);
      }
      
      // Check capacity
      if (session.members.size >= session.settings.maxMembers) {
        socket.emit(EVENTS.ERROR, { 
          message: `Session at capacity (${session.settings.maxMembers} members)` 
        });
        return;
      }
      
      // Add member to session
      socket.join(sessionId);
      const member = addMemberToSession(sessionId, socket.id, {
        displayName: displayName || `User ${socket.id.substr(-4)}`,
        role: role || 'follower'
      });
      
      // Auto-assign leadership if first member or requested
      if (session.members.size === 1 || role === 'leader') {
        session.leaderSocketId = socket.id;
        member.role = 'leader';
        session.message = `${member.displayName} is leading`;
      }
      
      // Send current state to joining member
      const sessionState = {
        ...session,
        members: Array.from(session.members.values()) // Convert Map to Array for client
      };
      socket.emit(EVENTS.SNAPSHOT, sessionState);
      
      // Notify all members of new joiner
      const stats = getSessionStats(sessionId);
      io.to(sessionId).emit(EVENTS.ROOM_STATS, stats);
      io.to(sessionId).emit(EVENTS.USER_JOINED, {
        member,
        memberCount: stats.memberCount
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in JOIN_SESSION:`, error);
      socket.emit(EVENTS.ERROR, { message: 'Failed to join session' });
    }
  });

  socket.on(EVENTS.UPDATE_MESSAGE, ({ sessionId, message }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      console.log(`[${new Date().toISOString()}] UPDATE_MESSAGE: ${sessionId} -> "${message}"`);
      s.message = message;
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in UPDATE_MESSAGE:`, error);
    }
  });

  socket.on(EVENTS.SET_ROLE, ({ sessionId, role }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      console.log(`[${new Date().toISOString()}] SET_ROLE: ${socket.id} -> ${role} in ${sessionId}`);
      if (role === "leader") {
        s.leaderSocketId = socket.id;
        s.message = "Leader connected";
        console.log(`[${new Date().toISOString()}] New leader set: ${socket.id} in ${sessionId}`);
      }
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_ROLE:`, error);
    }
  });

  socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED SET_TEMPO: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      console.log(`[${new Date().toISOString()}] SET_TEMPO: ${sessionId} -> ${tempo} BPM`);
      s.tempo = tempo;
      s.tempoBpm = tempo;
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_TEMPO:`, error);
    }
  });

  socket.on(EVENTS.PLAY, ({ sessionId }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED PLAY: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      console.log(`[${new Date().toISOString()}] PLAY: ${sessionId} at tempo ${s.tempoBpm} BPM`);
      s.isPlaying = true;
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
      
      // Start scroll tick interval
      if (!scrollIntervals.has(sessionId)) {
        console.log(`[${new Date().toISOString()}] Starting scroll ticker for ${sessionId}`);
        const interval = setInterval(() => {
          const session = sessions.get(sessionId);
          if (session && session.isPlaying) {
            session.position += 100; // advance 100ms
            io.to(sessionId).emit(EVENTS.SCROLL_TICK, { 
              sessionId, 
              positionMs: session.position 
            });
          }
        }, 100);
        scrollIntervals.set(sessionId, interval);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in PLAY:`, error);
    }
  });

  socket.on(EVENTS.PAUSE, ({ sessionId }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED PAUSE: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      console.log(`[${new Date().toISOString()}] PAUSE: ${sessionId}`);
      s.isPlaying = false;
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
      
      // Clear scroll tick interval
      if (scrollIntervals.has(sessionId)) {
        console.log(`[${new Date().toISOString()}] Stopping scroll ticker for ${sessionId}`);
        clearInterval(scrollIntervals.get(sessionId));
        scrollIntervals.delete(sessionId);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in PAUSE:`, error);
    }
  });

  socket.on(EVENTS.SEEK, ({ sessionId, position }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED SEEK: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      console.log(`[${new Date().toISOString()}] SEEK: ${sessionId} -> ${position}ms`);
      s.position = position;
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SEEK:`, error);
    }
  });

  socket.on(EVENTS.SYNC_REQUEST, ({ sessionId }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      const serverTime = Date.now();
      socket.emit(EVENTS.SYNC_RESPONSE, { 
        sessionId, 
        positionMs: s.position,
        tempoBpm: s.tempoBpm,
        isPlaying: s.isPlaying,
        serverTime
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SYNC_REQUEST:`, error);
    }
  });

  // Enhanced sync and latency measurement
  socket.on(EVENTS.LATENCY_PROBE, ({ timestamp, sessionId }) => {
    try {
      const serverTime = Date.now();
      socket.emit(EVENTS.LATENCY_RESPONSE, {
        clientTimestamp: timestamp,
        serverTimestamp: serverTime
      });
      console.log(`[${new Date().toISOString()}] LATENCY_PROBE from ${socket.id}: ${serverTime - timestamp}ms`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in LATENCY_PROBE:`, error);
    }
  });

  // Session lifecycle events
  socket.on(EVENTS.LEAVE_SESSION, ({ sessionId }) => {
    try {
      console.log(`[${new Date().toISOString()}] LEAVE_SESSION: ${socket.id} -> ${sessionId}`);
      socket.leave(sessionId);
      
      const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
      io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
      io.to(sessionId).emit(EVENTS.USER_LEFT, { 
        socketId: socket.id, 
        memberCount: roomSize 
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in LEAVE_SESSION:`, error);
    }
  });

  // Transport control enhancements
  socket.on(EVENTS.STOP, ({ sessionId }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED STOP: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      console.log(`[${new Date().toISOString()}] STOP: ${sessionId}`);
      s.isPlaying = false;
      s.position = 0; // Reset to beginning
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
      
      // Clear scroll tick interval
      if (scrollIntervals.has(sessionId)) {
        clearInterval(scrollIntervals.get(sessionId));
        scrollIntervals.delete(sessionId);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in STOP:`, error);
    }
  });

  // Role change notifications
  socket.on(EVENTS.ROLE_CHANGED, ({ sessionId, role, previousRole }) => {
    try {
      console.log(`[${new Date().toISOString()}] ROLE_CHANGED: ${socket.id} -> ${role} (was ${previousRole}) in ${sessionId}`);
      io.to(sessionId).emit(EVENTS.ROLE_CHANGED, {
        socketId: socket.id,
        role,
        previousRole,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in ROLE_CHANGED:`, error);
    }
  });

  // Tempo change with notification
  socket.on(EVENTS.TEMPO_CHANGE, ({ sessionId, tempo, fadeTime }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(`[${new Date().toISOString()}] BLOCKED TEMPO_CHANGE: ${socket.id} not leader in ${sessionId}`);
        return;
      }
      
      const oldTempo = s.tempoBpm;
      console.log(`[${new Date().toISOString()}] TEMPO_CHANGE: ${sessionId} -> ${tempo} BPM (was ${oldTempo})`);
      
      s.tempo = tempo;
      s.tempoBpm = tempo;
      
      // Broadcast tempo change with timing info
      io.to(sessionId).emit(EVENTS.TEMPO_CHANGE, {
        sessionId,
        oldTempo,
        newTempo: tempo,
        changeTime: Date.now(),
        fadeTime: fadeTime || 0
      });
      
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in TEMPO_CHANGE:`, error);
    }
  });

  // Beat sync for precise timing (Day 4 ready)
  socket.on(EVENTS.BEAT_SYNC, ({ sessionId, beatPosition, masterTime }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s || s.leaderSocketId !== socket.id) return;
      
      const serverTime = Date.now();
      const drift = serverTime - masterTime;
      
      io.to(sessionId).emit(EVENTS.BEAT_SYNC, {
        sessionId,
        masterTime: serverTime,
        beatPosition,
        tempo: s.tempoBpm,
        drift
      });
      
      console.log(`[${new Date().toISOString()}] BEAT_SYNC: ${sessionId} beat ${beatPosition} drift ${drift}ms`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in BEAT_SYNC:`, error);
    }
  });

  // Position sync for advanced synchronization
  socket.on(EVENTS.POSITION_SYNC, ({ sessionId, positionMs, timestamp }) => {
    try {
      const s = sessions.get(sessionId);
      if (!s || s.leaderSocketId !== socket.id) return;
      
      s.position = positionMs;
      const serverTime = Date.now();
      
      io.to(sessionId).emit(EVENTS.POSITION_SYNC, {
        sessionId,
        positionMs,
        serverTime,
        clientTimestamp: timestamp
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in POSITION_SYNC:`, error);
    }
  });

  // Chat/communication
  socket.on(EVENTS.CHAT_MESSAGE, ({ sessionId, message, username }) => {
    try {
      console.log(`[${new Date().toISOString()}] CHAT_MESSAGE: ${username || socket.id} in ${sessionId}: ${message}`);
      io.to(sessionId).emit(EVENTS.CHAT_MESSAGE, {
        sessionId,
        message,
        username: username || `User ${socket.id.substr(-4)}`,
        timestamp: Date.now(),
        socketId: socket.id
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in CHAT_MESSAGE:`, error);
    }
  });

  // Error handling
  socket.on(EVENTS.ERROR, (errorData) => {
    try {
      console.error(`[${new Date().toISOString()}] CLIENT ERROR from ${socket.id}:`, errorData);
      // Log client errors for debugging
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in ERROR handler:`, error);
    }
  });

  socket.on("disconnect", () => {
    try {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      
      // Find which session this socket was in
      const memberData = memberInfo.get(socket.id);
      if (memberData) {
        const { sessionId } = memberData;
        const result = removeMemberFromSession(sessionId, socket.id);
        
        if (result) {
          const session = sessions.get(sessionId);
          
          // If leader disconnected and we elected a new one
          if (result.newLeader) {
            session.message = `${session.members.get(result.newLeader).displayName} is now leading`;
            
            // Stop playback when leader changes
            session.isPlaying = false;
            if (scrollIntervals.has(sessionId)) {
              clearInterval(scrollIntervals.get(sessionId));
              scrollIntervals.delete(sessionId);
            }
            
            io.to(sessionId).emit(EVENTS.ROLE_CHANGED, {
              socketId: result.newLeader,
              role: 'leader',
              previousRole: 'follower',
              reason: 'leader_disconnected'
            });
          }
          
          // Send updated session state
          const sessionState = {
            ...session,
            members: Array.from(session.members.values())
          };
          io.to(sessionId).emit(EVENTS.SNAPSHOT, sessionState);
          
          // Send updated room stats
          const stats = getSessionStats(sessionId);
          io.to(sessionId).emit(EVENTS.ROOM_STATS, stats);
          
          // Notify of user leaving
          io.to(sessionId).emit(EVENTS.USER_LEFT, {
            socketId: socket.id,
            memberCount: stats.memberCount,
            newLeader: result.newLeader || null
          });
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in disconnect:`, error);
    }
  });
});

app.get("/", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`BandSync server listening on http://localhost:${PORT}`);
});