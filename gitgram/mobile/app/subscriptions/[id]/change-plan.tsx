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
import { subscriptionService } from '../../../services/subscriptionService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { Colors } from '../../../constants/Colors';

export default function ChangePlanScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const subscriptionId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [prorationMode, setProrationMode] = useState<
    'prorated_immediately' | 'full_immediately' | 'difference_immediately'
  >('difference_immediately');

  // Mock product list - replace with actual product list from your backend
  const availableProducts = [
    { id: 'prod_basic', name: 'Basic Plan', price: '$9.99/month' },
    { id: 'prod_pro', name: 'Pro Plan', price: '$19.99/month' },
    { id: 'prod_premium', name: 'Premium Plan', price: '$29.99/month' },
  ];

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

  return (
    <View style={styles.container}>
      <Header title="Change Plan" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Select New Plan</Text>
        {availableProducts.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[
              styles.productCard,
              selectedProductId === product.id && styles.productCardSelected,
            ]}
            onPress={() => setSelectedProductId(product.id)}
          >
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productPrice}>{product.price}</Text>
            </View>
            {selectedProductId === product.id && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

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
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    color: Colors.textSecondary,
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

