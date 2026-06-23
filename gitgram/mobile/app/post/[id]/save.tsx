import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function PostSaveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkSavedStatus();
  }, [id]);

  const checkSavedStatus = async () => {
    try {
      const response = await postService.isPostSaved(id!);
      setIsSaved(response.saved || false);
    } catch (error) {
      logger.error('Check saved status error:', error);
      // If endpoint doesn't exist, try checking saved posts list
      try {
        const savedResponse = await postService.getSavedPosts(1, 100);
        const isInSaved = savedResponse.posts?.some((p: any) => p.id === id);
        setIsSaved(isInSaved || false);
      } catch (e) {
        // Ignore error, assume not saved
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSave = async () => {
    setSaving(true);
    try {
      if (!id || typeof id !== 'string') return;
      
      if (isSaved) {
        // Note: Backend may need an unsave endpoint, for now we'll use save which toggles
        await postService.savePost(id);
        setIsSaved(false);
        Alert.alert('Success', 'Post removed from saved');
      } else {
        await postService.savePost(id);
        setIsSaved(true);
        Alert.alert('Success', 'Post saved');
      }
    } catch (error) {
      logger.error('Toggle save error:', error);
      Alert.alert('Error', 'Failed to update save status');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={isSaved ? 'Unsave Post' : 'Save Post'} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={isSaved ? 'Unsave Post' : 'Save Post'} />
      <View style={styles.content}>
        <Icon
          name={isSaved ? 'bookmark' : 'bookmark-border'}
          size={64}
          color={Colors.accent}
          style={styles.icon}
        />
        <Text style={styles.title}>
          {isSaved ? 'Post Saved' : 'Save Post?'}
        </Text>
        <Text style={styles.description}>
          {isSaved
            ? 'This post is saved to your collection. You can access it anytime from your profile.'
            : 'Save this post to your collection to view it later.'}
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            isSaved && styles.unsaveButton,
            saving && styles.buttonDisabled,
          ]}
          onPress={handleToggleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {saving
              ? 'Updating...'
              : isSaved
              ? 'Remove from Saved'
              : 'Save Post'}
          </Text>
        </TouchableOpacity>
      </View>
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
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  unsaveButton: {
    backgroundColor: Colors.error || '#ff4444',
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

