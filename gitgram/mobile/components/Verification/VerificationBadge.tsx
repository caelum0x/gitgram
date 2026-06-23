import React from 'react';
import { View, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';

interface VerificationBadgeProps {
  isVerified: boolean;
  isGoldenVerified?: boolean;
  size?: number;
}

export default function VerificationBadge({
  isVerified,
  isGoldenVerified = false,
  size = 16,
}: VerificationBadgeProps) {
  if (!isVerified) return null;

  return (
    <View style={styles.container}>
      <Icon
        name={isGoldenVerified ? 'workspace-premium' : 'verified'}
        size={size}
        color={isGoldenVerified ? '#FFD700' : Colors.accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 4,
  },
});

