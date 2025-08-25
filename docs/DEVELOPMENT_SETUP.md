# BandSync Development Setup Guide

Complete guide for setting up BandSync development environment on macOS, Windows, and Linux.

## 🚀 Quick Start (5 minutes)

```bash
# 1. Clone and install
git clone https://github.com/bandsync/bandsync.git
cd bandsync
npm install

# 2. Start development servers
npm run dev

# 3. Open mobile app
# - Install Expo Go on your phone
# - Scan QR code from terminal
# - Or press 'i' for iOS simulator / 'a' for Android emulator
```

## 📋 Prerequisites

### Required Software

- **Node.js**: v18.17+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm**: v9+
- **Git**: Latest version
- **Expo CLI**: `npm install -g @expo/cli`

### Mobile Development (Optional)

- **iOS Development** (macOS only):
  - Xcode 14+ (from Mac App Store)
  - iOS Simulator (included with Xcode)

- **Android Development** (all platforms):
  - Android Studio
  - Android SDK and emulator

### Network Configuration

- **Same WiFi Network**: All devices must be on same network for testing
- **Firewall**: Allow port 3001 for server connections
- **Router**: Some routers block device-to-device communication (disable AP isolation)

## 🏗️ Project Structure

```
bandsync/
├── package.json           # Root workspace config & scripts
├── apps/
│   ├── mobile/            # React Native/Expo mobile app
│   │   ├── App.tsx        # Entry point
│   │   ├── src/
│   │   │   ├── screens/   # SessionScreen, etc.
│   │   │   ├── components/# Reusable components
│   │   │   ├── hooks/     # useSocket, etc.
│   │   │   └── constants/ # Colors, config
│   │   └── package.json
│   └── server/            # Node.js/Express backend
│       ├── server.js      # Basic server
│       ├── server-enhanced.js # Production server
│       ├── src/           # Server modules
│       └── package.json
├── packages/
│   └── shared/            # Shared types & utilities
│       ├── events.js      # Socket.io event constants
│       ├── types/         # TypeScript interfaces
│       └── utils/         # Timing utilities
└── docs/                  # Architecture & API docs
```

## 🔧 Development Workflow

### 1. Initial Setup

```bash
# Use correct Node version (if using nvm)
nvm use

# Install all dependencies (monorepo)
npm install

# Build shared package
npm run build:shared

# Verify setup
npm run workspace-info
```

### 2. Start Development Servers

#### Option A: Both servers together (recommended)
```bash
npm run dev
# Starts both server and mobile concurrently
# Server: http://localhost:3001
# Mobile: Expo dev server
```

#### Option B: Individual servers
```bash
# Terminal 1: Backend server
npm run dev:server

# Terminal 2: Mobile app  
npm run dev:mobile

# Terminal 3: Shared package (if making changes)
npm run dev:shared
```

### 3. Mobile App Access

#### Physical Device (Recommended)
1. Install **Expo Go** app on your phone
2. Connect phone to same WiFi as computer
3. Scan QR code from terminal
4. App loads automatically

#### iOS Simulator (macOS only)
```bash
# In mobile terminal, press 'i' or run:
npm run ios
```

#### Android Emulator
```bash
# Start Android emulator first, then press 'a' or run:
npm run android
```

#### Web Browser
```bash
# Press 'w' or run:
npm run web
# Note: Limited functionality compared to mobile
```

### 4. Development Commands

```bash
# Linting & Type Checking
npm run lint                # All workspaces
npm run type-check          # TypeScript check

# Testing
npm test                    # All tests
npm run test:shared         # Shared package tests
npm run test:coverage       # Coverage report

# Building
npm run build               # All workspaces
npm run build:server        # Production server build
npm run build:mobile        # Mobile app build

# Cleanup
npm run clean               # Clear caches and builds
npm run clean:deps          # Remove node_modules
```

## 🌐 Server Configuration

### Environment Variables

Create `.env` file in `apps/server/`:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration  
CORS_ORIGIN=*

# Redis Configuration (for production scaling)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=15000
RATE_LIMIT_MAX_REQUESTS=100
```

### Server URLs

Update mobile app server URL in `apps/mobile/src/config.js`:

```javascript
// For local development
export const SERVER_URL = "http://192.168.1.100:3001"; // Your computer's LAN IP

// For iOS Simulator (uses localhost)
export const SERVER_URL = "http://localhost:3001";

// For Android Emulator
export const SERVER_URL = "http://10.0.2.2:3001";
```

**Finding your LAN IP:**
- **macOS/Linux**: `ifconfig | grep inet`
- **Windows**: `ipconfig`
- Look for IP starting with `192.168.x.x` or `10.0.x.x`

## 📱 Mobile Development

### TypeScript Configuration

Mobile app uses strict TypeScript. Config in `apps/mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "bandsync-shared": ["../../packages/shared"]
    }
  }
}
```

### Using Shared Package

```typescript
// Import shared constants and types
import { 
  EVENTS, 
  SessionState, 
  JoinSessionPayload 
} from 'bandsync-shared';

// Type-safe Socket.io usage
const payload: JoinSessionPayload = {
  sessionId: 'demo',
  displayName: 'John Doe',
  role: 'follower'
};

socket.emit(EVENTS.JOIN_SESSION, payload);
```

### Component Development

```typescript
// apps/mobile/src/components/MyComponent.tsx
import React from 'react';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

export function MyComponent() {
  return (
    <ThemedView>
      <ThemedText type="title">Hello BandSync</ThemedText>
    </ThemedView>
  );
}
```

## 🧪 Testing & Debugging

### Manual Testing Checklist

#### Single Device Testing
- [ ] Server starts without errors (http://localhost:3001)
- [ ] Mobile app connects to server
- [ ] Can join session as leader/follower
- [ ] Play/pause controls work
- [ ] Tempo slider updates

#### Multi-Device Testing
- [ ] Two devices join same session
- [ ] Leader controls sync to follower
- [ ] Role switching works
- [ ] Network disconnection handling
- [ ] Leader transfer on disconnect

### Common Issues & Solutions

#### Mobile App Won't Connect

**Problem**: "Connection failed" or infinite loading

**Solutions**:
1. **Check server URL**: Verify IP address in `apps/mobile/src/config.js`
2. **Same network**: Ensure all devices on same WiFi
3. **Firewall**: Allow port 3001 through firewall
4. **Router settings**: Disable AP isolation if enabled
5. **Server running**: Verify server is running on correct port

```bash
# Test server accessibility
curl http://YOUR_IP:3001
# Should return: {"ok":true}
```

#### Metro Bundler Issues

**Problem**: Metro cache errors or stale builds

**Solution**:
```bash
cd apps/mobile
npm start -- --clear
# Or restart with cache clearing
```

#### TypeScript Errors

**Problem**: Import errors or type mismatches

**Solution**:
```bash
# Rebuild shared package
cd packages/shared
npm run build

# Check types in mobile app
cd apps/mobile
npm run type-check
```

#### Workspace Issues

**Problem**: Package not found or version conflicts

**Solution**:
```bash
# Nuclear option: clean and reinstall
npm run clean:deps
npm install
```

### Debugging Tools

#### Server Logging
Server provides detailed logging with timestamps:
```
[2024-01-25T10:30:15.123Z] Client connected: abc123
[2024-01-25T10:30:15.234Z] JOIN_SESSION: abc123 -> demo as follower
```

#### Mobile Debugging
- **React Native Debugger**: Advanced debugging tool
- **Expo DevTools**: Built-in debugging interface
- **Chrome DevTools**: For web debugging (press `w`)

#### Network Analysis
```bash
# Check server connections
netstat -an | grep :3001

# Monitor Socket.io events (server logs)
# Look for event patterns and timing
```

## 🚀 Production Deployment

### Server Deployment

```bash
# Build production server
npm run build:server

# Start production server
cd apps/server
npm start
```

### Mobile App Deployment

```bash
# Build for production
cd apps/mobile

# iOS (requires Apple Developer account)
npx expo build:ios

# Android 
npx expo build:android
```

### Environment-Specific Config

Create environment-specific config files:

```typescript
// apps/mobile/src/config/index.ts
const config = {
  development: {
    SERVER_URL: 'http://192.168.1.100:3001'
  },
  production: {
    SERVER_URL: 'https://bandsync-api.example.com'
  }
};

export default config[process.env.NODE_ENV || 'development'];
```

## 📚 Additional Resources

### Documentation
- [Socket.io Event Contracts](./SOCKET_IO_EVENTS.md)
- [Architecture Overview](../README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)

### External Links
- [React Native Documentation](https://reactnative.dev/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [Socket.io Client API](https://socket.io/docs/v4/client-api/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Community
- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and community support

---

**Ready to build real-time musical collaboration!** 🎵✨

Need help? Check the troubleshooting section above or open a GitHub issue.