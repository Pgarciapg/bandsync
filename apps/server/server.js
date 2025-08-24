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
  socket.on(EVENTS.JOIN_SESSION, ({ sessionId }) => {
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
    }
    socket.emit(EVENTS.SNAPSHOT, sessions.get(sessionId));
  });

  socket.on(EVENTS.UPDATE_MESSAGE, ({ sessionId, message }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.message = message;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.SET_ROLE, ({ sessionId, role }) => {
    const s = sessions.get(sessionId); if (!s) return;
    if (role === "leader") {
      s.leaderSocketId = socket.id;
      s.message = "Leader connected";
    }
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
    const s = sessions.get(sessionId); if (!s) return;
    // Only leader can set tempo
    if (s.leaderSocketId !== socket.id) return;
    s.tempo = tempo;
    s.tempoBpm = tempo;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.PLAY, ({ sessionId }) => {
    const s = sessions.get(sessionId); if (!s) return;
    // Only leader can play
    if (s.leaderSocketId !== socket.id) return;
    s.isPlaying = true;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    
    // Start scroll tick interval
    if (!scrollIntervals.has(sessionId)) {
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
  });

  socket.on(EVENTS.PAUSE, ({ sessionId }) => {
    const s = sessions.get(sessionId); if (!s) return;
    // Only leader can pause
    if (s.leaderSocketId !== socket.id) return;
    s.isPlaying = false;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    
    // Clear scroll tick interval
    if (scrollIntervals.has(sessionId)) {
      clearInterval(scrollIntervals.get(sessionId));
      scrollIntervals.delete(sessionId);
    }
  });

  socket.on(EVENTS.SEEK, ({ sessionId, position }) => {
    const s = sessions.get(sessionId); if (!s) return;
    // Only leader can seek
    if (s.leaderSocketId !== socket.id) return;
    s.position = position;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.SYNC_REQUEST, ({ sessionId }) => {
    const s = sessions.get(sessionId); if (!s) return;
    socket.emit(EVENTS.SYNC_RESPONSE, { 
      sessionId, 
      positionMs: s.position,
      tempoBpm: s.tempoBpm,
      isPlaying: s.isPlaying
    });
  });

  socket.on("disconnect", () => {
    // Clean up if leader disconnects
    sessions.forEach((session, sessionId) => {
      if (session.leaderSocketId === socket.id) {
        session.leaderSocketId = null;
        session.isPlaying = false;
        session.message = "Leader disconnected";
        
        // Clear interval
        if (scrollIntervals.has(sessionId)) {
          clearInterval(scrollIntervals.get(sessionId));
          scrollIntervals.delete(sessionId);
        }
        
        io.to(sessionId).emit(EVENTS.SNAPSHOT, session);
      }
    });
  });
});

app.get("/", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`BandSync server listening on http://localhost:${PORT}`);
});