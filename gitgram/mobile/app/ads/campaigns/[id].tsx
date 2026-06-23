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
import { adCampaignService } from '../../../services/adCampaignService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { Colors } from '../../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CampaignDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadCampaign();
    loadAnalytics();
  }, [campaignId]);

  const loadCampaign = async () => {
    try {
      const response = await adCampaignService.getCampaign(campaignId);
      setCampaign(response.campaign);
    } catch (error) {
      logger.error('Load campaign error:', error);
      Alert.alert('Error', 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await adCampaignService.getCampaignAnalytics(campaignId);
      setAnalytics(response);
    } catch (error) {
      logger.error('Load analytics error:', error);
    }
  };

  const handlePause = async () => {
    try {
      setActionLoading(true);
      await adCampaignService.pauseCampaign(campaignId);
      Alert.alert('Success', 'Campaign paused');
      loadCampaign();
    } catch (error: any) {
      logger.error('Pause campaign error:', error);
      Alert.alert('Error', error.message || 'Failed to pause campaign');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading(true);
      await adCampaignService.resumeCampaign(campaignId);
      Alert.alert('Success', 'Campaign resumed');
      loadCampaign();
    } catch (error: any) {
      logger.error('Resume campaign error:', error);
      Alert.alert('Error', error.message || 'Failed to resume campaign');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFund = () => {
    router.push(`/ads/campaigns/${campaignId}/fund`);
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Campaign Details" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={styles.container}>
        <Header title="Campaign Details" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Campaign not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={campaign.name} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    campaign.status === 'active'
                      ? Colors.success || '#34C759'
                      : campaign.status === 'paused'
                      ? Colors.warning || '#FF9500'
                      : Colors.textSecondary || '#666',
                },
              ]}
            />
            <Text style={styles.statusText}>{campaign.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campaign Info</Text>
          {campaign.description && (
            <Text style={styles.description}>{campaign.description}</Text>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>{campaign.type}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Billing:</Text>
            <Text style={styles.infoValue}>{campaign.billingType.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Budget:</Text>
            <Text style={styles.infoValue}>{formatCurrency(campaign.budget)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Spent:</Text>
            <Text style={styles.infoValue}>{formatCurrency(campaign.spent)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Remaining:</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(campaign.budget - campaign.spent)}
            </Text>
          </View>
          {campaign.dailyBudget && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Daily Budget:</Text>
              <Text style={styles.infoValue}>{formatCurrency(campaign.dailyBudget)}</Text>
            </View>
          )}
        </View>

        {analytics && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Analytics</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{analytics.metrics.impressions.toLocaleString()}</Text>
                <Text style={styles.metricLabel}>Impressions</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{analytics.metrics.clicks.toLocaleString()}</Text>
                <Text style={styles.metricLabel}>Clicks</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{analytics.metrics.ctr}%</Text>
                <Text style={styles.metricLabel}>CTR</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatCurrency(analytics.metrics.spend)}</Text>
                <Text style={styles.metricLabel}>Spend</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {campaign.status === 'active' ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.pauseButton]}
              onPress={handlePause}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Icon name="pause" size={20} color="white" />
                  <Text style={styles.actionButtonText}>Pause Campaign</Text>
                </>
              )}
            </TouchableOpacity>
          ) : campaign.status === 'paused' ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.resumeButton]}
              onPress={handleResume}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Icon name="play-arrow" size={20} color="white" />
                  <Text style={styles.actionButtonText}>Resume Campaign</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.actionButton, styles.fundButton]}
            onPress={handleFund}
          >
            <Icon name="attach-money" size={20} color="white" />
            <Text style={styles.actionButtonText}>Add Funds</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.adsButton]}
            onPress={() => router.push(`/ads/campaigns/${campaignId}/ads`)}
          >
            <Icon name="campaign" size={20} color="white" />
            <Text style={styles.actionButtonText}>View Ads</Text>
          </TouchableOpacity>
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.primary || '#007AFF',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 8,
    minHeight: 50,
  },
  pauseButton: {
    backgroundColor: Colors.warning,
  },
  resumeButton: {
    backgroundColor: Colors.success,
  },
  fundButton: {
    backgroundColor: Colors.buttonPrimary,
  },
  adsButton: {
    backgroundColor: Colors.buttonSecondary,
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

