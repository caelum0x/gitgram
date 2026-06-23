import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SubscriptionCheckout from '../../components/subscription/SubscriptionCheckout';
import { subscriptionService } from '../../services/subscriptionService';
import { logger } from '../../utils/logger';
import Header from '../../components/navigation/Header';
import { Colors } from '../../constants/Colors';

export default function SubscriptionCheckoutScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const productId = params.productId as string;
  const productName = params.productName as string | undefined;
  const quantity = params.quantity ? parseInt(params.quantity as string) : 1;
  const trialPeriodDays = params.trialPeriodDays
    ? parseInt(params.trialPeriodDays as string)
    : undefined;

  const handleSuccess = () => {
    Alert.alert('Success', 'Subscription activated successfully!', [
      {
        text: 'OK',
        onPress: () => router.replace('/subscriptions'),
      },
    ]);
  };

  const handleCancel = () => {
    router.back();
  };

  const handleError = (error: Error) => {
    Alert.alert('Error', error.message || 'Failed to process subscription');
  };

  if (!productId) {
    return (
      <View style={styles.container}>
        <Header title="Subscription Checkout" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Product ID is required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Subscribe" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoContainer}>
          {productName && (
            <Text style={styles.productName}>{productName}</Text>
          )}
          <Text style={styles.productId}>Product: {productId}</Text>
          {quantity > 1 && (
            <Text style={styles.quantity}>Quantity: {quantity}</Text>
          )}
        </View>

        <SubscriptionCheckout
          productId={productId}
          productName={productName}
          quantity={quantity}
          trialPeriodDays={trialPeriodDays}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          onError={handleError}
        />

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Secure Payment</Text>
          <Text style={styles.infoText}>
            Your payment is processed securely through Dodo Payments. 
            You will be redirected to complete the payment.
          </Text>
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
  infoContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  productName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  productId: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  quantity: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary || '#007AFF',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    color: Colors.error || '#FF3B30',
    textAlign: 'center',
  },
});

