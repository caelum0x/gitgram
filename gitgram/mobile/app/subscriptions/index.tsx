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
import { subscriptionService } from '../../services/subscriptionService';
import { logger } from '../../utils/logger';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { Colors } from '../../constants/Colors';
import { Image } from 'expo-image';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      const response = await subscriptionService.getMySubscriptions();
      setSubscriptions(response.subscriptions || []);
    } catch (error) {
      logger.error('Load subscriptions error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSubscriptions();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return Colors.success || '#34C759';
      case 'on_hold':
        return Colors.warning || '#FF9500';
      case 'cancelled':
        return Colors.textSecondary || '#666';
      case 'failed':
        return Colors.error || '#FF3B30';
      default:
        return Colors.textSecondary || '#666';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderSubscription = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.subscriptionCard}
      onPress={() => router.push(`/subscriptions/${item.id}`)}
    >
      <View style={styles.subscriptionHeader}>
        <View style={styles.subscriptionInfo}>
          <Text style={styles.productName}>
            {item.productName || item.productId}
          </Text>
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

      <View style={styles.subscriptionDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Quantity:</Text>
          <Text style={styles.detailValue}>{item.quantity}</Text>
        </View>
        {item.currentPeriodEnd && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Next Billing:</Text>
            <Text style={styles.detailValue}>
              {formatDate(item.currentPeriodEnd)}
            </Text>
          </View>
        )}
        {item.trialEnd && new Date(item.trialEnd) > new Date() && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Trial Ends:</Text>
            <Text style={styles.detailValue}>{formatDate(item.trialEnd)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="My Subscriptions" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="My Subscriptions" />
      {subscriptions.length > 0 ? (
        <FlatList
          data={subscriptions}
          renderItem={renderSubscription}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          title="No subscriptions"
          message="You don't have any active subscriptions yet"
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
  listContent: {
    padding: 16,
  },
  subscriptionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subscriptionHeader: {
    marginBottom: 12,
  },
  subscriptionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
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
  subscriptionDetails: {
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

