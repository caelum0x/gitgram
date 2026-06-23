import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import Header from '../components/navigation/Header';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface TopPost {
  id: string;
  content: string;
  mediaUrls: string[];
  createdAt: string;
  engagementScore: number;
  _count: {
    likes: number;
    comments: number;
  };
}

interface Demographics {
  newFollowers: number;
  activeFollowers: number;
  influencers: number;
  avgFollowerCount: number;
}

interface Performance {
  totalPosts: number;
  withMedia: {
    count: number;
    avgEngagement: number;
  };
  withoutMedia: {
    count: number;
    avgEngagement: number;
  };
  topHashtags: Array<{ name: string; count: number }>;
}

export default function InsightsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState(30);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);

  useEffect(() => {
    loadInsights();
  }, [timeRange]);

  const loadInsights = async () => {
    try {
      const data = await userService.getInsightsOverview(timeRange);
      setTopPosts(data.topPosts || []);
      setDemographics(data.demographics || null);
      setPerformance(data.performance || null);
    } catch (error) {
      logger.error('Load insights error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadInsights();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Insights" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Insights" />
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.text}
          />
        }
      >
        {/* Time Range Selector */}
        <View style={styles.timeSelector}>
          {[7, 30, 90].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.timeButton,
                timeRange === days && styles.timeButtonActive,
              ]}
              onPress={() => setTimeRange(days)}
            >
              <Text
                style={[
                  styles.timeButtonText,
                  timeRange === days && styles.timeButtonTextActive,
                ]}
              >
                {days}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Overview Stats */}
        <View style={styles.statsGrid}>
          <StatCard
            title="Total Posts"
            value={performance?.totalPosts || 0}
            icon="document-text-outline"
          />
          <StatCard
            title="Avg Engagement"
            value={performance?.withMedia.avgEngagement || 0}
            subtitle="with media"
            icon="heart-outline"
          />
          <StatCard
            title="New Followers"
            value={demographics?.newFollowers || 0}
            subtitle="last 30 days"
            icon="person-add-outline"
          />
          <StatCard
            title="Influencers"
            value={demographics?.influencers || 0}
            subtitle="1k+ followers"
            icon="star-outline"
          />
        </View>

        {/* Content Performance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Performance</Text>
          <View style={styles.performanceCards}>
            <View style={styles.performanceCard}>
              <View style={styles.performanceIcon}>
                <Ionicons name="image-outline" size={24} color={Colors.accent} />
              </View>
              <View style={styles.performanceInfo}>
                <Text style={styles.performanceLabel}>With Media</Text>
                <Text style={styles.performanceSubtext}>
                  {performance?.withMedia.count || 0} posts
                </Text>
              </View>
              <View style={styles.performanceValue}>
                <Text style={styles.performanceNumber}>
                  {performance?.withMedia.avgEngagement || 0}
                </Text>
                <Text style={styles.performanceSubtext}>avg</Text>
              </View>
            </View>

            <View style={styles.performanceCard}>
              <View style={[styles.performanceIcon, { backgroundColor: Colors.surface }]}>
                <Ionicons name="text-outline" size={24} color={Colors.textSecondary} />
              </View>
              <View style={styles.performanceInfo}>
                <Text style={styles.performanceLabel}>Text Only</Text>
                <Text style={styles.performanceSubtext}>
                  {performance?.withoutMedia.count || 0} posts
                </Text>
              </View>
              <View style={styles.performanceValue}>
                <Text style={styles.performanceNumber}>
                  {performance?.withoutMedia.avgEngagement || 0}
                </Text>
                <Text style={styles.performanceSubtext}>avg</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Top Hashtags */}
        {performance?.topHashtags && performance.topHashtags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Hashtags</Text>
            <View style={styles.hashtagList}>
              {performance.topHashtags.map((tag, index) => (
                <View key={tag.name} style={styles.hashtagItem}>
                  <Text style={styles.hashtagRank}>{index + 1}</Text>
                  <Text style={styles.hashtagName}>#{tag.name}</Text>
                  <Text style={styles.hashtagCount}>{tag.count} posts</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Audience Demographics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audience Demographics</Text>
          <View style={styles.demographicsGrid}>
            <View style={styles.demographicCard}>
              <Text style={[styles.demographicValue, { color: '#22c55e' }]}>
                {demographics?.newFollowers || 0}
              </Text>
              <Text style={styles.demographicLabel}>New (30d)</Text>
            </View>
            <View style={styles.demographicCard}>
              <Text style={[styles.demographicValue, { color: '#3b82f6' }]}>
                {demographics?.activeFollowers || 0}
              </Text>
              <Text style={styles.demographicLabel}>Active</Text>
            </View>
            <View style={styles.demographicCard}>
              <Text style={[styles.demographicValue, { color: '#a855f7' }]}>
                {demographics?.influencers || 0}
              </Text>
              <Text style={styles.demographicLabel}>Influencers</Text>
            </View>
            <View style={styles.demographicCard}>
              <Text style={[styles.demographicValue, { color: '#f59e0b' }]}>
                {demographics?.avgFollowerCount || 0}
              </Text>
              <Text style={styles.demographicLabel}>Avg Followers</Text>
            </View>
          </View>
        </View>

        {/* Top Posts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performing Posts</Text>
          {topPosts.length > 0 ? (
            topPosts.slice(0, 5).map((post, index) => (
              <TouchableOpacity
                key={post.id}
                style={styles.topPostItem}
                onPress={() => router.push(`/post/${post.id}`)}
              >
                <Text style={styles.topPostRank}>{index + 1}</Text>
                <View style={styles.topPostContent}>
                  <Text style={styles.topPostText} numberOfLines={2}>
                    {post.content || '(Media post)'}
                  </Text>
                  <View style={styles.topPostStats}>
                    <View style={styles.topPostStat}>
                      <Ionicons name="heart" size={14} color={Colors.textSecondary} />
                      <Text style={styles.topPostStatText}>{post._count?.likes || 0}</Text>
                    </View>
                    <View style={styles.topPostStat}>
                      <Ionicons name="chatbubble" size={14} color={Colors.textSecondary} />
                      <Text style={styles.topPostStatText}>{post._count?.comments || 0}</Text>
                    </View>
                    <Text style={styles.topPostScore}>Score: {post.engagementScore}</Text>
                  </View>
                </View>
                {post.mediaUrls?.[0] && (
                  <Image source={{ uri: post.mediaUrls[0] }} style={styles.topPostImage} />
                )}
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No posts yet. Start creating content to see insights!
            </Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Text style={styles.statTitle}>{title}</Text>
        <View style={styles.statIcon}>
          <Ionicons name={icon as any} size={18} color={Colors.accent} />
        </View>
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  timeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  timeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  timeButtonActive: {
    backgroundColor: Colors.accent,
  },
  timeButtonText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  timeButtonTextActive: {
    color: Colors.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    margin: 4,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: 'bold',
  },
  statSubtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  performanceCards: {
    gap: 12,
  },
  performanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  performanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  performanceInfo: {
    flex: 1,
  },
  performanceLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  performanceSubtext: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  performanceValue: {
    alignItems: 'flex-end',
  },
  performanceNumber: {
    color: Colors.accent,
    fontSize: 24,
    fontWeight: 'bold',
  },
  hashtagList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hashtagRank: {
    color: Colors.textSecondary,
    fontSize: 14,
    width: 24,
  },
  hashtagName: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  hashtagCount: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  demographicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  demographicCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  demographicValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  demographicLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  topPostItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  topPostRank: {
    color: Colors.textSecondary,
    fontSize: 20,
    fontWeight: 'bold',
    width: 28,
  },
  topPostContent: {
    flex: 1,
  },
  topPostText: {
    color: Colors.text,
    fontSize: 14,
    marginBottom: 6,
  },
  topPostStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topPostStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topPostStatText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  topPostScore: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  topPostImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  emptyText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
});
