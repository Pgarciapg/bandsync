import React, { useRef, useEffect } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";

export default function FakeTab({ positionMs = 0 }) {
  const scrollViewRef = useRef(null);
  const pxPerMs = 0.1; // pixels per millisecond - adjust this to control scroll speed

  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollPosition = positionMs * pxPerMs;
      scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
    }
  }, [positionMs]);

  // Generate 300 numbered lines to simulate tab content
  const lines = Array.from({ length: 300 }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🎼 Fake Tab Scroller</Text>
      <Text style={styles.position}>Position: {Math.floor(positionMs / 1000)}s</Text>
      
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={true}
      >
        {lines.map((lineNumber) => (
          <View key={lineNumber} style={styles.line}>
            <Text style={styles.lineNumber}>{lineNumber.toString().padStart(3, '0')}</Text>
            <Text style={styles.lineContent}>
              {lineNumber % 4 === 1 && "E|--3--5--7--8--7--5--3--0--|"}
              {lineNumber % 4 === 2 && "B|--0--1--3--5--3--1--0-----|"}
              {lineNumber % 4 === 3 && "G|--0--2--4--5--4--2--0-----|"}
              {lineNumber % 4 === 0 && "D|--2--4--5--7--5--4--2--0--|"}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
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