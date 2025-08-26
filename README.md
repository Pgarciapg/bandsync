# BandSync

Mobile + realtime server to keep bands literally on the same page.

## Quick Start
1. `nvm use` (Node v20)
2. Copy `.env.example` files to `.env` in each app.
3. Install deps: `npm install` (at repo root)
4. Start server: `npm run dev:server`
5. Start mobile: `npm run dev:mobile` (Expo)
6. Set `EXPO_PUBLIC_SERVER_URL` to your LAN IP (e.g. `http://192.168.1.21:3001`) for real devices.

## Server Setup

The server will try to connect to a Redis instance using `REDIS_HOST` and `REDIS_PORT` environment variables. Start a local Redis server with `brew services start redis` or `docker run -p 6379:6379 redis` for persistent session storage. If no Redis instance is available or the connection fails, the server gracefully falls back to an in-memory store (data will reset on restart).

## 30-Second Demo

**To demonstrate BandSync quickly:**

1. Start server and mobile app as above
2. Mobile app will auto-detect "demo" session and show **Demo Mode**
3. Tap "🚀 Start Demo" - this automatically:
   - Sets you as leader
   - Loads sample guitar tab
   - Sets tempo to 100 BPM  
   - Starts playback with scroll sync
   - Enables metronome with haptic feedback
4. Open app on second device as "Follower" to see real-time sync
5. Use tempo controls, play/pause, seek to demonstrate leader/follower sync
6. Toggle between Fake Tab and PDF views to show content flexibility

**Key demo points:**
- Real-time position synchronization
- Leader-only controls (followers can't control playback)
- Visual metronome with haptic beats
- Member count shows connected users
- Smooth scrolling tied to position

## Workspaces
- `apps/mobile`: Expo app with React Native
- `apps/server`: Express + socket.io with session management  
- `packages/shared`: shared code (future)