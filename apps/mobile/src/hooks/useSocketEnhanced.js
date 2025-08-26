/**
 * Enhanced useSocket Hook with Role Management - Day 6
 * Builds upon existing useSocket with leadership transitions and role events
 */

import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import { EVENTS } from "bandsync-shared";
import { SERVER_URL } from "../config";

const LATENCY_PROBE_INTERVAL = 2500; // 2.5 seconds
const LATENCY_HISTORY_SIZE = 10;
const CONNECTION_TIMEOUT = 5000; // 5 seconds

export function useSocketEnhanced(sessionId) {
  const socketRef = useRef(null);
  const latencyProbeRef = useRef(null);
  
  // Existing state
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomStats, setRoomStats] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [latency, setLatency] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [syncQuality, setSyncQuality] = useState(null);
  const [lastLatencyProbe, setLastLatencyProbe] = useState(null);
  const [packetLossCount, setPacketLossCount] = useState(0);
  const [totalProbes, setTotalProbes] = useState(0);

  // Enhanced role management state
  const [role, setRole] = useState(null); // 'leader', 'follower', null
  const [isLeader, setIsLeader] = useState(false);
  const [leaderRequestPending, setLeaderRequestPending] = useState(false);
  const [leaderRequestInfo, setLeaderRequestInfo] = useState(null);
  const [roleTransitionHistory, setRoleTransitionHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentLeaderId, setCurrentLeaderId] = useState(null);

  // Message management
  const showMessage = useCallback((message, type = 'info', duration = 3000) => {
    if (type === 'error') {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(null), duration);
    } else if (type === 'success') {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), duration);
    }
  }, []);

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

  // Calculate sync quality
  const calculateSyncQuality = useCallback((newLatencyHistory) => {
    if (newLatencyHistory.length < 3) {
      setSyncQuality(null);
      return;
    }
    
    const avgLatency = newLatencyHistory.reduce((sum, l) => sum + l, 0) / newLatencyHistory.length;
    const variance = newLatencyHistory.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / newLatencyHistory.length;
    const stdDev = Math.sqrt(variance);
    const packetLoss = totalProbes > 0 ? packetLossCount / totalProbes : 0;
    
    let latencyScore = 1.0;
    if (avgLatency > 150) latencyScore = 0.3;
    else if (avgLatency > 50) latencyScore = 0.7;
    
    let consistencyScore = Math.max(0.2, 1.0 - (stdDev / 100));
    let packetLossScore = Math.max(0.1, 1.0 - (packetLoss * 10));
    
    const quality = (latencyScore * 0.4 + consistencyScore * 0.4 + packetLossScore * 0.2);
    setSyncQuality(Math.max(0.1, Math.min(1.0, quality)));
  }, [packetLossCount, totalProbes]);

  // Role management functions
  const requestLeader = useCallback(() => {
    if (!socketRef.current || leaderRequestPending || isLeader) return;
    
    setLeaderRequestPending(true);
    socketRef.current.emit('request_leader', { sessionId });
    showMessage('Requesting leadership...', 'info');
  }, [sessionId, leaderRequestPending, isLeader, showMessage]);

  const approveLeaderRequest = useCallback((requesterId) => {
    if (!socketRef.current || !isLeader) return;
    
    socketRef.current.emit('approve_leader_request', { sessionId, requesterId });
    setLeaderRequestInfo(null);
  }, [sessionId, isLeader]);

  const denyLeaderRequest = useCallback(() => {
    if (!socketRef.current || !isLeader) return;
    
    const requesterId = leaderRequestInfo?.requesterId;
    if (requesterId) {
      socketRef.current.emit('deny_leader_request', { sessionId, requesterId });
    }
    setLeaderRequestInfo(null);
  }, [sessionId, isLeader, leaderRequestInfo]);

  const setRoleManually = useCallback((newRole) => {
    if (!socketRef.current) return;
    
    socketRef.current.emit(EVENTS.SET_ROLE, { sessionId, role: newRole });
    
    if (newRole === 'leader') {
      setLeaderRequestPending(true);
    }
  }, [sessionId]);

  useEffect(() => {
    const socket = io(SERVER_URL, { 
      transports: ["websocket"],
      timeout: CONNECTION_TIMEOUT,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    // Connection event handlers
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      setConnected(true);
      setConnectionStatus('connected');
      setPacketLossCount(0);
      
      // Join session with display name - let server assign initial role
      socket.emit("join_session", { 
        sessionId,
        displayName: `User ${socket.id.substr(-4)}`
      });
      
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
      console.log("Socket disconnected:", reason);
      setConnected(false);
      setConnectionStatus('disconnected');
      setLatency(null);
      setRole(null);
      setIsLeader(false);
      setLeaderRequestPending(false);
      setCurrentLeaderId(null);
      
      if (latencyProbeRef.current) {
        clearInterval(latencyProbeRef.current);
        latencyProbeRef.current = null;
      }
    });

    // Existing event handlers
    socket.on(EVENTS.LATENCY_RESPONSE, ({ clientTimestamp, serverTimestamp }) => {
      const responseTime = Date.now();
      const roundTripTime = responseTime - clientTimestamp;
      const serverTimeOffset = serverTimestamp - (clientTimestamp + roundTripTime / 2);
      
      setLatency(roundTripTime);
      setServerTimeOffset(serverTimeOffset);
      
      setLatencyHistory(prev => {
        const newHistory = [...prev, roundTripTime].slice(-LATENCY_HISTORY_SIZE);
        calculateSyncQuality(newHistory);
        return newHistory;
      });
      
      setLastLatencyProbe(null);
    });

    socket.on("snapshot", (data) => {
      setState(data);
      
      // Update role information from session state
      if (data.leaderSocketId) {
        setCurrentLeaderId(data.leaderSocketId);
        const amILeader = data.leaderSocketId === socket.id;
        setIsLeader(amILeader);
        setRole(amILeader ? 'leader' : 'follower');
        
        if (amILeader && leaderRequestPending) {
          setLeaderRequestPending(false);
          showMessage('You are now the leader!', 'success');
        }
      }
    });

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

    // Enhanced role management event handlers
    socket.on("leader_request_sent", ({ message, currentLeader }) => {
      console.log("Leader request sent:", message);
      showMessage(message, 'info');
      setCurrentLeaderId(currentLeader);
    });

    socket.on("leader_request_approved", ({ message }) => {
      console.log("Leadership granted:", message);
      setRole("leader");
      setIsLeader(true);
      setLeaderRequestPending(false);
      showMessage(message, 'success');
      
      // Add to transition history
      setRoleTransitionHistory(prev => [
        ...prev,
        { 
          timestamp: Date.now(), 
          type: 'granted', 
          role: 'leader',
          message: 'Leadership granted'
        }
      ].slice(-10)); // Keep last 10 transitions
    });

    socket.on("leader_request_denied", ({ reason }) => {
      console.log("Leadership denied:", reason);
      setLeaderRequestPending(false);
      showMessage(`Leadership denied: ${reason}`, 'error');
      
      setRoleTransitionHistory(prev => [
        ...prev,
        { 
          timestamp: Date.now(), 
          type: 'denied', 
          role: 'follower',
          message: reason
        }
      ].slice(-10));
    });

    socket.on("leader_handoff_request", (requestInfo) => {
      console.log("Leadership handoff request:", requestInfo);
      setLeaderRequestInfo(requestInfo);
      showMessage(`${requestInfo.requesterInfo.displayName} wants to become leader`, 'info');
    });

    socket.on("leader_changed", ({ newLeaderId, newLeaderInfo, previousLeader }) => {
      console.log("Leader changed:", newLeaderId, newLeaderInfo);
      setCurrentLeaderId(newLeaderId);
      
      const amINewLeader = newLeaderId === socket.id;
      const wasIPreviousLeader = previousLeader === socket.id;
      
      setIsLeader(amINewLeader);
      setRole(amINewLeader ? 'leader' : 'follower');
      setLeaderRequestPending(false);
      setLeaderRequestInfo(null);
      
      if (amINewLeader) {
        showMessage('You are now the leader!', 'success');
      } else if (wasIPreviousLeader) {
        showMessage(`Leadership transferred to ${newLeaderInfo.displayName}`, 'info');
      } else {
        showMessage(`${newLeaderInfo.displayName} is now the leader`, 'info');
      }
      
      setRoleTransitionHistory(prev => [
        ...prev,
        { 
          timestamp: Date.now(), 
          type: 'changed', 
          role: amINewLeader ? 'leader' : 'follower',
          newLeader: newLeaderInfo.displayName,
          message: `Leadership changed to ${newLeaderInfo.displayName}`
        }
      ].slice(-10));
    });

    socket.on("leader_auto_assigned", ({ newLeaderId, newLeaderInfo, reason }) => {
      console.log("Leader auto-assigned:", newLeaderId, newLeaderInfo, reason);
      setCurrentLeaderId(newLeaderId);
      
      const amINewLeader = newLeaderId === socket.id;
      setIsLeader(amINewLeader);
      setRole(amINewLeader ? 'leader' : 'follower');
      
      if (amINewLeader) {
        showMessage('You have been promoted to leader!', 'success');
      } else {
        showMessage(`${newLeaderInfo.displayName} was promoted to leader`, 'info');
      }
      
      setRoleTransitionHistory(prev => [
        ...prev,
        { 
          timestamp: Date.now(), 
          type: 'auto_assigned', 
          role: amINewLeader ? 'leader' : 'follower',
          reason,
          message: `Auto-assigned: ${reason}`
        }
      ].slice(-10));
    });

    socket.on("leader_handoff_completed", ({ newLeaderId, message }) => {
      console.log("Leader handoff completed:", message);
      setRole('follower');
      setIsLeader(false);
      setCurrentLeaderId(newLeaderId);
      showMessage(message, 'success');
      
      setRoleTransitionHistory(prev => [
        ...prev,
        { 
          timestamp: Date.now(), 
          type: 'handoff_completed', 
          role: 'follower',
          message
        }
      ].slice(-10));
    });

    // Enhanced error handling
    socket.on("error", ({ message, code, requiredRole, currentRole, currentLeader }) => {
      console.error("Socket error:", message, code);
      
      if (code === 'INSUFFICIENT_ROLE') {
        showMessage(`Action requires ${requiredRole} role. You are: ${currentRole}`, 'error');
        setCurrentLeaderId(currentLeader);
      } else {
        showMessage(message, 'error');
      }
      
      // Reset pending states on error
      if (leaderRequestPending && code === 'INSUFFICIENT_ROLE') {
        setLeaderRequestPending(false);
      }
    });

    // User join/leave notifications
    socket.on("user_joined", ({ member, memberCount }) => {
      console.log("User joined:", member.displayName);
      showMessage(`${member.displayName} joined (${memberCount} members)`, 'info', 2000);
    });

    socket.on("user_left", ({ socketId, memberCount, newLeader }) => {
      console.log("User left:", socketId);
      if (newLeader) {
        showMessage(`Member left, ${newLeader} is now leader (${memberCount} members)`, 'info');
      } else {
        showMessage(`Member left (${memberCount} members)`, 'info', 1500);
      }
    });

    // Set up latency probe interval
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

    socket.on('connect', startLatencyProbes);
    
    // Packet loss detection
    const packetLossCheckInterval = setInterval(() => {
      if (lastLatencyProbe && Date.now() - lastLatencyProbe > LATENCY_PROBE_INTERVAL * 1.5) {
        setPacketLossCount(prev => prev + 1);
        setLastLatencyProbe(null);
      }
    }, 1000);

    return () => {
      socket.disconnect();
      if (latencyProbeRef.current) {
        clearInterval(latencyProbeRef.current);
      }
      clearInterval(packetLossCheckInterval);
    };
  }, [sessionId, measureLatency, calculateSyncQuality, connected, lastLatencyProbe, totalProbes, packetLossCount, leaderRequestPending, showMessage]);

  const emit = (event, payload) => {
    try {
      socketRef.current?.emit(event, payload);
    } catch (error) {
      console.error("Error emitting event:", event, error);
      showMessage(`Failed to send ${event}`, 'error');
    }
  };

  // Enhanced helper functions
  const getLatencyStatus = () => {
    if (latency === null) return 'unknown';
    if (latency < 50) return 'excellent';
    if (latency < 150) return 'good';
    return 'poor';
  };

  const getConnectionQuality = () => {
    if (syncQuality === null) return null;
    return Math.round(syncQuality * 100);
  };

  const getRoleDisplay = () => {
    if (!role) return "⏳ Joining...";
    if (isLeader) return "👑 Leader";
    return "👥 Follower";
  };

  const canRequestLeadership = () => {
    return connected && role === 'follower' && !leaderRequestPending;
  };

  const canApproveRequests = () => {
    return connected && isLeader && leaderRequestInfo !== null;
  };

  return { 
    // Existing functionality
    state, 
    emit, 
    connected, 
    roomStats,
    connectionStatus,
    latency,
    latencyHistory,
    latencyStatus: getLatencyStatus(),
    serverTimeOffset,
    syncQuality,
    connectionQuality: getConnectionQuality(),
    packetLoss: totalProbes > 0 ? Math.round((packetLossCount / totalProbes) * 100) : 0,

    // Enhanced role management
    role,
    isLeader,
    leaderRequestPending,
    leaderRequestInfo,
    currentLeaderId,
    roleTransitionHistory,
    errorMessage,
    successMessage,

    // Role management functions
    requestLeader,
    approveLeaderRequest,
    denyLeaderRequest,
    setRole: setRoleManually,
    
    // Helper functions
    getRoleDisplay,
    canRequestLeadership,
    canApproveRequests,
    showMessage
  };
}