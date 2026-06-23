import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { locationService } from '../../services/locationService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useLocationStore, LocationData } from '../../store/locationStore';

export default function LocationPickerScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);

  const { selectedLocation, selectLocation } = useLocationStore();

  // Load previously selected location if exists
  useEffect(() => {
    if (selectedLocation) {
      setLocation(selectedLocation);
    }
  }, []);

  const handleGetCurrentLocation = async () => {
    setLoading(true);
    try {
      // Try to use expo-location if available
      try {
        const Location = (await import('expo-location')).default;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant location permissions to use this feature.');
          setLoading(false);
          return;
        }
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
        setLocation(coords);
        
        // Try to get address via reverse geocoding
        try {
          const response = await locationService.geocodeAddress(
            `${coords.latitude},${coords.longitude}`
          );
          if (response.address) {
            setLocation({ ...coords, address: response.address });
          }
        } catch (geocodeError) {
          // Address lookup failed, but location is set
          logger.warn('Reverse geocoding failed:', geocodeError);
        }
      } catch (locationError) {
        // expo-location not available
        logger.warn('expo-location not available');
        Alert.alert('Info', 'Location services require expo-location package. Install it to enable this feature.');
      }
    } catch (error) {
      logger.error('Get current location error:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchLocation = async () => {
    // Navigate to location search screen
    router.push('/map/search');
  };

  const handleSave = () => {
    if (!location) {
      Alert.alert('Error', 'Please select a location');
      return;
    }

    // Pass location back to previous screen via the location store
    selectLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      placeName: location.placeName || location.address,
    });

    router.back();
  };

  return (
    <View style={styles.container}>
      <Header
        title="Pick Location"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <View style={styles.content}>
        <Text style={styles.instruction}>
          Select a location for your post or project. This helps others discover your content nearby.
        </Text>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={handleGetCurrentLocation}
          disabled={loading}
        >
          <Icon name="my-location" size={24} color={Colors.accent} />
          <Text style={styles.locationButtonText}>Use Current Location</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={handleSearchLocation}
        >
          <Icon name="search" size={24} color={Colors.accent} />
          <Text style={styles.locationButtonText}>Search Location</Text>
        </TouchableOpacity>

        {location && (
          <View style={styles.locationInfo}>
            <Icon name="location-on" size={24} color={Colors.accent} />
            <View style={styles.locationDetails}>
              <Text style={styles.locationText}>
                {location.address || 'Location selected'}
              </Text>
              <Text style={styles.locationCoords}>
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </Text>
            </View>
          </View>
        )}

        {loading && <LoadingSpinner />}
      </View>
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
    padding: 20,
  },
  instruction: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  locationButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  locationDetails: {
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

