import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ReelAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [id]);

  const loadAnalytics = async () => {
    try {
      const response = await reelService.getReelAnalytics(id!);
      setAnalytics(response.analytics || response);
    } catch (error) {
      logger.error('Load analytics error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Reel Analytics" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  const stats = [
    { icon: 'visibility', label: 'Views', value: analytics?.views || 0 },
    { icon: 'favorite', label: 'Likes', value: analytics?.likes || 0 },
    { icon: 'comment', label: 'Comments', value: analytics?.comments || 0 },
    { icon: 'share', label: 'Shares', value: analytics?.shares || 0 },
    { icon: 'bookmark', label: 'Saves', value: analytics?.saves || 0 },
  ];

  return (
    <View style={styles.container}>
      <Header title="Reel Analytics" />
      <ScrollView style={styles.content}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Icon name={stat.icon} size={32} color={Colors.accent} />
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{stat.value.toLocaleString()}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          </View>
        ))}
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
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  statInfo: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});

