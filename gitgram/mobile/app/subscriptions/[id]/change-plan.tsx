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
import {
  subscriptionService,
  type SubscriptionPlan,
} from '../../../services/subscriptionService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Colors } from '../../../constants/Colors';

export default function ChangePlanScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const subscriptionId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [availableProducts, setAvailableProducts] = useState<SubscriptionPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [prorationMode, setProrationMode] = useState<
    'prorated_immediately' | 'full_immediately' | 'difference_immediately'
  >('difference_immediately');

  const loadPlans = async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const response = await subscriptionService.getPlans();
      // Only purchasable plans (those with a configured product) are selectable.
      setAvailableProducts(response.plans.filter((plan) => plan.available));
      setCurrentPlan(response.currentPlan);
    } catch (error) {
      logger.error('Load plans error:', error);
      setPlansError('Unable to load available plans');
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleChangePlan = async () => {
    if (!selectedProductId) {
      Alert.alert('Error', 'Please select a plan');
      return;
    }

    Alert.alert(
      'Change Plan',
      'Are you sure you want to change your subscription plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change Plan',
          onPress: async () => {
            try {
              setLoading(true);
              await subscriptionService.changePlan(subscriptionId, {
                productId: selectedProductId,
                prorationBillingMode: prorationMode,
              });
              Alert.alert('Success', 'Plan change initiated successfully', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]);
            } catch (error: any) {
              logger.error('Change plan error:', error);
              Alert.alert('Error', error.message || 'Failed to change plan');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (plansLoading) {
    return (
      <View style={styles.container}>
        <Header title="Change Plan" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (plansError) {
    return (
      <View style={styles.container}>
        <Header title="Change Plan" />
        <EmptyState
          title="Couldn't load plans"
          message={plansError}
          icon="⚠️"
          actionLabel="Retry"
          onAction={loadPlans}
        />
      </View>
    );
  }

  if (availableProducts.length === 0) {
    return (
      <View style={styles.container}>
        <Header title="Change Plan" />
        <EmptyState
          title="No plans available"
          message="There are no upgradeable plans configured right now. Please check back later."
          icon="💳"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Change Plan" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Select New Plan</Text>
        {availableProducts.map((product) => {
          const isCurrent = product.id === currentPlan;
          return (
            <TouchableOpacity
              key={product.id}
              style={[
                styles.productCard,
                selectedProductId === product.id && styles.productCardSelected,
                isCurrent && styles.productCardDisabled,
              ]}
              onPress={() => !isCurrent && setSelectedProductId(product.id)}
              disabled={isCurrent}
            >
              <View style={styles.productInfo}>
                <View style={styles.productHeaderRow}>
                  <Text style={styles.productName}>{product.name}</Text>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.productPrice}>
                  {product.price}/{product.interval}
                </Text>
                {product.features.map((feature) => (
                  <Text key={feature} style={styles.featureText}>
                    • {feature}
                  </Text>
                ))}
              </View>
              {selectedProductId === product.id && !isCurrent && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionTitle}>Billing Option</Text>
        <View style={styles.prorationOptions}>
          <TouchableOpacity
            style={[
              styles.prorationOption,
              prorationMode === 'difference_immediately' && styles.prorationOptionSelected,
            ]}
            onPress={() => setProrationMode('difference_immediately')}
          >
            <Text style={styles.prorationTitle}>Difference Immediately</Text>
            <Text style={styles.prorationDescription}>
              Charge the difference for upgrades, credit for downgrades
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.prorationOption,
              prorationMode === 'prorated_immediately' && styles.prorationOptionSelected,
            ]}
            onPress={() => setProrationMode('prorated_immediately')}
          >
            <Text style={styles.prorationTitle}>Prorated Immediately</Text>
            <Text style={styles.prorationDescription}>
              Charge prorated amount based on remaining time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.prorationOption,
              prorationMode === 'full_immediately' && styles.prorationOptionSelected,
            ]}
            onPress={() => setProrationMode('full_immediately')}
          >
            <Text style={styles.prorationTitle}>Full Immediately</Text>
            <Text style={styles.prorationDescription}>
              Charge full amount of new plan immediately
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleChangePlan}
          disabled={loading || !selectedProductId}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Change Plan</Text>
          )}
        </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 12,
  },
  productCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productCardSelected: {
    borderColor: Colors.primary || '#007AFF',
    backgroundColor: Colors.surface,
  },
  productCardDisabled: {
    opacity: 0.6,
  },
  productInfo: {
    flex: 1,
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  currentBadge: {
    backgroundColor: Colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  productPrice: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary || '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  prorationOptions: {
    gap: 12,
  },
  prorationOption: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  prorationOptionSelected: {
    borderColor: Colors.primary || '#007AFF',
  },
  prorationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  prorationDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.primary || '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

