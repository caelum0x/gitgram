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
import EmptyState from '../../components/common/EmptyState';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'recent_searches';

export default function RecentSearchesScreen() {
  const router = useRouter();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    loadRecentSearches();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (error) {
      // Error handled silently
    }
  };

  const handleClear = async () => {
    try {
      await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentSearches([]);
    } catch (error) {
      // Error handled silently
    }
  };

  const handleSearch = (query: string) => {
    router.push(`/(tabs)/explore?query=${encodeURIComponent(query)}`);
  };

  const renderSearch = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={styles.searchItem}
      onPress={() => handleSearch(item)}
    >
      <Icon name="history" size={20} color={Colors.textSecondary} />
      <Text style={styles.searchText}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Recent Searches"
        rightIcon="delete"
        onRightPress={handleClear}
      />
      {recentSearches.length > 0 ? (
        <FlatList
          data={recentSearches}
          renderItem={renderSearch}
          keyExtractor={(item, index) => `${item}-${index}`}
        />
      ) : (
        <EmptyState
          title="No recent searches"
          message="Your recent searches will appear here"
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
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  searchText: {
    fontSize: 16,
    color: Colors.text,
  },
});

