import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { SERVER_URL } from "../config";

export function useSocket(sessionId) {
  const socketRef = useRef(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_session", { sessionId });
    });

    socket.on("snapshot", (data) => setState(data));

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  const emit = (event, payload) => socketRef.current?.emit(event, payload);

  return { state, emit };
}