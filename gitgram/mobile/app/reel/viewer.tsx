import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import ReelPlayer from '../../components/Reel/ReelPlayer';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { reelService } from '../../services/reelService';
import { logger } from '../../utils/logger';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ReelViewerScreen() {
  const { reelId } = useLocalSearchParams<{ reelId?: string }>();
  const [reels, setReels] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadReels();
  }, []);

  useEffect(() => {
    if (reelId && reels.length > 0) {
      const index = reels.findIndex((r) => r.id === reelId);
      if (index !== -1) {
        setCurrentIndex(index);
        flatListRef.current?.scrollToIndex({ index, animated: false });
      }
    }
  }, [reelId, reels]);

  const loadReels = async () => {
    try {
      const response = await reelService.getReels(1, 50);
      setReels(response.reels || []);
    } catch (error) {
      logger.error('Load reels error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={reels}
        renderItem={({ item, index }) => (
          <ReelPlayer
            videoUrl={item.videoUrl}
            isActive={index === currentIndex}
            likesCount={item.likesCount}
            commentsCount={item.commentsCount}
            username={item.user.username}
            caption={item.caption}
            onLike={() => {}}
            onComment={() => {}}
            onShare={() => {}}
          />
        )}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(data, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

