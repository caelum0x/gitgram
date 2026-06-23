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
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { githubService } from '../../services/githubService';
import { logger } from '../../utils/logger';

export default function CreateProjectScreen() {
  const router = useRouter();
  const [githubUrl, setGithubUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!githubUrl.trim()) {
      Alert.alert('Error', 'Please enter a GitHub repository URL');
      return;
    }

    setLoading(true);
    try {
      // Extract owner and repo from URL
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        Alert.alert('Error', 'Invalid GitHub URL');
        setLoading(false);
        return;
      }

      const [, owner, repo] = urlMatch;
      const tagArray = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      await githubService.createProject({
        owner,
        repo,
        description,
        tags: tagArray,
      });
      Alert.alert('Success', 'Project added successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Create project error:', error);
      Alert.alert('Error', 'Failed to add project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Add Project" />
      <View style={styles.content}>
        <Text style={styles.label}>GitHub Repository URL</Text>
        <TextInput
          style={styles.input}
          value={githubUrl}
          onChangeText={setGithubUrl}
          placeholder="https://github.com/owner/repo"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Project description"
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Tags (comma separated, optional)</Text>
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
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.buttonText}>Add Project</Text>
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
});

