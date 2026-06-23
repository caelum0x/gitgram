import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { subscriptionService } from '../../../services/subscriptionService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import { Colors } from '../../../constants/Colors';

export default function UpdatePaymentMethodScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const subscriptionId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [paymentType, setPaymentType] = useState<'new' | 'existing'>('new');

  const handleUpdatePaymentMethod = async () => {
    try {
      setLoading(true);

      const returnUrl = `gitgram://payment-status?subscriptionId=${subscriptionId}`;

      const response = await subscriptionService.updatePaymentMethod(subscriptionId, {
        type: paymentType,
        returnUrl,
      });

      if (response.paymentLink) {
        // Open payment link in browser
        const supported = await Linking.canOpenURL(response.paymentLink);
        if (supported) {
          await Linking.openURL(response.paymentLink);
          Alert.alert(
            'Payment Method Update',
            'Please complete the payment method update in the browser. You will be redirected back to the app when done.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Cannot open payment link');
        }
      } else {
        Alert.alert('Success', 'Payment method updated successfully', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      }
    } catch (error: any) {
      logger.error('Update payment method error:', error);
      Alert.alert('Error', error.message || 'Failed to update payment method');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Update Payment Method" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Why update payment method?</Text>
          <Text style={styles.infoText}>
            Your subscription is on hold because the payment method failed. 
            Update your payment method to reactivate your subscription.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Payment Method Type</Text>
        <View style={styles.options}>
          <TouchableOpacity
            style={[
              styles.option,
              paymentType === 'new' && styles.optionSelected,
            ]}
            onPress={() => setPaymentType('new')}
          >
            <Text style={styles.optionTitle}>Add New Payment Method</Text>
            <Text style={styles.optionDescription}>
              Enter a new payment method
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.option,
              paymentType === 'existing' && styles.optionSelected,
            ]}
            onPress={() => setPaymentType('existing')}
          >
            <Text style={styles.optionTitle}>Use Existing Payment Method</Text>
            <Text style={styles.optionDescription}>
              Select from your saved payment methods
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            <Text style={styles.noteBold}>Note:</Text> Updating your payment method 
            will automatically create a charge for any remaining dues and reactivate 
            your subscription upon successful payment.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleUpdatePaymentMethod}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Update Payment Method</Text>
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
  infoBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning || '#FF9500',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  options: {
    gap: 12,
    marginBottom: 24,
  },
  option: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  optionSelected: {
    borderColor: Colors.primary || '#007AFF',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  noteBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  noteText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  noteBold: {
    fontWeight: '600',
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.primary || '#007AFF',
    padding: 16,
    borderRadius: 8,
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
});

