import React, { useState, useEffect } from "react";
import { View, Text, Button, TextInput, StyleSheet, Switch, TouchableOpacity, Alert, Animated } from "react-native";
import * as Haptics from 'expo-haptics';
import Slider from "@react-native-community/slider";
// For now, let's use the server events directly
const EVENTS = {
  JOIN_SESSION: "join_session",
  SNAPSHOT: "snapshot",
  SET_ROLE: "set_role", 
  SET_TEMPO: "set_tempo",
  PLAY: "play",
  PAUSE: "pause",
  UPDATE_MESSAGE: "update_message"
};
import { useSocket } from "../hooks/useSocket";
import { useAccessibility } from "../hooks/useAccessibility";
import { SERVER_URL } from "../config";
import FakeTab from "../components/FakeTab";
import PdfScroller from "../components/PdfScroller";
import Metronome from "../components/Metronome";
import { ThemedView } from "../components/ThemedView";
import { ThemedText } from "../components/ThemedText";
import ConnectionStatusIndicator from "../components/ConnectionStatusIndicator";

// Session role type
type UserRole = 'leader' | 'follower';

// Enhanced NetworkStatusBanner Component with connection status awareness
function NetworkStatusBanner({ connected, connectionStatus, latency, onReconnect }) {
  const bannerOpacity = new Animated.Value(connected ? 0 : 1);
  
  useEffect(() => {
    Animated.timing(bannerOpacity, {
      toValue: connected ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [connected, bannerOpacity]);

  if (connected) return null;

  const getBannerConfig = () => {
    switch (connectionStatus) {
      case 'connecting':
        return {
          icon: '🔄',
          title: 'Connecting...',
          subtitle: 'Establishing connection to sync server...',
          color: '#fdcb6e'
        };
      case 'reconnecting':
        return {
          icon: '🔄',
          title: 'Reconnecting...',
          subtitle: 'Attempting to restore sync connection...',
          color: '#e17055'
        };
      case 'failed':
        return {
          icon: '❌',
          title: 'Connection Failed',
          subtitle: 'Unable to connect. Check your network connection.',
          color: '#d63031'
        };
      default:
        return {
          icon: '⚠️',
          title: 'Connection Lost',
          subtitle: 'Disconnected from sync server...',
          color: '#FF6B35'
        };
    }
  };

  const config = getBannerConfig();

  return (
    <Animated.View style={[styles.networkBanner, { opacity: bannerOpacity, backgroundColor: config.color }]}>
      <View style={styles.networkBannerContent}>
        <Text style={styles.networkBannerIcon}>{config.icon}</Text>
        <View style={styles.networkBannerTextContainer}>
          <Text style={styles.networkBannerTitle}>{config.title}</Text>
          <Text style={styles.networkBannerSubtitle}>
            {config.subtitle}
          </Text>
          {latency && (
            <Text style={styles.networkBannerLatency}>
              Last ping: {latency}ms
            </Text>
          )}
        </View>
        <TouchableOpacity 
          style={styles.reconnectButton}
          onPress={onReconnect}
          activeOpacity={0.8}
          disabled={connectionStatus === 'connecting'}
        >
          <Text style={styles.reconnectButtonText}>
            {connectionStatus === 'connecting' ? 'Wait...' : 'Retry'}
          </Text>
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

// FollowerControlHint Component - shows when followers try to interact with leader-only controls
function FollowerControlHint({ role, show, onDismiss }) {
  const opacity = new Animated.Value(show ? 1 : 0);
  
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: show ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    if (show) {
      const timer = setTimeout(onDismiss, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, opacity, onDismiss]);

  if (!show) return null;

  return (
    <Animated.View style={[styles.followerHint, { opacity }]}>
      <Text style={styles.followerHintIcon}>👑</Text>
      <Text style={styles.followerHintText}>
        Only the session leader can control tempo and playback
      </Text>
    </Animated.View>
  );
}

// Session Status Component for clear session state display with enhanced metrics
function SessionStatus({ 
  connected, 
  sessionId, 
  memberCount, 
  connectionStatus, 
  latency, 
  latencyStatus, 
  syncQuality, 
  serverTimeOffset, 
  packetLoss 
}) {
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
      
      {/* Enhanced Connection Status Indicator */}
      <ConnectionStatusIndicator
        connected={connected}
        connectionStatus={connectionStatus}
        latency={latency}
        latencyStatus={latencyStatus}
        syncQuality={syncQuality}
        packetLoss={packetLoss}
        compact={false}
      />
      
      <View style={styles.sessionMetrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Members</Text>
          <Text style={styles.metricValue}>{memberCount}</Text>
        </View>
        
        {connected && latency !== null && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Ping</Text>
            <Text style={[
              styles.metricValue, 
              { color: latency < 50 ? "#00b894" : latency < 150 ? "#fdcb6e" : "#e17055" }
            ]}>
              {latency}ms
            </Text>
          </View>
        )}
        
        {connected && serverTimeOffset !== 0 && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Time Offset</Text>
            <Text style={[
              styles.metricValue,
              { color: Math.abs(serverTimeOffset) < 10 ? "#00b894" : "#fdcb6e" }
            ]}>
              {serverTimeOffset > 0 ? '+' : ''}{serverTimeOffset}ms
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
  const { 
    state, 
    emit, 
    connected, 
    roomStats,
    connectionStatus,
    latency,
    latencyStatus,
    syncQuality,
    serverTimeOffset,
    packetLoss
  } = useSocket(sessionId);
  const { isReduceMotionEnabled, isHighContrastEnabled } = useAccessibility();
  const [message, setMessage] = useState("");
  const [role, setRole] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [tempoBpm, setTempoBpm] = useState(100);
  const [showPdf, setShowPdf] = useState(false);
  const [demoMode, setDemoMode] = useState(sessionId === "demo");
  const [connectionRetries, setConnectionRetries] = useState(0);
  // Remove local syncQuality state as it's now provided by useSocket
  // const [syncQuality, setSyncQuality] = useState(null);
  const [showFollowerHint, setShowFollowerHint] = useState(false);

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

  // Handle follower control interaction feedback
  const handleFollowerControlTap = async (controlType) => {
    if (role === "follower") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowFollowerHint(true);
      
      // Show specific alert based on control type
      const messages = {
        tempo: "Only the session leader can change the tempo. Ask them to adjust it or take leadership.",
        playback: "Only the session leader can control playback. Ask them to play/pause or take leadership.",
        message: "Only the session leader can send messages to all members. Ask them to send messages or take leadership."
      };
      
      setTimeout(() => {
        Alert.alert(
          "Leader Control",
          messages[controlType],
          [
            { text: "OK", style: "default" },
            { 
              text: "Take Leadership", 
              style: "default",
              onPress: () => handleRoleChange("leader")
            }
          ]
        );
      }, 300);
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
        connectionStatus={connectionStatus}
        latency={latency}
        onReconnect={handleReconnect} 
      />
      
      <SessionStatus 
        connected={connected}
        sessionId={sessionId}
        memberCount={roomStats?.memberCount || 0}
        connectionStatus={connectionStatus}
        latency={latency}
        latencyStatus={latencyStatus}
        syncQuality={syncQuality}
        serverTimeOffset={serverTimeOffset}
        packetLoss={packetLoss}
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
          <FollowerControlHint 
            role={role}
            show={showFollowerHint}
            onDismiss={() => setShowFollowerHint(false)}
          />
          
          <RoleToggle 
            currentRole={role} 
            onRoleChange={handleRoleChange}
            disabled={!connected}
            memberCount={roomStats?.memberCount || 0}
          />
          
          {/* Compact connection status in controls */}
          <View style={styles.compactStatusRow}>
            <ConnectionStatusIndicator
              connected={connected}
              connectionStatus={connectionStatus}
              latency={latency}
              latencyStatus={latencyStatus}
              syncQuality={syncQuality}
              packetLoss={packetLoss}
              compact={true}
            />
            {syncQuality !== null && (
              <Text style={styles.compactQualityText}>
                Quality: {Math.round(syncQuality * 100)}%
              </Text>
            )}
          </View>
          
          <View style={styles.controlsHeader}>
            
            <View style={styles.compactControls}>
              <View style={styles.tempoContainer}>
                <Text style={[styles.tempoText, role !== "leader" && styles.disabledText]}>
                  {role === "leader" ? "👑" : "👥"} Tempo: {Math.round(tempoBpm)} BPM
                </Text>
                {role === "leader" ? (
                  <TextInput
                    style={styles.compactInput}
                    value={tempoBpm.toString()}
                    onChangeText={(text) => handleTempoChange(parseInt(text) || 100)}
                    keyboardType="numeric"
                    placeholder="BPM"
                  />
                ) : (
                  <TouchableOpacity
                    style={[styles.compactInput, styles.disabledInput]}
                    onPress={() => handleFollowerControlTap('tempo')}
                  >
                    <Text style={styles.disabledInputText}>{Math.round(tempoBpm)}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {role !== "leader" && (
                <Text style={styles.followerNote}>
                  Leader controls tempo
                </Text>
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

            <View style={styles.playbackControls}>
              {role === "leader" ? (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => emit(state?.isPlaying ? EVENTS.PAUSE : EVENTS.PLAY, { sessionId })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.playButtonIcon}>
                    {state?.isPlaying ? "⏸️" : "▶️"}
                  </Text>
                  <Text style={styles.playButtonText}>
                    {state?.isPlaying ? "Pause" : "Play"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.playButton, styles.disabledPlayButton]}
                  onPress={() => handleFollowerControlTap('playback')}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.playButtonIcon, styles.disabledIcon]}>
                    {state?.isPlaying ? "⏸️" : "▶️"}
                  </Text>
                  <Text style={[styles.playButtonText, styles.disabledText]}>
                    {state?.isPlaying ? "Playing" : "Stopped"}
                  </Text>
                  <Text style={styles.followerPlaybackNote}>Leader Only</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.metronomeContainer, role === "leader" ? styles.leaderMetronome : styles.followerMetronome]}>
            <View style={styles.metronomeHeader}>
              <Text style={[styles.metronomeLabel, role === "leader" ? styles.leaderText : styles.followerText]}>
                {role === "leader" ? "👑 Your Metronome" : "👥 Following Leader's Beat"}
              </Text>
            </View>
            <Metronome 
              tempoBpm={tempoBpm} 
              isPlaying={state?.isPlaying || false}
              syncQuality={syncQuality}
              latency={latency}
              enableReducedMotion={isReduceMotionEnabled}
              enableHighContrast={isHighContrastEnabled}
            />
          </View>

          <View style={styles.tabContainer}>
            {showPdf ? (
              <PdfScroller positionMs={currentPosition} />
            ) : (
              <FakeTab positionMs={currentPosition} />
            )}
          </View>

          <View style={[styles.messageContainer, role === "leader" ? styles.leaderMessageContainer : styles.followerMessageContainer]}>
            <Text style={[styles.messageLabel, role === "leader" ? styles.leaderText : styles.followerText]}>
              {role === "leader" ? "👑 Broadcast Message" : "👥 Session Message"}
            </Text>
            <TextInput
              placeholder={role === "leader" ? "Send message to all members..." : "Shared message (view only)"}
              value={message}
              onChangeText={setMessage}
              style={[styles.textInput, role !== "leader" && styles.disabledTextInput]}
              editable={role === "leader" && connected}
              onFocus={() => role !== "leader" && handleFollowerControlTap('message')}
            />
            {role === "leader" ? (
              <TouchableOpacity 
                style={[styles.messageButton, !connected && styles.disabledButton]}
                onPress={() => emit(EVENTS.UPDATE_MESSAGE, { sessionId, message })}
                disabled={!connected}
                activeOpacity={0.8}
              >
                <Text style={[styles.messageButtonText, !connected && styles.disabledButtonText]}>
                  {connected ? "📢 Send" : "⚠️ Offline"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.disabledMessageButton}
                onPress={() => handleFollowerControlTap('message')}
                activeOpacity={0.6}
              >
                <Text style={styles.disabledButtonText}>
                  Leader Only
                </Text>
              </TouchableOpacity>
            )}
            {role === "follower" && (
              <Text style={styles.followerNote}>
                Only the leader can send messages
              </Text>
            )}
          </View>

          <View style={[styles.statusContainer, role === "leader" ? styles.leaderStatusContainer : styles.followerStatusContainer]}>
            <Text style={[styles.statusLabel, role === "leader" ? styles.leaderText : styles.followerText]}>
              {role === "leader" ? "👑 Session Status" : "👥 Following Status"}
            </Text>
            <Text style={[styles.debugText, role === "leader" ? styles.leaderText : styles.followerText]}>
              {state?.message || "Waiting for session data..."}
            </Text>
            {!connected && (
              <Text style={styles.offlineStatus}>
                ⚠️ Controls disabled - reconnecting...
              </Text>
            )}
          </View>
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
    paddingBottom: 16,
    borderBottomWidth: 2,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  roleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10
  },
  compactControls: {
    marginBottom: 10
  },
  tempoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5
  },
  tempoText: {
    fontSize: 14,
    marginRight: 10,
    fontWeight: '600'
  },
  disabledText: {
    color: '#999',
    opacity: 0.7
  },
  compactInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    borderRadius: 6,
    width: 70,
    textAlign: 'center',
    backgroundColor: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
    opacity: 0.7
  },
  disabledInputText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600'
  },
  followerNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2
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
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  disabledPlayButton: {
    backgroundColor: '#e0e0e0',
    shadowOpacity: 0.1,
    elevation: 1
  },
  playButtonIcon: {
    fontSize: 18,
    marginRight: 8
  },
  disabledIcon: {
    opacity: 0.5
  },
  playButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1
  },
  followerPlaybackNote: {
    fontSize: 10,
    color: '#999',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tabContainer: {
    flex: 1,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    overflow: 'hidden'
  },
  messageContainer: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  leaderMessageContainer: {
    backgroundColor: '#f8f7ff',
    borderWidth: 1,
    borderColor: '#e6e3ff'
  },
  followerMessageContainer: {
    backgroundColor: '#f7fffe',
    borderWidth: 1,
    borderColor: '#e3fffe'
  },
  messageLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 16
  },
  disabledTextInput: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
    color: '#999'
  },
  messageButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  disabledButton: {
    backgroundColor: '#ccc',
    shadowOpacity: 0.1,
    elevation: 1
  },
  disabledMessageButton: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center'
  },
  messageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  disabledButtonText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600'
  },
  statusContainer: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  leaderStatusContainer: {
    backgroundColor: '#f8f7ff',
    borderWidth: 1,
    borderColor: '#e6e3ff'
  },
  followerStatusContainer: {
    backgroundColor: '#f7fffe',
    borderWidth: 1,
    borderColor: '#e3fffe'
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  debugText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 4
  },
  offlineStatus: {
    fontSize: 12,
    color: '#e17055',
    fontWeight: '600',
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
  networkBannerLatency: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
    fontWeight: '500'
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
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)'
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
    fontSize: 32,
    marginRight: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2
  },
  roleToggleInfo: {
    flex: 1
  },
  roleToggleText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  leaderBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1
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
  },
  
  // Follower Control Hint styles
  followerHint: {
    position: 'absolute',
    top: -60,
    left: 16,
    right: 16,
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  followerHintIcon: {
    fontSize: 20,
    marginRight: 10
  },
  followerHintText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18
  },
  
  // Enhanced role-based control section styles
  roleIndicatorBar: {
    marginBottom: 12,
    alignItems: 'center'
  },
  roleIndicatorText: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4
  },
  leaderIndicator: {
    color: '#6c5ce7'
  },
  followerIndicator: {
    color: '#00cec9'
  },
  controlHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic'
  },
  leaderControlsHeader: {
    backgroundColor: '#f8f7ff',
    borderBottomColor: '#6c5ce7',
    borderWidth: 1,
    borderColor: '#e6e3ff'
  },
  followerControlsHeader: {
    backgroundColor: '#f7fffe',
    borderBottomColor: '#00cec9',
    borderWidth: 1,
    borderColor: '#e3fffe'
  },
  
  // Metronome container styles
  metronomeContainer: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  leaderMetronome: {
    backgroundColor: '#f8f7ff',
    borderWidth: 1,
    borderColor: '#e6e3ff'
  },
  followerMetronome: {
    backgroundColor: '#f7fffe',
    borderWidth: 1,
    borderColor: '#e3fffe'
  },
  metronomeHeader: {
    marginBottom: 8,
    alignItems: 'center'
  },
  metronomeLabel: {
    fontSize: 14,
    fontWeight: '600'
  },
  leaderText: {
    color: '#6c5ce7'
  },
  followerText: {
    color: '#00cec9'
  },
  
  // Compact status styles
  compactStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef'
  },
  compactQualityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057'
  }
});