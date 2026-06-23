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
import { Image } from 'expo-image';
import { locationService } from '../../services/locationService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function NearbyUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (location) {
      loadNearbyUsers();
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

  const loadNearbyUsers = async () => {
    if (!location) return;

    try {
      setLoading(true);
      const response = await locationService.getNearbyUsers(
        location.latitude,
        location.longitude,
        10,
        20
      );
      setUsers(response.users || []);
    } catch (error) {
      logger.error('Load nearby users error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => router.push(`/profile/${item.id}`)}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        {item.distance && (
          <Text style={styles.distance}>
            {item.distance.toFixed(1)} km away
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Nearby Users" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Nearby Users" />
      {location && (
        <View style={styles.locationHeader}>
          <Icon name="location-on" size={20} color={Colors.accent} />
          <Text style={styles.locationText}>
            Users near you ({location.latitude.toFixed(2)}, {location.longitude.toFixed(2)})
          </Text>
        </View>
      )}

      {users.length > 0 ? (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No users nearby"
          message="Check back later for users in your area"
          icon="👥"
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
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  distance: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

