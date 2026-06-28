import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { Colors } from '../../constants/Colors';
import SkeletonLoader from './SkeletonLoader';
import { useLightbox } from './Lightbox';

interface OptimizedImageProps {
  source: string | { uri: string };
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  placeholder?: string;
  priority?: 'low' | 'normal' | 'high';
  showSkeleton?: boolean;
  aspectRatio?: number;
  borderRadius?: number;
  // Accessible description of the image. Drives the screen-reader label and the
  // "ALT" badge overlay (Bluesky-style accessibility affordance).
  alt?: string;
  // Show an "ALT" badge overlay when alt text is present.
  showAltBadge?: boolean;
  // When true, tapping the image opens the global fullscreen lightbox.
  enableLightbox?: boolean;
}

// Default blurhash for loading state
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export default function OptimizedImage({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  priority = 'normal',
  showSkeleton = true,
  aspectRatio,
  borderRadius = 0,
  alt,
  showAltBadge = true,
  enableLightbox = false,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const openLightbox = useLightbox();

  const uri = typeof source === 'string' ? source : source.uri;

  // Generate optimized URL with size parameters if needed
  const optimizedUri = uri;

  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  if (hasError) {
    return (
      <View
        style={[
          styles.errorContainer,
          style,
          { borderRadius },
          aspectRatio ? { aspectRatio } : {},
        ]}
      >
        <View style={styles.errorIcon}>
          <View style={styles.errorIconInner} />
        </View>
      </View>
    );
  }

  const imageContent = (
    <>
      {isLoading && showSkeleton && (
        <View style={[StyleSheet.absoluteFill, { borderRadius }]}>
          <SkeletonLoader
            width="100%"
            height="100%"
            borderRadius={borderRadius}
          />
        </View>
      )}
      <Image
        source={{ uri: optimizedUri }}
        style={[
          styles.image,
          { borderRadius },
          aspectRatio ? { aspectRatio } : {},
        ] as any}
        contentFit={contentFit}
        transition={200}
        placeholder={{ blurhash: placeholder || DEFAULT_BLURHASH }}
        cachePolicy="memory-disk"
        priority={priority}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        accessible={!!alt}
        accessibilityLabel={alt}
      />
      {!!alt && showAltBadge && (
        <View style={styles.altBadge} pointerEvents="none">
          <Text style={styles.altBadgeText}>ALT</Text>
        </View>
      )}
    </>
  );

  const containerStyle = [style, aspectRatio ? { aspectRatio } : {}];

  if (enableLightbox) {
    return (
      <TouchableOpacity
        style={containerStyle}
        activeOpacity={0.9}
        onPress={() => openLightbox([{ uri, alt }], 0)}
        accessibilityRole="imagebutton"
        accessibilityLabel={alt || 'Open image'}
      >
        {imageContent}
      </TouchableOpacity>
    );
  }

  return <View style={containerStyle}>{imageContent}</View>;
}

// Pre-configured variants for common use cases
export function AvatarImage({
  source,
  size = 40,
  style,
}: {
  source: string | { uri: string };
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: size, height: size }, style]}
      borderRadius={size / 2}
      contentFit="cover"
      priority="high"
    />
  );
}

export function PostImage({
  source,
  style,
  aspectRatio = 1,
}: {
  source: string | { uri: string };
  style?: StyleProp<ViewStyle>;
  aspectRatio?: number;
}) {
  return (
    <OptimizedImage
      source={source}
      style={style}
      aspectRatio={aspectRatio}
      contentFit="cover"
      priority="normal"
    />
  );
}

export function ThumbnailImage({
  source,
  size = 80,
  style,
}: {
  source: string | { uri: string };
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <OptimizedImage
      source={source}
      style={[{ width: size, height: size }, style]}
      borderRadius={8}
      contentFit="cover"
      priority="low"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
  altBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  altBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorContainer: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconInner: {
    width: 20,
    height: 2,
    backgroundColor: Colors.textSecondary,
    transform: [{ rotate: '45deg' }],
  },
});
