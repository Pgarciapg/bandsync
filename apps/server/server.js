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

/** In-memory session state:
 * sessions: Map<sessionId, {
 *   message: string,
 *   tempo: number,
 *   position: number, // ms
 *   isPlaying: boolean,
 *   leaderSocketId: string | null,
 *   tempoBpm: number
 * }>
 */
const sessions = new Map();
const scrollIntervals = new Map(); // sessionId -> intervalId

io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  
  socket.on(EVENTS.JOIN_SESSION, ({ sessionId }) => {
    try {
      console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId}`);
      socket.join(sessionId);
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { 
          message: "Waiting for leader…", 
          tempo: 100, 
          position: 0, 
          isPlaying: false,
          leaderSocketId: null,
          tempoBpm: 100
        });
        console.log(`[${new Date().toISOString()}] Created new session: ${sessionId}`);
      }
      const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
      console.log(`[${new Date().toISOString()}] Session ${sessionId} now has ${roomSize} members`);
      socket.emit(EVENTS.SNAPSHOT, sessions.get(sessionId));
      io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in JOIN_SESSION:`, error);
      socket.emit('error', { message: 'Failed to join session' });
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
      socket.emit(EVENTS.SYNC_RESPONSE, { 
        sessionId, 
        positionMs: s.position,
        tempoBpm: s.tempoBpm,
        isPlaying: s.isPlaying
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SYNC_REQUEST:`, error);
    }
  });

  socket.on("disconnect", () => {
    try {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      // Clean up if leader disconnects
      sessions.forEach((session, sessionId) => {
        if (session.leaderSocketId === socket.id) {
          console.log(`[${new Date().toISOString()}] Leader disconnected from ${sessionId}, cleaning up`);
          session.leaderSocketId = null;
          session.isPlaying = false;
          session.message = "Leader disconnected";
          
          // Clear interval
          if (scrollIntervals.has(sessionId)) {
            clearInterval(scrollIntervals.get(sessionId));
            scrollIntervals.delete(sessionId);
          }
          
          io.to(sessionId).emit(EVENTS.SNAPSHOT, session);
          const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
          io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
        }
      });
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