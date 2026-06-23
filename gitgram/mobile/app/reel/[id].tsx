import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import ReelPlayer from '../../components/Reel/ReelPlayer';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { reelService } from '../../services/reelService';
import { logger } from '../../utils/logger';

export default function ReelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [reel, setReel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadReel();
  }, [id]);

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(id!);
      setReel(response.reel || response);
    } catch (error) {
      logger.error('Load reel error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadReel();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Reel" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!reel) {
    return (
      <View style={styles.container}>
        <Header title="Reel" />
        <EmptyState title="Reel not found" message="This reel may have been deleted" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Reel"
        rightIcon="more-vert"
        onRightPress={() => {
          // Show reel menu
        }}
      />
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <ReelPlayer
          videoUrl={reel.videoUrl}
          isActive={true}
          likesCount={reel.likesCount}
          commentsCount={reel.commentsCount}
          username={reel.user.username}
          caption={reel.caption}
          onLike={() => {}}
          onComment={() => router.push(`/reel/${id}/comments`)}
          onShare={() => router.push(`/reel/${id}/share`)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
});

