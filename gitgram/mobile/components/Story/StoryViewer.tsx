import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Colors } from '../../constants/Colors';
import { useLightbox } from '../common/Lightbox';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STORY_DURATION = 5000; // 5 seconds

interface Story {
  id: string;
  mediaType: string;
  mediaUrl: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  onClose: () => void;
}

export default function StoryViewer({
  stories,
  initialIndex = 0,
  onClose,
}: StoryViewerProps) {
  const [currentStoryIndex, setCurrentStoryIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const openLightbox = useLightbox();

  const currentStory = stories[currentStoryIndex];
  const player = useVideoPlayer(
    currentStory?.mediaType === 'video' ? currentStory.mediaUrl : '',
    (player) => {
      player.loop = false;
      player.muted = false;
    }
  );

  useEffect(() => {
    if (currentStory?.mediaType === 'video') {
      player.play();
      // Use the status update callback instead of addListener
      const checkStatus = setInterval(() => {
        if (player.playing && player.currentTime >= player.duration - 0.1) {
          nextStory();
          clearInterval(checkStatus);
        }
      }, 100);
      
      return () => {
        clearInterval(checkStatus);
        progressAnim.stopAnimation();
      };
    } else {
      startProgress();
      return () => {
        progressAnim.stopAnimation();
      };
    }
  }, [currentStoryIndex]);

  const startProgress = () => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        nextStory();
      }
    });
  };

  const nextStory = () => {
    if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else {
      onClose();
    }
  };

  const previousStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      onClose();
    }
  };

  const handleTap = (event: any) => {
    const { locationX } = event.nativeEvent;
    if (locationX < SCREEN_WIDTH / 2) {
      previousStory();
    } else {
      nextStory();
    }
  };

  const handleLongPress = () => {
    // Only still images make sense to open in the zoomable lightbox.
    if (currentStory?.mediaType === 'video') return;
    openLightbox(
      [
        {
          uri: currentStory.mediaUrl,
          alt: `Story by ${currentStory.user.username}`,
        },
      ],
      0,
    );
  };

  if (!currentStory) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Progress bars */}
      <View style={styles.progressContainer}>
        {stories.map((_, index) => (
          <View key={index} style={styles.progressBar}>
            {index === currentStoryIndex && (
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {/* Story content */}
      <TouchableOpacity
        style={styles.content}
        activeOpacity={1}
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={350}
      >
        {currentStory.mediaType === 'video' ? (
          <VideoView player={player} style={styles.media} contentFit="cover" />
        ) : (
          <Image
            source={{ uri: currentStory.mediaUrl }}
            style={styles.media}
            contentFit="cover"
          />
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            {currentStory.user.avatar ? (
              <Image
                source={{ uri: currentStory.user.avatar }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {currentStory.user.username[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.username}>{currentStory.user.username}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressContainer: {
    flexDirection: 'row',
    padding: 8,
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.text,
  },
  content: {
    flex: 1,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  username: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
});

