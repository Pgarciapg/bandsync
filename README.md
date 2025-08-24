# BandSync

Mobile + realtime server to keep bands literally on the same page.

## Quick Start
1. `nvm use` (Node v20)
2. Copy `.env.example` files to `.env` in each app.
3. Install deps: `npm install` (at repo root)
4. Start server: `npm run dev:server`
5. Start mobile: `npm run dev:mobile` (Expo)
6. Set `EXPO_PUBLIC_SERVER_URL` to your LAN IP (e.g. `http://192.168.1.21:3001`) for real devices.

## Workspaces
- `apps/mobile`: Expo app
- `apps/server`: Express + socket.io
- `packages/shared`: shared code (future)