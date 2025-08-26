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
  
  // Enhanced beat indicator animations
  const beatIndicatorAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0)
  ]).current;
  
  // Tempo visualization animations
  const tempoBarAnimations = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0.2))
  ).current;
  
  // Sync pulse animation for better feedback
  const syncPulseAnimation = useRef(new Animated.Value(0)).current;
  const tempoWaveAnimation = useRef(new Animated.Value(0)).current;

  // Enhanced pulse effect with multiple visual indicators
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
      
      // Enhanced beat indicator animations with staggered timing
      beatIndicatorAnimations.forEach((animation, index) => {
        const delay = index * (enableReducedMotion ? 30 : 50);
        setTimeout(() => {
          Animated.sequence([
            Animated.timing(animation, {
              toValue: 1,
              duration: duration * 0.4,
              useNativeDriver: true,
            }),
            Animated.timing(animation, {
              toValue: 0,
              duration: duration * 0.6,
              useNativeDriver: true,
            })
          ]).start();
        }, delay);
      });
      
      // Tempo bar visualization with wave-like pattern
      if (!enableReducedMotion) {
        tempoBarAnimations.forEach((animation, index) => {
          const barDelay = index * 20;
          const intensity = 0.3 + Math.sin(index * 0.5) * 0.4; // Wave pattern
          setTimeout(() => {
            Animated.sequence([
              Animated.timing(animation, {
                toValue: intensity,
                duration: duration * 0.3,
                useNativeDriver: false,
              }),
              Animated.timing(animation, {
                toValue: 0.2,
                duration: duration * 0.7,
                useNativeDriver: false,
              })
            ]).start();
          }, barDelay);
        });
      }
      
      // Sync pulse for better feedback
      Animated.timing(syncPulseAnimation, {
        toValue: 1,
        duration: duration * 0.5,
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(syncPulseAnimation, {
          toValue: 0,
          duration: duration * 0.5,
          useNativeDriver: true,
        }).start();
      });
      
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
  
  // Glow effect and tempo wave for active state
  useEffect(() => {
    if (isPlaying && isEnabled) {
      // Main glow animation
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
      
      // Continuous tempo wave visualization
      if (!enableReducedMotion) {
        Animated.loop(
          Animated.timing(tempoWaveAnimation, {
            toValue: 1,
            duration: (60000 / tempoBpm) * 4, // Complete wave cycle over 4 beats
            useNativeDriver: true,
          })
        ).start();
      }
    } else {
      glowAnimation.setValue(0);
      tempoWaveAnimation.setValue(0);
      // Reset tempo bars when stopped
      tempoBarAnimations.forEach(animation => animation.setValue(0.2));
    }
  }, [isPlaying, isEnabled, enableReducedMotion, tempoBpm]);

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
      
      {/* Enhanced visual beat indicator section */}
      <View style={styles.beatIndicatorContainer}>
        {/* Tempo visualization bars */}
        {!enableReducedMotion && (
          <View style={styles.tempoVisualizationContainer}>
            {tempoBarAnimations.map((animation, index) => {
              const rotation = tempoWaveAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg']
              });
              
              return (
                <Animated.View 
                  key={index}
                  style={[
                    styles.tempoBar,
                    {
                      height: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 60]
                      }),
                      backgroundColor: getSyncStatusColor(),
                      opacity: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0.8]
                      }),
                      transform: [
                        { 
                          rotate: rotation
                        },
                        {
                          translateY: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -10]
                          })
                        }
                      ]
                    }
                  ]} 
                />
              );
            })}
          </View>
        )}
        
        {/* Enhanced beat indicators around main circle */}
        <View style={styles.beatIndicatorsRing}>
          {beatIndicatorAnimations.map((animation, index) => {
            const angle = (index * 90) * (Math.PI / 180); // 90 degrees apart
            const radius = 80;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            return (
              <Animated.View
                key={index}
                style={[
                  styles.beatIndicatorDot,
                  {
                    position: 'absolute',
                    left: x,
                    top: y,
                    backgroundColor: getSyncStatusColor(),
                    transform: [
                      { scale: animation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1.5]
                        })
                      }
                    ],
                    opacity: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1]
                    })
                  }
                ]}
              />
            );
          })}
        </View>
        
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
        
        {/* Sync pulse ring for better feedback */}
        <Animated.View 
          style={[
            styles.syncPulseRing,
            {
              transform: [{ scale: syncPulseAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.1]
              })}],
              opacity: syncPulseAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.6]
              }),
              borderColor: getSyncStatusColor()
            }
          ]}
        />
        
        {/* Main beat circle with enhanced styling */}
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
          
          {/* Enhanced beat indicator dot */}
          <Animated.View style={[
            styles.beatDot,
            {
              backgroundColor: getSyncStatusColor(),
              transform: [{ scale: pulseAnimation }],
              opacity: isPlaying ? (pulse ? 1 : 0.6) : 0.3
            }
          ]} />
          
          {/* Tempo change indicator */}
          {Math.abs(tempoBpm - previousTempo) > 5 && (
            <Animated.View style={[
              styles.tempoChangeIndicator,
              {
                backgroundColor: tempoBpm > previousTempo ? '#28a745' : '#ffc107',
                opacity: tempoTransition.interpolate({
                  inputRange: [previousTempo, tempoBpm],
                  outputRange: [1, 0]
                })
              }
            ]}>
              <Text style={styles.tempoChangeText}>
                {tempoBpm > previousTempo ? '↗' : '↘'}
              </Text>
            </Animated.View>
          )}
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
  
  // Enhanced beat indicator styles
  beatIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
    height: 200,
    width: 200
  },
  tempoVisualizationContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  tempoBar: {
    width: 4,
    marginHorizontal: 2,
    borderRadius: 2,
    position: 'absolute'
  },
  beatIndicatorsRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center'
  },
  beatIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3
  },
  syncPulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    backgroundColor: 'transparent'
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
  tempoChangeIndicator: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3
  },
  tempoChangeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
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