import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { storeService } from '../../../services/storeService';

export default function StoreItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadItem(id);
    }
  }, [id]);

  const loadItem = async (itemId: string) => {
    try {
      setLoading(true);
      const response = await storeService.getItem(itemId);
      setItem(response.item);
    } catch (error) {
      logger.error('Load store item error:', error);
      Alert.alert('Error', 'Failed to load item');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = () => {
    Alert.alert(
      'Purchase Item',
      `Are you sure you want to purchase "${item?.title}" for $${item?.price}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            try {
              if (!id || typeof id !== 'string') return;
              await storeService.purchaseItem(id);
              Alert.alert('Success', 'Item purchased successfully!');
            } catch (error) {
              logger.error('Purchase error:', error);
              Alert.alert('Error', 'Failed to purchase item');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Store Item" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Header title="Store Item" />
        <EmptyState title="Item not found" message="This item could not be found" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title={item.title} />
      {item.image && (
        <Image source={{ uri: item.image }} style={styles.itemImage} />
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.price}>${item.price}</Text>
        </View>

        {item.seller && (
          <TouchableOpacity
            style={styles.sellerInfo}
            onPress={() => router.push(`/profile/${item.seller.id}`)}
          >
            <Text style={styles.sellerLabel}>Sold by:</Text>
            <Text style={styles.sellerName}>@{item.seller.username}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Icon name="star" size={20} color={Colors.accent} />
            <Text style={styles.statText}>{item.rating || '0.0'}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="shopping-cart" size={20} color={Colors.accent} />
            <Text style={styles.statText}>{item.salesCount || 0} sales</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{item.description}</Text>

        {item.features && (
          <>
            <Text style={styles.sectionTitle}>Features</Text>
            {item.features.map((feature: string, index: number) => (
              <View key={index} style={styles.featureItem}>
                <Icon name="check-circle" size={20} color={Colors.accent} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </>
        )}

        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={handlePurchase}
        >
          <Text style={styles.purchaseButtonText}>Purchase for ${item.price}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  itemImage: {
    width: '100%',
    height: 300,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  sellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sellerLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  sellerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },
  stats: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 16,
    color: Colors.text,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: Colors.text,
  },
  purchaseButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  purchaseButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
});

