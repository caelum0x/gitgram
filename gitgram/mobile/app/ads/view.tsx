import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Image } from 'expo-image';
import { logger } from '../../utils/logger';
import { adService } from '../../services/adService';

export default function AdViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ad, setAd] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadAd(id);
    }
  }, [id]);

  const loadAd = async (adId: string) => {
    try {
      const response = await adService.getAd(adId);
      await adService.trackView(adId);
      setAd(response.ad || response);
    } catch (error) {
      logger.error('Load ad error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (ad?.url) {
      await Linking.openURL(ad.url);
      await adService.trackClick(ad.id);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Advertisement" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!ad) {
    return (
      <View style={styles.container}>
        <Header title="Advertisement" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Ad not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Advertisement" />
      <TouchableOpacity style={styles.adContainer} onPress={handleClick}>
        {ad.image && (
          <Image source={{ uri: ad.image }} style={styles.adImage} />
        )}
        <View style={styles.adContent}>
          <Text style={styles.adTitle}>{ad.title}</Text>
          {ad.description && (
            <Text style={styles.adDescription}>{ad.description}</Text>
          )}
          {ad.sponsor && (
            <Text style={styles.sponsorLabel}>Sponsored by {ad.sponsor}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  adContainer: {
    flex: 1,
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  adImage: {
    width: '100%',
    height: 300,
  },
  adContent: {
    padding: 16,
  },
  adTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  adDescription: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 8,
  },
  sponsorLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});

