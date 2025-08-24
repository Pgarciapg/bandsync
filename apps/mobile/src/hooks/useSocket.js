import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { SERVER_URL } from "../config";

export function useSocket(sessionId) {
  const socketRef = useRef(null);
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_session", { sessionId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("snapshot", (data) => setState(data));

    socket.on("scroll_tick", (data) => {
      if (data.sessionId === sessionId) {
        setState(prevState => ({
          ...prevState,
          position: data.positionMs
        }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  const emit = (event, payload) => socketRef.current?.emit(event, payload);

  return { state, emit, connected };
}