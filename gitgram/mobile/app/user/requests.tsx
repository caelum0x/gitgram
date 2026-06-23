import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { userService } from '../../services/userService';
import { logger } from '../../utils/logger';
import { Image } from 'expo-image';
import { formatDistanceToNow } from 'date-fns';

interface FollowRequest {
  id: string;
  requesterId: string;
  status: string;
  createdAt: string;
  requester?: {
    id: string;
    username: string;
    avatar?: string;
    bio?: string;
  };
}

export default function FollowRequestsScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const response = await userService.getFollowRequests();
      setRequests(response.requests || []);
    } catch (error) {
      logger.error('Load follow requests error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await userService.acceptFollowRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      Alert.alert('Success', 'Follow request accepted');
    } catch (error) {
      logger.error('Accept follow request error:', error);
      Alert.alert('Error', 'Failed to accept request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await userService.rejectFollowRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (error) {
      logger.error('Decline follow request error:', error);
      Alert.alert('Error', 'Failed to decline request');
    } finally {
      setProcessingId(null);
    }
  };

  const navigateToProfile = (username: string) => {
    router.push(`/user/${username}`);
  };

  const renderRequest = ({ item }: { item: FollowRequest }) => (
    <View style={styles.requestItem}>
      <TouchableOpacity
        style={styles.userSection}
        onPress={() => item.requester?.username && navigateToProfile(item.requester.username)}
      >
        {item.requester?.avatar ? (
          <Image source={{ uri: item.requester.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.requester?.username?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.requestInfo}>
          <Text style={styles.username}>@{item.requester?.username || 'Unknown'}</Text>
          {item.requester?.bio && (
            <Text style={styles.bio} numberOfLines={1}>
              {item.requester.bio}
            </Text>
          )}
          <Text style={styles.timestamp}>
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.acceptButton, processingId === item.id && styles.disabledButton]}
          onPress={() => handleAccept(item.id)}
          disabled={processingId === item.id}
        >
          <Text style={styles.acceptButtonText}>
            {processingId === item.id ? '...' : 'Accept'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.declineButton, processingId === item.id && styles.disabledButton]}
          onPress={() => handleDecline(item.id)}
          disabled={processingId === item.id}
        >
          <Text style={styles.declineButtonText}>
            {processingId === item.id ? '...' : 'Decline'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Follow Requests" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Follow Requests"
        rightElement={
          requests.length > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{requests.length}</Text>
            </View>
          ) : undefined
        }
      />
      {requests.length > 0 ? (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.text}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          icon="users"
          title="No follow requests"
          message="When someone requests to follow you, you'll see it here"
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
  requestItem: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  requestInfo: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  declineButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  declineButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
});
