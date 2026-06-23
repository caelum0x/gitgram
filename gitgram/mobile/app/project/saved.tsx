import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { githubService } from '../../services/githubService';
import { logger } from '../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function SavedProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async (pageNum = 1, refresh = false) => {
    try {
      setLoading(true);
      const response = await githubService.getSavedProjects(pageNum, 20);
      const newProjects = response.projects || [];
      
      if (refresh) {
        setProjects(newProjects);
      } else {
        setProjects(prev => [...prev, ...newProjects]);
      }
      setHasMore(response.pagination?.page < response.pagination?.pages);
    } catch (error) {
      logger.error('Load saved projects error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadProjects(nextPage);
    }
  };

  const renderProject = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/project/${item.id}`)}
    >
      {item.screenshots && item.screenshots.length > 0 ? (
        <Image
          source={{ uri: item.screenshots[0] }}
          style={styles.thumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder}>
          <Icon name="code" size={32} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.projectInfo}>
        <Text style={styles.projectName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.projectDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.projectStats}>
          <View style={styles.statItem}>
            <Icon name="star" size={16} color={Colors.accent} />
            <Text style={styles.statText}>{item.stars || 0}</Text>
          </View>
          {item.language && (
            <Text style={styles.language}>{item.language}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && projects.length === 0) {
    return (
      <View style={styles.container}>
        <Header title="Saved Projects" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Saved Projects" />
      {projects.length > 0 ? (
        <FlatList
          data={projects}
          renderItem={renderProject}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasMore && projects.length > 0 ? (
              <LoadingSpinner />
            ) : null
          }
        />
      ) : (
        <EmptyState
          title="No saved projects"
          message="Save projects to view them here"
          icon="⭐"
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
  listContent: {
    padding: 16,
  },
  projectCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.border,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectInfo: {
    padding: 16,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  projectDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  projectStats: {
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
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  language: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

