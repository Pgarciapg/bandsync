import React, { useState, useEffect } from "react";
import { View, Text, Button, TextInput, StyleSheet } from "react-native";
import Slider from "@react-native-community/slider";
import { useSocket } from "../hooks/useSocket";
import { SERVER_URL } from "../config";
import FakeTab from "../components/FakeTab";

const EVENTS = {
  UPDATE_MESSAGE: "update_message",
  PLAY: "play",
  PAUSE: "pause",
  SET_TEMPO: "set_tempo",
  SET_ROLE: "set_role",
  SCROLL_TICK: "scroll_tick",
  SYNC_REQUEST: "sync_request"
};

export default function SessionScreen({ sessionId = "demo" }) {
  const { state, emit, connected } = useSocket(sessionId);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [tempoBpm, setTempoBpm] = useState(100);

  useEffect(() => {
    if (state) {
      setCurrentPosition(state.position || 0);
      setTempoBpm(state.tempoBpm || 100);
    }
  }, [state]);

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    emit(EVENTS.SET_ROLE, { sessionId, role: selectedRole });
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

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>🌐 {SERVER_URL}</Text>
        <Text style={styles.statusText}>📱 Session: {sessionId}</Text>
        <Text style={styles.connectionStatus}>
          {connected ? "🟢 Connected" : "🔴 Disconnected"}
        </Text>
      </View>

      {!role ? (
        <View style={styles.roleSelection}>
          <Text style={styles.title}>Select Your Role</Text>
          <View style={styles.buttonRow}>
            <Button title="👑 Leader" onPress={() => handleRoleSelect("leader")} />
            <Button title="👥 Follower" onPress={() => handleRoleSelect("follower")} />
          </View>
        </View>
      ) : (
        <View style={styles.controls}>
          <View style={styles.controlsHeader}>
            <Text style={styles.roleText}>Role: {role === "leader" ? "👑 Leader" : "👥 Follower"}</Text>
            
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

            {role === "leader" && (
              <View style={styles.playbackControls}>
                <Button 
                  title={state?.isPlaying ? "⏸️ Pause" : "▶️ Play"} 
                  onPress={() => emit(state?.isPlaying ? EVENTS.PAUSE : EVENTS.PLAY, { sessionId })} 
                />
              </View>
            )}
          </View>

          <View style={styles.tabContainer}>
            <FakeTab positionMs={currentPosition} />
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
    </View>
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
  statusText: {
    fontSize: 12,
    color: '#666'
  },
  connectionStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5
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
  }
});