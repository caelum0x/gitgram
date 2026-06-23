import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { logger } from '../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { storeService } from '../../services/storeService';

export default function StoreBrowseScreen() {
  const router = useRouter();
  const filterParams = useLocalSearchParams<{
    category?: string;
    priceMin?: string;
    priceMax?: string;
    sort?: string;
    minRating?: string;
  }>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'all' | 'projects' | 'code' | 'templates'>('all');

  useEffect(() => {
    // If filters were passed from the filters screen, apply the category
    if (filterParams.category) {
      setCategory(filterParams.category as any);
    }
  }, [filterParams.category]);

  useEffect(() => {
    loadStoreItems();
  }, [category, filterParams.sort, filterParams.priceMin, filterParams.priceMax, filterParams.minRating]);

  const loadStoreItems = async () => {
    try {
      setLoading(true);
      const categoryParam = filterParams.category || (category === 'all' ? undefined : category);
      const response = await storeService.getItems(categoryParam, 1, 20);
      let filteredItems = response.items || [];

      // Client-side filtering for price range and rating until backend supports these filters
      if (filterParams.priceMin) {
        const min = parseFloat(filterParams.priceMin);
        filteredItems = filteredItems.filter((item: any) => (item.price || 0) >= min);
      }
      if (filterParams.priceMax) {
        const max = parseFloat(filterParams.priceMax);
        filteredItems = filteredItems.filter((item: any) => (item.price || 0) <= max);
      }
      if (filterParams.minRating) {
        const minRating = parseFloat(filterParams.minRating);
        filteredItems = filteredItems.filter((item: any) => (item.rating || 0) >= minRating);
      }

      // Client-side sorting
      if (filterParams.sort) {
        switch (filterParams.sort) {
          case 'price_asc':
            filteredItems.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
            break;
          case 'price_desc':
            filteredItems.sort((a: any, b: any) => (b.price || 0) - (a.price || 0));
            break;
          case 'oldest':
            filteredItems.sort((a: any, b: any) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            break;
          case 'popular':
            filteredItems.sort((a: any, b: any) => (b.purchaseCount || 0) - (a.purchaseCount || 0));
            break;
          case 'rating':
            filteredItems.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
            break;
          // 'newest' is the default from the API
        }
      }

      setItems(filteredItems);
    } catch (error) {
      logger.error('Load store items error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => router.push(`/store/item/${item.id}`)}
    >
      {item.image && (
        <Image source={{ uri: item.image }} style={styles.itemImage} />
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.itemFooter}>
          <Text style={styles.itemPrice}>${item.price}</Text>
          <View style={styles.itemStats}>
            <Icon name="star" size={16} color={Colors.accent} />
            <Text style={styles.itemRating}>{item.rating || '0.0'}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Store" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Store" />
      <View style={styles.categories}>
        <TouchableOpacity
          style={[styles.categoryTab, category === 'all' && styles.activeTab]}
          onPress={() => setCategory('all')}
        >
          <Text style={[styles.categoryText, category === 'all' && styles.activeText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryTab, category === 'projects' && styles.activeTab]}
          onPress={() => setCategory('projects')}
        >
          <Text style={[styles.categoryText, category === 'projects' && styles.activeText]}>
            Projects
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryTab, category === 'code' && styles.activeTab]}
          onPress={() => setCategory('code')}
        >
          <Text style={[styles.categoryText, category === 'code' && styles.activeText]}>
            Code
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryTab, category === 'templates' && styles.activeTab]}
          onPress={() => setCategory('templates')}
        >
          <Text style={[styles.categoryText, category === 'templates' && styles.activeText]}>
            Templates
          </Text>
        </TouchableOpacity>
      </View>

      {items.length > 0 ? (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={2}
        />
      ) : (
        <EmptyState
          title="No items available"
          message="Check back later for new items"
          icon="🛒"
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
  categories: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  activeTab: {
    backgroundColor: Colors.accent,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeText: {
    color: Colors.text,
  },
  listContent: {
    padding: 16,
  },
  itemCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    margin: 8,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: 150,
  },
  itemInfo: {
    padding: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  itemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemRating: {
    fontSize: 14,
    color: Colors.text,
  },
});

