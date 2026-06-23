import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { githubService } from '../../services/githubService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function SuggestedProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSuggestedProjects();
  }, []);

  const loadSuggestedProjects = async () => {
    try {
      const response = await githubService.getUserProjects(1, 20);
      setProjects(response.projects || []);
    } catch (error) {
      logger.error('Load suggested projects error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSuggestedProjects();
  };

  const renderProject = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectItem}
      onPress={() => router.push(`/project/${item.id}`)}
    >
      {item.screenshots?.[0] ? (
        <Image source={{ uri: item.screenshots[0] }} style={styles.projectImage} />
      ) : (
        <View style={styles.projectImagePlaceholder}>
          <Icon name="code" size={32} color={Colors.textSecondary} />
        </View>
      )}
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.projectDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.projectStats}>
          <Icon name="star" size={16} color={Colors.textSecondary} />
          <Text style={styles.projectStatText}>{item.starsCount || 0}</Text>
          <Icon name="call-split" size={16} color={Colors.textSecondary} style={styles.statIcon} />
          <Text style={styles.projectStatText}>{item.forksCount || 0}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Suggested Projects" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Suggested Projects" />
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No suggestions"
            message="We couldn't find any projects to suggest"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  projectImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  projectImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 4,
  },
  statIcon: {
    marginLeft: 12,
  },
  projectStatText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

