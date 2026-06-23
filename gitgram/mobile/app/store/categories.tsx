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
import { logger } from '../../utils/logger';
import { storeService } from '../../services/storeService';
import Icon from 'react-native-vector-icons/MaterialIcons';

const categories = [
  { id: 'project', name: 'Projects', icon: 'folder', count: 0 },
  { id: 'code', name: 'Code Snippets', icon: 'code', count: 0 },
  { id: 'template', name: 'Templates', icon: 'description', count: 0 },
  { id: 'library', name: 'Libraries', icon: 'library-books', count: 0 },
  { id: 'tool', name: 'Tools', icon: 'build', count: 0 },
  { id: 'other', name: 'Other', icon: 'more-horiz', count: 0 },
];

export default function StoreCategoriesScreen() {
  const router = useRouter();
  const [categoriesWithCounts, setCategoriesWithCounts] = useState(categories);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategoryCounts();
  }, []);

  const loadCategoryCounts = async () => {
    try {
      const response = await storeService.getCategoryCounts();
      const counts = response.counts || response;
      setCategoriesWithCounts(
        categories.map((cat) => ({
          ...cat,
          count: counts[cat.id] || 0,
        }))
      );
    } catch (error) {
      logger.error('Load category counts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCategory = ({ item }: { item: typeof categories[0] }) => (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => router.push(`/store/browse?category=${item.id}`)}
    >
      <View style={styles.categoryIcon}>
        <Icon name={item.icon} size={32} color={Colors.accent} />
      </View>
      <Text style={styles.categoryName}>{item.name}</Text>
      <Text style={styles.categoryCount}>{item.count} items</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Store Categories" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Store Categories" />
      <FlatList
        data={categoriesWithCounts}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        numColumns={2}
      />
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
  categoryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    margin: 8,
    alignItems: 'center',
  },
  categoryIcon: {
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  categoryCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

