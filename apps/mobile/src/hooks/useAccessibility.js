import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Hook to detect accessibility preferences
 * @returns {Object} Accessibility preferences
 */
export function useAccessibility() {
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);
  const [isHighContrastEnabled, setIsHighContrastEnabled] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const checkReduceMotion = async () => {
      try {
        const isReduceMotionOn = await AccessibilityInfo.isReduceMotionEnabled();
        setIsReduceMotionEnabled(isReduceMotionOn);
      } catch (error) {
        // If AccessibilityInfo doesn't support this method, default to false
        setIsReduceMotionEnabled(false);
      }
    };

    // Check for high contrast preference
    const checkHighContrast = async () => {
      try {
        // This may not be available on all platforms
        if (AccessibilityInfo.isHighTextContrastEnabled) {
          const isHighContrastOn = await AccessibilityInfo.isHighTextContrastEnabled();
          setIsHighContrastEnabled(isHighContrastOn);
        }
      } catch (error) {
        setIsHighContrastEnabled(false);
      }
    };

    checkReduceMotion();
    checkHighContrast();

    // Set up listeners for changes
    const reduceMotionListener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setIsReduceMotionEnabled
    );

    // High contrast listener (if available)
    let highContrastListener;
    if (AccessibilityInfo.addEventListener) {
      try {
        highContrastListener = AccessibilityInfo.addEventListener(
          'highTextContrastChanged',
          setIsHighContrastEnabled
        );
      } catch (error) {
        // Not supported on this platform
      }
    }

    return () => {
      if (reduceMotionListener?.remove) {
        reduceMotionListener.remove();
      }
      if (highContrastListener?.remove) {
        highContrastListener.remove();
      }
    };
  }, []);

  return {
    isReduceMotionEnabled,
    isHighContrastEnabled,
  };
}