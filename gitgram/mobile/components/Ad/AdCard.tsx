import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Image } from 'expo-image';
import { adService } from '../../services/adService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface AdCardProps {
  ad: {
    id: string;
    title: string;
    description?: string;
    imageUrl: string;
    targetUrl: string;
  };
  onReport?: () => void;
}

export default function AdCard({ ad, onReport }: AdCardProps) {
  const router = useRouter();
  const [viewed, setViewed] = useState(false);

  useEffect(() => {
    // Track view when ad is visible
    if (!viewed) {
      adService.trackView(ad.id).catch((error) => {
        logger.error('Track ad view error:', error);
      });
      setViewed(true);
    }
  }, [ad.id, viewed]);

  const handleClick = async () => {
    try {
      await adService.trackClick(ad.id);
      // Open target URL (in a real app, this would open in browser or in-app browser)
      // router.push(ad.targetUrl);
    } catch (error) {
      logger.error('Track ad click error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.adLabel}>
        <Text style={styles.adLabelText}>Ad</Text>
      </View>
      <TouchableOpacity onPress={handleClick} activeOpacity={0.8}>
        <Image source={{ uri: ad.imageUrl }} style={styles.image} />
        <View style={styles.info}>
          <Text style={styles.title}>{ad.title}</Text>
          {ad.description && (
            <Text style={styles.description} numberOfLines={2}>
              {ad.description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      {onReport && (
        <TouchableOpacity
          style={styles.reportButton}
          onPress={onReport}
        >
          <Icon name="report" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  adLabel: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1,
  },
  adLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  image: {
    width: '100%',
    height: 200,
  },
  info: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  reportButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    padding: 8,
  },
});

