import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useReelEditorStore, VISUAL_EFFECTS, VisualEffect } from '../../../store/reelEditorStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PREVIEW_HEIGHT = SCREEN_HEIGHT * 0.5;
const EFFECT_CARD_SIZE = (SCREEN_WIDTH - 64) / 3;

// Effect overlay component to simulate visual effects on video
const EffectOverlay = ({ effect }: { effect: VisualEffect | undefined }) => {
  if (!effect || effect.id === 'none') return null;

  const overlayStyles: any[] = [styles.effectOverlay];

  if (effect.overlay) {
    overlayStyles.push({
      backgroundColor: effect.overlay.color,
      opacity: effect.overlay.opacity,
    });
  }

  // For B&W and desaturated effects, we use a grayscale overlay trick
  if (effect.adjustments?.saturation === 0) {
    overlayStyles.push({
      backgroundColor: 'transparent',
    });
    return (
      <View style={[styles.effectOverlay, styles.grayscaleOverlay]}>
        <View style={styles.grayscaleLayer} />
      </View>
    );
  }

  if (effect.adjustments?.contrast && effect.adjustments.contrast > 1) {
    overlayStyles.push({
      // Simulate higher contrast with slight darkening
      shadowColor: '#000',
      shadowOpacity: (effect.adjustments.contrast - 1) * 0.2,
    });
  }

  return <View style={overlayStyles} pointerEvents="none" />;
};

// Preview thumbnail with effect applied
const EffectPreviewThumbnail = ({
  effect,
  thumbnailUri,
  isSelected,
  isPreviewing,
}: {
  effect: VisualEffect;
  thumbnailUri: string | null;
  isSelected: boolean;
  isPreviewing: boolean;
}) => {
  const getOverlayStyle = () => {
    if (effect.id === 'none') return null;

    const overlayStyle: any = {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 8,
    };

    if (effect.adjustments?.saturation === 0) {
      // Grayscale effect simulation
      overlayStyle.backgroundColor = 'rgba(128, 128, 128, 0.5)';
    } else if (effect.overlay) {
      overlayStyle.backgroundColor = effect.overlay.color;
    }

    return overlayStyle;
  };

  const overlayStyle = getOverlayStyle();

  return (
    <View style={styles.thumbnailContainer}>
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <Icon name="videocam" size={24} color={Colors.textSecondary} />
        </View>
      )}
      {overlayStyle && <View style={overlayStyle} pointerEvents="none" />}
      {(isSelected || isPreviewing) && (
        <View style={styles.thumbnailSelectedOverlay}>
          <Icon
            name={isSelected ? 'check-circle' : 'visibility'}
            size={20}
            color={Colors.accent}
          />
        </View>
      )}
    </View>
  );
};

export default function ReelEffectsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Get state from store
  const {
    videoUri,
    thumbnailUri,
    selectedEffect,
    previewEffect,
    setSelectedEffect,
    setPreviewEffect,
    applyPreviewEffect,
  } = useReelEditorStore();

  // Animation for selection feedback
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Currently active effect for preview (preview takes precedence)
  const activeEffectId = previewEffect || selectedEffect;
  const activeEffect = VISUAL_EFFECTS.find((e) => e.id === activeEffectId);

  const handleEffectPress = useCallback(
    (effectId: string) => {
      // Animate selection
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Set as selected effect directly
      setSelectedEffect(effectId);
      setPreviewEffect(null);
    },
    [scaleAnim, setSelectedEffect, setPreviewEffect]
  );

  const handleEffectLongPress = useCallback(
    (effectId: string) => {
      // Preview effect without applying
      setPreviewEffect(effectId);
    },
    [setPreviewEffect]
  );

  const handleEffectPressOut = useCallback(() => {
    // Clear preview when finger is lifted (if not selected)
    if (previewEffect) {
      setPreviewEffect(null);
    }
  }, [previewEffect, setPreviewEffect]);

  const handleApply = () => {
    // Effect is already selected, just navigate back
    // The selected effect is persisted in the store
    router.back();
  };

  const renderEffectCard = ({ item }: { item: VisualEffect }) => {
    const isSelected = selectedEffect === item.id;
    const isPreviewing = previewEffect === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.effectCard,
          isSelected && styles.effectCardSelected,
          isPreviewing && styles.effectCardPreviewing,
        ]}
        onPress={() => handleEffectPress(item.id)}
        onLongPress={() => handleEffectLongPress(item.id)}
        onPressOut={handleEffectPressOut}
        delayLongPress={200}
        activeOpacity={0.8}
      >
        <EffectPreviewThumbnail
          effect={item}
          thumbnailUri={thumbnailUri}
          isSelected={isSelected}
          isPreviewing={isPreviewing}
        />
        <View style={styles.effectInfo}>
          <Icon
            name={item.icon}
            size={20}
            color={isSelected ? Colors.accent : Colors.textSecondary}
          />
          <Text
            style={[
              styles.effectLabel,
              isSelected && styles.effectLabelSelected,
              isPreviewing && styles.effectLabelPreviewing,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </View>
        {isSelected && (
          <View style={styles.checkmark}>
            <Icon name="check-circle" size={20} color={Colors.accent} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Effects"
        rightIcon="check"
        onRightPress={handleApply}
      />

      {/* Video Preview with Effect */}
      <Animated.View
        style={[
          styles.previewContainer,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {videoUri ? (
          <View style={styles.videoWrapper}>
            <Video
              source={{ uri: videoUri }}
              style={styles.videoPreview}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted
            />
            <EffectOverlay effect={activeEffect} />
          </View>
        ) : thumbnailUri ? (
          <View style={styles.videoWrapper}>
            <Image source={{ uri: thumbnailUri }} style={styles.videoPreview} />
            <EffectOverlay effect={activeEffect} />
          </View>
        ) : (
          <View style={styles.placeholderPreview}>
            <Icon name="videocam-off" size={64} color={Colors.textSecondary} />
            <Text style={styles.placeholderText}>No video selected</Text>
          </View>
        )}

        {/* Effect Name Badge */}
        {activeEffect && activeEffect.id !== 'none' && (
          <View style={styles.effectBadge}>
            <Icon name={activeEffect.icon} size={16} color={Colors.text} />
            <Text style={styles.effectBadgeText}>{activeEffect.label}</Text>
          </View>
        )}
      </Animated.View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>
          Tap to select an effect. Long press to preview.
        </Text>
      </View>

      {/* Effects Grid */}
      <FlatList
        data={VISUAL_EFFECTS}
        numColumns={3}
        keyExtractor={(item) => item.id}
        renderItem={renderEffectCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.columnWrapper}
      />

      {/* Current Selection Footer */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <Text style={styles.footerLabel}>Selected Effect:</Text>
          <View style={styles.footerEffectInfo}>
            <Icon
              name={VISUAL_EFFECTS.find((e) => e.id === selectedEffect)?.icon || 'image'}
              size={20}
              color={Colors.accent}
            />
            <Text style={styles.footerEffectName}>
              {VISUAL_EFFECTS.find((e) => e.id === selectedEffect)?.label || 'None'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  previewContainer: {
    height: PREVIEW_HEIGHT,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  effectOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  grayscaleOverlay: {
    backgroundColor: 'transparent',
  },
  grayscaleLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(128, 128, 128, 0.4)',
    // Note: True grayscale would require expo-gl or similar
    // This is a visual approximation
  },
  placeholderPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 16,
  },
  effectBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  effectBadgeText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  instructionsContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  instructionsText: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  effectCard: {
    width: EFFECT_CARD_SIZE,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
    position: 'relative',
  },
  effectCardSelected: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  effectCardPreviewing: {
    borderColor: Colors.warning,
    borderWidth: 2,
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  placeholderThumbnail: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailSelectedOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    padding: 2,
  },
  effectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 6,
  },
  effectLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  effectLabelSelected: {
    color: Colors.accent,
    fontWeight: '600',
  },
  effectLabelPreviewing: {
    color: Colors.warning,
  },
  checkmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    padding: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32, // Account for safe area
  },
  footerContent: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  footerEffectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerEffectName: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
