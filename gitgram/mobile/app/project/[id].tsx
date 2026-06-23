import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { githubService } from '../../services/githubService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Image } from 'expo-image';

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadProject(id);
    }
  }, [id]);

  const loadProject = async (projectId: string) => {
    try {
      setLoading(true);
      const response = await githubService.getProject(projectId);
      const projectData = response.project || response;
      setProject(projectData);
      setIsSaved(projectData.isSaved || false);
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
    try {
      setSaving(true);
      const response = await githubService.saveProject(id);
      setIsSaved(response.saved);
      Alert.alert('Success', response.saved ? 'Project saved' : 'Project unsaved');
    } catch (error) {
      logger.error('Save project error:', error);
      Alert.alert('Error', 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenGitHub = () => {
    if (project?.githubUrl) {
      Linking.openURL(project.githubUrl);
    }
  };

  const handleSync = async () => {
    if (!id) return;
    try {
      setLoading(true);
      await githubService.syncProject(id);
      await loadProject(id);
      Alert.alert('Success', 'Project synced successfully');
    } catch (error) {
      logger.error('Sync project error:', error);
      Alert.alert('Error', 'Failed to sync project');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Project" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.container}>
        <Header title="Project" />
        <EmptyState title="Project not found" message="This project could not be found" />
      </View>
    );
  }

  const [activeTab, setActiveTab] = useState<'readme' | 'highlights' | 'contributors'>('readme');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {project.fullName || project.name || 'Project'}
        </Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleOpenGitHub}>
          <Icon name="open-in-new" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Project Header Info */}
        <View style={styles.projectHeader}>
          <View style={styles.projectTitleRow}>
            <Image
              source={{ uri: project.owner?.avatar_url || project.avatarUrl }}
              style={styles.avatar}
            />
            <View style={styles.titleTextContainer}>
              <Text style={styles.ownerName}>{project.owner?.login || project.owner || 'Owner'}</Text>
              <Text style={styles.repoName}>{project.name}</Text>
            </View>
          </View>

          {project.description && (
            <Text style={styles.description}>{project.description}</Text>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Icon name="star-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.statText}>
                <Text style={styles.statValue}>{project.stars || project.stargazers_count || 0}</Text> stars
              </Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="call-split" size={16} color={Colors.textSecondary} />
              <Text style={styles.statText}>
                <Text style={styles.statValue}>{project.forks || project.forks_count || 0}</Text> forks
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
            <Icon name={isSaved ? "bookmark" : "bookmark-border"} size={20} color={isSaved ? Colors.primary : Colors.text} />
            <Text style={[styles.actionButtonText, isSaved && { color: Colors.primary }]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="notifications-none" size={20} color={Colors.text} />
            <Text style={styles.actionButtonText}>Notifications</Text>
          </TouchableOpacity>
        </View>

        {/* Code Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Code</Text>
          <TouchableOpacity
            style={styles.codeButton}
            onPress={() => router.push({
              pathname: '/project/[id]/files',
              params: { id: id, fullName: project.fullName || `${project.owner?.login}/${project.name}` }
            })}
          >
            <View style={styles.codeButtonLeft}>
              <Icon name="code" size={20} color={Colors.textSecondary} />
              <Text style={styles.codeButtonText}>Browse code</Text>
            </View>
            <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Readme Section */}
        {project.readme && (
          <View style={styles.section}>
            <View style={styles.readmeHeader}>
              <Icon name="menu-book" size={20} color={Colors.textSecondary} />
              <Text style={styles.sectionTitle}>README.md</Text>
            </View>
            <View style={styles.readmeContent}>
              <Text style={styles.readmeText}>{project.readme}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60, // Adjust for status bar
    paddingBottom: 12,
    backgroundColor: Colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  backButton: {
    padding: 4,
  },
  shareButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  projectHeader: {
    padding: 16,
    backgroundColor: Colors.secondary,
    marginBottom: 16,
  },
  projectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: Colors.border,
  },
  titleTextContainer: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  repoName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  statValue: {
    color: Colors.text,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  actionButtonText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    marginBottom: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    padding: 16,
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.secondary,
  },
  codeButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeButtonText: {
    fontSize: 16,
    color: Colors.text,
  },
  readmeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.secondary,
  },
  readmeContent: {
    padding: 16,
    backgroundColor: Colors.background,
  },
  readmeText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});


