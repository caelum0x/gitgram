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
import PostCard from '../../components/Post/PostCard';
import { locationService } from '../../services/locationService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function LocationFeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (location) {
      loadLocationPosts();
    }
  }, [location]);

  const getCurrentLocation = async () => {
    try {
      // Try to use expo-location if available
      try {
        const Location = (await import('expo-location')).default;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          });
          return;
        }
      } catch (locationError) {
        // expo-location not available or permission denied, use fallback
        logger.warn('expo-location not available, using default location');
      }
      
      // Fallback to default location (San Francisco)
      setLocation({ latitude: 37.7749, longitude: -122.4194 });
    } catch (error) {
      logger.error('Get current location error:', error);
      setLoading(false);
    }
  };

  const loadLocationPosts = async () => {
    if (!location) return;

    try {
      setLoading(true);
      const response = await locationService.getNearbyPosts(
        location.latitude,
        location.longitude,
        10,
        20
      );
      setPosts(response.posts || []);
    } catch (error) {
      logger.error('Load location posts error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Location Feed" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Location Feed" />
      {location && (
        <View style={styles.locationHeader}>
          <Icon name="location-on" size={20} color={Colors.accent} />
          <Text style={styles.locationText}>
            Showing posts near you ({location.latitude.toFixed(2)}, {location.longitude.toFixed(2)})
          </Text>
        </View>
      )}

      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={({ item }) => <PostCard post={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No posts nearby"
          message="Check back later for posts in your area"
          icon="📍"
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
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingBottom: 20,
  },
});

