import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

export default function SessionInfo({ 
  sessionId, 
  memberCount = 0, 
  members = [], 
  creationTime = null,
  currentUserRole = 'follower',
  onMemberPress = null,
  style = {},
  compact = false 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [animation] = useState(new Animated.Value(0));

  const toggleExpanded = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);
    
    Animated.spring(animation, {
      toValue,
      useNativeDriver: false,
      tension: 100,
      friction: 8,
    }).start();
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getMemberIcon = (role, isCurrentUser = false) => {
    if (isCurrentUser) {
      return role === 'leader' ? '👑🫵' : '👥🫵';
    }
    return role === 'leader' ? '👑' : '👥';
  };

  const expandedHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.min(150, members.length * 45 + 40)],
  });

  if (compact) {
    return (
      <TouchableOpacity 
        style={[styles.compactContainer, style]}
        onPress={toggleExpanded}
        activeOpacity={0.8}
      >
        <View style={styles.compactHeader}>
          <View style={styles.sessionBadge}>
            <Text style={styles.sessionBadgeText}>SESSION</Text>
          </View>
          <Text style={styles.compactSessionId}>{sessionId}</Text>
          <View style={styles.memberCountBadge}>
            <Text style={styles.memberCountText}>{memberCount}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Main Header */}
      <TouchableOpacity 
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.9}
      >
        <View style={styles.headerLeft}>
          <View style={styles.sessionIdContainer}>
            <Text style={styles.sessionLabel}>Session</Text>
            <Text style={styles.sessionId}>{sessionId}</Text>
          </View>
          <Text style={styles.creationTime}>
            Created {formatTime(creationTime)}
          </Text>
        </View>
        
        <View style={styles.headerRight}>
          <View style={styles.memberSummary}>
            <Text style={styles.memberCount}>{memberCount}</Text>
            <Text style={styles.memberLabel}>
              {memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
          <Animated.Text 
            style={[
              styles.expandIcon,
              {
                transform: [{
                  rotate: animation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg']
                  })
                }]
              }
            ]}
          >
            ▼
          </Animated.Text>
        </View>
      </TouchableOpacity>

      {/* Expandable Member List */}
      <Animated.View 
        style={[
          styles.expandableContainer,
          {
            height: expandedHeight,
            opacity: animation.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.5, 1]
            })
          }
        ]}
      >
        <View style={styles.memberListContainer}>
          <Text style={styles.memberListTitle}>Session Members</Text>
          <View style={styles.memberList}>
            {members.map((member, index) => (
              <TouchableOpacity
                key={member.id || index}
                style={[
                  styles.memberItem,
                  member.isCurrentUser && styles.currentUserItem
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onMemberPress?.(member);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.memberInfo}>
                  <Text style={styles.memberIcon}>
                    {getMemberIcon(member.role, member.isCurrentUser)}
                  </Text>
                  <View style={styles.memberDetails}>
                    <Text style={[
                      styles.memberName,
                      member.isCurrentUser && styles.currentUserName
                    ]}>
                      {member.name || `User ${index + 1}`}
                      {member.isCurrentUser && ' (You)'}
                    </Text>
                    <Text style={styles.memberRole}>
                      {member.role === 'leader' ? 'Session Leader' : 'Following'}
                    </Text>
                  </View>
                </View>
                <View style={[
                  styles.connectionStatus,
                  {
                    backgroundColor: member.connected 
                      ? '#28a745' 
                      : member.connecting 
                        ? '#ffc107'
                        : '#dc3545'
                  }
                ]} />
              </TouchableOpacity>
            ))}
            
            {members.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>👥</Text>
                <Text style={styles.emptyStateText}>
                  No other members in this session
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  headerLeft: {
    flex: 1
  },
  sessionIdContainer: {
    marginBottom: 4
  },
  sessionLabel: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  sessionId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 2
  },
  creationTime: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic'
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row'
  },
  memberSummary: {
    alignItems: 'center',
    marginRight: 12
  },
  memberCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50'
  },
  memberLabel: {
    fontSize: 10,
    color: '#6c757d',
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  expandIcon: {
    fontSize: 16,
    color: '#6c757d',
    fontWeight: 'bold'
  },
  
  // Expandable section
  expandableContainer: {
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  },
  memberListContainer: {
    padding: 16
  },
  memberListTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  memberList: {
    gap: 8
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef'
  },
  currentUserItem: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3'
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  memberIcon: {
    fontSize: 20,
    marginRight: 12
  },
  memberDetails: {
    flex: 1
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2
  },
  currentUserName: {
    color: '#1976D2',
    fontWeight: 'bold'
  },
  memberRole: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500'
  },
  connectionStatus: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  
  // Empty state
  emptyState: {
    alignItems: 'center',
    padding: 20
  },
  emptyStateIcon: {
    fontSize: 32,
    marginBottom: 8,
    opacity: 0.5
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center'
  },
  
  // Compact styles
  compactContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 8
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sessionBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  sessionBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  compactSessionId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
    textAlign: 'center'
  },
  memberCountBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center'
  },
  memberCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  }
});