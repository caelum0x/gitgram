import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Image } from 'expo-image';
import { logger } from '../../../utils/logger';
import { reelService } from '../../../services/reelService';

interface Reaction {
  id: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  createdAt: string;
}

export default function ReelReactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReactions();
  }, [id]);

  const loadReactions = async () => {
    try {
      const response = await reelService.getReelReactions(id!);
      setReactions(response.reactions || []);
    } catch (error) {
      logger.error('Load reactions error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderReaction = ({ item }: { item: Reaction }) => (
    <View style={styles.reactionItem}>
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.reactionInfo}>
        <Text style={styles.username}>{item.user.username}</Text>
        <Text style={styles.reactionType}>Liked this reel</Text>
      </View>
      <Text style={styles.emoji}>❤️</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Likes" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Likes" />
      {reactions.length > 0 ? (
        <FlatList
          data={reactions}
          renderItem={renderReaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState title="No likes yet" message="Be the first to like this reel." />
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
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontWeight: 'bold',
  },
  reactionInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  reactionType: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emoji: {
    fontSize: 24,
  },
});
