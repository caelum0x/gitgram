import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';

export default function RetweetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRetweet = async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Error', 'Invalid post ID.');
      router.back();
      return;
    }

    setLoading(true);
    try {
      await postService.retweetPost(id, comment || undefined);
      Alert.alert('Success', 'Post retweeted successfully');
      router.back();
    } catch (error: any) {
      logger.error('Retweet error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to retweet post.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Retweet" rightIcon="check" onRightPress={handleRetweet} />
      <View style={styles.content}>
        <Text style={styles.label}>Add a comment (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="What's happening?"
          placeholderTextColor={Colors.textSecondary}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={6}
          maxLength={280}
        />
        <Text style={styles.charCount}>{comment.length}/280</Text>

        <TouchableOpacity
          style={[styles.retweetButton, loading && styles.buttonDisabled]}
          onPress={handleRetweet}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.retweetButtonText}>Retweet</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: 'top',
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  retweetButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  retweetButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

