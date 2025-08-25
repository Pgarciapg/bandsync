import React, { useState, useEffect } from "react";
import { View, Text, Button, TextInput, StyleSheet, Switch, TouchableOpacity, Alert, Animated } from "react-native";
import * as Haptics from 'expo-haptics';
import Slider from "@react-native-community/slider";
import { EVENTS } from "bandsync-shared";
import { useSocket } from "../hooks/useSocket";
import { SERVER_URL } from "../config";
import FakeTab from "../components/FakeTab";
import PdfScroller from "../components/PdfScroller";
import Metronome from "../components/Metronome";
import { ThemedView } from "../components/ThemedView";
import { ThemedText } from "../components/ThemedText";

// Session role type
type UserRole = 'leader' | 'follower';

// NetworkStatusBanner Component
function NetworkStatusBanner({ connected, onReconnect }) {
  const bannerOpacity = new Animated.Value(connected ? 0 : 1);
  
  useEffect(() => {
    Animated.timing(bannerOpacity, {
      toValue: connected ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [connected, bannerOpacity]);

  if (connected) return null;

  return (
    <Animated.View style={[styles.networkBanner, { opacity: bannerOpacity }]}>
      <View style={styles.networkBannerContent}>
        <Text style={styles.networkBannerIcon}>⚠️</Text>
        <View style={styles.networkBannerTextContainer}>
          <Text style={styles.networkBannerTitle}>Connection Lost</Text>
          <Text style={styles.networkBannerSubtitle}>
            Reconnecting to sync with other musicians...
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.reconnectButton}
          onPress={onReconnect}
          activeOpacity={0.8}
        >
          <Text style={styles.reconnectButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// Enhanced RoleToggle Component with clear visual hierarchy
function RoleToggle({ currentRole, onRoleChange, disabled, memberCount = 0 }) {
  const [isChanging, setIsChanging] = useState(false);

  const handleRoleToggle = async () => {
    if (disabled || isChanging) return;
    
    // Haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setIsChanging(true);
    const newRole = currentRole === "leader" ? "follower" : "leader";
    
    // Show confirmation for role change with context
    const confirmMessage = currentRole === "leader" 
      ? `Transfer leadership to another member? You'll become a follower.`
      : `Take control as the leader? You'll control tempo and playback for ${memberCount} members.`;
    
    Alert.alert(
      "Change Role",
      confirmMessage,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setIsChanging(false)
        },
        {
          text: currentRole === "leader" ? "Transfer" : "Lead",
          style: currentRole === "leader" ? "destructive" : "default",
          onPress: () => {
            onRoleChange(newRole);
            setIsChanging(false);
          }
        }
      ]
    );
  };

  const isLeader = currentRole === "leader";
  const backgroundColor = isLeader ? "#6c5ce7" : "#00cec9"; // Purple for leader, teal for follower
  const textColor = "#ffffff";

  return (
    <TouchableOpacity
      style={[
        styles.roleToggleContainer,
        { backgroundColor },
        disabled && styles.roleToggleDisabled
      ]}
      onPress={handleRoleToggle}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.roleToggleHeader}>
        <Text style={[styles.roleToggleIcon, { color: textColor }]}>
          {isLeader ? "👑" : "👥"}
        </Text>
        <View style={styles.roleToggleInfo}>
          <Text style={[styles.roleToggleText, { color: textColor }]}>
            {isLeader ? "Session Leader" : "Following"}
          </Text>
          <Text style={[styles.roleToggleSubtext, { color: textColor, opacity: 0.8 }]}>
            {isLeader 
              ? `Controlling ${memberCount} members`
              : "Listening for leader's tempo"
            }
          </Text>
        </View>
      </View>
      
      <View style={styles.roleToggleActions}>
        <Text style={[styles.roleToggleHint, { color: textColor, opacity: 0.9 }]}>
          {isLeader ? "Tap to transfer leadership" : "Tap to take control"}
        </Text>
        {isLeader && (
          <View style={styles.leaderBadge}>
            <Text style={styles.leaderBadgeText}>ACTIVE</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Session Status Component for clear session state display  
function SessionStatus({ connected, sessionId, memberCount, syncQuality }) {
  const statusColor = connected ? "#00b894" : "#e17055";
  const statusText = connected ? "Connected" : "Disconnected";
  
  return (
    <ThemedView style={styles.sessionStatusContainer}>
      <View style={styles.sessionStatusHeader}>
        <Text style={styles.sessionTitle}>Session: {sessionId}</Text>
        <View style={[styles.connectionIndicator, { backgroundColor: statusColor }]}>
          <Text style={styles.connectionText}>{statusText}</Text>
        </View>
      </View>
      
      <View style={styles.sessionMetrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Members</Text>
          <Text style={styles.metricValue}>{memberCount}</Text>
        </View>
        
        {connected && syncQuality !== undefined && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Sync Quality</Text>
            <Text style={[
              styles.metricValue, 
              { color: syncQuality > 0.8 ? "#00b894" : syncQuality > 0.5 ? "#fdcb6e" : "#e17055" }
            ]}>
              {Math.round(syncQuality * 100)}%
            </Text>
          </View>
        )}
        
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Server</Text>
          <Text style={styles.metricValue}>{SERVER_URL.replace('http://', '')}</Text>
        </View>
      </View>
    </ThemedView>
  );
}

export default function SessionScreen({ sessionId = "demo" }) {
  const { state, emit, connected, roomStats } = useSocket(sessionId);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [tempoBpm, setTempoBpm] = useState(100);
  const [showPdf, setShowPdf] = useState(false);
  const [demoMode, setDemoMode] = useState(sessionId === "demo");
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [syncQuality, setSyncQuality] = useState(null);

  useEffect(() => {
    if (state) {
      setCurrentPosition(state.position || 0);
      setTempoBpm(state.tempoBpm || 100);
    }
  }, [state]);

  // Connection retry handler
  const handleReconnect = () => {
    setConnectionRetries(prev => prev + 1);
    // The useSocket hook will handle the actual reconnection
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    emit(EVENTS.SET_ROLE, { sessionId, role: selectedRole });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    emit(EVENTS.SET_ROLE, { sessionId, role: newRole });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleTempoChange = (value) => {
    setTempoBpm(value);
    if (role === "leader") {
      emit(EVENTS.SET_TEMPO, { sessionId, tempo: value });
    }
  };

  const handleSeek = (position) => {
    if (role === "leader") {
      emit("seek", { sessionId, position });
    }
  };

  const startDemo = () => {
    if (demoMode) {
      // Auto setup for demo mode
      setRole("leader");
      emit(EVENTS.SET_ROLE, { sessionId, role: "leader" });
      setShowPdf(true); // Show the PDF viewer
      setTimeout(() => {
        setTempoBpm(100);
        emit(EVENTS.SET_TEMPO, { sessionId, tempo: 100 });
        setTimeout(() => {
          emit("seek", { sessionId, position: 0 });
          setTimeout(() => {
            emit(EVENTS.PLAY, { sessionId });
          }, 500);
        }, 300);
      }, 200);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <NetworkStatusBanner 
        connected={connected} 
        onReconnect={handleReconnect} 
      />
      
      <SessionStatus 
        connected={connected}
        sessionId={sessionId}
        memberCount={roomStats?.memberCount || 0}
        syncQuality={syncQuality}
      />

      {!role ? (
        <View style={styles.roleSelection}>
          <Text style={styles.title}>
            {demoMode ? "BandSync Demo Mode" : "Select Your Role"}
          </Text>
          
          {demoMode ? (
            <View style={styles.demoContainer}>
              <Text style={styles.demoText}>
                🎸 Ready to demonstrate BandSync!
              </Text>
              <Text style={styles.demoInstructions}>
                This will set you as leader, load the sample tab, set tempo to 100 BPM, and start playing.
              </Text>
              <Button 
                title="🚀 Start Demo" 
                onPress={startDemo}
                color="#4CAF50"
              />
              <View style={styles.manualControls}>
                <Text style={styles.orText}>or choose manually:</Text>
                <View style={styles.buttonRow}>
                  <Button title="👑 Leader" onPress={() => handleRoleSelect("leader")} />
                  <Button title="👥 Follower" onPress={() => handleRoleSelect("follower")} />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <Button title="👑 Leader" onPress={() => handleRoleSelect("leader")} />
              <Button title="👥 Follower" onPress={() => handleRoleSelect("follower")} />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.controls}>
          <RoleToggle 
            currentRole={role} 
            onRoleChange={handleRoleChange}
            disabled={!connected}
            memberCount={roomStats?.memberCount || 0}
          />
          
          <View style={styles.controlsHeader}>
            
            <View style={styles.compactControls}>
              <Text style={styles.tempoText}>Tempo: {Math.round(tempoBpm)} BPM</Text>
              {role === "leader" && (
                <TextInput
                  style={styles.compactInput}
                  value={tempoBpm.toString()}
                  onChangeText={(text) => handleTempoChange(parseInt(text) || 100)}
                  keyboardType="numeric"
                />
              )}
            </View>

            <View style={styles.viewToggle}>
              <Text style={styles.toggleLabel}>View: {showPdf ? "PDF" : "Fake Tab"}</Text>
              <Switch
                value={showPdf}
                onValueChange={setShowPdf}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={showPdf ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>

            {role === "leader" && (
              <View style={styles.playbackControls}>
                <Button 
                  title={state?.isPlaying ? "⏸️ Pause" : "▶️ Play"} 
                  onPress={() => emit(state?.isPlaying ? EVENTS.PAUSE : EVENTS.PLAY, { sessionId })} 
                />
              </View>
            )}
          </View>

          <Metronome tempoBpm={tempoBpm} isPlaying={state?.isPlaying || false} />

          <View style={styles.tabContainer}>
            {showPdf ? (
              <PdfScroller positionMs={currentPosition} />
            ) : (
              <FakeTab positionMs={currentPosition} />
            )}
          </View>

          <View style={styles.messageContainer}>
            <TextInput
              placeholder="Shared message"
              value={message}
              onChangeText={setMessage}
              style={styles.textInput}
            />
            <Button title="Update Message" onPress={() => emit(EVENTS.UPDATE_MESSAGE, { sessionId, message })} />
          </View>

          <Text style={styles.debugText}>Status: {state?.message || "Waiting..."}</Text>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5'
  },
  statusBar: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 8
  },
  statusBarWithBanner: {
    marginTop: 80 // Account for network banner height
  },
  statusText: {
    fontSize: 12,
    color: '#666'
  },
  connectionStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5
  },
  memberCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 3
  },
  roleSelection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30
  },
  demoContainer: {
    alignItems: 'center',
    padding: 20
  },
  demoText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center'
  },
  demoInstructions: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  manualControls: {
    marginTop: 30,
    alignItems: 'center'
  },
  orText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 10
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 20
  },
  controls: {
    flex: 1
  },
  controlsHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 10
  },
  roleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10
  },
  compactControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  tempoText: {
    fontSize: 14,
    marginRight: 10
  },
  compactInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 5,
    borderRadius: 3,
    width: 60,
    textAlign: 'center'
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  toggleLabel: {
    fontSize: 14,
    marginRight: 10
  },
  playbackControls: {
    marginBottom: 10
  },
  tabContainer: {
    flex: 1,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    overflow: 'hidden'
  },
  messageContainer: {
    marginBottom: 20
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic'
  },
  // NetworkStatusBanner styles
  networkBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF6B35',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  networkBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50, // Account for status bar
  },
  networkBannerIcon: {
    fontSize: 24,
    marginRight: 12
  },
  networkBannerTextContainer: {
    flex: 1
  },
  networkBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2
  },
  networkBannerSubtitle: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9
  },
  reconnectButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)'
  },
  reconnectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  // Enhanced RoleToggle styles
  roleToggleContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4
  },
  roleToggleDisabled: {
    opacity: 0.6
  },
  roleToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  roleToggleIcon: {
    fontSize: 28,
    marginRight: 16
  },
  roleToggleInfo: {
    flex: 1
  },
  roleToggleText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2
  },
  roleToggleSubtext: {
    fontSize: 14,
    fontWeight: '500'
  },
  roleToggleActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  roleToggleHint: {
    fontSize: 12,
    fontWeight: '600'
  },
  leaderBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  leaderBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  
  // SessionStatus styles
  sessionStatusContainer: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6'
  },
  sessionStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50'
  },
  connectionIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  connectionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  sessionMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metric: {
    alignItems: 'center',
    flex: 1
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50'
  }
});