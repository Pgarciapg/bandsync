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

const scrollIntervals = new Map(); // sessionId -> intervalId

let sessionStore;

async function initStore() {
  const redisHost = process.env.REDIS_HOST || "127.0.0.1";
  const redisPort = process.env.REDIS_PORT || "6379";
  try {
    const { createClient } = await import("redis");
    const client = createClient({ socket: { host: redisHost, port: Number(redisPort) } });
    client.on("error", (err) =>
      console.error(`[${new Date().toISOString()}] Redis error`, err)
    );
    await client.connect();
    console.log(
      `[${new Date().toISOString()}] Connected to Redis at ${redisHost}:${redisPort}`
    );
    sessionStore = {
      async get(id) {
        const data = await client.get(id);
        return data ? JSON.parse(data) : null;
      },
      async set(id, value) {
        await client.set(id, JSON.stringify(value));
      },
      async has(id) {
        return (await client.exists(id)) === 1;
      },
      async delete(id) {
        await client.del(id);
      },
      async entries() {
        const keys = await client.keys("*");
        const result = [];
        for (const key of keys) {
          const val = await client.get(key);
          if (val) result.push([key, JSON.parse(val)]);
        }
        return result;
      }
    };
  } catch (err) {
    console.warn(
      `[${new Date().toISOString()}] Redis unavailable (${err.message}); using in-memory store`
    );
    const sessions = new Map();
    sessionStore = {
      async get(id) {
        return sessions.get(id);
      },
      async set(id, value) {
        sessions.set(id, value);
      },
      async has(id) {
        return sessions.has(id);
      },
      async delete(id) {
        sessions.delete(id);
      },
      async entries() {
        return Array.from(sessions.entries());
      }
    };
  }
}

await initStore();

io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);

  socket.on(EVENTS.JOIN_SESSION, async ({ sessionId }) => {
    try {
      console.log(`[${new Date().toISOString()}] JOIN_SESSION: ${socket.id} -> ${sessionId}`);
      socket.join(sessionId);
      if (!(await sessionStore.has(sessionId))) {
        await sessionStore.set(sessionId, {
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
      socket.emit(EVENTS.SNAPSHOT, await sessionStore.get(sessionId));
      io.to(sessionId).emit(EVENTS.ROOM_STATS, { sessionId, memberCount: roomSize });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in JOIN_SESSION:`, error);
      socket.emit("error", { message: "Failed to join session" });
    }
  });

  socket.on(EVENTS.UPDATE_MESSAGE, async ({ sessionId, message }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      console.log(`[${new Date().toISOString()}] UPDATE_MESSAGE: ${sessionId} -> "${message}"`);
      s.message = message;
      await sessionStore.set(sessionId, s);
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in UPDATE_MESSAGE:`, error);
    }
  });

  socket.on(EVENTS.SET_ROLE, async ({ sessionId, role }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      console.log(`[${new Date().toISOString()}] SET_ROLE: ${socket.id} -> ${role} in ${sessionId}`);
      if (role === "leader") {
        s.leaderSocketId = socket.id;
        s.message = "Leader connected";
        console.log(`[${new Date().toISOString()}] New leader set: ${socket.id} in ${sessionId}`);
      }
      await sessionStore.set(sessionId, s);
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_ROLE:`, error);
    }
  });

  socket.on(EVENTS.SET_TEMPO, async ({ sessionId, tempo }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(
          `[${new Date().toISOString()}] BLOCKED SET_TEMPO: ${socket.id} not leader in ${sessionId}`
        );
        return;
      }
      console.log(`[${new Date().toISOString()}] SET_TEMPO: ${sessionId} -> ${tempo} BPM`);
      s.tempo = tempo;
      s.tempoBpm = tempo;
      await sessionStore.set(sessionId, s);
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SET_TEMPO:`, error);
    }
  });

  socket.on(EVENTS.PLAY, async ({ sessionId }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(
          `[${new Date().toISOString()}] BLOCKED PLAY: ${socket.id} not leader in ${sessionId}`
        );
        return;
      }
      console.log(
        `[${new Date().toISOString()}] PLAY: ${sessionId} at tempo ${s.tempoBpm} BPM`
      );
      s.isPlaying = true;
      await sessionStore.set(sessionId, s);
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);

      // Start scroll tick interval
      if (!scrollIntervals.has(sessionId)) {
        console.log(`[${new Date().toISOString()}] Starting scroll ticker for ${sessionId}`);
        const interval = setInterval(async () => {
          const session = await sessionStore.get(sessionId);
          if (session && session.isPlaying) {
            session.position += 100; // advance 100ms
            await sessionStore.set(sessionId, session);
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

  socket.on(EVENTS.PAUSE, async ({ sessionId }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(
          `[${new Date().toISOString()}] BLOCKED PAUSE: ${socket.id} not leader in ${sessionId}`
        );
        return;
      }
      console.log(`[${new Date().toISOString()}] PAUSE: ${sessionId}`);
      s.isPlaying = false;
      await sessionStore.set(sessionId, s);
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

  socket.on(EVENTS.SEEK, async ({ sessionId, position }) => {
    try {
      const s = await sessionStore.get(sessionId);
      if (!s) return;
      if (s.leaderSocketId !== socket.id) {
        console.log(
          `[${new Date().toISOString()}] BLOCKED SEEK: ${socket.id} not leader in ${sessionId}`
        );
        return;
      }
      console.log(`[${new Date().toISOString()}] SEEK: ${sessionId} -> ${position}ms`);
      s.position = position;
      await sessionStore.set(sessionId, s);
      io.to(sessionId).emit(EVENTS.SNAPSHOT, s);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR in SEEK:`, error);
    }
  });

  socket.on(EVENTS.SYNC_REQUEST, async ({ sessionId }) => {
    try {
      const s = await sessionStore.get(sessionId);
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

  socket.on("disconnect", async () => {
    try {
      console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
      // Clean up if leader disconnects
      const entries = await sessionStore.entries();
      for (const [sessionId, session] of entries) {
        if (session.leaderSocketId === socket.id) {
          console.log(
            `[${new Date().toISOString()}] Leader disconnected from ${sessionId}, cleaning up`
          );
          session.leaderSocketId = null;
          session.isPlaying = false;
          session.message = "Leader disconnected";

          // Clear interval
          if (scrollIntervals.has(sessionId)) {
            clearInterval(scrollIntervals.get(sessionId));
            scrollIntervals.delete(sessionId);
          }

          await sessionStore.set(sessionId, session);
          io.to(sessionId).emit(EVENTS.SNAPSHOT, session);
          const roomSize = io.sockets.adapter.rooms.get(sessionId)?.size || 0;
          io.to(sessionId).emit(EVENTS.ROOM_STATS, {
            sessionId,
            memberCount: roomSize
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