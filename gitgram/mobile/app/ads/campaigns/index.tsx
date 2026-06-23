import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { adCampaignService } from '../../../services/adCampaignService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Colors } from '../../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AdCampaignsScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadCampaigns();
  }, [filter]);

  const loadCampaigns = async () => {
    try {
      const response = await adCampaignService.getCampaigns(
        filter === 'all' ? undefined : filter
      );
      setCampaigns(response.campaigns || []);
    } catch (error) {
      logger.error('Load campaigns error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCampaigns();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return Colors.success || '#34C759';
      case 'paused':
        return Colors.warning || '#FF9500';
      case 'completed':
        return Colors.textSecondary || '#666';
      case 'draft':
        return Colors.textSecondary || '#666';
      default:
        return Colors.textSecondary || '#666';
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const renderCampaign = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.campaignCard}
      onPress={() => router.push(`/ads/campaigns/${item.id}`)}
    >
      <View style={styles.campaignHeader}>
        <View style={styles.campaignInfo}>
          <Text style={styles.campaignName}>{item.name}</Text>
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

      <View style={styles.campaignDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Budget:</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.budget)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Spent:</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.spent)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Remaining:</Text>
          <Text style={styles.detailValue}>
            {formatCurrency(item.budget - item.spent)}
          </Text>
        </View>
        {item._count && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ads:</Text>
            <Text style={styles.detailValue}>{item._count.ads || 0}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Ad Campaigns" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Ad Campaigns"
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/ads/campaigns/create')}
            style={styles.addButton}
          >
            <Icon name="add" size={24} color={Colors.primary || '#007AFF'} />
          </TouchableOpacity>
        }
      />
      
      <View style={styles.filterContainer}>
        {['all', 'active', 'paused', 'draft', 'completed'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterButton,
              filter === status && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(status)}
          >
            <Text
              style={[
                styles.filterText,
                filter === status && styles.filterTextActive,
              ]}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {campaigns.length > 0 ? (
        <FlatList
          data={campaigns}
          renderItem={renderCampaign}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          title="No campaigns"
          message={
            filter === 'all'
              ? "You don't have any ad campaigns yet"
              : `No ${filter} campaigns`
          }
          actionLabel="Create Campaign"
          onAction={() => router.push('/ads/campaigns/create')}
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
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary || '#007AFF',
    borderColor: Colors.primary || '#007AFF',
  },
  filterText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  campaignCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  campaignHeader: {
    marginBottom: 12,
  },
  campaignInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  campaignName: {
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
  campaignDetails: {
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

