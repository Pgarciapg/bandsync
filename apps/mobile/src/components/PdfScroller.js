import React, { useRef, useEffect, useState } from "react";
import { ScrollView, Text, View, StyleSheet, Button, Alert } from "react-native";
import * as DocumentPicker from 'expo-document-picker';

export default function PdfScroller({ positionMs = 0 }) {
  const scrollViewRef = useRef(null);
  const [content, setContent] = useState("");
  const [isPdfMode, setIsPdfMode] = useState(false);
  const pxPerMs = 0.15; // pixels per millisecond - slightly faster than FakeTab

  useEffect(() => {
    // Load default content on mount
    loadDefaultContent();
  }, []);

  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollPosition = positionMs * pxPerMs;
      scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
    }
  }, [positionMs]);

  const loadDefaultContent = async () => {
    try {
      // For demo purposes, we'll use the text file we created
      const sampleContent = `BandSync Sample Guitar Tab

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

--- End of Tab ---`;

      setContent(sampleContent);
      setIsPdfMode(false);
    } catch (error) {
      console.error('Error loading default content:', error);
      setContent("Error loading content");
    }
  };

  const pickDocument = async () => {
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
  };

  const renderContent = () => {
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

    // Render text content line by line
    const lines = content.split('\n');
    return lines.map((line, index) => (
      <View key={index} style={styles.line}>
        <Text style={styles.lineNumber}>{(index + 1).toString().padStart(3, '0')}</Text>
        <Text style={styles.lineContent}>{line}</Text>
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎼 PDF/Tab Scroller</Text>
        <Button title="Load File" onPress={pickDocument} />
      </View>
      
      <Text style={styles.position}>Position: {Math.floor(positionMs / 1000)}s</Text>
      
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={true}
      >
        {renderContent()}
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