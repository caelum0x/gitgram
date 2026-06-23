import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
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
import { useLocationStore } from '../../store/locationStore';

export default function LocationSearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { selectLocation } = useLocationStore();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await locationService.geocodeAddress(searchQuery);
      if (response.coordinates) {
        setResults([response.coordinates]);
      } else {
        setResults([]);
      }
    } catch (error) {
      logger.error('Location search error:', error);
      Alert.alert('Error', 'Failed to search location');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = (location: { latitude: number; longitude: number; address?: string }) => {
    // Pass location back via the location store
    selectLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      placeName: location.address,
    });

    // Navigate back two screens (search -> picker -> original screen)
    // Using router.back() twice or navigating directly
    router.dismiss(2);
  };

  return (
    <View style={styles.container}>
      <Header title="Search Location" />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for a location..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Icon name="search" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleSelectLocation(item)}
            >
              <Icon name="location-on" size={24} color={Colors.accent} />
              <View style={styles.resultInfo}>
                <Text style={styles.resultAddress}>
                  {item.address || 'Location'}
                </Text>
                <Text style={styles.resultCoords}>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.listContent}
        />
      ) : searchQuery ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Enter a location to search</Text>
        </View>
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
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultAddress: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  resultCoords: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});

