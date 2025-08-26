/**
 * RoleManager Component - Enhanced Role Management UI for Day 6
 * Handles leadership requests, approvals, and role transitions
 */

import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal, 
  Alert,
  ScrollView,
  Animated
} from 'react-native';

export default function RoleManager({
  role,
  isLeader,
  leaderRequestPending,
  leaderRequestInfo,
  onRequestLeader,
  onApproveRequest,
  onDenyRequest,
  connected,
  roleTransitionHistory = [],
  canRequestLeadership,
  canApproveRequests,
  getRoleDisplay
}) {
  
  const showLeaderRequestModal = () => {
    if (!leaderRequestInfo) return null;

    return (
      <Modal
        visible={!!leaderRequestInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={onDenyRequest}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔄 Leadership Request</Text>
            <Text style={styles.modalText}>
              <Text style={styles.bold}>{leaderRequestInfo.requesterInfo?.displayName || 'A member'}</Text>
              {' '}wants to become the leader of this session.
            </Text>
            <Text style={styles.modalSubtext}>
              Transfer your leadership role to them?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.approveButton]} 
                onPress={() => onApproveRequest(leaderRequestInfo.requesterId)}
              >
                <Text style={styles.approveButtonText}>✓ Transfer Leadership</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.denyButton]} 
                onPress={onDenyRequest}
              >
                <Text style={styles.denyButtonText}>✗ Keep Leadership</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const getRoleColor = () => {
    if (!connected) return "#999";
    if (isLeader) return "#FFD700"; // Gold
    if (role === "follower") return "#4CAF50"; // Green
    return "#666"; // Gray for unknown/joining
  };

  const getRoleIcon = () => {
    if (!connected) return "🔌";
    if (isLeader) return "👑";
    if (role === "follower") return "👥";
    return "⏳";
  };

  const handleRoleAction = () => {
    if (!connected) {
      Alert.alert("Not Connected", "Please wait for connection to establish.");
      return;
    }

    if (role === "follower" && !leaderRequestPending) {
      Alert.alert(
        "Request Leadership",
        "Do you want to request to become the session leader? The current leader will need to approve your request.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Request Leadership", 
            onPress: onRequestLeader,
            style: "default"
          }
        ]
      );
    } else if (isLeader) {
      Alert.alert(
        "Leadership Info",
        "You are currently the leader of this session. You have control over playback and can approve leadership requests from other members.",
        [{ text: "OK" }]
      );
    } else if (leaderRequestPending) {
      Alert.alert(
        "Request Pending",
        "Your leadership request has been sent and is waiting for approval from the current leader.",
        [{ text: "OK" }]
      );
    }
  };

  const getStatusMessage = () => {
    if (!connected) return "Connecting to session...";
    if (leaderRequestPending) return "Leadership request pending approval";
    if (isLeader) return "You control playback and session settings";
    if (role === "follower") return "Following the current leader";
    return "Determining role...";
  };

  const showTransitionHistory = () => {
    if (roleTransitionHistory.length === 0) return;

    const recentTransitions = roleTransitionHistory.slice(-3); // Show last 3

    Alert.alert(
      "Recent Role Changes",
      recentTransitions.map(transition => {
        const time = new Date(transition.timestamp).toLocaleTimeString();
        return `${time}: ${transition.message}`;
      }).join('\n\n'),
      [{ text: "OK" }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.roleIndicator, { borderColor: getRoleColor() }]}>
        {/* Role Header */}
        <View style={styles.roleHeader}>
          <Text style={styles.roleIcon}>{getRoleIcon()}</Text>
          <View style={styles.roleInfo}>
            <Text style={[styles.roleText, { color: getRoleColor() }]}>
              {getRoleDisplay ? getRoleDisplay() : `${getRoleIcon()} ${role || 'Unknown'}`}
            </Text>
            <Text style={styles.statusText}>
              {getStatusMessage()}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        {connected && (
          <View style={styles.actionContainer}>
            {role === "follower" && !leaderRequestPending && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.requestButton]}
                onPress={handleRoleAction}
                disabled={!canRequestLeadership || !canRequestLeadership()}
              >
                <Text style={styles.actionButtonText}>
                  🔄 Request Leadership
                </Text>
              </TouchableOpacity>
            )}

            {leaderRequestPending && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.pendingButton]}
                disabled={true}
              >
                <Text style={styles.pendingButtonText}>
                  ⏳ Request Pending...
                </Text>
              </TouchableOpacity>
            )}

            {isLeader && (
              <View style={styles.leaderActions}>
                <Text style={styles.leaderHint}>
                  You're the leader! Others can request leadership from you.
                </Text>
                {canApproveRequests && canApproveRequests() && (
                  <Text style={styles.pendingRequestsText}>
                    📩 You have pending leadership requests
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* History Button */}
        {roleTransitionHistory.length > 0 && (
          <TouchableOpacity 
            style={styles.historyButton}
            onPress={showTransitionHistory}
          >
            <Text style={styles.historyButtonText}>
              📋 History ({roleTransitionHistory.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leadership Request Modal */}
      {showLeaderRequestModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  roleIndicator: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#f8f9fa',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  roleInfo: {
    flex: 1,
  },
  roleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  actionContainer: {
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 4,
    alignItems: 'center',
  },
  requestButton: {
    backgroundColor: '#2196F3',
  },
  pendingButton: {
    backgroundColor: '#FF9800',
    opacity: 0.8,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  pendingButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  leaderActions: {
    paddingVertical: 8,
  },
  leaderHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  pendingRequestsText: {
    fontSize: 14,
    color: '#FF9800',
    textAlign: 'center',
    fontWeight: '500',
  },
  historyButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    alignSelf: 'center',
  },
  historyButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    minWidth: 300,
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
    lineHeight: 22,
  },
  modalSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
    lineHeight: 20,
  },
  bold: {
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'column',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  denyButton: {
    backgroundColor: '#f44336',
  },
  approveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  denyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});