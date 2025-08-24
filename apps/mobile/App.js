import React from "react";
import { SafeAreaView } from "react-native";
import SessionScreen from "./src/screens/SessionScreen";

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <SessionScreen sessionId="demo" />
    </SafeAreaView>
  );
}