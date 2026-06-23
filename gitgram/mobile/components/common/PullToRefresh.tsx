import React from 'react';
import { RefreshControl, RefreshControlProps } from 'react-native';
import { Colors } from '../../constants/Colors';

interface PullToRefreshProps extends Omit<RefreshControlProps, 'colors' | 'tintColor'> {
  refreshing: boolean;
  onRefresh: () => void;
}

export default function PullToRefresh({
  refreshing,
  onRefresh,
  ...props
}: PullToRefreshProps) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={Colors.accent}
      colors={[Colors.accent]}
      {...props}
    />
  );
}

