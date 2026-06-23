import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import Header from '../components/navigation/Header';
import PostCard from '../components/Post/PostCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { trendingService, TrendingHashtag, TrendingUser } from '../services/trendingService';
import { logger } from '../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

type TabType = 'posts' | 'hashtags' | 'users';

export default function TrendingScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [users, setUsers] = useState<TrendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('week');

  const loadTrendingPosts = useCallback(async () => {
    try {
      const response = await trendingService.getTrendingPosts(timeframe, 1, 20);
      setPosts(response.posts || []);
    } catch (error) {
      logger.error('Load trending posts error:', error);
      // Fallback to popular posts if trending fails
      try {
        const fallbackResponse = await trendingService.getPopularPosts(20, 0);
        setPosts(fallbackResponse.posts || []);
      } catch (fallbackError) {
        logger.error('Fallback popular posts error:', fallbackError);
      }
    }
  }, [timeframe]);

  const loadTrendingHashtags = useCallback(async () => {
    try {
      const response = await trendingService.getTrendingHashtags(50);
      // Normalize response - could be array or object with hashtags
      const hashtagList = Array.isArray(response) ? response : (response as any).hashtags || [];
      setHashtags(hashtagList);
    } catch (error) {
      logger.error('Load trending hashtags error:', error);
      // Fallback to popular hashtags
      try {
        const fallbackResponse = await trendingService.getPopularHashtags(50);
        setHashtags(fallbackResponse.hashtags || []);
      } catch (fallbackError) {
        logger.error('Fallback popular hashtags error:', fallbackError);
      }
    }
  }, []);

  const loadTrendingUsers = useCallback(async () => {
    try {
      const response = await trendingService.getTrendingUsers(20);
      setUsers(response.users || []);
    } catch (error) {
      logger.error('Load trending users error:', error);
    }
  }, []);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'posts':
          await loadTrendingPosts();
          break;
        case 'hashtags':
          await loadTrendingHashtags();
          break;
        case 'users':
          await loadTrendingUsers();
          break;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, loadTrendingPosts, loadTrendingHashtags, loadTrendingUsers]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadContent();
  };

  const handleTabChange = (tab: TabType) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const renderHashtagItem = ({ item, index }: { item: TrendingHashtag; index: number }) => {
    const postCount = item._count?.posts || item.count || 0;
    const tagName = item.name.startsWith('#') ? item.name : `#${item.name}`;

    return (
      <TouchableOpacity
        style={styles.hashtagItem}
        onPress={() => router.push(`/hashtag/${item.name.replace('#', '')}`)}
      >
        <View style={styles.rank}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <Icon name="tag" size={24} color={Colors.accent} />
        <View style={styles.itemInfo}>
          <Text style={styles.hashtagName}>{tagName}</Text>
          <Text style={styles.subText}>
            {postCount} {postCount === 1 ? 'post' : 'posts'}
          </Text>
        </View>
        <Icon name="trending-up" size={20} color={Colors.accent} />
      </TouchableOpacity>
    );
  };

  const renderUserItem = ({ item, index }: { item: TrendingUser; index: number }) => {
    const followerCount = item._count?.followers || 0;
    const postCount = item._count?.posts || 0;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => router.push(`/profile/${item.id}`)}
      >
        <View style={styles.rank}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Icon name="person" size={24} color={Colors.textSecondary} />
          </View>
        )}
        <View style={styles.itemInfo}>
          <View style={styles.usernameRow}>
            <Text style={styles.username}>@{item.username}</Text>
            {item.verified && (
              <Icon name="verified" size={16} color={Colors.accent} style={styles.verifiedIcon} />
            )}
          </View>
          <Text style={styles.subText} numberOfLines={1}>
            {followerCount} followers | {postCount} posts
          </Text>
          {item.bio && (
            <Text style={styles.bio} numberOfLines={1}>
              {item.bio}
            </Text>
          )}
        </View>
        <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (loading && !refreshing) {
      return <LoadingSpinner fullScreen />;
    }

    switch (activeTab) {
      case 'posts':
        return (
          <FlatList
            data={posts}
            renderItem={({ item }) => <PostCard post={item} />}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListHeaderComponent={
              <View style={styles.timeframeContainer}>
                {(['today', 'week', 'month'] as const).map((tf) => (
                  <TouchableOpacity
                    key={tf}
                    style={[styles.timeframeButton, timeframe === tf && styles.activeTimeframe]}
                    onPress={() => setTimeframe(tf)}
                  >
                    <Text
                      style={[styles.timeframeText, timeframe === tf && styles.activeTimeframeText]}
                    >
                      {tf.charAt(0).toUpperCase() + tf.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                title="No trending posts"
                message="Check back later for trending posts!"
              />
            }
          />
        );

      case 'hashtags':
        return (
          <FlatList
            data={hashtags}
            renderItem={renderHashtagItem}
            keyExtractor={(item) => item.id || item.name}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              <EmptyState
                title="No trending hashtags"
                message="Check back later for trending hashtags!"
              />
            }
          />
        );

      case 'users':
        return (
          <FlatList
            data={users}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              <EmptyState
                title="No trending users"
                message="Check back later for trending users!"
              />
            }
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Trending" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
          onPress={() => handleTabChange('posts')}
        >
          <Icon
            name="whatshot"
            size={20}
            color={activeTab === 'posts' ? Colors.text : Colors.textSecondary}
          />
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
          style={[styles.tab, activeTab === 'hashtags' && styles.activeTab]}
          onPress={() => handleTabChange('hashtags')}
        >
          <Icon
            name="tag"
            size={20}
            color={activeTab === 'hashtags' ? Colors.text : Colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'hashtags' && styles.activeTabText,
            ]}
          >
            Hashtags
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.activeTab]}
          onPress={() => handleTabChange('users')}
        >
          <Icon
            name="people"
            size={20}
            color={activeTab === 'users' ? Colors.text : Colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'users' && styles.activeTabText,
            ]}
          >
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {renderContent()}
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
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
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
  timeframeContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  timeframeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  activeTimeframe: {
    backgroundColor: Colors.accent,
  },
  timeframeText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  activeTimeframeText: {
    color: Colors.background,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  itemInfo: {
    flex: 1,
  },
  hashtagName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  subText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  bio: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
