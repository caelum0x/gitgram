import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ReelPlayer from '../../../components/Reel/ReelPlayer';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function ReelRemixScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [originalReel, setOriginalReel] = useState<any>(null);
  const [remixType, setRemixType] = useState<'duet' | 'stitch'>('duet');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOriginalReel();
  }, [id]);

  const loadOriginalReel = async () => {
    try {
      const response = await reelService.getReel(id!);
      setOriginalReel(response.reel);
    } catch (error) {
      logger.error('Load reel error:', error);
      Alert.alert('Error', 'Failed to load reel');
      router.back();
    }
  };

  const handleCreateRemix = () => {
    router.push({
      pathname: '/create/reel',
      params: { remixId: id, remixType },
    });
  };

  if (!originalReel) {
    return (
      <View style={styles.container}>
        <Header title="Remix Reel" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Remix Reel" />
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Create a Remix</Text>
        <Text style={styles.description}>
          Create a duet or stitch with this reel. Your video will appear alongside the original.
        </Text>

        <View style={styles.typeSelector}>
          <TouchableOpacity
            style={[styles.typeButton, remixType === 'duet' && styles.typeButtonActive]}
            onPress={() => setRemixType('duet')}
          >
            <Icon
              name="people"
              size={24}
              color={remixType === 'duet' ? Colors.accent : Colors.textSecondary}
            />
            <Text
              style={[
                styles.typeLabel,
                remixType === 'duet' && styles.typeLabelActive,
              ]}
            >
              Duet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, remixType === 'stitch' && styles.typeButtonActive]}
            onPress={() => setRemixType('stitch')}
          >
            <Icon
              name="content-cut"
              size={24}
              color={remixType === 'stitch' ? Colors.accent : Colors.textSecondary}
            />
            <Text
              style={[
                styles.typeLabel,
                remixType === 'stitch' && styles.typeLabelActive,
              ]}
            >
              Stitch
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.previewSection}>
          <Text style={styles.sectionTitle}>Original Reel</Text>
          <View style={styles.previewContainer}>
            <ReelPlayer
              videoUrl={originalReel.videoUrl}
              isActive={false}
              likesCount={originalReel.likesCount}
              commentsCount={originalReel.commentsCount}
              username={originalReel.user.username}
              caption={originalReel.caption}
              onLike={() => {}}
              onComment={() => {}}
              onShare={() => {}}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreateRemix}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating...' : 'Create Remix'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  typeButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  typeLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  typeLabelActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  previewSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  previewContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

