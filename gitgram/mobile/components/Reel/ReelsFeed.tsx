import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import ReelPlayer from './ReelPlayer';
import { reelService } from '../../services/reelService';
import LoadingSpinner from '../common/LoadingSpinner';
import EmptyState from '../common/EmptyState';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
}

export default function ReelsFeed() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadReels();
  }, []);

  const loadReels = async () => {
    try {
      setLoading(true);
      const response = await reelService.getReels();
      setReels(response.reels || []);
    } catch (error) {
      console.error('Load reels error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.y;
    const index = Math.round(scrollPosition / SCREEN_HEIGHT);
    setCurrentIndex(index);
  };

  const handleLike = async (reelId: string) => {
    try {
      await reelService.likeReel(reelId);
      setReels((prev) =>
        prev.map((reel) =>
          reel.id === reelId
            ? {
                ...reel,
                isLiked: !reel.isLiked,
                likesCount: reel.isLiked
                  ? reel.likesCount - 1
                  : reel.likesCount + 1,
              }
            : reel
        )
      );
    } catch (error) {
      console.error('Like reel error:', error);
    }
  };

  const handleComment = (reelId: string) => {
    // Navigate to comments screen
    console.log('Open comments for reel:', reelId);
  };

  const handleShare = (reelId: string) => {
    // Handle share
    console.log('Share reel:', reelId);
  };

  const renderReel = ({ item, index }: { item: Reel; index: number }) => (
    <View style={styles.reelContainer}>
      <ReelPlayer
        reel={item}
        onLike={() => handleLike(item.id)}
        onComment={() => handleComment(item.id)}
        onShare={() => handleShare(item.id)}
        isActive={index === currentIndex}
        isLiked={item.isLiked}
        likesCount={item.likesCount}
      />
    </View>
  );

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (reels.length === 0) {
    return (
      <EmptyState
        title="No reels yet"
        message="Start creating reels to see them here!"
        icon="🎬"
      />
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={reels}
      renderItem={renderReel}
      keyExtractor={(item) => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      snapToInterval={SCREEN_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
    />
  );
}

const styles = StyleSheet.create({
  reelContainer: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
});
