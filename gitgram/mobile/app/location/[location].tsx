import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import PostCard from '../../components/Post/PostCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { postService } from '../../services/postService';
import { locationService } from '../../services/locationService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function LocationFeedScreen() {
  const { location } = useLocalSearchParams<{ location: string }>();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadPosts();
  }, [location]);

  const loadPosts = async (pageNum = 1, refresh = false) => {
    try {
      // First try the dedicated location search endpoint via geocoding,
      // then fall back to text-based post search with the location name
      let postsData: any[] = [];
      let totalHasMore = false;

      try {
        const geocoded = await locationService.geocodeAddress(location || '');
        if (geocoded?.latitude && geocoded?.longitude) {
          const response = await locationService.getNearbyPosts(
            geocoded.latitude,
            geocoded.longitude,
            10,
            20
          );
          postsData = Array.isArray(response) ? response : response.posts || [];
          totalHasMore = postsData.length >= 20;
        }
      } catch {
        // Geocoding or nearby posts endpoint not available, fall back to search
      }

      // Fall back to text search if location-based search returned no results
      if (postsData.length === 0) {
        const response = await postService.searchPosts(location || '', pageNum, 20);
        postsData = response.posts || [];
        totalHasMore = response.pagination?.page < response.pagination?.pages;
      }

      if (refresh) {
        setPosts(postsData);
      } else {
        setPosts((prev) => [...prev, ...postsData]);
      }
      setHasMore(totalHasMore);
    } catch (error) {
      logger.error('Load location posts error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadPosts(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPosts(nextPage);
    }
  };

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <Header title={location || 'Location'} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={location || 'Location'}
        rightIcon="location-on"
      />
      <View style={styles.locationHeader}>
        <Icon name="location-on" size={20} color={Colors.accent} />
        <Text style={styles.locationText}>{location}</Text>
      </View>
      <FlatList
        data={posts}
        renderItem={({ item }) => <PostCard post={item} />}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title={`No posts from ${location}`}
              message="Be the first to post from this location!"
            />
          ) : null
        }
        ListFooterComponent={
          hasMore && posts.length > 0 ? <LoadingSpinner /> : null
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
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  locationText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});

