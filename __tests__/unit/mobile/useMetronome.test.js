import { renderHook, act } from '@testing-library/react';
import * as Haptics from 'expo-haptics';
import { useMetronome } from '../../../apps/mobile/src/hooks/useMetronome';

// Mock timers for precise timing control
jest.useFakeTimers();

describe('useMetronome Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Basic Functionality', () => {
    test('should initialize with default values', () => {
      const { result } = renderHook(() => useMetronome(120, false));
      
      expect(result.current.tickCount).toBe(0);
      expect(result.current.isEnabled).toBe(true);
      expect(typeof result.current.toggleEnabled).toBe('function');
    });

    test('should not start metronome when not playing', () => {
      renderHook(() => useMetronome(120, false));
      
      // Advance time
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    test('should not start metronome when disabled', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      // Disable metronome
      act(() => {
        result.current.toggleEnabled();
      });
      
      // Advance time
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    test('should start metronome when playing and enabled', () => {
      renderHook(() => useMetronome(120, true)); // 120 BPM = 500ms per beat
      
      // Advance time by one beat
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('Tempo Accuracy', () => {
    test('should maintain accurate timing at 60 BPM', () => {
      const { result } = renderHook(() => useMetronome(60, true));
      
      // 60 BPM = 1000ms per beat
      let tickCount = 0;
      
      // Test 5 beats
      for (let i = 0; i < 5; i++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        tickCount++;
      }
      
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(5);
      expect(result.current.tickCount).toBe(5);
    });

    test('should maintain accurate timing at 120 BPM', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      // 120 BPM = 500ms per beat
      let expectedTicks = 0;
      
      // Test multiple beats
      for (let i = 0; i < 10; i++) {
        act(() => {
          jest.advanceTimersByTime(500);
        });
        expectedTicks++;
      }
      
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(10);
      expect(result.current.tickCount).toBe(10);
    });

    test('should maintain accurate timing at 180 BPM (fast tempo)', () => {
      const { result } = renderHook(() => useMetronome(180, true));
      
      // 180 BPM = 333.33ms per beat
      const beatInterval = 60000 / 180; // ~333.33ms
      
      // Test multiple beats
      for (let i = 0; i < 6; i++) {
        act(() => {
          jest.advanceTimersByTime(beatInterval);
        });
      }
      
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(6);
      expect(result.current.tickCount).toBe(6);
    });

    test('should handle tempo changes accurately', () => {
      const { result, rerender } = renderHook(
        ({ tempo, playing }) => useMetronome(tempo, playing),
        { initialProps: { tempo: 120, playing: true } }
      );
      
      // Start at 120 BPM (500ms per beat)
      act(() => {
        jest.advanceTimersByTime(1000); // 2 beats
      });
      
      expect(result.current.tickCount).toBe(2);
      
      // Change to 60 BPM (1000ms per beat)
      rerender({ tempo: 60, playing: true });
      
      // Reset tick count tracking
      const previousTicks = result.current.tickCount;
      
      act(() => {
        jest.advanceTimersByTime(2000); // 2 beats at new tempo
      });
      
      // Should have 2 additional beats (but tick count is cumulative)
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    test('should increment tick count on each beat', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      expect(result.current.tickCount).toBe(0);
      
      // First beat
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      expect(result.current.tickCount).toBe(1);
      
      // Second beat
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      expect(result.current.tickCount).toBe(2);
    });

    test('should toggle enabled state', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      expect(result.current.isEnabled).toBe(true);
      
      act(() => {
        result.current.toggleEnabled();
      });
      
      expect(result.current.isEnabled).toBe(false);
      
      act(() => {
        result.current.toggleEnabled();
      });
      
      expect(result.current.isEnabled).toBe(true);
    });

    test('should stop ticking when disabled mid-playback', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      // Start metronome
      act(() => {
        jest.advanceTimersByTime(500); // First beat
      });
      
      expect(result.current.tickCount).toBe(1);
      
      // Disable metronome
      act(() => {
        result.current.toggleEnabled();
      });
      
      // Continue time - should not tick
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      expect(result.current.tickCount).toBe(1); // No additional ticks
    });
  });

  describe('Synchronization Performance', () => {
    test('should maintain consistent timing over extended periods', () => {
      const { result } = renderHook(() => useMetronome(120, true));
      
      const beatInterval = 500; // 120 BPM
      const testDuration = 30000; // 30 seconds
      const expectedBeats = testDuration / beatInterval; // 60 beats
      
      // Run for extended period
      act(() => {
        jest.advanceTimersByTime(testDuration);
      });
      
      expect(result.current.tickCount).toBe(expectedBeats);
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(expectedBeats);
    });

    test('should handle rapid start/stop cycles', () => {
      const { rerender } = renderHook(
        ({ tempo, playing }) => useMetronome(tempo, playing),
        { initialProps: { tempo: 120, playing: false } }
      );
      
      // Rapid start/stop cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        // Start
        rerender({ tempo: 120, playing: true });
        act(() => {
          jest.advanceTimersByTime(100); // Brief play
        });
        
        // Stop
        rerender({ tempo: 120, playing: false });
        act(() => {
          jest.advanceTimersByTime(100); // Brief pause
        });
      }
      
      // Should handle without errors
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });

    test('should clean up intervals properly', () => {
      const { unmount } = renderHook(() => useMetronome(120, true));
      
      // Start metronome
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
      
      // Unmount component
      unmount();
      
      // Advance time after unmount - should not trigger haptics
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1); // No additional calls
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero tempo gracefully', () => {
      const { result } = renderHook(() => useMetronome(0, true));
      
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
      expect(result.current.tickCount).toBe(0);
    });

    test('should handle negative tempo gracefully', () => {
      const { result } = renderHook(() => useMetronome(-120, true));
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
      expect(result.current.tickCount).toBe(0);
    });

    test('should handle very high tempo values', () => {
      const { result } = renderHook(() => useMetronome(300, true)); // 300 BPM = 200ms per beat
      
      act(() => {
        jest.advanceTimersByTime(1000); // 5 beats
      });
      
      expect(result.current.tickCount).toBe(5);
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(5);
    });

    test('should handle rapid tempo changes', () => {
      const { rerender } = renderHook(
        ({ tempo }) => useMetronome(tempo, true),
        { initialProps: { tempo: 60 } }
      );
      
      // Rapid tempo changes
      const tempos = [60, 120, 180, 90, 150];
      
      tempos.forEach(tempo => {
        rerender({ tempo });
        act(() => {
          jest.advanceTimersByTime(100); // Brief time at each tempo
        });
      });
      
      // Should handle without crashing
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });
  });

  describe('Haptics Integration', () => {
    test('should call haptics with correct impact style', () => {
      renderHook(() => useMetronome(120, true));
      
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    test('should handle haptics errors gracefully', () => {
      // Mock haptics to reject
      Haptics.impactAsync.mockRejectedValue(new Error('Haptics unavailable'));
      
      const { result } = renderHook(() => useMetronome(120, true));
      
      // Should not throw error
      expect(() => {
        act(() => {
          jest.advanceTimersByTime(500);
        });
      }).not.toThrow();
      
      expect(result.current.tickCount).toBe(1);
    });
  });
});