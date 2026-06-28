import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (proximity)
// ---------------------------------------------------------------------------
const Colors = {
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
} as const;

const SHIMMER_DURATION_MS = 1100;
const MIN_OPACITY = 0.35;
const MAX_OPACITY = 0.85;

export interface SkeletonProps {
  /** Width of the skeleton block. Defaults to filling the parent. */
  width?: DimensionValue;
  /** Height of the skeleton block. */
  height?: DimensionValue;
  /** Corner radius of the block. */
  borderRadius?: number;
  /** Additional style overrides. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Animated shimmer skeleton block. Loops a subtle opacity pulse to indicate
 * loading state without layout shift.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(MIN_OPACITY)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: MAX_OPACITY,
          duration: SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: MIN_OPACITY,
          duration: SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="none"
      style={[
        styles.block,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/**
 * Skeleton placeholder matching the shape of a feed PostCard.
 */
export function PostSkeleton() {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.postHeaderText}>
          <Skeleton width="55%" height={14} borderRadius={6} />
          <Skeleton width="30%" height={10} borderRadius={5} style={styles.gapTop} />
        </View>
      </View>
      <Skeleton width="100%" height={12} borderRadius={6} style={styles.gapTop} />
      <Skeleton width="92%" height={12} borderRadius={6} style={styles.gapTopSmall} />
      <Skeleton width="70%" height={12} borderRadius={6} style={styles.gapTopSmall} />
      <View style={styles.postActions}>
        <Skeleton width={56} height={20} borderRadius={10} />
        <Skeleton width={56} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

/**
 * Skeleton placeholder for a profile header.
 */
export function ProfileSkeleton() {
  return (
    <View style={styles.profile}>
      <Skeleton width={88} height={88} borderRadius={44} />
      <Skeleton width="50%" height={18} borderRadius={8} style={styles.gapTop} />
      <Skeleton width="35%" height={12} borderRadius={6} style={styles.gapTopSmall} />
      <View style={styles.profileStats}>
        <Skeleton width={64} height={36} borderRadius={10} />
        <Skeleton width={64} height={36} borderRadius={10} />
        <Skeleton width={64} height={36} borderRadius={10} />
      </View>
    </View>
  );
}

/**
 * Skeleton placeholder for a single list row (avatar + two text lines).
 */
export function ListItemSkeleton() {
  return (
    <View style={styles.listItem}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.listItemText}>
        <Skeleton width="60%" height={14} borderRadius={6} />
        <Skeleton width="40%" height={10} borderRadius={5} style={styles.gapTopSmall} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Colors.surfaceElevated,
  },
  gapTop: {
    marginTop: 10,
  },
  gapTopSmall: {
    marginTop: 6,
  },
  postCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  postHeaderText: {
    flex: 1,
  },
  postActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
  },
  profile: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.background,
  },
  profileStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listItemText: {
    flex: 1,
  },
});

export default Skeleton;
