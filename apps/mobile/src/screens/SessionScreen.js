import React, { useState } from "react";
import { View, Text, Button, TextInput } from "react-native";
import { useSocket } from "../hooks/useSocket";
import { SERVER_URL } from "../config";

const EVENTS = {
  UPDATE_MESSAGE: "update_message",
  PLAY: "play",
  PAUSE: "pause",
  SET_TEMPO: "set_tempo"
};

export default function SessionScreen({ sessionId = "demo" }) {
  const { state, emit } = useSocket(sessionId);
  const [message, setMessage] = useState("");

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text>Server: {SERVER_URL}</Text>
      <Text>Session: {sessionId}</Text>
      <Text>Snapshot: {state ? JSON.stringify(state) : "Connecting…"}</Text>

      <TextInput
        placeholder="Shared message"
        value={message}
        onChangeText={setMessage}
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button title="Update Message" onPress={() => emit(EVENTS.UPDATE_MESSAGE, { sessionId, message })} />
      <Button title="Play" onPress={() => emit(EVENTS.PLAY, { sessionId })} />
      <Button title="Pause" onPress={() => emit(EVENTS.PAUSE, { sessionId })} />
      <Button title="Tempo 90" onPress={() => emit(EVENTS.SET_TEMPO, { sessionId, tempo: 90 })} />
    </View>
  );
}