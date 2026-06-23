import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function ReelEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingReel, setLoadingReel] = useState(true);

  useEffect(() => {
    loadReel();
  }, [id]);

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(id!);
      setCaption(response.reel.caption || response.reel.description || '');
      setHashtags(
        response.reel.hashtags
          ? Array.isArray(response.reel.hashtags)
            ? response.reel.hashtags.join(' ')
            : response.reel.hashtags
          : ''
      );
    } catch (error) {
      logger.error('Load reel error:', error);
      Alert.alert('Error', 'Failed to load reel');
      router.back();
    } finally {
      setLoadingReel(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await reelService.updateReel(id!, {
        caption,
        hashtags: hashtags.split(' ').filter((tag) => tag.trim().startsWith('#')),
      });
      Alert.alert('Success', 'Reel updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      logger.error('Update reel error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update reel');
    } finally {
      setLoading(false);
    }
  };

  if (loadingReel) {
    return (
      <View style={styles.container}>
        <Header title="Edit Reel" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Header title="Edit Reel" rightIcon="check" onRightPress={handleSave} />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>Caption</Text>
          <TextInput
            style={styles.input}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={2200}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Hashtags (separate with spaces)</Text>
          <TextInput
            style={styles.input}
            placeholder="#hashtag1 #hashtag2"
            placeholderTextColor={Colors.textSecondary}
            value={hashtags}
            onChangeText={setHashtags}
            autoCapitalize="none"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
