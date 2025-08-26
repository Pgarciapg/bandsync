import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ConnectionStatusIndicator({ 
  connected, 
  connectionStatus, 
  latency, 
  latencyStatus, 
  syncQuality, 
  packetLoss,
  compact = false 
}) {
  const getStatusColor = () => {
    if (!connected) {
      switch (connectionStatus) {
        case 'connecting': return '#fdcb6e';
        case 'reconnecting': return '#e17055';
        case 'failed': return '#d63031';
        default: return '#74b9ff';
      }
    }
    return '#00b894';
  };

  const getLatencyColor = () => {
    switch (latencyStatus) {
      case 'excellent': return '#00b894'; // Green
      case 'good': return '#fdcb6e'; // Yellow
      case 'poor': return '#e17055'; // Red
      default: return '#74b9ff'; // Blue for unknown
    }
  };

  const getStatusIcon = () => {
    if (!connected) {
      switch (connectionStatus) {
        case 'connecting': return '🔄';
        case 'reconnecting': return '🔄';
        case 'failed': return '🔴';
        default: return '⚪';
      }
    }
    return '🟢';
  };

  const getStatusText = () => {
    if (!connected) {
      switch (connectionStatus) {
        case 'connecting': return 'Connecting...';
        case 'reconnecting': return 'Reconnecting...';
        case 'failed': return 'Connection Failed';
        default: return 'Disconnected';
      }
    }
    return 'Connected';
  };

  const getSyncQualityColor = () => {
    if (syncQuality === null) return '#74b9ff';
    if (syncQuality > 0.8) return '#00b894'; // Excellent
    if (syncQuality > 0.5) return '#fdcb6e'; // Good
    return '#e17055'; // Poor
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={[styles.compactDot, { backgroundColor: getStatusColor() }]} />
        <Text style={styles.compactText}>
          {connected && latency !== null ? `${latency}ms` : getStatusText()}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <View style={styles.statusRow}>
        <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
        <View style={styles.statusInfo}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          {connected && (
            <Text style={styles.statusSubtext}>
              Real-time sync active
            </Text>
          )}
        </View>
      </View>

      {/* Network Metrics */}
      {connected && (
        <View style={styles.metricsContainer}>
          {/* Latency */}
          <View style={styles.metric}>
            <View style={styles.metricHeader}>
              <View style={[styles.metricDot, { backgroundColor: getLatencyColor() }]} />
              <Text style={styles.metricLabel}>Latency</Text>
            </View>
            <Text style={[styles.metricValue, { color: getLatencyColor() }]}>
              {latency !== null ? `${latency}ms` : '...'}
            </Text>
          </View>

          {/* Sync Quality */}
          {syncQuality !== null && (
            <View style={styles.metric}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: getSyncQualityColor() }]} />
                <Text style={styles.metricLabel}>Sync Quality</Text>
              </View>
              <Text style={[styles.metricValue, { color: getSyncQualityColor() }]}>
                {Math.round(syncQuality * 100)}%
              </Text>
            </View>
          )}

          {/* Packet Loss */}
          {packetLoss > 0 && (
            <View style={styles.metric}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: '#e17055' }]} />
                <Text style={styles.metricLabel}>Packet Loss</Text>
              </View>
              <Text style={[styles.metricValue, { color: '#e17055' }]}>
                {packetLoss}%
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Quality Indicator Bar */}
      {connected && syncQuality !== null && (
        <View style={styles.qualityBar}>
          <View 
            style={[
              styles.qualityFill, 
              { 
                width: `${syncQuality * 100}%`, 
                backgroundColor: getSyncQualityColor() 
              }
            ]} 
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  compactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: {
    fontSize: 20,
    marginRight: 10,
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
    fontStyle: 'italic',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  qualityBar: {
    height: 4,
    backgroundColor: '#e9ecef',
    borderRadius: 2,
    overflow: 'hidden',
  },
  qualityFill: {
    height: '100%',
    borderRadius: 2,
  },
});