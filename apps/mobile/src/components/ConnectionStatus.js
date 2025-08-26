import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

const ANIMATION_DURATION = 300;

export default function ConnectionStatus({ 
  socket,
  connected, 
  connectionStatus,
  latency,
  latencyStatus,
  syncQuality,
  packetLoss,
  sessionState,
  compact = false,
  showReconnectButton = true,
  onReconnect
}) {
  const connectionStatusHook = useConnectionStatus(socket, connected, latency);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  
  const warningOpacity = useRef(new Animated.Value(0)).current;
  const expandAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  // Cache session state when connected
  useEffect(() => {
    if (connected && sessionState) {
      connectionStatusHook.cacheSessionState(sessionState);
    }
  }, [connected, sessionState, connectionStatusHook]);

  // Show connection quality warnings
  useEffect(() => {
    const { connectionQuality } = connectionStatusHook;
    const shouldShowWarning = connected && (connectionQuality === 'poor' || connectionQuality === 'bad');
    
    if (shouldShowWarning !== showWarning) {
      setShowWarning(shouldShowWarning);
      
      Animated.timing(warningOpacity, {
        toValue: shouldShowWarning ? 1 : 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
    }
  }, [connectionStatusHook.connectionQuality, connected, showWarning, warningOpacity]);

  // Pulse animation for reconnecting state
  useEffect(() => {
    if (connectionStatusHook.isReconnecting || connectionStatus === 'reconnecting') {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (connectionStatusHook.isReconnecting || connectionStatus === 'reconnecting') {
            pulse();
          }
        });
      };
      pulse();
    }
  }, [connectionStatusHook.isReconnecting, connectionStatus, pulseAnimation]);

  // Expand/collapse animation
  useEffect(() => {
    Animated.timing(expandAnimation, {
      toValue: isExpanded ? 1 : 0,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, expandAnimation]);

  const handleReconnect = async () => {
    if (onReconnect) {
      onReconnect();
    } else {
      connectionStatusHook.forceReconnection();
    }
  };

  const handleShowDetails = () => {
    if (!compact) {
      setIsExpanded(!isExpanded);
    }
  };

  const getStatusConfig = () => {
    const { networkState, offlineMode, connectionQualityConfig, isReconnecting } = connectionStatusHook;
    
    // Offline mode
    if (offlineMode || !networkState?.isConnected) {
      return {
        icon: '📵',
        label: 'Offline',
        sublabel: 'No internet connection',
        color: '#6c757d',
        backgroundColor: '#f8f9fa',
        borderColor: '#dee2e6'
      };
    }
    
    // Reconnecting
    if (isReconnecting || connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
      const attempt = connectionStatusHook.reconnectAttempts + 1;
      const nextDelay = Math.round(connectionStatusHook.nextReconnectDelay / 1000);
      
      return {
        icon: '🔄',
        label: isReconnecting ? `Reconnecting (${attempt})` : 'Connecting',
        sublabel: isReconnecting ? `Next attempt in ${nextDelay}s` : 'Establishing connection',
        color: '#e17055',
        backgroundColor: '#fdebe9',
        borderColor: '#f5c6c6'
      };
    }
    
    // Connected - show connection quality
    if (connected) {
      return {
        icon: connectionQualityConfig.icon,
        label: `Connected (${connectionQualityConfig.label})`,
        sublabel: connectionQualityConfig.description,
        color: connectionQualityConfig.color,
        backgroundColor: connected ? '#d4edda' : '#f8d7da',
        borderColor: connected ? '#c3e6cb' : '#f5c6cb'
      };
    }
    
    // Connection failed
    return {
      icon: '❌',
      label: 'Connection Failed',
      sublabel: 'Unable to reach server',
      color: '#d63031',
      backgroundColor: '#f8d7da',
      borderColor: '#f5c6cb'
    };
  };

  const getLatencyDisplay = () => {
    if (latency === null) return 'Measuring...';
    return `${latency}ms`;
  };

  const getSyncQualityDisplay = () => {
    if (syncQuality === null) return 'Unknown';
    return `${Math.round(syncQuality * 100)}%`;
  };

  const getPacketLossDisplay = () => {
    if (packetLoss === 0) return '0%';
    return `${packetLoss}%`;
  };

  const statusConfig = getStatusConfig();

  // Compact view
  if (compact) {
    return (
      <TouchableOpacity 
        style={[styles.compactContainer, { borderColor: statusConfig.borderColor }]}
        onPress={handleShowDetails}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.compactContent, { opacity: pulseAnimation }]}>
          <View style={[styles.compactDot, { backgroundColor: statusConfig.color }]} />
          <Text style={styles.compactText}>
            {connected && latency !== null ? getLatencyDisplay() : statusConfig.label}
          </Text>
          {connectionStatusHook.connectionQuality && connected && (
            <View style={[styles.qualityIndicator, { backgroundColor: statusConfig.color }]}>
              <Text style={styles.qualityText}>
                {connectionStatusHook.connectionQualityConfig.label.charAt(0)}
              </Text>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  // Full view
  return (
    <View style={[styles.container, { 
      backgroundColor: statusConfig.backgroundColor,
      borderColor: statusConfig.borderColor 
    }]}>
      {/* Connection Quality Warning */}
      {showWarning && (
        <Animated.View style={[styles.warningBanner, { opacity: warningOpacity }]}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            Poor connection quality detected. Sync delays may occur.
          </Text>
        </Animated.View>
      )}

      {/* Main Status Row */}
      <TouchableOpacity 
        style={styles.statusRow}
        onPress={handleShowDetails}
        activeOpacity={0.8}
      >
        <Animated.Text style={[styles.statusIcon, { opacity: pulseAnimation }]}>
          {statusConfig.icon}
        </Animated.Text>
        <View style={styles.statusInfo}>
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
          <Text style={styles.statusSubtext}>
            {statusConfig.sublabel}
          </Text>
          {connected && latency && (
            <Text style={styles.latencyText}>
              Ping: {getLatencyDisplay()} • Quality: {getSyncQualityDisplay()}
            </Text>
          )}
        </View>
        
        {showReconnectButton && (!connected || connectionStatusHook.isReconnecting) && (
          <TouchableOpacity 
            style={[styles.reconnectButton, { 
              backgroundColor: statusConfig.color,
              opacity: connectionStatusHook.isReconnecting ? 0.7 : 1
            }]}
            onPress={handleReconnect}
            disabled={connectionStatusHook.isReconnecting}
            activeOpacity={0.8}
          >
            <Text style={styles.reconnectButtonText}>
              {connectionStatusHook.isReconnecting ? 'Wait...' : 'Retry'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Expanded Details */}
      <Animated.View style={[
        styles.expandedContent,
        {
          maxHeight: expandAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 300]
          }),
          opacity: expandAnimation
        }
      ]}>
        <View style={styles.metricsGrid}>
          {/* Network Metrics */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Latency</Text>
            <Text style={[styles.metricValue, { 
              color: latency < 50 ? '#00b894' : latency < 100 ? '#fdcb6e' : '#e17055' 
            }]}>
              {getLatencyDisplay()}
            </Text>
            <Text style={styles.metricDescription}>Round-trip time</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Sync Quality</Text>
            <Text style={[styles.metricValue, { 
              color: syncQuality > 0.8 ? '#00b894' : syncQuality > 0.5 ? '#fdcb6e' : '#e17055'
            }]}>
              {getSyncQualityDisplay()}
            </Text>
            <Text style={styles.metricDescription}>Overall performance</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Packet Loss</Text>
            <Text style={[styles.metricValue, { 
              color: packetLoss === 0 ? '#00b894' : packetLoss < 5 ? '#fdcb6e' : '#e17055'
            }]}>
              {getPacketLossDisplay()}
            </Text>
            <Text style={styles.metricDescription}>Data reliability</Text>
          </View>
        </View>

        {/* Network Information */}
        {connectionStatusHook.networkState && (
          <View style={styles.networkInfo}>
            <Text style={styles.networkInfoLabel}>Network Details</Text>
            <Text style={styles.networkInfoText}>
              Type: {connectionStatusHook.networkState.type} • 
              Internet: {connectionStatusHook.networkState.isInternetReachable ? 'Yes' : 'No'}
            </Text>
          </View>
        )}

        {/* Offline Mode Information */}
        {connectionStatusHook.offlineMode && connectionStatusHook.lastSessionState && (
          <View style={styles.offlineModeInfo}>
            <Text style={styles.offlineLabel}>📦 Offline Mode Active</Text>
            <Text style={styles.offlineText}>
              Using cached session data from {new Date(connectionStatusHook.lastSessionState.cachedAt).toLocaleTimeString()}
            </Text>
          </View>
        )}

        {/* Reconnection Information */}
        {connectionStatusHook.isReconnecting && (
          <View style={styles.reconnectionInfo}>
            <Text style={styles.reconnectionLabel}>🔄 Auto-Reconnection</Text>
            <Text style={styles.reconnectionText}>
              Attempt {connectionStatusHook.reconnectAttempts + 1} • Next retry in {Math.round(connectionStatusHook.nextReconnectDelay / 1000)}s
            </Text>
            <Text style={styles.reconnectionNote}>
              Using exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
            </Text>
          </View>
        )}

        {/* Heartbeat Status */}
        {connected && (
          <View style={styles.heartbeatInfo}>
            <Text style={styles.heartbeatLabel}>💓 Heartbeat</Text>
            <Text style={[styles.heartbeatStatus, {
              color: connectionStatusHook.heartbeatStatus === 'healthy' ? '#00b894' : 
                    connectionStatusHook.heartbeatStatus === 'checking' ? '#fdcb6e' : '#e17055'
            }]}>
              {connectionStatusHook.heartbeatStatus === 'healthy' && '✅ Healthy'}
              {connectionStatusHook.heartbeatStatus === 'checking' && '🔍 Checking'}
              {connectionStatusHook.heartbeatStatus === 'timeout' && '⚠️ Timeout'}
              {connectionStatusHook.heartbeatStatus === 'disconnected' && '❌ Disconnected'}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginRight: 8,
  },
  qualityIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statusSubtext: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 2,
  },
  latencyText: {
    fontSize: 11,
    color: '#495057',
    fontWeight: '500',
  },
  reconnectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reconnectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  expandedContent: {
    overflow: 'hidden',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: '#6c757d',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  metricDescription: {
    fontSize: 9,
    color: '#6c757d',
    textAlign: 'center',
  },
  networkInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  networkInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  networkInfoText: {
    fontSize: 11,
    color: '#6c757d',
  },
  offlineModeInfo: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  offlineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  offlineText: {
    fontSize: 11,
    color: '#856404',
  },
  reconnectionInfo: {
    backgroundColor: '#ffeaa7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  reconnectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  reconnectionText: {
    fontSize: 11,
    color: '#856404',
    marginBottom: 2,
  },
  reconnectionNote: {
    fontSize: 10,
    color: '#856404',
    fontStyle: 'italic',
  },
  heartbeatInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 8,
    padding: 12,
  },
  heartbeatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
  },
  heartbeatStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
});