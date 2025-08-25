# Contributing to BandSync

Welcome to BandSync! This guide will help you contribute to our real-time musical collaboration platform.

## 🏗️ Monorepo Structure

BandSync uses a monorepo structure with workspaces for efficient development:

```
bandsync/
├── package.json           # Root workspace configuration
├── apps/
│   ├── mobile/            # React Native/Expo mobile app (TypeScript)
│   └── server/            # Node.js/Express backend with Socket.io
├── packages/
│   └── shared/            # Shared types, utilities, and constants
├── docs/                  # Architecture documentation
└── README.md
```

## 🚀 Development Setup

### Prerequisites

- **Node**: v20+ (use `.nvmrc`: `nvm use`)
- **npm**: Version 9+
- **Expo CLI**: `npm install -g @expo/cli`

### Quick Start

1. **Install all dependencies:**
   ```bash
   npm install
   ```

2. **Start development servers:**
   ```bash
   # Start both server and mobile concurrently
   npm run dev

   # Or start individually
   npm run dev:server  # Backend on http://localhost:3001
   npm run dev:mobile  # Mobile with Expo
   ```

3. **Verify setup:**
   - Open mobile app (Expo Go or simulator)
   - Connect to demo session
   - Test leader/follower role switching

## 📋 Development Workflow

### Branch Naming
- `feat/<short-description>` - New features
- `fix/<short-description>` - Bug fixes  
- `docs/<short-description>` - Documentation updates
- `chore/<short-description>` - Maintenance tasks

### Commit Format (Conventional)
```bash
# Examples:
git commit -m "feat(mobile): add leader/follower role switching"
git commit -m "fix(server): resolve session cleanup memory leak"
git commit -m "docs(api): update Socket.io event contracts"
git commit -m "chore: upgrade React Native to 0.79.6"
```

**Scopes:**
- `mobile` - Mobile app changes
- `server` - Backend changes
- `shared` - Shared package changes
- `docs` - Documentation changes

### PR Checklist ✅

Before submitting a Pull Request:

- [ ] **Code works locally**: Both server + mobile run without errors
- [ ] **Tests pass**: Run `npm test` in relevant workspaces
- [ ] **TypeScript compiles**: No type errors in mobile app
- [ ] **Follows conventions**: Consistent with existing code style
- [ ] **Documentation updated**: If adding new features or APIs
- [ ] **No secrets committed**: Use `.env.example` for new environment variables
- [ ] **Socket.io events**: Use shared constants from `packages/shared/events.js`
- [ ] **Cross-platform tested**: iOS and Android (for mobile changes)

## 🎯 Architecture Guidelines

### Socket.io Events (Critical for Day 4 handoff)

**✅ Always use shared constants:**
```javascript
import { EVENTS } from 'bandsync-shared';

// Good - Type-safe, consistent
socket.emit(EVENTS.SET_TEMPO, { sessionId, tempo: 120 });
socket.emit(EVENTS.PLAY, { sessionId });

// Bad - Magic strings, error-prone  
socket.emit('set_tempo', { sessionId, tempo: 120 });
```

**Event Categories:**
- `CRITICAL` - Sync, latency, drift correction
- `TIMING` - Metronome, tempo, beats
- `TRANSPORT` - Play, pause, seek
- `SESSION` - Join, leave, roles, state

### TypeScript Standards

- **Mobile App**: Full TypeScript with strict configuration
- **Shared Package**: TypeScript-first with comprehensive types
- **Server**: Gradual migration (existing JS files remain)

### Performance Requirements

- **Sub-100ms latency** for synchronization events
- **60fps smooth animations** on mobile
- **Support 100+ concurrent sessions** (architecture ready)

## 🔧 Common Development Tasks

### Adding New Socket.io Events

1. **Define event in shared package:**
   ```javascript
   // packages/shared/events.js
   export const EVENTS = {
     // ... existing events
     MY_NEW_EVENT: "my_new_event"
   };
   ```

2. **Add server handler:**
   ```javascript
   // apps/server/src/...
   import { EVENTS } from '../../../packages/shared/events.js';
   
   socket.on(EVENTS.MY_NEW_EVENT, (data) => {
     // Handle event
   });
   ```

3. **Use on mobile:**
   ```typescript
   // apps/mobile/src/...
   import { EVENTS } from 'bandsync-shared';
   
   emit(EVENTS.MY_NEW_EVENT, payload);
   ```

### Adding Shared Types

1. **Define in shared package:**
   ```typescript
   // packages/shared/types/session.ts
   export interface MyNewPayload {
     sessionId: string;
     data: any;
   }
   ```

2. **Export from index:**
   ```typescript
   // packages/shared/types/index.ts
   export * from './session.js';
   ```

3. **Use with type safety:**
   ```typescript
   import { MyNewPayload } from 'bandsync-shared';
   
   const payload: MyNewPayload = {
     sessionId: 'demo',
     data: { /* ... */ }
   };
   ```

## 🧪 Testing

### Run Tests
```bash
# All workspaces
npm test

# Specific workspace
cd packages/shared && npm test
cd apps/mobile && npm run type-check
```

### Manual Testing Scenarios

**Session Management:**
- [ ] Multiple devices join same session
- [ ] Leader controls work (play, pause, tempo)
- [ ] Follower receives updates in real-time
- [ ] Role switching functions properly

**Connection Resilience:**
- [ ] App handles server disconnection gracefully
- [ ] Reconnection works automatically
- [ ] Network status banner appears/disappears correctly

**Cross-Platform:**
- [ ] iOS and Android compatibility
- [ ] Consistent behavior across devices
- [ ] Touch interactions work smoothly

## 🚨 Troubleshooting

### Workspace Issues
```bash
# Clear all caches and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

### Expo Metro Issues
```bash
cd apps/mobile
npm start -- --clear
```

### Socket.io Connection Problems

1. **Check server URL** in `apps/mobile/src/config.js`
2. **Ensure same network** - both devices on same WiFi
3. **Check firewall settings** - allow port 3001
4. **Verify server is running** - visit http://localhost:3001 in browser

### TypeScript Errors
```bash
# Rebuild shared package
cd packages/shared
npm run build

# Check mobile app types
cd apps/mobile  
npm run type-check
```

## 📚 Key Resources

- **Socket.io Events**: `packages/shared/events.js` 
- **TypeScript Types**: `packages/shared/types/`
- **Mobile Components**: `apps/mobile/src/components/`
- **Server Architecture**: `apps/server/DEPLOYMENT.md`
- **Performance Analysis**: `UI_PERFORMANCE_ANALYSIS.md`

## 🤝 Getting Help

- **Questions**: Open GitHub Discussion
- **Bugs**: Create Issue with repro steps  
- **Features**: Issue with detailed requirements

---

**Ready for Day 4 Core Synchronization?** ✅ Architecture is consolidated and ready!