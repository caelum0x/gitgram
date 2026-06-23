import React, { useState, useEffect } from 'react';
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
import { githubService } from '../../../services/githubService';
import { logger } from '../../../utils/logger';

export default function EditProjectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadProject(id);
    }
  }, [id]);

  const loadProject = async (projectId: string) => {
    try {
      setLoading(true);
      const response = await githubService.getProject(projectId);
      const project = response.project || response;
      setProject(project);
      setDescription(project.description || '');
      setTags(project.tags?.join(', ') || '');
    } catch (error) {
      logger.error('Load project error:', error);
      Alert.alert('Error', 'Failed to load project');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;

    setLoading(true);
    try {
      if (!id || typeof id !== 'string') return;
      
      const tagArray = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      await githubService.updateProject(id, {
        description,
        tags: tagArray,
      });
      Alert.alert('Success', 'Project updated successfully');
      router.back();
    } catch (error) {
      logger.error('Update project error:', error);
      Alert.alert('Error', 'Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Edit Project" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.container}>
        <Header title="Edit Project" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Project not found</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header
        title="Edit Project"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <View style={styles.content}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Project description"
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Tags (comma separated)</Text>
        <TextInput
          style={styles.input}
          value={tags}
          onChangeText={setTags}
          placeholder="react, typescript, open-source"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Text>
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
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
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
    textAlign: 'center',
  },
});

