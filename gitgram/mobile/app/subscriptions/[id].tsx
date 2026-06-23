import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { subscriptionService } from '../../services/subscriptionService';
import { logger } from '../../utils/logger';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Colors } from '../../constants/Colors';

export default function SubscriptionDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const subscriptionId = params.id as string;

  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, [subscriptionId]);

  const loadSubscription = async () => {
    try {
      const response = await subscriptionService.getSubscription(subscriptionId);
      setSubscription(response.subscription);
    } catch (error) {
      logger.error('Load subscription error:', error);
      Alert.alert('Error', 'Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel this subscription?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await subscriptionService.cancelSubscription(subscriptionId);
              Alert.alert('Success', 'Subscription cancelled successfully');
              loadSubscription();
            } catch (error: any) {
              logger.error('Cancel subscription error:', error);
              Alert.alert('Error', error.message || 'Failed to cancel subscription');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleUpdatePaymentMethod = () => {
    router.push({
      pathname: '/subscriptions/[id]/update-payment',
      params: { id: subscriptionId },
    });
  };

  const handleChangePlan = () => {
    router.push({
      pathname: '/subscriptions/[id]/change-plan',
      params: { id: subscriptionId },
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Subscription Details" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!subscription) {
    return (
      <View style={styles.container}>
        <Header title="Subscription Details" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Subscription not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Subscription Details" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(subscription.status) },
              ]}
            />
            <Text style={styles.statusText}>
              {subscription.status.toUpperCase()}
            </Text>
          </View>
          {subscription.status === 'on_hold' && (
            <Text style={styles.onHoldText}>
              Your subscription is on hold. Please update your payment method to reactivate.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Product:</Text>
            <Text style={styles.infoValue}>
              {subscription.productName || subscription.productId}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Quantity:</Text>
            <Text style={styles.infoValue}>{subscription.quantity}</Text>
          </View>
          {subscription.currentPeriodStart && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current Period Start:</Text>
              <Text style={styles.infoValue}>
                {formatDate(subscription.currentPeriodStart)}
              </Text>
            </View>
          )}
          {subscription.currentPeriodEnd && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Next Billing Date:</Text>
              <Text style={styles.infoValue}>
                {formatDate(subscription.currentPeriodEnd)}
              </Text>
            </View>
          )}
          {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Trial Ends:</Text>
              <Text style={styles.infoValue}>
                {formatDate(subscription.trialEnd)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {subscription.status === 'active' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.changePlanButton]}
                onPress={handleChangePlan}
              >
                <Text style={styles.actionButtonText}>Change Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCancelSubscription}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.actionButtonText}>Cancel Subscription</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          {subscription.status === 'on_hold' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.updatePaymentButton]}
              onPress={handleUpdatePaymentMethod}
            >
              <Text style={styles.actionButtonText}>Update Payment Method</Text>
            </TouchableOpacity>
          )}
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
  },
  contentContainer: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  onHoldText: {
    fontSize: 14,
    color: Colors.warning,
    marginTop: 8,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  changePlanButton: {
    backgroundColor: Colors.buttonPrimary,
  },
  cancelButton: {
    backgroundColor: Colors.error,
  },
  updatePaymentButton: {
    backgroundColor: Colors.warning,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    color: Colors.error,
    textAlign: 'center',
  },
});

