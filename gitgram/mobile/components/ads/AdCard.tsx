import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';

export interface AdCardProps {
  ad: {
    id: string;
    title: string;
    description: string;
    mediaUrl: string;
    ctaText: string;
    ctaLink: string;
    advertiser: {
      name: string;
      avatar?: string;
    };
  };
}

export default function AdCard({ ad }: AdCardProps) {
  const handlePress = () => {
    if (ad.ctaLink) {
      Linking.openURL(ad.ctaLink);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.advertiserInfo}>
          {ad.advertiser.avatar ? (
            <Image source={{ uri: ad.advertiser.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <ThemedText style={styles.avatarText}>
                {ad.advertiser.name[0].toUpperCase()}
              </ThemedText>
            </View>
          )}
          <View>
            <ThemedText type="defaultSemiBold">{ad.advertiser.name}</ThemedText>
            <ThemedText style={styles.sponsoredLabel}>Sponsored</ThemedText>
          </View>
        </View>
        <Icon name="more-horiz" size={24} color={Colors.textSecondary} />
      </View>

      {ad.mediaUrl && (
        <Image source={{ uri: ad.mediaUrl }} style={styles.media} resizeMode="cover" />
      )}

      <View style={styles.content}>
        <View style={styles.ctaRow}>
          <ThemedText style={styles.title} numberOfLines={1}>{ad.title}</ThemedText>
          <TouchableOpacity style={styles.ctaButton} onPress={handlePress}>
            <ThemedText style={styles.ctaText}>{ad.ctaText || 'Learn More'}</ThemedText>
            <Icon name="arrow-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.description} numberOfLines={2}>
          {ad.description}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  advertiserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sponsoredLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  media: {
    width: '100%',
    aspectRatio: 1.91, // Standard Facebook/Link share aspect ratio
  },
  content: {
    padding: 12,
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ctaText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  description: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
