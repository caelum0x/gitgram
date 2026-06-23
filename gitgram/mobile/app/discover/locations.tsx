import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { logger } from '../../utils/logger';
import { locationService } from '../../services/locationService';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function TrendingLocationsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrendingLocations();
  }, []);

  const loadTrendingLocations = async () => {
    try {
      const response = await locationService.getTrendingLocations(50);
      setLocations(response.locations || []);
    } catch (error) {
      logger.error('Load trending locations error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderLocation = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.locationItem}
      onPress={() => router.push(`/location/${encodeURIComponent(item.name)}`)}
    >
      <Icon name="location-on" size={24} color={Colors.accent} />
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.name}</Text>
        <Text style={styles.postsCount}>
          {item.postsCount.toLocaleString()} posts
        </Text>
      </View>
      <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
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
      {locations.length > 0 ? (
        <FlatList
          data={locations}
          renderItem={renderLocation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No trending locations"
          message="Locations will appear here as they trend"
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
  listContent: {
    padding: 16,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
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
  postsCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

