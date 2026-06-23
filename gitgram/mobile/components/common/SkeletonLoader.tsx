import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '../../constants/Colors';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
}

export default function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonLoaderProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: Colors.surface,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function PostSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.header}>
        <SkeletonLoader width={32} height={32} borderRadius={16} />
        <View style={skeletonStyles.headerText}>
          <SkeletonLoader width={100} height={14} />
          <SkeletonLoader width={60} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
      <SkeletonLoader width="100%" height={300} borderRadius={0} />
      <View style={skeletonStyles.footer}>
        <SkeletonLoader width={80} height={16} />
        <SkeletonLoader width={120} height={14} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function CommentSkeleton() {
  return (
    <View style={skeletonStyles.commentContainer}>
      <SkeletonLoader width={40} height={40} borderRadius={20} />
      <View style={skeletonStyles.commentContent}>
        <SkeletonLoader width={80} height={14} />
        <SkeletonLoader width="90%" height={12} style={{ marginTop: 6 }} />
        <SkeletonLoader width="60%" height={12} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

export function StorySkeleton() {
  return (
    <View style={skeletonStyles.storyContainer}>
      <SkeletonLoader width={68} height={68} borderRadius={34} />
      <SkeletonLoader width={60} height={10} style={{ marginTop: 6 }} />
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={skeletonStyles.profileContainer}>
      <SkeletonLoader width={90} height={90} borderRadius={45} />
      <View style={skeletonStyles.profileStats}>
        <View style={skeletonStyles.statItem}>
          <SkeletonLoader width={40} height={20} />
          <SkeletonLoader width={50} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={skeletonStyles.statItem}>
          <SkeletonLoader width={40} height={20} />
          <SkeletonLoader width={50} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={skeletonStyles.statItem}>
          <SkeletonLoader width={40} height={20} />
          <SkeletonLoader width={50} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
      <SkeletonLoader width={120} height={16} style={{ marginTop: 16 }} />
      <SkeletonLoader width="80%" height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

export function NotificationSkeleton() {
  return (
    <View style={skeletonStyles.notificationContainer}>
      <SkeletonLoader width={44} height={44} borderRadius={22} />
      <View style={skeletonStyles.notificationContent}>
        <SkeletonLoader width="80%" height={14} />
        <SkeletonLoader width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function RepoCardSkeleton() {
  return (
    <View style={skeletonStyles.repoContainer}>
      <View style={skeletonStyles.repoHeader}>
        <SkeletonLoader width={24} height={24} borderRadius={12} />
        <SkeletonLoader width={150} height={16} />
      </View>
      <SkeletonLoader width="100%" height={12} style={{ marginTop: 12 }} />
      <SkeletonLoader width="70%" height={12} style={{ marginTop: 6 }} />
      <View style={skeletonStyles.repoFooter}>
        <SkeletonLoader width={60} height={14} />
        <SkeletonLoader width={60} height={14} />
        <SkeletonLoader width={60} height={14} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  footer: {
    padding: 12,
  },
  commentContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  commentContent: {
    flex: 1,
  },
  storyContainer: {
    alignItems: 'center',
    marginRight: 12,
  },
  profileContainer: {
    alignItems: 'center',
    padding: 16,
  },
  profileStats: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 32,
  },
  statItem: {
    alignItems: 'center',
  },
  notificationContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  repoContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  repoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repoFooter: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 16,
  },
});
