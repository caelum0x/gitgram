import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';

interface DualImagePreviewProps {
  screenshotUrl: string;
  selfieUrl: string;
  height?: number;
}

export default function DualImagePreview({
  screenshotUrl,
  selfieUrl,
  height = 300,
}: DualImagePreviewProps) {
  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.screenshotContainer}>
        <Image source={{ uri: screenshotUrl }} style={styles.screenshot} />
      </View>
      <View style={styles.selfieContainer}>
        <Image source={{ uri: selfieUrl }} style={styles.selfie} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  screenshotContainer: {
    flex: 2,
    backgroundColor: Colors.surface,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  selfieContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
  },
  selfie: {
    width: '100%',
    height: '100%',
  },
});

