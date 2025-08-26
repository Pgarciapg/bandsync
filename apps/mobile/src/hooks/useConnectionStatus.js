import { useEffect, useRef, useState, useCallback } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as Haptics from 'expo-haptics';

const CONNECTION_QUALITY_THRESHOLDS = {
  excellent: 50,   // < 50ms
  good: 100,      // 50-100ms  
  poor: 300,      // 100-300ms
  bad: Infinity   // > 300ms
};

const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000]; // Max 30s
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds
const OFFLINE_CACHE_DURATION = 300000; // 5 minutes

export function useConnectionStatus(socket, connected, latency) {
  const [networkState, setNetworkState] = useState(null);
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastSessionState, setLastSessionState] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState('unknown');
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);
  const cacheTimeoutRef = useRef(null);

  // Network state monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkState(state);
      
      // Handle network transitions
      if (state.isConnected === false && !offlineMode) {
        setOfflineMode(true);
        triggerHapticFeedback('networkLost');
      } else if (state.isConnected === true && offlineMode) {
        setOfflineMode(false);
        triggerHapticFeedback('networkRestored');
        // Attempt reconnection when network is restored
        if (!connected && socket) {
          attemptReconnection();
        }
      }
    });

    return unsubscribe;
  }, [offlineMode, connected, socket]);

  // Connection quality assessment
  useEffect(() => {
    if (latency === null) {
      setConnectionQuality('unknown');
      return;
    }

    let quality = 'bad';
    if (latency < CONNECTION_QUALITY_THRESHOLDS.excellent) {
      quality = 'excellent';
    } else if (latency < CONNECTION_QUALITY_THRESHOLDS.good) {
      quality = 'good';
    } else if (latency < CONNECTION_QUALITY_THRESHOLDS.poor) {
      quality = 'poor';
    }

    setConnectionQuality(quality);

    // Warn about poor connection quality
    if (quality === 'poor' || quality === 'bad') {
      triggerHapticFeedback('poorConnection');
    }
  }, [latency]);

  // Heartbeat monitoring
  useEffect(() => {
    if (!connected || !socket) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      setHeartbeatStatus('disconnected');
      return;
    }

    // Start heartbeat monitoring
    heartbeatIntervalRef.current = setInterval(() => {
      const heartbeatTimestamp = Date.now();
      setLastHeartbeat(heartbeatTimestamp);
      setHeartbeatStatus('checking');
      
      // Send heartbeat ping
      socket.emit('heartbeat', { timestamp: heartbeatTimestamp });
      
      // Set timeout for heartbeat response
      heartbeatTimeoutRef.current = setTimeout(() => {
        setHeartbeatStatus('timeout');
        console.warn('Heartbeat timeout - connection may be unstable');
        
        // If we haven't received a heartbeat response, consider reconnection
        if (connected) {
          attemptReconnection();
        }
      }, HEARTBEAT_TIMEOUT);
    }, HEARTBEAT_INTERVAL);

    // Listen for heartbeat responses
    const handleHeartbeatResponse = ({ timestamp, serverTimestamp }) => {
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      
      const responseTime = Date.now() - timestamp;
      setHeartbeatStatus('healthy');
      
      // Update latency if this is more recent than socket latency
      // This provides additional latency monitoring through heartbeats
    };

    socket.on('heartbeat_response', handleHeartbeatResponse);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
      socket.off('heartbeat_response', handleHeartbeatResponse);
    };
  }, [connected, socket]);

  // Session state caching for offline mode
  const cacheSessionState = useCallback((sessionState) => {
    setLastSessionState({
      ...sessionState,
      cachedAt: Date.now()
    });
    
    // Clear cache after duration
    if (cacheTimeoutRef.current) {
      clearTimeout(cacheTimeoutRef.current);
    }
    cacheTimeoutRef.current = setTimeout(() => {
      setLastSessionState(null);
    }, OFFLINE_CACHE_DURATION);
  }, []);

  // Auto-reconnection with exponential backoff
  const attemptReconnection = useCallback(() => {
    if (isReconnecting || !socket) return;
    
    setIsReconnecting(true);
    const attemptIndex = Math.min(reconnectAttempts, RECONNECT_INTERVALS.length - 1);
    const delay = RECONNECT_INTERVALS[attemptIndex];
    
    console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (socket && !connected) {
        socket.connect();
        setReconnectAttempts(prev => prev + 1);
      }
      setIsReconnecting(false);
    }, delay);
  }, [isReconnecting, reconnectAttempts, socket, connected]);

  // Reset reconnection attempts on successful connection
  useEffect(() => {
    if (connected) {
      setReconnectAttempts(0);
      setIsReconnecting(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }
  }, [connected]);

  // Manual reconnection trigger
  const forceReconnection = useCallback(() => {
    if (socket) {
      setReconnectAttempts(0); // Reset attempts for manual trigger
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
      }, 1000);
    }
    triggerHapticFeedback('manualReconnect');
  }, [socket]);

  // Haptic feedback for connection events
  const triggerHapticFeedback = useCallback(async (eventType) => {
    try {
      switch (eventType) {
        case 'networkLost':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case 'networkRestored':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'poorConnection':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'manualReconnect':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }, []);

  // Connection quality helpers
  const getConnectionQualityConfig = useCallback(() => {
    const configs = {
      excellent: {
        color: '#00b894',
        icon: '🟢',
        label: 'Excellent',
        description: 'Perfect sync quality'
      },
      good: {
        color: '#fdcb6e', 
        icon: '🟡',
        label: 'Good',
        description: 'Minor delays possible'
      },
      poor: {
        color: '#e17055',
        icon: '🟠', 
        label: 'Poor',
        description: 'Noticeable sync delays'
      },
      bad: {
        color: '#d63031',
        icon: '🔴',
        label: 'Bad', 
        description: 'Severe sync issues'
      },
      unknown: {
        color: '#74b9ff',
        icon: '⚪',
        label: 'Unknown',
        description: 'Measuring connection...'
      }
    };
    
    return configs[connectionQuality] || configs.unknown;
  }, [connectionQuality]);

  // Network type information
  const getNetworkInfo = useCallback(() => {
    if (!networkState) return null;
    
    return {
      type: networkState.type,
      isConnected: networkState.isConnected,
      isInternetReachable: networkState.isInternetReachable,
      details: networkState.details
    };
  }, [networkState]);

  // Check if cached data is still valid
  const isCacheValid = useCallback(() => {
    if (!lastSessionState || !lastSessionState.cachedAt) return false;
    return (Date.now() - lastSessionState.cachedAt) < OFFLINE_CACHE_DURATION;
  }, [lastSessionState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
      if (cacheTimeoutRef.current) {
        clearTimeout(cacheTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Network state
    networkState: getNetworkInfo(),
    offlineMode,
    
    // Connection quality
    connectionQuality,
    connectionQualityConfig: getConnectionQualityConfig(),
    
    // Reconnection status
    isReconnecting,
    reconnectAttempts,
    nextReconnectDelay: reconnectAttempts < RECONNECT_INTERVALS.length 
      ? RECONNECT_INTERVALS[Math.min(reconnectAttempts, RECONNECT_INTERVALS.length - 1)]
      : RECONNECT_INTERVALS[RECONNECT_INTERVALS.length - 1],
    
    // Heartbeat monitoring
    heartbeatStatus,
    lastHeartbeat,
    
    // Offline mode support
    lastSessionState: isCacheValid() ? lastSessionState : null,
    cacheSessionState,
    
    // Actions
    forceReconnection,
    triggerHapticFeedback
  };
}