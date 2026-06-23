import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function UserReelsScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadReels();
  }, [userId]);

  const loadReels = async () => {
    try {
      const response = await reelService.getReels(1, 50, userId);
      setReels(response.reels || []);
    } catch (error) {
      logger.error('Load reels error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadReels();
  };

  const renderReel = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.reelItem}
      onPress={() => router.push(`/reel/${item.id}`)}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.reelThumbnail} />
      ) : (
        <View style={styles.reelThumbnailPlaceholder}>
          <Icon name="play-circle" size={32} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.reelOverlay}>
        <Icon name="play-circle-filled" size={24} color={Colors.text} />
        <Text style={styles.reelStats}>{item.likesCount}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Reels" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Reels" />
      {reels.length > 0 ? (
        <FlatList
          data={reels}
          renderItem={renderReel}
          keyExtractor={(item) => item.id}
          numColumns={3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState title="No reels yet" message="This user hasn't created any reels" />
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
    padding: 1,
  },
  reelItem: {
    width: '33.33%',
    aspectRatio: 9 / 16,
    padding: 1,
    position: 'relative',
  },
  reelThumbnail: {
    width: '100%',
    height: '100%',
  },
  reelThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
    padding: 8,
    alignItems: 'center',
  },
  reelStats: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

