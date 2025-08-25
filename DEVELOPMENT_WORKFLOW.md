# BandSync Development Workflow
*Unified conventions and practices established - Sprint Day 1*

## 🏗 Monorepo Structure

```
bandsync/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── server/          # Express + Socket.io server  
├── packages/
│   └── shared/          # Shared utilities and constants
├── docs/                # Documentation and guides
└── tools/               # Development tools and scripts
```

## 🛠 Development Commands

### Root Level (Workspace Management)
```bash
npm install              # Install all workspace dependencies
npm run dev:server       # Start development server  
npm run dev:mobile       # Start Expo development
npm run dev:sync         # Start both with sync testing
npm run test:all         # Run all workspace tests
npm run lint:all         # Lint all workspaces
npm run typecheck:all    # TypeScript checking
npm run build:all        # Build all production assets
```

### Mobile App Commands
```bash
cd apps/mobile
npm start                # Expo development server
npm run android          # Run on Android device/simulator
npm run ios              # Run on iOS device/simulator  
npm run web              # Run in web browser
npm run test             # Run mobile tests
npm run lint             # ESLint for mobile code
```

### Server Commands  
```bash
cd apps/server
npm run dev              # Development server with nodemon
npm run start            # Production server
npm run test             # Server tests
npm run lint             # ESLint for server code
```

## 📋 Code Standards

### TypeScript Migration
- **Target**: Full TypeScript conversion by Week 2
- **Files**: Start with hooks, then components, then screens
- **Config**: Shared `tsconfig.json` at workspace root
- **Strategy**: Gradual migration with `.js` → `.ts` extension changes

### ESLint + Prettier Configuration
```json
// .eslintrc.js (workspace root)
{
  "extends": [
    "@expo/eslint-config",  
    "@react-native-community",
    "prettier"
  ],
  "rules": {
    "no-console": "warn",
    "react-hooks/exhaustive-deps": "error",
    "react-native/no-unused-styles": "error"
  }
}
```

### Import/Export Patterns
```javascript
// Absolute imports from shared package
import { SOCKET_EVENTS } from '@bandsync/shared';

// Relative imports within workspace
import { useSocket } from '../hooks/useSocket';

// Named exports preferred over default exports
export { SessionScreen } from './SessionScreen';
```

## 🧪 Testing Strategy

### Mobile Testing (React Native Testing Library)
```javascript
// Component testing pattern
import { render, fireEvent } from '@testing-library/react-native';
import { SessionScreen } from '../SessionScreen';

test('should start metronome when play pressed', () => {
  const { getByTestId } = render(<SessionScreen />);
  fireEvent.press(getByTestId('play-button'));
  expect(getByTestId('metronome')).toBeTruthy();
});
```

### Server Testing (Jest + Supertest)
```javascript
// Socket event testing pattern
import request from 'supertest';
import { createServer } from '../server';

test('should join session successfully', async () => {
  const response = await request(app)
    .post('/api/sessions/join')
    .send({ sessionId: 'test-session' });
  expect(response.status).toBe(200);
});
```

## 🔄 Git Workflow

### Branch Strategy
- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/**: Individual feature development
- **hotfix/**: Critical production fixes

### Commit Convention
```bash
# Format: type(scope): description
feat(mobile): add role-switching UI animations
fix(server): resolve session cleanup memory leak  
chore(deps): upgrade React to v19
docs(readme): update setup instructions
test(mobile): add SessionScreen component tests
```

### Pull Request Process
1. **Feature Branch**: Create from `develop`
2. **Development**: Implement with tests
3. **Self-Review**: Run full test suite and linting
4. **PR Creation**: Template with testing checklist
5. **Review**: Code review by peer/maintainer
6. **Merge**: Squash and merge to `develop`

## 🚀 CI/CD Pipeline (Future)

### GitHub Actions Workflow
```yaml
# .github/workflows/ci.yml
name: CI/CD
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:all
      - run: npm run lint:all
      - run: npm run typecheck:all
```

### Deployment Targets
- **Server**: Heroku/Railway deployment
- **Mobile**: Expo EAS Build for App Store/Play Store
- **Monitoring**: Integration with error tracking and analytics

## 🏷 Environment Management

### Development Environments
```bash
# .env.example files in each workspace
# apps/server/.env.example
NODE_ENV=development
PORT=3001
REDIS_URL=redis://localhost:6379

# apps/mobile/.env.example  
EXPO_PUBLIC_SERVER_URL=http://localhost:3001
EXPO_PUBLIC_ENV=development
```

### Environment Loading
- **Server**: `dotenv` package for `.env` loading
- **Mobile**: Expo's built-in environment variable handling
- **Shared**: Environment-specific configurations in `packages/shared`

## 📦 Dependency Management

### Workspace Dependencies
```json
// package.json (root)
{
  "workspaces": ["apps/*", "packages/*"],
  "devDependencies": {
    "eslint": "^8.0.0",
    "prettier": "^3.0.0", 
    "typescript": "^5.0.0",
    "jest": "^29.0.0"
  }
}
```

### Version Alignment
- **React/React Native**: Consistent versions across workspaces
- **TypeScript**: Shared configuration and version
- **ESLint/Prettier**: Consistent formatting rules
- **Socket.io**: Client/server version compatibility

## 🔧 Development Tools

### VS Code Extensions
- **Expo Tools**: React Native/Expo development
- **ESLint**: Real-time linting
- **Prettier**: Code formatting
- **TypeScript**: Enhanced TypeScript support
- **Jest**: Test runner integration

### Recommended Settings
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "emmet.includeLanguages": {
    "javascript": "javascriptreact"
  }
}
```

## 🎯 Performance Guidelines

### Mobile Optimization
- **FlatList**: For large data sets over ScrollView
- **Memoization**: React.memo for expensive components
- **Image Optimization**: Proper caching and sizing
- **Bundle Analysis**: Regular bundle size monitoring

### Server Optimization  
- **Connection Pooling**: Database and Redis connections
- **Event Throttling**: Rate limiting for high-frequency events
- **Memory Management**: Session cleanup and garbage collection
- **Response Caching**: Static and computed responses

---

*Development workflow established - Ready for collaborative development and production deployment*