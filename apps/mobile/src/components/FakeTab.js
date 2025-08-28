import React, { useRef, useEffect, memo, useMemo, useCallback } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";

// Performance optimization: Memoized line component
const TabLine = memo(({ lineNumber }) => {
  const content = useMemo(() => {
    const patterns = {
      1: "E|--3--5--7--8--7--5--3--0--|",
      2: "B|--0--1--3--5--3--1--0-----|",
      3: "G|--0--2--4--5--4--2--0-----|",
      0: "D|--2--4--5--7--5--4--2--0--|"
    };
    return patterns[lineNumber % 4] || "";
  }, [lineNumber]);
  
  return (
    <View style={styles.line}>
      <Text style={styles.lineNumber}>{lineNumber.toString().padStart(3, '0')}</Text>
      <Text style={styles.lineContent}>{content}</Text>
    </View>
  );
});

const FakeTab = memo(({ positionMs = 0 }) => {
  const scrollViewRef = useRef(null);
  const lastPositionRef = useRef(0);
  const pxPerMs = 0.1; // pixels per millisecond - adjust this to control scroll speed

  // Performance optimization: Smooth scrolling with requestAnimationFrame
  const smoothScrollTo = useCallback((targetPosition) => {
    if (!scrollViewRef.current) return;
    
    const startPosition = lastPositionRef.current;
    const distance = targetPosition - startPosition;
    const duration = 100; // ms
    let startTime = null;
    
    const animateScroll = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentPosition = startPosition + (distance * easeOut);
      
      scrollViewRef.current?.scrollTo({ 
        y: currentPosition, 
        animated: false 
      });
      
      lastPositionRef.current = currentPosition;
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };
    
    requestAnimationFrame(animateScroll);
  }, []);
  
  useEffect(() => {
    const scrollPosition = positionMs * pxPerMs;
    // Only scroll if position changed significantly (performance optimization)
    if (Math.abs(scrollPosition - lastPositionRef.current) > 5) {
      smoothScrollTo(scrollPosition);
    }
  }, [positionMs, pxPerMs, smoothScrollTo]);

  // Performance optimization: Memoized lines data
  const lines = useMemo(() => Array.from({ length: 300 }, (_, i) => i + 1), []);
  
  // Performance optimization: Memoized position display
  const positionDisplay = useMemo(() => {
    return Math.floor(positionMs / 1000);
  }, [positionMs]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🎼 Fake Tab Scroller</Text>
      <Text style={styles.position}>Position: {positionDisplay}s</Text>
      
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={true}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={20}
      >
        {lines.map((lineNumber) => (
          <TabLine key={lineNumber} lineNumber={lineNumber} />
        ))}
      </ScrollView>
    </View>
  );
});

export default FakeTab;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5
  },
  position: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 10
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#f9f9f9'
  },
  line: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    minHeight: 30
  },
  lineNumber: {
    width: 40,
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
    marginRight: 10
  },
  lineContent: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333'
  }
});