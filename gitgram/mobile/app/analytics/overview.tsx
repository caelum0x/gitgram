import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { analyticsService } from '../../services/analyticsService';

export default function AnalyticsOverviewScreen() {
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    posts: 0,
    reels: 0,
    totalLikes: 0,
    totalComments: 0,
    profileViews: 0,
    reach: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await analyticsService.getOverview();
      const analytics = response.analytics || response;
      setStats({
        followers: analytics.followers || 0,
        following: analytics.following || 0,
        posts: analytics.posts || 0,
        reels: analytics.reels || 0,
        totalLikes: analytics.totalLikes || 0,
        totalComments: analytics.totalComments || 0,
        profileViews: analytics.profileViews || 0,
        reach: analytics.reach || 0,
      });
    } catch (error) {
      logger.error('Load analytics error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Analytics" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Analytics" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.followers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.following.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.posts.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.reels.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Reels</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engagement</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalLikes.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Likes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalComments.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Comments</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reach</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.profileViews.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Profile Views</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.reach.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Reach</Text>
            </View>
          </View>
        </View>
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
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.accent,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

