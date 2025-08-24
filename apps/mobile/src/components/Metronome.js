import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import { useMetronome } from "../hooks/useMetronome";

export default function Metronome({ tempoBpm, isPlaying }) {
  const { tickCount, isEnabled, toggleEnabled } = useMetronome(tempoBpm, isPlaying);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (isPlaying && isEnabled) {
      // Visual pulse effect
      setPulse(true);
      const timeout = setTimeout(() => setPulse(false), 100);
      return () => clearTimeout(timeout);
    }
  }, [tickCount, isPlaying, isEnabled]);

  const getPulseStyle = () => ({
    backgroundColor: pulse ? '#ff6b6b' : '#f8f8f8',
    transform: [{ scale: pulse ? 1.1 : 1 }]
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🥁 Metronome</Text>
        <Button 
          title={isEnabled ? "ON" : "OFF"} 
          onPress={toggleEnabled}
          color={isEnabled ? "#4CAF50" : "#888"}
        />
      </View>
      
      <View style={[styles.pulse, getPulseStyle()]}>
        <Text style={styles.tempo}>{tempoBpm}</Text>
        <Text style={styles.bpmLabel}>BPM</Text>
      </View>
      
      <View style={styles.statusContainer}>
        <Text style={styles.status}>
          {isPlaying ? (isEnabled ? "🔊 Ticking" : "🔇 Muted") : "⏸️ Paused"}
        </Text>
        <Text style={styles.tickCounter}>Ticks: {tickCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 10
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  pulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#ddd'
  },
  tempo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  bpmLabel: {
    fontSize: 12,
    color: '#666'
  },
  statusContainer: {
    alignItems: 'center'
  },
  status: {
    fontSize: 14,
    marginBottom: 5
  },
  tickCounter: {
    fontSize: 12,
    color: '#666'
  }
});