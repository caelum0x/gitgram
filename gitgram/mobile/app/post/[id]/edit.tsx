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
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function PostEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);

  useEffect(() => {
    loadPost();
  }, [id]);

  const loadPost = async () => {
    try {
      const response = await postService.getPost(id!);
      setContent(response.post.content || '');
      setHashtags(
        response.post.hashtags ? (Array.isArray(response.post.hashtags) ? response.post.hashtags.join(' ') : response.post.hashtags) : ''
      );
    } catch (error) {
      logger.error('Load post error:', error);
      Alert.alert('Error', 'Failed to load post');
      router.back();
    } finally {
      setLoadingPost(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await postService.updatePost(id!, {
        content,
        hashtags: hashtags.split(' ').filter((tag) => tag.trim().startsWith('#')),
      });
      Alert.alert('Success', 'Post updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      logger.error('Update post error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update post');
    } finally {
      setLoading(false);
    }
  };

  if (loadingPost) {
    return (
      <View style={styles.container}>
        <Header title="Edit Post" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Header
        title="Edit Post"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <TextInput
          style={styles.contentInput}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          maxLength={2200}
        />

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

        <View style={styles.charCount}>
          <Text style={styles.charCountText}>
            {content.length} / 2200 characters
          </Text>
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
  contentInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    color: Colors.text,
    fontSize: 16,
    minHeight: 200,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
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
  },
  charCount: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  charCountText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

