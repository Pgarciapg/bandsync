# BandSync Test Suite

Comprehensive automated testing framework for BandSync real-time synchronization accuracy and performance validation.

## Overview

The BandSync test suite ensures sub-100ms synchronization accuracy across multiple devices under various network conditions. It includes unit tests, integration tests, performance benchmarks, and real-time validation tools.

## Test Structure

```
__tests__/
├── unit/                    # Unit tests
│   ├── mobile/             # React Native hook tests
│   └── server/             # Server-side logic tests
├── integration/            # Integration tests
│   ├── multi-device-sync.test.js      # 2-6 device sync tests
│   └── network-conditions.test.js     # Network simulation tests
├── performance/            # Performance benchmarks
│   └── latency-benchmark.test.js      # Latency measurement tests
├── utils/                  # Testing utilities
│   ├── network-simulator.js           # Network condition simulation
│   └── sync-validator.js              # Sync accuracy validation
└── automation/             # Test automation scripts
    ├── test-runner.js                  # Comprehensive test runner
    └── quick-sync-test.js             # Rapid development testing
```

## Key Test Scenarios

### 1. Synchronization Accuracy Tests
- **Target**: <50ms average sync accuracy
- **Limit**: <100ms maximum sync drift
- **Coverage**: 2-6 concurrent devices
- **Validation**: Real-time position synchronization

### 2. Network Condition Tests
- **Local Network**: <25ms sync accuracy
- **Broadband**: <50ms sync accuracy  
- **Mobile 4G**: <75ms sync accuracy
- **Poor WiFi**: Graceful degradation
- **High Packet Loss**: 20% packet loss resilience

### 3. Performance Benchmarks
- **Connection Latency**: <100ms initial connection
- **Event Response**: <50ms average response time
- **Scroll Tick Accuracy**: ±20ms timing precision
- **Load Testing**: 8+ concurrent devices

### 4. Edge Case Testing
- **Leader Disconnection**: Graceful state recovery
- **Network Interruption**: Automatic reconnection
- **Rapid Tempo Changes**: 50+ BPM changes/second
- **Extended Sessions**: 30+ minute stability

## Running Tests

### Quick Development Test
```bash
# Rapid 2-device sync validation (30 seconds)
npm run test:quick

# Or directly:
node __tests__/automation/quick-sync-test.js
```

### Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only  
npm run test:integration

# Performance benchmarks only
npm run test:performance

# Synchronization-focused tests
npm run test:sync
```

### Comprehensive Test Suite
```bash
# Full automated test suite (10-15 minutes)
npm test

# Or with custom runner:
node __tests__/automation/test-runner.js all

# CI-friendly output:
node __tests__/automation/test-runner.js all --ci
```

### Test Runner Options
```bash
# Disable parallel execution
node __tests__/automation/test-runner.js all --no-parallel

# Skip code coverage
node __tests__/automation/test-runner.js all --no-coverage

# Fail fast on first error
node __tests__/automation/test-runner.js all --bail

# Quiet output
node __tests__/automation/test-runner.js all --quiet
```

## Test Reports

### Automated Reporting
- **JSON Reports**: `test-reports/test-report-{timestamp}.json`
- **Summary**: `test-reports/latest-summary.json`
- **Human Readable**: `test-reports/latest-report.txt`

### Coverage Reports
- **Unit Tests**: 90%+ line coverage required
- **Critical Paths**: 100% sync logic coverage
- **Integration**: End-to-end scenario coverage

### Performance Metrics
- **Latency Tracking**: Real-time measurement
- **Sync Accuracy**: Statistical analysis
- **Network Resilience**: Condition simulation
- **Load Testing**: Concurrent user simulation

## Continuous Integration

### GitHub Actions Workflow
The test suite integrates with GitHub Actions for automated validation:

```yaml
# Triggered on:
- Push to main/develop branches
- Pull requests
- Nightly scheduled runs
- Manual triggers with [full-test] in commit message
```

### Quality Gates
1. **Unit Tests**: Must pass with 90%+ coverage
2. **Integration Tests**: All sync scenarios must pass
3. **Performance Tests**: Latency thresholds must be met
4. **Deployment Ready**: All tests pass for main branch

### Test Matrix
- **Node.js Versions**: 18, 20
- **Test Groups**: Unit (mobile/server), Integration, Performance
- **Parallel Execution**: Optimized for CI environment
- **Artifact Collection**: Reports and logs for debugging

## Development Workflow Integration

### Pre-commit Testing
```bash
# Quick validation before commit
npm run test:quick

# Specific synchronization tests
npm run test:sync
```

### Local Development
```bash
# Watch mode for unit tests
npm run test:watch

# Debug mode with verbose output
npm run test:unit -- --verbose

# Coverage analysis
npm run test:coverage
```

### Performance Monitoring
```bash
# Latency benchmarks
npm run test:performance

# Network condition simulation
npm run test:integration -- --testPathPattern=network-conditions
```

## Synchronization Validation Framework

### Real-time Monitoring
The `SyncAccuracyValidator` provides:
- **Live Drift Detection**: <100ms drift alerts
- **Timing Analysis**: Interval consistency validation
- **Cross-device Sync**: Position accuracy verification
- **Performance Grading**: A+ to F rating system

### Network Simulation
The `NetworkSimulator` supports:
- **Connection Presets**: Local, Broadband, Mobile, Satellite
- **Custom Conditions**: Latency, jitter, packet loss
- **Degradation Testing**: Gradual network deterioration
- **Stress Scenarios**: High-load condition testing

### Usage Example
```javascript
import { SyncAccuracyValidator, RealTimeSyncMonitor } from './utils/sync-validator.js';

const validator = new SyncAccuracyValidator({
  targetSyncAccuracy: 50,  // 50ms target
  maxAcceptableDrift: 100  // 100ms limit
});

const monitor = new RealTimeSyncMonitor(validator);
const measurement = validator.startMeasurement('MyTest');

// Record events during test
measurement.recordEvent('device1', 'scroll_tick', { position: 1000 });
measurement.recordEvent('device2', 'scroll_tick', { position: 1000 });

// Analyze results
const analysis = measurement.complete();
console.log(`Sync Grade: ${analysis.grade}`);
console.log(`Avg Accuracy: ${analysis.synchronization.avgSyncAccuracy}ms`);
```

## Troubleshooting

### Common Issues

1. **High Sync Drift**
   - Check server processing times
   - Verify network conditions
   - Review Socket.IO configuration

2. **Test Timeouts**  
   - Increase timeout values for slow networks
   - Check server startup times
   - Verify dependency installation

3. **Network Simulation Issues**
   - Ensure no real network interference
   - Check port availability (3001-3010)
   - Verify WebSocket support

### Debug Mode
```bash
# Enable debug logging
DEBUG=bandsync:* npm test

# Verbose test output
npm test -- --verbose

# Single test debugging
npm test -- --testNamePattern="specific test name"
```

### Performance Analysis
```bash
# Generate detailed performance report
npm run test:performance -- --verbose > perf-report.txt

# Memory usage analysis
node --inspect __tests__/automation/test-runner.js performance
```

## Contributing

### Test Development Guidelines

1. **Sync Accuracy Focus**: All tests should validate synchronization accuracy
2. **Real-world Scenarios**: Test realistic network and usage conditions
3. **Performance Awareness**: Include latency and throughput measurements
4. **Error Resilience**: Test failure and recovery scenarios
5. **Cross-platform**: Ensure tests work across different environments

### Adding New Tests

1. **Unit Tests**: Add to `__tests__/unit/[mobile|server]/`
2. **Integration**: Add to `__tests__/integration/`
3. **Performance**: Add to `__tests__/performance/`
4. **Update Runner**: Add new test patterns to `test-runner.js`

### Validation Requirements

- All new sync features must include accuracy tests
- Performance tests for latency-critical code
- Network condition testing for robustness
- Documentation updates for new test scenarios

---

## Test Results Interpretation

### Grade Scale
- **A+**: <25ms avg, <50ms max drift (Excellent)
- **A**: <50ms avg, <100ms max drift (Very Good) 
- **B**: <75ms avg, <150ms max drift (Good)
- **C**: <100ms avg, <200ms max drift (Acceptable)
- **D**: <150ms avg, <300ms max drift (Poor)
- **F**: >150ms avg, >300ms max drift (Unacceptable)

### Success Criteria
- **Development**: Grade C or better
- **Staging**: Grade B or better  
- **Production**: Grade A or better
- **Target**: Grade A+ for optimal experience

For detailed API documentation and advanced usage scenarios, see the individual test files and utility modules.