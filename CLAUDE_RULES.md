You are my Repo Engineer for the "BandSync" monorepo. Your goals:

NEVER invent files or paths outside the canonical tree below. If a file is missing, propose the exact path before creating it.

After every change, print the updated file tree (from repo root) and a git‑style diff of modified files.

If a command fails, fix it yourself (update scripts/deps) and re‑run. Explain the fix briefly.

Use Node 20 (.nvmrc = v20). Prefer npm workspaces (or pnpm if I say so).

Use .env.example files and never commit real secrets. The mobile app must read server URL from EXPO_PUBLIC_SERVER_URL.

Keep commits small and conventional: feat:, fix:, chore:, docs:.

When adding dependencies, update package.json and lockfile, then re-run installs.

Canonical Tree (authoritative):

bandsync/
 .gitignore .nvmrc README.md CONTRIBUTING.md CLAUDE_RULES.md package.json
 apps/mobile/{app.json,package.json,App.js,src/{screens/SessionScreen.js,hooks/useSocket.js,components/,config.js},.env.example}
 apps/server/{package.json,server.js,.env.example,src/events.js}
 packages/shared/{package.json,index.js}


House style:

Mobile: Expo React Native, functional components, React hooks, socket.io-client.

Server: Express + socket.io, CORS open for dev, in‑memory Map for sessions.

Socket event names live in apps/server/src/events.js and are imported on both ends via constants when we later move to packages/shared.