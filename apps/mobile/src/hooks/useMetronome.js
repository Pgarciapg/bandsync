import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Haptics from "expo-haptics";

// Performance optimization: High-precision timing using requestAnimationFrame
class HighPrecisionMetronome {
  constructor(callback, interval) {
    this.callback = callback;
    this.interval = interval;
    this.startTime = null;
    this.nextTick = 0;
    this.animationFrame = null;
    this.running = false;
  }

  start() {
    this.startTime = performance.now();
    this.nextTick = this.startTime + this.interval;
    this.running = true;
    this.tick();
  }

  tick = () => {
    if (!this.running) return;

    const now = performance.now();
    
    if (now >= this.nextTick) {
      this.callback();
      // Calculate next tick time, accounting for any drift
      while (this.nextTick <= now) {
        this.nextTick += this.interval;
      }
    }

    this.animationFrame = requestAnimationFrame(this.tick);
  };

  stop() {
    this.running = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  updateInterval(newInterval) {
    this.interval = newInterval;
    if (this.running) {
      // Adjust next tick based on new interval
      const now = performance.now();
      this.nextTick = now + newInterval;
    }
  }
}

export function useMetronome(tempoBpm, isPlaying) {
  const metronomeRef = useRef(null);
  const [tickCount, setTickCount] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);
  const lastTickTimeRef = useRef(0);
  const [accuracy, setAccuracy] = useState(100); // Timing accuracy percentage

  // Performance optimization: Memoized haptic feedback function
  const triggerHaptic = useCallback(() => {
    if (isEnabled) {
      // Use lighter haptic feedback to reduce battery drain
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isEnabled]);

  // Performance optimization: Memoized tick handler
  const handleTick = useCallback(() => {
    const currentTime = performance.now();
    
    // Calculate timing accuracy
    if (lastTickTimeRef.current > 0) {
      const expectedInterval = 60000 / tempoBpm;
      const actualInterval = currentTime - lastTickTimeRef.current;
      const accuracyPercent = Math.max(0, 100 - Math.abs((actualInterval - expectedInterval) / expectedInterval * 100));
      setAccuracy(accuracyPercent);
    }
    
    lastTickTimeRef.current = currentTime;
    
    // Batch updates for better performance
    setTickCount(prev => prev + 1);
    triggerHaptic();
  }, [tempoBpm, triggerHaptic]);

  // Performance optimization: Memoized beat interval calculation
  const beatInterval = useMemo(() => {
    return tempoBpm > 0 ? 60000 / tempoBpm : 0;
  }, [tempoBpm]);

  useEffect(() => {
    if (isPlaying && isEnabled && tempoBpm > 0) {
      // Use high-precision metronome instead of setInterval
      metronomeRef.current = new HighPrecisionMetronome(handleTick, beatInterval);
      metronomeRef.current.start();

      return () => {
        if (metronomeRef.current) {
          metronomeRef.current.stop();
          metronomeRef.current = null;
        }
      };
    } else {
      // Stop metronome if not playing or disabled
      if (metronomeRef.current) {
        metronomeRef.current.stop();
        metronomeRef.current = null;
      }
    }
  }, [tempoBpm, isPlaying, isEnabled, handleTick, beatInterval]);

  // Performance optimization: Update interval when tempo changes without restarting
  useEffect(() => {
    if (metronomeRef.current && isPlaying && isEnabled) {
      metronomeRef.current.updateInterval(beatInterval);
    }
  }, [beatInterval, isPlaying, isEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (metronomeRef.current) {
        metronomeRef.current.stop();
      }
    };
  }, []);

  // Performance optimization: Memoized toggle function
  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
  }, []);

  // Performance optimization: Reset tick count when starting/stopping
  useEffect(() => {
    if (!isPlaying) {
      setTickCount(0);
      lastTickTimeRef.current = 0;
      setAccuracy(100);
    }
  }, [isPlaying]);

  return {
    tickCount,
    isEnabled,
    toggleEnabled,
    accuracy
  };
}