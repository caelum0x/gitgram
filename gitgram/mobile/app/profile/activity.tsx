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
import { userService } from '../../services/userService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ActivityScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'posts' | 'likes' | 'comments'>('all');

  useEffect(() => {
    loadActivity();
  }, [activeTab]);

  const loadActivity = async () => {
    try {
      const response = await userService.getActivity(activeTab);
      setActivities(response.activities || []);
    } catch (error) {
      logger.error('Load activity error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderActivity = ({ item }: { item: any }) => {
    let icon = 'circle';
    let color = Colors.text;

    switch (item.type) {
      case 'post':
        icon = 'add-circle';
        color = Colors.accent;
        break;
      case 'like':
        icon = 'favorite';
        color = Colors.error || '#ff4444';
        break;
      case 'comment':
        icon = 'comment';
        color = Colors.accent;
        break;
      default:
        break;
    }

    return (
      <TouchableOpacity
        style={styles.activityItem}
        onPress={() => {
          if (item.postId) router.push(`/post/${item.postId}`);
          else if (item.reelId) router.push(`/reel/${item.reelId}`);
        }}
      >
        <Icon name={icon} size={24} color={color} style={styles.activityIcon} />
        <View style={styles.activityContent}>
          <Text style={styles.activityText}>{item.description}</Text>
          <Text style={styles.activityTime}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Your Activity" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Your Activity" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'all' && styles.activeTabText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
          onPress={() => setActiveTab('posts')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'posts' && styles.activeTabText,
            ]}
          >
            Posts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'likes' && styles.activeTab]}
          onPress={() => setActiveTab('likes')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'likes' && styles.activeTabText,
            ]}
          >
            Likes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'comments' && styles.activeTab]}
          onPress={() => setActiveTab('comments')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'comments' && styles.activeTabText,
            ]}
          >
            Comments
          </Text>
        </TouchableOpacity>
      </View>

      {activities.length > 0 ? (
        <FlatList
          data={activities}
          renderItem={renderActivity}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No activity"
          message="Your activity will appear here"
          icon="📊"
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.text,
  },
  listContent: {
    padding: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  activityIcon: {
    marginRight: 8,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
