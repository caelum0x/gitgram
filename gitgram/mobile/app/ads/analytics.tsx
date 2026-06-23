import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { adService } from '../../services/adService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AdAnalyticsScreen() {
  const router = useRouter();
  const [ads, setAds] = useState<any[]>([]);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMyAds();
  }, []);

  useEffect(() => {
    if (selectedAd) {
      loadAdAnalytics(selectedAd.id);
    }
  }, [selectedAd]);

  const loadMyAds = async () => {
    try {
      setLoading(true);
      const response = await adService.getMyAds();
      setAds(response.ads || []);
    } catch (error) {
      logger.error('Load my ads error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdAnalytics = async (adId: string) => {
    try {
      const response = await adService.getAdAnalytics(adId);
      setAnalytics(response.analytics);
    } catch (error) {
      logger.error('Load ad analytics error:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Ad Analytics" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Ad Analytics" />
      {ads.length > 0 ? (
        <ScrollView style={styles.content}>
          <View style={styles.adSelector}>
            <Text style={styles.sectionTitle}>Select Ad</Text>
            {ads.map((ad) => (
              <TouchableOpacity
                key={ad.id}
                style={[
                  styles.adOption,
                  selectedAd?.id === ad.id && styles.selectedAd,
                ]}
                onPress={() => setSelectedAd(ad)}
              >
                <Text style={styles.adTitle}>{ad.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {analytics && (
            <View style={styles.analyticsContainer}>
              <Text style={styles.sectionTitle}>Analytics</Text>

              <View style={styles.statCard}>
                <Icon name="visibility" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>{analytics.views}</Text>
                  <Text style={styles.statLabel}>Total Views</Text>
                </View>
              </View>

              <View style={styles.statCard}>
                <Icon name="mouse" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>{analytics.clicks}</Text>
                  <Text style={styles.statLabel}>Total Clicks</Text>
                </View>
              </View>

              <View style={styles.statCard}>
                <Icon name="percent" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>
                    {analytics.clickThroughRate?.toFixed(2)}%
                  </Text>
                  <Text style={styles.statLabel}>Click-Through Rate</Text>
                </View>
              </View>

              <View style={styles.statCard}>
                <Icon name="attach-money" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>${analytics.spent.toFixed(2)}</Text>
                  <Text style={styles.statLabel}>Total Spent</Text>
                </View>
              </View>

              <View style={styles.statCard}>
                <Icon name="trending-up" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>
                    ${analytics.costPerClick?.toFixed(2)}
                  </Text>
                  <Text style={styles.statLabel}>Cost Per Click</Text>
                </View>
              </View>

              <View style={styles.statCard}>
                <Icon name="trending-down" size={24} color={Colors.accent} />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>
                    ${analytics.costPerView?.toFixed(4)}
                  </Text>
                  <Text style={styles.statLabel}>Cost Per View</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <EmptyState
          title="No ads yet"
          message="Create an ad to see analytics"
          icon="📊"
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
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  adSelector: {
    marginBottom: 32,
  },
  adOption: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedAd: {
    borderColor: Colors.accent,
  },
  adTitle: {
    fontSize: 16,
    color: Colors.text,
  },
  analyticsContainer: {
    marginTop: 20,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  statInfo: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.accent,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

