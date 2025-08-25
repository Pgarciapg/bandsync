/**
 * BandSync Mobile App Entry Point
 * Real-time musical collaboration with TypeScript support
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import SessionScreen from './src/screens/SessionScreen';
import { ThemedView } from './src/components/ThemedView';

export default function App() {
  return (
    <ThemedView style={styles.container}>
      <SessionScreen sessionId="demo" />
      <StatusBar style="auto" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});