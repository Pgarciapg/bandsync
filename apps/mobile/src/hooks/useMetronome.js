import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";

export function useMetronome(tempoBpm, isPlaying) {
  const intervalRef = useRef(null);
  const [tickCount, setTickCount] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (isPlaying && isEnabled && tempoBpm > 0) {
      const beatMs = 60000 / tempoBpm; // milliseconds per beat
      
      intervalRef.current = setInterval(() => {
        // Haptic feedback on each beat
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Update tick count for visual indication
        setTickCount(prev => prev + 1);
      }, beatMs);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clear interval if not playing or disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [tempoBpm, isPlaying, isEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const toggleEnabled = () => setIsEnabled(!isEnabled);

  return {
    tickCount,
    isEnabled,
    toggleEnabled
  };
}