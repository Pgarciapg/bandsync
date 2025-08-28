# BandSync

Mobile + realtime server to keep bands literally on the same page.

## Quick Start
1. `nvm use` (Node v20)
2. Copy `.env.example` files to `.env` in each app.
3. Install deps: `npm install` (at repo root)
4. Start server: `npm run dev:server`
5. Start mobile: `npm run dev:mobile` (Expo)
6. Set `EXPO_PUBLIC_SERVER_URL` to your LAN IP (e.g. `http://192.168.1.21:3001`) for real devices.

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

## Run iOS

### Prerequisites
- macOS with Xcode 16.4 or later
- Node.js 20.x (use `nvm use 20` to switch)
- iOS Simulator or physical iOS device

### First-time setup:
```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp apps/mobile/.env.example apps/mobile/.env

# 3. Generate iOS project (if ios/ folder doesn't exist)
cd apps/mobile && npx expo prebuild -p ios
```

### Launch on iOS Simulator:
```bash
# From repository root
export PATH="$HOME/.rbenv/bin:$PATH" && eval "$(rbenv init -)"
cd apps/mobile && npx expo run:ios
```

The app will automatically:
- Build the native iOS project
- Install CocoaPods dependencies
- Launch iOS Simulator (iPhone 16 Pro by default)
- Start Metro bundler
- Open the BandSync app

### Alternative launch method:
```bash
# Start Metro bundler first
npm --workspace apps/mobile run start

# Then press 'i' in the terminal to launch iOS simulator
```

## Clean

If you encounter build issues, try these steps:

### Clean Metro cache:
```bash
npm --workspace apps/mobile run start -- --clear-cache
```

### Clean iOS build:
```bash
cd apps/mobile
rm -rf ios/build
npx expo prebuild -p ios --clear
```

### Clean everything:
```bash
# Clean node modules and reinstall
rm -rf node_modules apps/mobile/node_modules
npm install

# Clean iOS and rebuild
cd apps/mobile
rm -rf ios
npx expo prebuild -p ios
```

## Known Issues

### CocoaPods Installation
- If CocoaPods installation fails, the build process will handle it automatically
- On older Ruby versions, you may need to install Ruby 3.1+ via rbenv:
  ```bash
  curl -fsSL https://github.com/rbenv/rbenv-installer/raw/HEAD/bin/rbenv-installer | bash
  export PATH="$HOME/.rbenv/bin:$PATH"
  eval "$(rbenv init -)"
  rbenv install 3.1.0
  rbenv global 3.1.0
  gem install cocoapods
  ```

### Simulator Selection
- App defaults to iPhone 16 Pro if iPhone 15 is not available
- Use `xcrun simctl list devices` to see available simulators

### Metro Bundle Issues
- If Metro bundler fails to start, ensure the monorepo Metro config is properly set up
- The `metro.config.js` should use `expo/metro-config` for Expo projects

## Workspaces
- `apps/mobile`: Expo app with React Native
- `apps/server`: Express + socket.io with session management  
- `packages/shared`: shared code (future)