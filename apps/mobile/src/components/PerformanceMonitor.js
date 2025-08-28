import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Performance monitoring component for debugging and optimization
const PerformanceMonitor = memo(({ enabled = false }) => {
  const [fps, setFps] = useState(60);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [renderTime, setRenderTime] = useState(0);
  const [networkLatency, setNetworkLatency] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrame;

    // FPS Monitoring
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationFrame = requestAnimationFrame(measureFPS);
    };

    // Memory monitoring (approximate)
    const monitorMemory = () => {
      if (global.performance && global.performance.memory) {
        const used = global.performance.memory.usedJSHeapSize;
        const total = global.performance.memory.totalJSHeapSize;
        setMemoryUsage(Math.round((used / total) * 100));
      }
    };

    // Start monitoring
    measureFPS();
    const memoryInterval = setInterval(monitorMemory, 2000);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      clearInterval(memoryInterval);
    };
  }, [enabled]);

  if (!enabled) return null;

  const getFpsColor = () => {
    if (fps >= 55) return '#4CAF50';
    if (fps >= 45) return '#FF9800';
    return '#F44336';
  };

  const getMemoryColor = () => {
    if (memoryUsage <= 60) return '#4CAF50';
    if (memoryUsage <= 80) return '#FF9800';
    return '#F44336';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Performance Monitor</Text>
      
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.label}>FPS</Text>
          <Text style={[styles.value, { color: getFpsColor() }]}>{fps}</Text>
        </View>
        
        <View style={styles.metric}>
          <Text style={styles.label}>Memory</Text>
          <Text style={[styles.value, { color: getMemoryColor() }]}>{memoryUsage}%</Text>
        </View>
        
        <View style={styles.metric}>
          <Text style={styles.label}>Render</Text>
          <Text style={styles.value}>{renderTime.toFixed(1)}ms</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 6,
    zIndex: 1000,
  },
  title: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    alignItems: 'center',
  },
  label: {
    color: '#ccc',
    fontSize: 8,
  },
  value: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default PerformanceMonitor;