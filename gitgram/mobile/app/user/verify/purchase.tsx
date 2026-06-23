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
import { useRouter } from 'expo-router';
import { verificationPurchaseService } from '../../../services/verificationPurchaseService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { Colors } from '../../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { paymentDeepLinkHandler } from '../../../utils/paymentDeepLinkHandler';

export default function VerificationPurchaseScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'standard' | 'golden'>('standard');
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [purchaseStatus, setPurchaseStatus] = useState<any>(null);

  useEffect(() => {
    loadPricing();
    loadPurchaseStatus();
    
    // Listen for payment completion
    const unsubscribe = paymentDeepLinkHandler.addListener((params) => {
      if (params.status === 'succeeded' || params.status === 'active') {
        Alert.alert('Success', 'Verification purchase completed!', [
          {
            text: 'OK',
            onPress: () => {
              loadPurchaseStatus();
              router.back();
            },
          },
        ]);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadPricing = async () => {
    try {
      const standardMonthly = await verificationPurchaseService.getPricing('standard', 'monthly');
      const standardAnnual = await verificationPurchaseService.getPricing('standard', 'annual');
      const goldenMonthly = await verificationPurchaseService.getPricing('golden', 'monthly');
      const goldenAnnual = await verificationPurchaseService.getPricing('golden', 'annual');

      setPricing({
        standard: { monthly: standardMonthly.price, annual: standardAnnual.price },
        golden: { monthly: goldenMonthly.price, annual: goldenAnnual.price },
      });
    } catch (error) {
      logger.error('Load pricing error:', error);
    }
  };

  const loadPurchaseStatus = async () => {
    try {
      const status = await verificationPurchaseService.getPurchaseStatus();
      setPurchaseStatus(status);
    } catch (error) {
      logger.error('Load purchase status error:', error);
    }
  };

  const handlePurchase = async () => {
    try {
      setLoading(true);
      const result = await verificationPurchaseService.createCheckout(selectedType, selectedPeriod);

      if (result.checkoutUrl) {
        await WebBrowser.openBrowserAsync(result.checkoutUrl, {
          dismissButtonStyle: 'cancel',
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        } as any);
      }
    } catch (error: any) {
      logger.error('Purchase error:', error);
      Alert.alert('Error', error.message || 'Failed to create checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    Alert.alert(
      'Cancel Verification',
      'Are you sure you want to cancel your verification? Your badge will be removed at the end of the billing period.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await verificationPurchaseService.cancelPurchase();
              Alert.alert('Success', 'Verification cancelled successfully');
              loadPurchaseStatus();
            } catch (error: any) {
              logger.error('Cancel error:', error);
              Alert.alert('Error', error.message || 'Failed to cancel verification');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleUpgrade = async () => {
    Alert.alert(
      'Upgrade to Gold',
      'Upgrade your verification to Gold for enhanced features and visibility.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: async () => {
            try {
              setLoading(true);
              await verificationPurchaseService.upgradeToGolden();
              Alert.alert('Success', 'Upgraded to Gold verification!');
              loadPurchaseStatus();
            } catch (error: any) {
              logger.error('Upgrade error:', error);
              Alert.alert('Error', error.message || 'Failed to upgrade');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDowngrade = async () => {
    Alert.alert(
      'Downgrade to Standard',
      'Downgrade your verification to Standard. You will receive a credit for the remaining period.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Downgrade',
          onPress: async () => {
            try {
              setLoading(true);
              await verificationPurchaseService.downgradeToStandard();
              Alert.alert('Success', 'Downgraded to Standard verification');
              loadPurchaseStatus();
            } catch (error: any) {
              logger.error('Downgrade error:', error);
              Alert.alert('Error', error.message || 'Failed to downgrade');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getPrice = () => {
    if (!pricing) return 'Loading...';
    return `$${pricing[selectedType][selectedPeriod].toFixed(2)}/${selectedPeriod === 'monthly' ? 'mo' : 'yr'}`;
  };

  if (!pricing) {
    return (
      <View style={styles.container}>
        <Header title="Purchase Verification" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Purchase Verification" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {purchaseStatus?.hasVerification && (
          <View style={styles.currentStatusCard}>
            <View style={styles.statusHeader}>
              <Icon
                name={purchaseStatus.type === 'golden' ? 'verified' : 'check-circle'}
                size={24}
                color={purchaseStatus.type === 'golden' ? Colors.warning || '#FFD700' : Colors.primary || '#007AFF'}
              />
              <Text style={styles.statusText}>
                {purchaseStatus.type === 'golden' ? 'Gold' : 'Standard'} Verification Active
              </Text>
            </View>
            {purchaseStatus.expiresAt && (
              <Text style={styles.expiresText}>
                Renews: {new Date(purchaseStatus.expiresAt).toLocaleDateString()}
              </Text>
            )}
            <View style={styles.statusActions}>
              {purchaseStatus.type === 'standard' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.upgradeButton]}
                  onPress={handleUpgrade}
                  disabled={loading}
                >
                  <Text style={styles.actionButtonText}>Upgrade to Gold</Text>
                </TouchableOpacity>
              )}
              {purchaseStatus.type === 'golden' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.downgradeButton]}
                  onPress={handleDowngrade}
                  disabled={loading}
                >
                  <Text style={styles.actionButtonText}>Downgrade to Standard</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCancel}
                disabled={loading}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!purchaseStatus?.hasVerification && (
          <>
            <Text style={styles.sectionTitle}>Choose Verification Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  selectedType === 'standard' && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType('standard')}
              >
                <View style={styles.typeHeader}>
                  <Icon name="check-circle" size={32} color={Colors.primary || '#007AFF'} />
                  <Text style={styles.typeName}>Standard</Text>
                </View>
                <Text style={styles.typeDescription}>
                  Blue verification badge for individuals and creators
                </Text>
                <Text style={styles.typePrice}>
                  ${pricing.standard[selectedPeriod].toFixed(2)}/{selectedPeriod === 'monthly' ? 'mo' : 'yr'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeCard,
                  selectedType === 'golden' && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType('golden')}
              >
                <View style={styles.typeHeader}>
                  <Icon name="verified" size={32} color={Colors.warning || '#FFD700'} />
                  <Text style={styles.typeName}>Gold</Text>
                </View>
                <Text style={styles.typeDescription}>
                  Premium gold badge for companies and organizations
                </Text>
                <Text style={styles.typePrice}>
                  ${pricing.golden[selectedPeriod].toFixed(2)}/{selectedPeriod === 'monthly' ? 'mo' : 'yr'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Billing Period</Text>
            <View style={styles.periodSelector}>
              <TouchableOpacity
                style={[
                  styles.periodOption,
                  selectedPeriod === 'monthly' && styles.periodOptionSelected,
                ]}
                onPress={() => setSelectedPeriod('monthly')}
              >
                <Text style={styles.periodText}>Monthly</Text>
                <Text style={styles.periodSubtext}>
                  ${pricing[selectedType].monthly.toFixed(2)}/month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.periodOption,
                  selectedPeriod === 'annual' && styles.periodOptionSelected,
                ]}
                onPress={() => setSelectedPeriod('annual')}
              >
                <Text style={styles.periodText}>Annual</Text>
                <Text style={styles.periodSubtext}>
                  ${pricing[selectedType].annual.toFixed(2)}/year
                  <Text style={styles.savingsText}>
                    {' '}(Save ${((pricing[selectedType].monthly * 12 - pricing[selectedType].annual) / (pricing[selectedType].monthly * 12) * 100).toFixed(0)}%)
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Type:</Text>
                <Text style={styles.summaryValue}>
                  {selectedType === 'golden' ? 'Gold' : 'Standard'} Verification
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Period:</Text>
                <Text style={styles.summaryValue}>
                  {selectedPeriod === 'annual' ? 'Annual' : 'Monthly'}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.summaryLabel}>Total:</Text>
                <Text style={styles.summaryTotalValue}>{getPrice()}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.purchaseButton, loading && styles.purchaseButtonDisabled]}
              onPress={handlePurchase}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.purchaseButtonText}>Purchase Verification</Text>
              )}
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                • Verification badge will appear on your profile, posts, and comments
              </Text>
              <Text style={styles.infoText}>
                • Subscription renews automatically
              </Text>
              <Text style={styles.infoText}>
                • Cancel anytime, badge removed at end of billing period
              </Text>
            </View>
          </>
        )}
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
  currentStatusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  expiresText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  statusActions: {
    gap: 8,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButton: {
    backgroundColor: Colors.warning,
  },
  downgradeButton: {
    backgroundColor: Colors.buttonSecondary,
  },
  cancelButton: {
    backgroundColor: Colors.error,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 12,
  },
  typeSelector: {
    gap: 12,
    marginBottom: 24,
  },
  typeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  typeCardSelected: {
    borderColor: Colors.accent,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  typeName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  typeDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  typePrice: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.accent,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  periodOption: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  periodOptionSelected: {
    borderColor: Colors.accent,
  },
  periodText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  periodSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  savingsText: {
    color: Colors.success,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryTotal: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.accent,
  },
  purchaseButton: {
    backgroundColor: Colors.buttonPrimary,
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginBottom: 24,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
});

