import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Button } from '../../../components/ui/Button';
import { scheduledPostsService } from '../../../services/scheduledPostsService';
import { logger } from '../../../utils/logger';

interface ScheduledPost {
  id: string;
  content: string;
  scheduledAt?: string;
  scheduledFor?: string;
}

const toLocalInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DD HH:mm for a simple, editable representation
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toIso = (value: string): string | null => {
  const normalized = value.trim().replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export default function EditScheduledPostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [scheduledInput, setScheduledInput] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const response = await scheduledPostsService.getScheduledPost(id);
      const post: ScheduledPost = response.scheduledPost || response;
      setContent(post.content || '');
      setScheduledInput(toLocalInput(post.scheduledFor || post.scheduledAt));
    } catch (err) {
      logger.error('Load scheduled post error:', err);
      setError('Could not load this scheduled post.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!id) return;
    if (!content.trim()) {
      Alert.alert('Error', 'Content cannot be empty');
      return;
    }
    const scheduledFor = toIso(scheduledInput);
    if (scheduledInput && !scheduledFor) {
      Alert.alert('Error', 'Use a valid date/time, e.g. 2026-07-01 14:30');
      return;
    }

    setSaving(true);
    try {
      await scheduledPostsService.updateScheduledPost(id, {
        content: content.trim(),
        ...(scheduledFor ? { scheduledFor } : {}),
      });
      Alert.alert('Saved', 'Scheduled post updated', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      logger.error('Update scheduled post error:', err);
      Alert.alert('Error', 'Failed to update scheduled post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Edit Scheduled Post" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Header title="Edit Scheduled Post" />
        <EmptyState
          icon="⚠️"
          title="Something went wrong"
          message={error}
          actionLabel="Retry"
          onAction={load}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Edit Scheduled Post" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Content</Text>
        <TextInput
          style={styles.input}
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
        />

        <Text style={styles.label}>Scheduled for</Text>
        <TextInput
          style={styles.dateInput}
          value={scheduledInput}
          onChangeText={setScheduledInput}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
        />

        <Button title="Save Changes" onPress={handleSave} size="lg" loading={saving} disabled={saving} />
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
    padding: 16,
    gap: 12,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  dateInput: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
});
