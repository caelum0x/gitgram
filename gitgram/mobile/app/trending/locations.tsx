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
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { locationService } from '../../services/locationService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function TrendingLocationsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTrendingLocations();
  }, []);

  const loadTrendingLocations = async () => {
    try {
      const response = await locationService.getTrendingLocations(50);
      const data = Array.isArray(response) ? response : response.locations || [];
      setLocations(
        data.map((item: any) => ({
          location: item.name || item.location,
          count: item.postCount || item.count || item._count?.posts || 0,
        }))
      );
    } catch (error) {
      logger.error('Load trending locations error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTrendingLocations();
  };

  const renderLocation = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={styles.locationItem}
      onPress={() => router.push(`/location/${encodeURIComponent(item.location)}`)}
    >
      <View style={styles.rank}>
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>
      <Icon name="location-on" size={24} color={Colors.accent} />
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.location}</Text>
        <Text style={styles.locationCount}>
          {item.count} {item.count === 1 ? 'post' : 'posts'}
        </Text>
      </View>
      <Icon name="trending-up" size={20} color={Colors.accent} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Trending Locations" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Trending Locations" />
      <FlatList
        data={locations}
        renderItem={renderLocation}
        keyExtractor={(item) => item.location}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No trending locations"
            message="Check back later for trending locations!"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  locationCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

