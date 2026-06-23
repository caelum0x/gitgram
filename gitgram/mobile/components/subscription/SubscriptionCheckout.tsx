import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { subscriptionService } from '../../services/subscriptionService';
import { logger } from '../../utils/logger';
import { paymentDeepLinkHandler, PaymentCallbackParams } from '../../utils/paymentDeepLinkHandler';
import { Colors } from '../../constants/Colors';

interface SubscriptionCheckoutProps {
  productId: string;
  productName?: string;
  quantity?: number;
  trialPeriodDays?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export default function SubscriptionCheckout({
  productId,
  productName,
  quantity = 1,
  trialPeriodDays,
  onSuccess,
  onCancel,
  onError,
}: SubscriptionCheckoutProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for payment completion deep links
    const unsubscribe = paymentDeepLinkHandler.addListener((params: PaymentCallbackParams) => {
      if (params.productId === productId || params.subscriptionId) {
        if (params.status === 'succeeded' || params.status === 'active') {
          onSuccess?.();
        } else if (params.status === 'failed' || params.status === 'cancelled') {
          onCancel?.();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [productId, onSuccess, onCancel]);

  const handleCheckout = async () => {
    try {
      setLoading(true);

      // Get checkout URL from backend
      // Use deep link scheme for return URL
      const returnUrl = `gitgram://payment-status?productId=${productId}`;
      
      const checkoutUrl = await subscriptionService.getCheckoutURL({
        productId,
        quantity,
        trialPeriodDays,
        returnUrl,
      });

      // Open checkout in WebBrowser
      const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
        // iOS options
        dismissButtonStyle: 'cancel',
        readerMode: false,
        animated: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        // Android options
        showTitle: true,
        toolbarColor: Colors.primary || '#007AFF',
        secondaryToolbarColor: 'black',
        navigationBarColor: 'black',
        enableUrlBarHiding: true,
        enableDefaultShare: true,
        showInRecents: true,
      } as any);

      // Handle result
      if (result.type === 'cancel') {
        onCancel?.();
      } else if (result.type === 'dismiss') {
        // User dismissed - check if payment was successful via deep link
        // Deep link handler will call onSuccess if payment succeeded
      }
    } catch (error: any) {
      logger.error('Subscription checkout error:', error);
      Alert.alert('Error', 'Failed to open payment page. Please try again.');
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCheckout}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {productName ? `Subscribe to ${productName}` : 'Subscribe Now'}
          </Text>
        )}
      </TouchableOpacity>
      {trialPeriodDays && trialPeriodDays > 0 && (
        <Text style={styles.trialText}>
          {trialPeriodDays}-day free trial
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  button: {
    backgroundColor: Colors.buttonPrimary,
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
  trialText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

