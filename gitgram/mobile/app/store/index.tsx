import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, ScrollView, View, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Input } from '../../components/ui/Input';
import { Colors } from '../../constants/Colors';
import { storeService, StoreItem } from '../../services/storeService';
import { Image } from 'expo-image';

export default function StoreScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<StoreItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await storeService.getItems();
      setProducts(response.items || response.products || []);
    } catch (error) {
      console.error('Load products error:', error);
    }
  };

  const renderItem = ({ item }: { item: StoreItem }) => (
    <TouchableOpacity 
      style={styles.item}
      onPress={() => router.push(`/store/item/${item.id}`)}
    >
      <Image source={{ uri: item.images?.[0] }} style={styles.image} />
      <View style={styles.details}>
        <ThemedText style={styles.name} numberOfLines={1}>{item.name}</ThemedText>
        <ThemedText style={styles.price}>${item.price.toFixed(2)}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Store</ThemedText>
        <TouchableOpacity onPress={() => router.push('/store/sell')}>
          <ThemedText type="link">Sell</ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Input
          placeholder="Search items..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredProducts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columnWrapper}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  list: {
    padding: 10,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  item: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  details: {
    padding: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: 'bold',
  },
});

