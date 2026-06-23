import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { githubService } from '../../services/githubService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function SearchProjectsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setProjects([]);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await githubService.searchProjects(searchQuery);
      setProjects(response.projects || []);
    } catch (error) {
      logger.error('Search projects error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderProject = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectItem}
      onPress={() => router.push(`/project/${item.id}`)}
    >
      <Icon name="folder" size={24} color={Colors.accent} />
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.projectDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.projectStats}>
          {item.stars !== undefined && (
            <View style={styles.stat}>
              <Icon name="star" size={16} color={Colors.textSecondary} />
              <Text style={styles.statText}>{item.stars}</Text>
            </View>
          )}
          {item.language && (
            <Text style={styles.language}>{item.language}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Search Projects" />
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search projects..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchQuery('')}
          >
            <Icon name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : projects.length > 0 ? (
        <FlatList
          data={projects}
          renderItem={renderProject}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : searchQuery ? (
        <EmptyState
          title="No projects found"
          message="Try searching with different keywords"
          icon="🔍"
        />
      ) : (
        <EmptyState
          title="Search Projects"
          message="Enter a project name to search"
          icon="📁"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  searchIcon: {
    marginLeft: 4,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
  },
  listContent: {
    padding: 16,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  projectStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  language: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
