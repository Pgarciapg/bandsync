// Performance configuration for mobile app optimization
export const PERFORMANCE_CONFIG = {
  // Real-time synchronization settings
  SYNC: {
    // Maximum allowed latency for real-time sync (ms)
    MAX_REALTIME_LATENCY: 100,
    // Jitter threshold for connection quality (ms)  
    MAX_JITTER: 30,
    // Update throttle interval for position updates (ms)
    POSITION_UPDATE_THROTTLE: 16, // ~60fps
    // Debounce interval for room stats updates (ms)
    ROOM_STATS_DEBOUNCE: 100,
    // Ping interval for latency measurement (ms)
    PING_INTERVAL: 5000,
  },

  // Animation and rendering settings
  RENDERING: {
    // Target frame rate for animations
    TARGET_FPS: 60,
    // Animation duration for smooth scrolling (ms)
    SMOOTH_SCROLL_DURATION: 100,
    // Threshold for triggering smooth scroll (px)
    SCROLL_THRESHOLD: 5,
    // Maximum items to render in virtualized lists
    MAX_RENDER_BATCH: 10,
    // Window size for virtualized lists
    VIRTUALIZATION_WINDOW_SIZE: 5,
    // Initial number of items to render
    INITIAL_RENDER_COUNT: 20,
  },

  // Memory management settings
  MEMORY: {
    // Maximum number of latency samples to keep
    MAX_LATENCY_SAMPLES: 20,
    // Interval for memory monitoring (ms)
    MEMORY_MONITOR_INTERVAL: 2000,
    // Enable clipped subview removal for ScrollView
    ENABLE_REMOVE_CLIPPED_SUBVIEWS: true,
  },

  // Battery optimization settings
  BATTERY: {
    // Disable animations when battery is low
    DISABLE_ANIMATIONS_ON_LOW_BATTERY: true,
    // Reduce update frequency when in background
    BACKGROUND_UPDATE_REDUCTION: 0.5,
    // Disable haptic feedback on low battery
    DISABLE_HAPTIC_ON_LOW_BATTERY: true,
  },

  // Network optimization settings
  NETWORK: {
    // Socket.io configuration
    SOCKET_CONFIG: {
      pingInterval: 1000,
      pingTimeout: 500,
      compression: true,
      bufferSize: 1000,
    },
    // Adaptive buffer sizes based on connection quality
    ADAPTIVE_BUFFERS: {
      EXCELLENT: 50,  // < 50ms latency, < 10ms jitter
      GOOD: 100,      // < 100ms latency, < 30ms jitter  
      POOR: 200,      // > 100ms latency or > 30ms jitter
    },
  },

  // Development and debugging settings
  DEBUG: {
    // Show performance monitor in development
    SHOW_PERFORMANCE_MONITOR: __DEV__,
    // Log performance metrics to console
    LOG_PERFORMANCE_METRICS: __DEV__,
    // Enable detailed timing logs
    ENABLE_TIMING_LOGS: false,
  }
};

// Performance thresholds for monitoring
export const PERFORMANCE_THRESHOLDS = {
  FPS: {
    EXCELLENT: 55,
    GOOD: 45,
    POOR: 30,
  },
  MEMORY: {
    GOOD: 60,      // < 60% memory usage
    WARNING: 80,   // 60-80% memory usage
    CRITICAL: 90,  // > 80% memory usage
  },
  LATENCY: {
    EXCELLENT: 30,  // < 30ms
    GOOD: 50,       // 30-50ms
    ACCEPTABLE: 100, // 50-100ms
    POOR: 200,      // > 100ms
  }
};

// Device capability detection
export const getDeviceCapabilities = () => {
  // Basic device capability detection
  // In a real app, you'd use a library like react-native-device-info
  const capabilities = {
    isLowEndDevice: false, // Would check actual device specs
    supportsHighRefreshRate: true,
    hasGoodMemory: true,
    supportsHardwareAcceleration: true,
  };

  return capabilities;
};

// Get optimized configuration based on device capabilities
export const getOptimizedConfig = () => {
  const capabilities = getDeviceCapabilities();
  const config = { ...PERFORMANCE_CONFIG };

  if (capabilities.isLowEndDevice) {
    // Reduce performance requirements for low-end devices
    config.RENDERING.TARGET_FPS = 30;
    config.RENDERING.MAX_RENDER_BATCH = 5;
    config.SYNC.POSITION_UPDATE_THROTTLE = 33; // ~30fps
    config.MEMORY.MAX_LATENCY_SAMPLES = 10;
  }

  if (!capabilities.supportsHighRefreshRate) {
    config.RENDERING.TARGET_FPS = 30;
    config.SYNC.POSITION_UPDATE_THROTTLE = 33;
  }

  if (!capabilities.hasGoodMemory) {
    config.RENDERING.MAX_RENDER_BATCH = 5;
    config.RENDERING.INITIAL_RENDER_COUNT = 10;
    config.MEMORY.MAX_LATENCY_SAMPLES = 10;
  }

  return config;
};