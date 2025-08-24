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
 *   isPlaying: boolean
 * }>
 */
const sessions = new Map();

io.on("connection", (socket) => {
  socket.on(EVENTS.JOIN_SESSION, ({ sessionId }) => {
    socket.join(sessionId);
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { message: "Waiting for leader…", tempo: 100, position: 0, isPlaying: false });
    }
    socket.emit(EVENTS.SNAPSHOT, sessions.get(sessionId));
  });

  socket.on(EVENTS.UPDATE_MESSAGE, ({ sessionId, message }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.message = message;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.SET_TEMPO, ({ sessionId, tempo }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.tempo = tempo;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.PLAY, ({ sessionId }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.isPlaying = true;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.PAUSE, ({ sessionId }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.isPlaying = false;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });

  socket.on(EVENTS.SEEK, ({ sessionId, position }) => {
    const s = sessions.get(sessionId); if (!s) return;
    s.position = position;
    io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
  });
});

app.get("/", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`BandSync server listening on http://localhost:${PORT}`);
});