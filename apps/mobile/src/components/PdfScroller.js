import React, { useRef, useEffect, useState, memo, useMemo, useCallback } from "react";
import { ScrollView, Text, View, StyleSheet, Button, Alert } from "react-native";
import * as DocumentPicker from 'expo-document-picker';

// Performance optimization: Memoized content line component
const ContentLine = memo(({ line, index }) => (
  <View style={styles.line}>
    <Text style={styles.lineNumber}>{(index + 1).toString().padStart(3, '0')}</Text>
    <Text style={styles.lineContent}>{line}</Text>
  </View>
));

const PdfScroller = memo(({ positionMs = 0 }) => {
  const scrollViewRef = useRef(null);
  const lastPositionRef = useRef(0);
  const [content, setContent] = useState("");
  const [isPdfMode, setIsPdfMode] = useState(false);
  const pxPerMs = 0.15; // pixels per millisecond - slightly faster than FakeTab

  useEffect(() => {
    // Load default content on mount
    loadDefaultContent();
  }, []);

  // Performance optimization: Smooth scrolling similar to FakeTab
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

  // Performance optimization: Memoized default content
  const defaultContent = useMemo(() => `BandSync Sample Guitar Tab

Stairway to Heaven - Led Zeppelin
Tuning: Standard (E A D G B E)

Intro:
Am    C    D    F    G    Am

E|--------0----------0----------2----------1----------3----------0-------|
B|--------1----------1----------3----------1----------3----------1-------|
G|--------2----------0----------2----------2----------0----------2-------|
D|--------2----------2----------0----------3----------0----------2-------|
A|--------0----------3----------x----------3----------2----------0-------|
E|--------x----------x----------x----------1----------3----------x-------|

Verse 1:
Am                           C                 D
There's a lady who's sure all that glitters is gold
F                        G                Am
And she's buying a stairway to heaven

Am                           C                   D
When she gets there she knows, if the stores are all closed
F                              G                 Am
With a word she can get what she came for

F                    G                Am
Ooh, ooh, and she's buying a stairway to heaven

Chorus:
C                D               F
There's a sign on the wall but she wants to be sure
           Am
'Cause you know sometimes words have two meanings
C                    D                F
In a tree by the brook, there's a songbird who sings
              Am
Sometimes all of our thoughts are misgiven

Bridge:
Am     G     F     G     Am     G     F     G

Solo Section:
E|--8--10--12--10--8--7--8--5--3--5--3--0--|
B|--8--10--12--10--8--8--8--5--5--5--3--1--|
G|--9--11--12--11--9--7--9--5--2--5--2--0--|
D|--10-12--14--12--10-9--10-7--0--7--0--2--|
A|--10-12--14--12--10-7--10-7--x--7--x--3--|
E|--8--10--12--10--8--x--8--5--x--5--x--x--|

Outro:
F     G     Am     F     G     Am

And she's buying a stairway to heaven...

--- End of Tab ---`, []);
  
  const loadDefaultContent = useCallback(async () => {
    try {
      setContent(defaultContent);
      setIsPdfMode(false);
    } catch (error) {
      console.error('Error loading default content:', error);
      setContent("Error loading content");
    }
  }, [defaultContent]);

  // Performance optimization: Memoized document picker function
  const pickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        if (asset.mimeType === 'application/pdf') {
          setIsPdfMode(true);
          setContent(asset.uri);
        } else if (asset.mimeType === 'text/plain') {
          // For text files, we could read the content
          setIsPdfMode(false);
          setContent("Text file selected: " + asset.name);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
      console.error('Document picker error:', error);
    }
  }, []);

  // Performance optimization: Memoized content rendering
  const contentLines = useMemo(() => {
    return content.split('\n');
  }, [content]);
  
  const positionDisplay = useMemo(() => {
    return Math.floor(positionMs / 1000);
  }, [positionMs]);
  
  const renderContent = useCallback(() => {
    if (isPdfMode) {
      return (
        <View style={styles.pdfPlaceholder}>
          <Text style={styles.pdfText}>PDF Mode</Text>
          <Text style={styles.pdfSubtext}>PDF viewing would be implemented here</Text>
          <Text style={styles.pdfSubtext}>Using react-native-pdf library</Text>
          <Button title="Back to Text" onPress={loadDefaultContent} />
        </View>
      );
    }

    // Render text content line by line with memoized components
    return contentLines.map((line, index) => (
      <ContentLine key={index} line={line} index={index} />
    ));
  }, [isPdfMode, contentLines, loadDefaultContent]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎼 PDF/Tab Scroller</Text>
        <Button title="Load File" onPress={pickDocument} />
      </View>
      
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
        {renderContent()}
      </ScrollView>
    </View>
  );
});

export default PdfScroller;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  position: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666',
    paddingVertical: 5
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#fafafa'
  },
  line: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: 24
  },
  lineNumber: {
    width: 35,
    fontSize: 10,
    color: '#999',
    fontFamily: 'monospace',
    marginRight: 8
  },
  lineContent: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333'
  },
  pdfPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  pdfText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10
  },
  pdfSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center'
  }
});