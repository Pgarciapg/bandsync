import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from "react-native";
import { useMetronome } from "../hooks/useMetronome";

export default function Metronome({ tempoBpm, isPlaying, syncQuality = null, latency = null, enableReducedMotion = false, enableHighContrast = false }) {
  const { tickCount, isEnabled, toggleEnabled } = useMetronome(tempoBpm, isPlaying);
  const [pulse, setPulse] = useState(false);
  const [previousTempo, setPreviousTempo] = useState(tempoBpm);
  
  // Animation references
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const colorAnimation = useRef(new Animated.Value(0)).current;
  const tempoTransition = useRef(new Animated.Value(tempoBpm)).current;
  const ringAnimation = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;

  // Enhanced pulse effect with smooth animations
  useEffect(() => {
    if (isPlaying && isEnabled) {
      setPulse(true);
      
      // Main pulse animation
      const duration = enableReducedMotion ? 150 : 200;
      const pulseSequence = Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: enableReducedMotion ? 1.05 : 1.2,
          duration: duration * 0.3,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: duration * 0.7,
          useNativeDriver: true,
        })
      ]);
      
      // Ring ripple animation
      if (!enableReducedMotion) {
        Animated.sequence([
          Animated.timing(ringAnimation, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(ringAnimation, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          })
        ]).start();
      }
      
      pulseSequence.start();
      
      const timeout = setTimeout(() => setPulse(false), duration);
      return () => clearTimeout(timeout);
    }
  }, [tickCount, isPlaying, isEnabled, enableReducedMotion]);
  
  // Smooth tempo transitions
  useEffect(() => {
    if (tempoBpm !== previousTempo) {
      Animated.timing(tempoTransition, {
        toValue: tempoBpm,
        duration: enableReducedMotion ? 200 : 500,
        useNativeDriver: false,
      }).start();
      setPreviousTempo(tempoBpm);
    }
  }, [tempoBpm, previousTempo, enableReducedMotion]);
  
  // Sync quality color transitions
  useEffect(() => {
    let targetValue = 0; // Default/neutral
    if (syncQuality !== null) {
      if (syncQuality >= 0.8) targetValue = 1; // Green - excellent sync
      else if (syncQuality >= 0.5) targetValue = 0.5; // Yellow - good sync
      else targetValue = 0; // Red - poor sync
    }
    
    Animated.timing(colorAnimation, {
      toValue: targetValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [syncQuality]);
  
  // Glow effect for active state
  useEffect(() => {
    if (isPlaying && isEnabled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnimation, {
            toValue: 1,
            duration: enableReducedMotion ? 1000 : 2000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnimation, {
            toValue: 0.3,
            duration: enableReducedMotion ? 1000 : 2000,
            useNativeDriver: false,
          })
        ])
      ).start();
    } else {
      glowAnimation.setValue(0);
    }
  }, [isPlaying, isEnabled, enableReducedMotion]);

  // Get sync status color based on latency and sync quality with high contrast support
  const getSyncStatusColor = () => {
    if (!isPlaying || syncQuality === null) return enableHighContrast ? '#666666' : '#e9ecef'; // Neutral gray
    
    if (latency !== null) {
      if (latency < 50) return enableHighContrast ? '#006600' : '#28a745'; // Green - excellent (darker for high contrast)
      if (latency < 150) return enableHighContrast ? '#cc9900' : '#ffc107'; // Yellow - good (darker for high contrast)
      return enableHighContrast ? '#cc0000' : '#dc3545'; // Red - poor (darker for high contrast)
    }
    
    // Fallback to sync quality
    if (syncQuality >= 0.8) return enableHighContrast ? '#006600' : '#28a745';
    if (syncQuality >= 0.5) return enableHighContrast ? '#cc9900' : '#ffc107';
    return enableHighContrast ? '#cc0000' : '#dc3545';
  };
  
  const getSyncStatusText = () => {
    if (!isPlaying) return 'Ready';
    if (syncQuality === null) return 'Syncing...';
    
    if (latency !== null) {
      if (latency < 50) return 'Perfect Sync';
      if (latency < 150) return 'Good Sync';
      return 'Poor Sync';
    }
    
    if (syncQuality >= 0.8) return 'Excellent';
    if (syncQuality >= 0.5) return 'Good';
    return 'Needs Attention';
  };
  
  // Dynamic background color based on sync status with high contrast support
  const backgroundColorInterpolation = colorAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: enableHighContrast 
      ? ['rgba(204, 0, 0, 0.2)', 'rgba(204, 153, 0, 0.2)', 'rgba(0, 102, 0, 0.2)'] // Higher contrast backgrounds
      : ['rgba(220, 53, 69, 0.1)', 'rgba(255, 193, 7, 0.1)', 'rgba(40, 167, 69, 0.1)'] // Red, Yellow, Green backgrounds
  });
  
  // Dynamic border color with high contrast support
  const borderColorInterpolation = colorAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: enableHighContrast 
      ? ['#cc0000', '#cc9900', '#006600'] // Higher contrast colors
      : ['#dc3545', '#ffc107', '#28a745']
  });
  
  // Glow effect
  const glowIntensity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8]
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: backgroundColorInterpolation }]}>
      {/* Header with enhanced controls */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, enableHighContrast && styles.highContrastText]}>🎵 Visual Metronome</Text>
          <Text style={[styles.syncStatus, { color: getSyncStatusColor() }]}>
            {getSyncStatusText()}
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.enableButton, { backgroundColor: isEnabled ? '#28a745' : '#6c757d' }]}
          onPress={toggleEnabled}
          activeOpacity={0.8}
        >
          <Text style={styles.enableButtonText}>{isEnabled ? "ON" : "OFF"}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Main visual beat indicator */}
      <View style={styles.beatIndicatorContainer}>
        {/* Animated ripple rings (reduced motion compatible) */}
        {!enableReducedMotion && (
          <Animated.View 
            style={[
              styles.rippleRing,
              {
                transform: [{ scale: ringAnimation }],
                opacity: ringAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 0]
                }),
                borderColor: getSyncStatusColor()
              }
            ]}
          />
        )}
        
        {/* Main beat circle */}
        <Animated.View style={[
          styles.beatCircle,
          {
            transform: [{ scale: pulseAnimation }],
            borderColor: borderColorInterpolation,
            shadowRadius: glowIntensity,
            shadowColor: getSyncStatusColor(),
            shadowOpacity: isPlaying ? 0.4 : 0.1,
          }
        ]}>
          {/* Animated tempo display */}
          <Animated.Text style={[styles.tempoDisplay, enableHighContrast && styles.highContrastText]}>
            {Math.round(tempoBpm)}
          </Animated.Text>
          <Text style={[styles.bpmLabel, enableHighContrast && styles.highContrastSubtext]}>BPM</Text>
          
          {/* Beat indicator dot */}
          <Animated.View style={[
            styles.beatDot,
            {
              backgroundColor: getSyncStatusColor(),
              transform: [{ scale: pulseAnimation }],
              opacity: isPlaying ? (pulse ? 1 : 0.6) : 0.3
            }
          ]} />
        </Animated.View>
      </View>
      
      {/* Enhanced status information */}
      <View style={[styles.statusContainer, enableHighContrast && styles.highContrastContainer]}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, enableHighContrast && styles.highContrastSubtext]}>Status</Text>
            <Text style={[
              styles.statusValue, 
              { color: isPlaying ? '#28a745' : '#6c757d' },
              enableHighContrast && styles.highContrastText
            ]}>
              {isPlaying ? (isEnabled ? "🔊 Active" : "🔇 Muted") : "⏸️ Stopped"}
            </Text>
          </View>
          
          {latency !== null && (
            <View style={styles.statusItem}>
              <Text style={[styles.statusLabel, enableHighContrast && styles.highContrastSubtext]}>Latency</Text>
              <Text style={[
                styles.statusValue, 
                { color: getSyncStatusColor() },
                enableHighContrast && styles.highContrastText
              ]}>
                {latency}ms
              </Text>
            </View>
          )}
          
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, enableHighContrast && styles.highContrastSubtext]}>Beat Count</Text>
            <Text style={[styles.statusValue, enableHighContrast && styles.highContrastText]}>{tickCount}</Text>
          </View>
        </View>
        
        {/* Sync quality indicator */}
        {syncQuality !== null && (
          <View style={styles.syncQualityContainer}>
            <Text style={[styles.syncQualityLabel, enableHighContrast && styles.highContrastSubtext]}>Sync Quality</Text>
            <View style={[styles.syncQualityBar, enableHighContrast && styles.highContrastBorder]}>
              <Animated.View 
                style={[
                  styles.syncQualityFill,
                  {
                    width: `${Math.max(0, Math.min(100, syncQuality * 100))}%`,
                    backgroundColor: getSyncStatusColor()
                  }
                ]}
              />
            </View>
            <Text style={[
              styles.syncQualityPercent, 
              { color: getSyncStatusColor() },
              enableHighContrast && styles.highContrastText
            ]}>
              {Math.round(syncQuality * 100)}%
            </Text>
          </View>
        )}
      </View>
      
      {/* Accessibility hint */}
      {(enableReducedMotion || enableHighContrast) && (
        <View style={styles.accessibilityHint}>
          <Text style={[styles.accessibilityHintText, enableHighContrast && styles.highContrastSubtext]}>
            ♿ Accessibility mode: {enableReducedMotion && "Reduced Motion"} {enableHighContrast && "High Contrast"}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const { width: screenWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  titleContainer: {
    flex: 1
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4
  },
  syncStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  enableButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  enableButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  
  // Beat indicator styles
  beatIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative'
  },
  rippleRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    backgroundColor: 'transparent'
  },
  beatCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    elevation: 8,
    position: 'relative'
  },
  tempoDisplay: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center'
  },
  bpmLabel: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center'
  },
  beatDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3
  },
  
  // Status styles
  statusContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    padding: 12
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12
  },
  statusItem: {
    alignItems: 'center',
    flex: 1
  },
  statusLabel: {
    fontSize: 10,
    color: '#6c757d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50'
  },
  
  // Sync quality indicator
  syncQualityContainer: {
    alignItems: 'center'
  },
  syncQualityLabel: {
    fontSize: 10,
    color: '#6c757d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  syncQualityBar: {
    width: screenWidth * 0.6,
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4
  },
  syncQualityFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 2
  },
  syncQualityPercent: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  
  // Accessibility styles
  accessibilityHint: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(108, 117, 125, 0.1)',
    borderRadius: 4,
    alignItems: 'center'
  },
  accessibilityHintText: {
    fontSize: 10,
    color: '#6c757d',
    fontWeight: '500'
  },
  
  // High contrast styles
  highContrastText: {
    color: '#000000',
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1
  },
  highContrastSubtext: {
    color: '#333333',
    fontWeight: 'bold'
  },
  highContrastContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000'
  },
  highContrastBorder: {
    borderWidth: 1,
    borderColor: '#000000'
  }
});