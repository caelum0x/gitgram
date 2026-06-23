import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { settingsService } from '../../../services/settingsService';

export default function ActiveSessionsScreen() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getActiveSessions();
      setSessions(response.sessions || []);
    } catch (error) {
      logger.error('Load sessions error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    Alert.alert(
      'Revoke Session',
      'Are you sure you want to revoke this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await settingsService.revokeSession(sessionId);
              setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            } catch (error) {
              logger.error('Revoke session error:', error);
              Alert.alert('Error', 'Failed to revoke session');
            }
          },
        },
      ]
    );
  };

  const renderSession = ({ item }: { item: any }) => (
    <View style={styles.sessionItem}>
      <Icon
        name={item.device?.includes('iPhone') ? 'phone-iphone' : 'computer'}
        size={32}
        color={Colors.accent}
      />
      <View style={styles.sessionInfo}>
        <View style={styles.sessionHeader}>
          <Text style={styles.deviceName}>{item.device}</Text>
          {item.isCurrent && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current</Text>
            </View>
          )}
        </View>
        <Text style={styles.location}>{item.location}</Text>
        <Text style={styles.lastActive}>
          Last active: {new Date(item.lastActive).toLocaleString()}
        </Text>
      </View>
      {!item.isCurrent && (
        <TouchableOpacity
          style={styles.revokeButton}
          onPress={() => handleRevokeSession(item.id)}
        >
          <Icon name="close" size={20} color={Colors.error || '#ff4444'} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Active Sessions" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Active Sessions" />
      {sessions.length > 0 ? (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No active sessions"
          message="Active sessions will appear here"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  currentBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text,
  },
  location: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  lastActive: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  revokeButton: {
    padding: 8,
  },
});

