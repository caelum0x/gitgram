import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { postService } from '../../services/postService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function LocationSearchScreen() {
  const { query } = useLocalSearchParams<{ query?: string }>();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(query || '');
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setLocations([]);
      return;
    }

    setLoading(true);
    try {
      const response = await postService.searchPosts(searchQuery, 1, 20);
      // Extract unique locations from posts
      const uniqueLocations = new Map();
      (response.posts || []).forEach((post: any) => {
        if (post.location) {
          if (!uniqueLocations.has(post.location)) {
            uniqueLocations.set(post.location, {
              location: post.location,
              postsCount: 0,
            });
          }
          uniqueLocations.get(post.location).postsCount++;
        }
      });
      setLocations(Array.from(uniqueLocations.values()));
    } catch (error) {
      logger.error('Search locations error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    handleSearch();
  };

  const renderLocation = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.locationItem}
      onPress={() => router.push(`/location/${encodeURIComponent(item.location)}`)}
    >
      <Icon name="location-on" size={24} color={Colors.accent} />
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.location}</Text>
        <Text style={styles.locationCount}>
          {item.postsCount} {item.postsCount === 1 ? 'post' : 'posts'}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Search Locations" />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search locations..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <Icon name="search" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {loading && locations.length === 0 ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={locations}
          renderItem={renderLocation}
          keyExtractor={(item) => item.location}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            searchQuery.trim() ? (
              <EmptyState
                title="No locations found"
                message={`No locations match "${searchQuery}"`}
              />
            ) : (
              <EmptyState
                title="Search locations"
                message="Enter a location to search"
              />
            )
          }
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
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
  locationCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

