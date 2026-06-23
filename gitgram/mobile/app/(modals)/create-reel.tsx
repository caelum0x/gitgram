import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReelTrimEditor from '../../components/Reel/ReelTrimEditor';
import { reelService } from '../../services/reelService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useReelEditorStore, VISUAL_EFFECTS } from '../../store/reelEditorStore';

// Effect overlay component to apply visual effects on preview
const EffectPreviewOverlay = ({ effectId }: { effectId: string }) => {
  const effect = VISUAL_EFFECTS.find((e) => e.id === effectId);
  if (!effect || effect.id === 'none') return null;

  const overlayStyle: any = {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  };

  if (effect.adjustments?.saturation === 0) {
    overlayStyle.backgroundColor = 'rgba(128, 128, 128, 0.4)';
  } else if (effect.overlay) {
    overlayStyle.backgroundColor = effect.overlay.color;
  }

  return <View style={overlayStyle} pointerEvents="none" />;
};

export default function CreateReelScreen() {
  const router = useRouter();
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTrimEditor, setShowTrimEditor] = useState(false);
  const videoRef = React.useRef<Video>(null);

  // Use the reel editor store
  const {
    videoUri,
    selectedEffect,
    musicTrack,
    startTime,
    endTime,
    duration,
    setVideoUri,
    setThumbnailUri,
    setDuration,
    setTrimSettings,
    reset,
  } = useReelEditorStore();

  // Get effect data for display
  const selectedEffectData = VISUAL_EFFECTS.find((e) => e.id === selectedEffect);
  const hasTrim = duration > 0 && (startTime > 0 || (endTime > 0 && endTime < duration));
  const trimDurationLabel = hasTrim ? `${Math.max(0.1, endTime - startTime).toFixed(1)}s` : null;

  const applySelectedVideo = (asset: ImagePicker.ImagePickerAsset) => {
    setVideoUri(asset.uri);
    if (typeof asset.duration === 'number' && asset.duration > 0) {
      setDuration(asset.duration / 1000);
    } else {
      setDuration(0);
    }
    const thumbnail = (asset as ImagePicker.ImagePickerAsset & { thumbnail?: string }).thumbnail;
    if (thumbnail) {
      setThumbnailUri(thumbnail);
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      applySelectedVideo(result.assets[0]);
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      applySelectedVideo(result.assets[0]);
    }
  };

  const navigateToEffects = () => {
    if (!videoUri) {
      Alert.alert('Select Video', 'Please select a video first before adding effects');
      return;
    }
    // Navigate to effects screen with a temporary ID
    router.push('/reel/new/effects');
  };

  const handleSubmit = async () => {
    if (!videoUri) {
      Alert.alert('Error', 'Please select a video');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('video', {
        uri: videoUri,
        type: 'video/mp4',
        name: 'reel.mp4',
      } as any);
      formData.append('caption', caption);
      if (hashtags) {
        formData.append('hashtags', hashtags);
      }
      if (musicTrack?.id) {
        formData.append('musicTrackId', musicTrack.id);
      }
      if (duration > 0) {
        formData.append('duration', String(duration));
      }
      if (startTime > 0 || (duration > 0 && endTime > 0 && endTime < duration)) {
        formData.append('trimStart', String(startTime));
        formData.append('trimEnd', String(endTime));
      }
      // Include the selected effect
      if (selectedEffect && selectedEffect !== 'none') {
        formData.append('effect', selectedEffect);
      }

      await reelService.createReel(formData);

      // Reset the store after successful creation
      reset();

      Alert.alert('Success', 'Reel created successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      logger.error('Create reel error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to create reel');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveVideo = () => {
    setVideoUri(null);
    setThumbnailUri(null);
    setDuration(0);
    setShowTrimEditor(false);
  };

  const previewTrimmedClip = () => {
    const previewStartMs = Math.max(0, startTime * 1000);
    void (async () => {
      await videoRef.current?.setPositionAsync(previewStartMs).catch(() => {});
      await videoRef.current?.playAsync().catch(() => {});
    })();
  };

  React.useEffect(() => {
    if (!videoUri || !hasTrim) {
      return;
    }

    void videoRef.current?.setPositionAsync(startTime * 1000).catch(() => {});
  }, [videoUri, hasTrim, startTime]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Create Reel" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Create Reel"
        rightIcon="check"
        onRightPress={handleSubmit}
      />
      <ScrollView style={styles.content}>
        {/* Video Selection/Preview */}
        <View style={styles.videoButton}>
          {videoUri ? (
            <View style={styles.videoPreviewContainer}>
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={styles.videoPreview}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping={!hasTrim}
                isMuted
                onPlaybackStatusUpdate={(status) => {
                  if (!status.isLoaded || !hasTrim) {
                    return;
                  }

                  const trimEndMs = endTime * 1000;
                  if (status.positionMillis >= trimEndMs - 120) {
                    void (async () => {
                      await videoRef.current?.setPositionAsync(startTime * 1000).catch(() => {});
                      await videoRef.current?.playAsync().catch(() => {});
                    })();
                  }
                }}
              />
              <EffectPreviewOverlay effectId={selectedEffect} />
              <TouchableOpacity
                style={styles.removeVideoButton}
                onPress={handleRemoveVideo}
              >
                <Icon name="close" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.changeVideoButton}
                onPress={pickVideo}
              >
                <Icon name="videocam" size={16} color="#fff" />
                <Text style={styles.changeVideoText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recordVideoButton}
                onPress={recordVideo}
              >
                <Icon name="fiber-manual-record" size={16} color="#fff" />
                <Text style={styles.changeVideoText}>Record</Text>
              </TouchableOpacity>
              {hasTrim && (
                <View style={styles.trimBadge}>
                  <Icon name="content-cut" size={14} color="#fff" />
                  <Text style={styles.changeVideoText}>{trimDurationLabel}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.videoPlaceholder}>
              <Icon name="videocam" size={48} color={Colors.textSecondary} />
              <Text style={styles.videoPlaceholderText}>Create Reel Video</Text>
              <View style={styles.uploadActions}>
                <TouchableOpacity style={styles.primaryActionButton} onPress={recordVideo}>
                  <Text style={styles.primaryActionText}>Record Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={pickVideo}>
                  <Text style={styles.secondaryActionText}>Choose From Library</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Editing Tools */}
        {videoUri && (
          <View style={styles.toolsSection}>
            <Text style={styles.toolsSectionTitle}>Editing Tools</Text>
            <View style={styles.toolsRow}>
              {/* Effects Button */}
              <TouchableOpacity style={styles.toolButton} onPress={navigateToEffects}>
                <View style={styles.toolIconContainer}>
                  <Icon
                    name={selectedEffectData?.icon || 'auto-fix-high'}
                    size={24}
                    color={selectedEffect !== 'none' ? Colors.accent : Colors.text}
                  />
                </View>
                <Text
                  style={[
                    styles.toolLabel,
                    selectedEffect !== 'none' && styles.toolLabelActive,
                  ]}
                >
                  Effects
                </Text>
                {selectedEffect !== 'none' && (
                  <Text style={styles.toolValue}>{selectedEffectData?.label}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolButton}
                onPress={() => router.push('/reel/new/music')}
              >
                <View style={styles.toolIconContainer}>
                  <Icon
                    name="music-note"
                    size={24}
                    color={musicTrack ? Colors.accent : Colors.text}
                  />
                </View>
                <Text style={[styles.toolLabel, musicTrack && styles.toolLabelActive]}>Music</Text>
                {musicTrack && (
                  <Text style={styles.toolValue} numberOfLines={1}>
                    {musicTrack.title}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolButton}
                onPress={() => setShowTrimEditor((current) => !current)}
              >
                <View style={styles.toolIconContainer}>
                  <Icon
                    name="content-cut"
                    size={24}
                    color={showTrimEditor || hasTrim ? Colors.accent : Colors.text}
                  />
                </View>
                <Text style={[styles.toolLabel, (showTrimEditor || hasTrim) && styles.toolLabelActive]}>
                  Trim
                </Text>
                {trimDurationLabel && (
                  <Text style={styles.toolValue}>{trimDurationLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
            {showTrimEditor && (
              <ReelTrimEditor
                duration={duration}
                startTime={startTime}
                endTime={endTime > 0 ? endTime : duration}
                onChange={setTrimSettings}
                onPreview={previewTrimmedClip}
              />
            )}
          </View>
        )}

        {/* Caption Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Caption</Text>
          <TextInput
            style={styles.input}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={2200}
          />
        </View>

        {/* Hashtags Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Hashtags (separate with spaces)</Text>
          <TextInput
            style={styles.input}
            placeholder="#hashtag1 #hashtag2"
            placeholderTextColor={Colors.textSecondary}
            value={hashtags}
            onChangeText={setHashtags}
            autoCapitalize="none"
          />
        </View>
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
    padding: 16,
  },
  videoButton: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  videoPlaceholder: {
    alignItems: 'center',
  },
  videoPlaceholderText: {
    marginTop: 8,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  uploadActions: {
    width: '100%',
    marginTop: 16,
    gap: 12,
    paddingHorizontal: 20,
  },
  primaryActionButton: {
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryActionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryActionText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  videoPreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  removeVideoButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    padding: 6,
  },
  changeVideoButton: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeVideoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recordVideoButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trimBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolsSection: {
    marginBottom: 16,
  },
  toolsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toolButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toolIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
  },
  toolLabelActive: {
    color: Colors.accent,
  },
  toolValue: {
    fontSize: 11,
    color: Colors.accent,
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
