import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../../../constants/Colors';
import Header from '../../../../components/navigation/Header';
import EmptyState from '../../../../components/common/EmptyState';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { adService } from '../../../../services/adService';
import { logger } from '../../../../utils/logger';

export default function CampaignAdsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAds();
  }, [campaignId]);

  const loadAds = async () => {
    try {
      const response = await adService.getAds(campaignId);
      setAds(response.ads || []);
    } catch (error) {
      logger.error('Load ads error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAds();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return Colors.success || '#34C759';
      case 'pending':
        return Colors.warning || '#FF9500';
      case 'approved':
        return Colors.success || '#34C759';
      case 'rejected':
        return Colors.error || '#FF3B30';
      case 'paused':
        return Colors.textSecondary || '#666';
      default:
        return Colors.textSecondary || '#666';
    }
  };

  const renderAd = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.adCard}
      onPress={() => router.push(`/ads/${item.id}`)}
    >
      <View style={styles.adHeader}>
        <View style={styles.adInfo}>
          <Text style={styles.adTitle}>{item.title || 'Untitled Ad'}</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            />
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.adDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Impressions:</Text>
          <Text style={styles.detailValue}>{item.impressions.toLocaleString()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Clicks:</Text>
          <Text style={styles.detailValue}>{item.clicks.toLocaleString()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Spend:</Text>
          <Text style={styles.detailValue}>${item.spend.toFixed(2)}</Text>
        </View>
        {item.postId && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>Post Promotion</Text>
          </View>
        )}
        {item.reelId && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>Reel Promotion</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Campaign Ads" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Campaign Ads"
        rightAction={
          <TouchableOpacity
            onPress={() => router.push(`/ads/campaigns/${campaignId}/ads/create`)}
            style={styles.addButton}
          >
            <Icon name="add" size={24} color={Colors.primary || '#007AFF'} />
          </TouchableOpacity>
        }
      />
      {ads.length > 0 ? (
        <FlatList
          data={ads}
          renderItem={renderAd}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          title="No ads"
          message="This campaign doesn't have any ads yet"
          actionLabel="Create Ad"
          onAction={() => router.push(`/ads/campaigns/${campaignId}/ads/create`)}
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
  addButton: {
    padding: 8,
  },
  listContent: {
    padding: 16,
  },
  adCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adHeader: {
    marginBottom: 12,
  },
  adInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  adDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
});
