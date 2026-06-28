import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { ThemedText } from '../ui/ThemedText';
import { Colors } from '../../constants/Colors';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ReportModal from '../common/ReportModal';
import { VISUAL_EFFECTS } from '../../store/reelEditorStore';
import { useHaptics } from '../../hooks/useHaptics';
import LikeBounceAnimation, {
  LikeBounceAnimationHandle,
} from '../common/LikeBounceAnimation';

const DOUBLE_PRESS_DELAY = 300;

const { width, height } = Dimensions.get('window');

interface ReelPlayerProps {
  reel?: any;
  videoUrl?: string;
  username?: string;
  caption?: string;
  commentsCount?: number;
  isActive: boolean;
  isLiked?: boolean;
  likesCount?: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}

const ReelEffectOverlay = ({ effectId }: { effectId?: string | null }) => {
  const effect = VISUAL_EFFECTS.find((item) => item.id === effectId);
  if (!effect || effect.id === 'none') {
    return null;
  }

  const overlayStyle: any = {
    ...StyleSheet.absoluteFillObject,
  };

  if (effect.adjustments?.saturation === 0) {
    overlayStyle.backgroundColor = 'rgba(128, 128, 128, 0.45)';
  } else if (effect.overlay) {
    overlayStyle.backgroundColor = effect.overlay.color;
    overlayStyle.opacity = effect.overlay.opacity;
  }

  return <View pointerEvents="none" style={overlayStyle} />;
};

export default function ReelPlayer({
  reel: reelInput,
  videoUrl,
  username,
  caption,
  isActive,
  isLiked = false,
  likesCount = 0,
  onLike,
  onComment,
  onShare,
}: ReelPlayerProps) {
  const reel = reelInput || {
    id: videoUrl || 'preview',
    videoUrl,
    caption,
    user: { username: username || 'user', avatar: '' },
  };
  const video = React.useRef<Video>(null);
  const haptics = useHaptics();
  const likeBounceRef = useRef<LikeBounceAnimationHandle>(null);
  const lastTapRef = useRef(0);
  const [status, setStatus] = React.useState<any>({});
  const [isPlaying, setIsPlaying] = React.useState(isActive);
  const [showReportModal, setShowReportModal] = useState(false);
  const trimStartMs = Math.max(0, Number(reel.trimStart ?? 0) * 1000);
  const trimEndMs = typeof reel.trimEnd === 'number' && reel.trimEnd > (reel.trimStart ?? 0)
    ? reel.trimEnd * 1000
    : null;
  const effectLabel = VISUAL_EFFECTS.find((item) => item.id === reel.effectId)?.label;

  React.useEffect(() => {
    const syncPlayback = async () => {
      if (isActive) {
        if (trimStartMs > 0) {
          await video.current?.setPositionAsync(trimStartMs).catch(() => {});
        }
        await video.current?.playAsync().catch(() => {});
        setIsPlaying(true);
      } else {
        await video.current?.pauseAsync().catch(() => {});
        setIsPlaying(false);
      }
    };

    void syncPlayback();
  }, [isActive, reel.id, trimStartMs]);

  const togglePlayback = () => {
    if (status.isPlaying) {
      video.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      video.current?.playAsync();
      setIsPlaying(true);
    }
  };

  const handleLikePress = () => {
    haptics('Medium');
    onLike();
  };

  const handleVideoPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      lastTapRef.current = 0;
      // Double-tap always likes (never unlikes), matching the feed convention.
      if (!isLiked) {
        likeBounceRef.current?.animate();
        handleLikePress();
      } else {
        likeBounceRef.current?.animate();
      }
      return;
    }
    lastTapRef.current = now;
    togglePlayback();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={1} onPress={handleVideoPress} style={styles.videoContainer}>
        <Video
          ref={video}
          source={{ uri: reel.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping={!trimEndMs}
          isMuted={false}
          onPlaybackStatusUpdate={(nextStatus) => {
            setStatus(() => nextStatus);

            if (!nextStatus.isLoaded || !trimEndMs) {
              return;
            }

            if (nextStatus.positionMillis >= trimEndMs - 120) {
              void (async () => {
                await video.current?.setPositionAsync(trimStartMs).catch(() => {});
                if (isActive) {
                  await video.current?.playAsync().catch(() => {});
                }
              })();
            }
          }}
        />
        <ReelEffectOverlay effectId={reel.effectId} />
        {!isPlaying && (
          <View style={styles.playIconContainer}>
            <Icon name="play-arrow" size={64} color="rgba(255, 255, 255, 0.6)" />
          </View>
        )}
        <LikeBounceAnimation ref={likeBounceRef} color="#ff4757" />
      </TouchableOpacity>

      <View style={styles.overlay}>
        <View style={styles.bottomInfo}>
          <View style={styles.userInfo}>
            <Image source={{ uri: reel.user.avatar }} style={styles.avatar} />
            <ThemedText style={styles.username}>{reel.user.username}</ThemedText>
            <TouchableOpacity style={styles.followButton}>
              <ThemedText style={styles.followText}>Follow</ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText style={styles.caption}>{reel.caption}</ThemedText>
          {(effectLabel || reel.music?.title) && (
            <View style={styles.metaRow}>
              {effectLabel && (
                <View style={styles.metaChip}>
                  <ThemedText style={styles.metaChipText}>{effectLabel}</ThemedText>
                </View>
              )}
              {reel.music?.title && (
                <View style={styles.metaChip}>
                  <ThemedText style={styles.metaChipText}>
                    {reel.music.title} {reel.music.artist ? `• ${reel.music.artist}` : ''}
                  </ThemedText>
                </View>
              )}
            </View>
          )}
          {reel.codeSnippet && (
            <View style={styles.codeSnippetContainer}>
              <ThemedText style={styles.codeSnippet} numberOfLines={3}>
                {reel.codeSnippet}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLikePress}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? 'Unlike reel' : 'Like reel'}
          >
            <Icon name={isLiked ? "favorite" : "favorite-border"} size={32} color={isLiked ? "#ff4757" : "#FFF"} />
            <ThemedText style={styles.actionText}>{likesCount}</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={onComment}>
            <Icon name="chat-bubble-outline" size={32} color="#FFF" />
            <ThemedText style={styles.actionText}>{reel.commentsCount}</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={onShare}>
            <Icon name="share" size={32} color="#FFF" />
            <ThemedText style={styles.actionText}>Share</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setShowReportModal(true)}>
            <Icon name="more-horiz" size={32} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Report Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="REEL"
        targetId={reel.id}
        targetName={reel.caption ? reel.caption.substring(0, 50) + (reel.caption.length > 50 ? '...' : '') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width,
    height: height - 49, // Subtract tab bar height approximation
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  playIconContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 50,
    padding: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 40,
  },
  bottomInfo: {
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 60,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: Colors.surface,
  },
  username: {
    color: '#FFF',
    fontWeight: 'bold',
    marginRight: 10,
  },
  followButton: {
    borderWidth: 1,
    borderColor: '#FFF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  caption: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  metaChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaChipText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  codeSnippetContainer: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  codeSnippet: {
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actions: {
    position: 'absolute',
    right: 10,
    bottom: 40,
    alignItems: 'center',
  },
  actionButton: {
    marginBottom: 20,
    alignItems: 'center',
  },
  actionText: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 4,
  },
});
