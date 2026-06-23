import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';

export default function PostSharedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadShares(id);
    }
  }, [id]);

  const loadShares = async (postId: string) => {
    try {
      setLoading(true);
      const response = await postService.getPostShares(postId);
      setShares(response.shares || []);
    } catch (error) {
      logger.error('Load shares error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderShare = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.shareItem}
      onPress={() => router.push(`/profile/${item.user.id}`)}
    >
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.shareInfo}>
        <Text style={styles.username}>@{item.user.username}</Text>
        <Text style={styles.shareTime}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
        {item.platform && (
          <Text style={styles.platform}>Shared to {item.platform}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Shared By" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Shared By" />
      {shares.length > 0 ? (
        <FlatList
          data={shares}
          renderItem={renderShare}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No shares yet"
          message="People who share this post will appear here"
          icon="📤"
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
  shareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  shareInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  shareTime: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  platform: {
    fontSize: 12,
    color: Colors.accent,
  },
});

