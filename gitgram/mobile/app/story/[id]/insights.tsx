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
import { storyService } from '../../../services/storyService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function StoryInsightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, [id]);

  const loadInsights = async () => {
    try {
      const response = await storyService.getStoryInsights(id!);
      setInsights(response.insights || response);
    } catch (error) {
      logger.error('Load insights error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Story Insights" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  const stats = [
    { icon: 'visibility', label: 'Views', value: insights?.views || 0 },
    { icon: 'touch-app', label: 'Interactions', value: insights?.interactions || 0 },
    { icon: 'reply', label: 'Replies', value: insights?.replies || 0 },
    { icon: 'share', label: 'Shares', value: insights?.shares || 0 },
  ];

  return (
    <View style={styles.container}>
      <Header title="Story Insights" />
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

