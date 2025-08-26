import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import { EVENTS } from "bandsync-shared";
import { SERVER_URL } from "../config";

const LATENCY_PROBE_INTERVAL = 2500; // 2.5 seconds
const LATENCY_HISTORY_SIZE = 10;
const CONNECTION_TIMEOUT = 5000; // 5 seconds

export function useSocket(sessionId) {
  const socketRef = useRef(null);
  const latencyProbeRef = useRef(null);
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomStats, setRoomStats] = useState(null);
  
  // Enhanced connection status
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected', 'connecting', 'reconnecting', 'disconnected', 'failed'
  const [latency, setLatency] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [syncQuality, setSyncQuality] = useState(null);
  const [lastLatencyProbe, setLastLatencyProbe] = useState(null);
  const [packetLossCount, setPacketLossCount] = useState(0);
  const [totalProbes, setTotalProbes] = useState(0);

  // Latency measurement function
  const measureLatency = useCallback(() => {
    if (!socketRef.current || !connected) return;
    
    const probeTimestamp = Date.now();
    setLastLatencyProbe(probeTimestamp);
    setTotalProbes(prev => prev + 1);
    
    socketRef.current.emit(EVENTS.LATENCY_PROBE, {
      timestamp: probeTimestamp,
      sessionId
    });
  }, [connected, sessionId]);

  // Calculate sync quality based on latency consistency and connection stability
  const calculateSyncQuality = useCallback((newLatencyHistory) => {
    if (newLatencyHistory.length < 3) {
      setSyncQuality(null);
      return;
    }
    
    const avgLatency = newLatencyHistory.reduce((sum, l) => sum + l, 0) / newLatencyHistory.length;
    const variance = newLatencyHistory.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / newLatencyHistory.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate packet loss rate
    const packetLoss = totalProbes > 0 ? packetLossCount / totalProbes : 0;
    
    // Quality factors:
    // - Latency: Good (<50ms), Fair (50-150ms), Poor (>150ms)
    // - Consistency: Low std dev = good, high std dev = poor
    // - Packet loss: 0% = perfect, >5% = poor
    
    let latencyScore = 1.0;
    if (avgLatency > 150) latencyScore = 0.3;
    else if (avgLatency > 50) latencyScore = 0.7;
    
    let consistencyScore = Math.max(0.2, 1.0 - (stdDev / 100)); // Penalize high variance
    let packetLossScore = Math.max(0.1, 1.0 - (packetLoss * 10)); // Heavy penalty for packet loss
    
    const quality = (latencyScore * 0.4 + consistencyScore * 0.4 + packetLossScore * 0.2);
    setSyncQuality(Math.max(0.1, Math.min(1.0, quality)));
  }, [packetLossCount, totalProbes]);

  useEffect(() => {
    const socket = io(SERVER_URL, { 
      transports: ["websocket"],
      timeout: CONNECTION_TIMEOUT,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    // Enhanced connection event handlers
    socket.on("connect", () => {
      setConnected(true);
      setConnectionStatus('connected');
      setPacketLossCount(0); // Reset packet loss on new connection
      socket.emit("join_session", { sessionId });
      
      // Start latency measurement after connection
      setTimeout(() => {
        measureLatency();
      }, 1000);
    });

    socket.on("connecting", () => {
      setConnectionStatus('connecting');
    });

    socket.on("reconnecting", (attemptNumber) => {
      setConnectionStatus('reconnecting');
      setConnected(false);
    });

    socket.on("reconnect_failed", () => {
      setConnectionStatus('failed');
      setConnected(false);
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      setConnectionStatus('disconnected');
      setLatency(null);
      
      // Clear latency probe interval
      if (latencyProbeRef.current) {
        clearInterval(latencyProbeRef.current);
        latencyProbeRef.current = null;
      }
    });

    // Handle latency response
    socket.on(EVENTS.LATENCY_RESPONSE, ({ clientTimestamp, serverTimestamp }) => {
      const responseTime = Date.now();
      const roundTripTime = responseTime - clientTimestamp;
      const serverTimeOffset = serverTimestamp - (clientTimestamp + roundTripTime / 2);
      
      setLatency(roundTripTime);
      setServerTimeOffset(serverTimeOffset);
      
      // Update latency history
      setLatencyHistory(prev => {
        const newHistory = [...prev, roundTripTime].slice(-LATENCY_HISTORY_SIZE);
        calculateSyncQuality(newHistory);
        return newHistory;
      });
      
      // Reset probe timeout - we got a response
      setLastLatencyProbe(null);
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

    socket.on("room_stats", (data) => {
      if (data.sessionId === sessionId) {
        setRoomStats(data);
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    // Set up latency probe interval when connected
    const startLatencyProbes = () => {
      if (latencyProbeRef.current) {
        clearInterval(latencyProbeRef.current);
      }
      
      latencyProbeRef.current = setInterval(() => {
        if (connected && socketRef.current) {
          measureLatency();
        }
      }, LATENCY_PROBE_INTERVAL);
    };

    // Start probes when connected
    socket.on('connect', startLatencyProbes);
    
    // Check for missed latency responses (packet loss detection)
    const packetLossCheckInterval = setInterval(() => {
      if (lastLatencyProbe && Date.now() - lastLatencyProbe > LATENCY_PROBE_INTERVAL * 1.5) {
        // We sent a probe but didn't get a response within reasonable time
        setPacketLossCount(prev => prev + 1);
        setLastLatencyProbe(null); // Reset to avoid multiple counts
      }
    }, 1000);

    return () => {
      socket.disconnect();
      if (latencyProbeRef.current) {
        clearInterval(latencyProbeRef.current);
      }
      clearInterval(packetLossCheckInterval);
    };
  }, [sessionId, measureLatency, calculateSyncQuality, connected, lastLatencyProbe, totalProbes, packetLossCount]);

  const emit = (event, payload) => {
    try {
      socketRef.current?.emit(event, payload);
    } catch (error) {
      console.error("Error emitting event:", event, error);
    }
  };

  // Get latency status color
  const getLatencyStatus = () => {
    if (latency === null) return 'unknown';
    if (latency < 50) return 'excellent'; // Green
    if (latency < 150) return 'good'; // Yellow  
    return 'poor'; // Red
  };

  // Get connection quality percentage
  const getConnectionQuality = () => {
    if (syncQuality === null) return null;
    return Math.round(syncQuality * 100);
  };

  return { 
    state, 
    emit, 
    connected, 
    roomStats,
    // Enhanced connection status
    connectionStatus,
    latency,
    latencyHistory,
    latencyStatus: getLatencyStatus(),
    serverTimeOffset,
    syncQuality,
    connectionQuality: getConnectionQuality(),
    packetLoss: totalProbes > 0 ? Math.round((packetLossCount / totalProbes) * 100) : 0
  };
}