import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { adCampaignService } from '../../services/adCampaignService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface Campaign {
  id: string;
  name: string;
  status: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
}

interface CampaignStats {
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
}

export default function AdsManagerScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignStats>({
    totalImpressions: 0,
    totalClicks: 0,
    totalSpend: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setError(null);
    try {
      const response = await adCampaignService.getCampaigns();
      const list: Campaign[] = response.campaigns || response.data || [];
      setCampaigns(list);
      setStats(
        list.reduce<CampaignStats>(
          (acc, c) => ({
            totalImpressions: acc.totalImpressions + (c.impressions || 0),
            totalClicks: acc.totalClicks + (c.clicks || 0),
            totalSpend: acc.totalSpend + (c.spend || 0),
          }),
          { totalImpressions: 0, totalClicks: 0, totalSpend: 0 }
        )
      );
    } catch (err) {
      logger.error('Load campaigns error:', err);
      setError('Could not load campaigns. Pull to refresh to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCampaigns();
    }, [loadCampaigns])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCampaigns();
  }, [loadCampaigns]);

  const renderCampaign = ({ item }: { item: Campaign }) => (
    <TouchableOpacity
      style={styles.campaignCard}
      onPress={() => router.push(`/ads/campaigns/${item.id}`)}
    >
      <View style={styles.campaignHeader}>
        <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
        <View style={[
          styles.statusBadge,
          item.status === 'active' ? styles.statusActive : styles.statusPaused
        ]}>
          <ThemedText style={[
            styles.statusText,
            item.status === 'active' ? styles.statusTextActive : styles.statusTextPaused
          ]}>
            {item.status.toUpperCase()}
          </ThemedText>
        </View>
      </View>
      
      <View style={styles.campaignStats}>
        <View style={styles.statItem}>
          <ThemedText type="caption">Impressions</ThemedText>
          <ThemedText type="defaultSemiBold">{(item.impressions || 0).toLocaleString()}</ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText type="caption">Clicks</ThemedText>
          <ThemedText type="defaultSemiBold">{(item.clicks || 0).toLocaleString()}</ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText type="caption">Spend</ThemedText>
          <ThemedText type="defaultSemiBold">${(item.spend || 0).toFixed(2)}</ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <ThemedText type="title">Ads Manager</ThemedText>
        <Button
          title="Create"
          size="sm"
          onPress={() => router.push('/ads/campaigns/create')}
        />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text} />
        }
      >
        {/* Overview Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <ThemedText type="caption">Impressions</ThemedText>
            <ThemedText type="title">{stats.totalImpressions.toLocaleString()}</ThemedText>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statCard, { flex: 1, marginRight: 8 }]}>
              <ThemedText type="caption">Clicks</ThemedText>
              <ThemedText type="subtitle">{stats.totalClicks.toLocaleString()}</ThemedText>
            </View>
            <View style={[styles.statCard, { flex: 1, marginLeft: 8 }]}>
              <ThemedText type="caption">Spend</ThemedText>
              <ThemedText type="subtitle">${stats.totalSpend.toFixed(2)}</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Campaigns</ThemedText>
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <EmptyState
              icon="⚠️"
              title="Something went wrong"
              message={error}
              actionLabel="Retry"
              onAction={loadCampaigns}
            />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon="📣"
              title="No campaigns yet"
              message="Create your first ad campaign to start reaching developers."
              actionLabel="Create Campaign"
              onAction={() => router.push('/ads/campaigns/create')}
            />
          ) : (
            <FlatList
              data={campaigns}
              renderItem={renderCampaign}
              keyExtractor={item => item.id.toString()}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    paddingRight: 16,
  },
  statsContainer: {
    padding: 20,
  },
  statCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  campaignCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  campaignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: 'rgba(35, 134, 54, 0.1)',
  },
  statusPaused: {
    backgroundColor: 'rgba(157, 166, 185, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusTextActive: {
    color: Colors.success,
  },
  statusTextPaused: {
    color: Colors.textSecondary,
  },
  campaignStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
});

