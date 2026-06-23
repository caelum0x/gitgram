import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface StoreItemCardProps {
  item: {
    id: string;
    name: string;
    description?: string;
    price: number;
    currency?: string;
    images?: string[];
    rating?: number;
    salesCount?: number;
    category?: string;
  };
}

export default function StoreItemCard({ item }: StoreItemCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push(`/store/item/${item.id}`)}
    >
      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={styles.image} />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.price}>
            {item.currency || '$'}
            {item.price.toFixed(2)}
          </Text>
          {item.rating !== undefined && (
            <View style={styles.rating}>
              <Icon name="star" size={16} color={Colors.accent} />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {item.salesCount !== undefined && item.salesCount > 0 && (
          <Text style={styles.sales}>{item.salesCount} sales</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 200,
  },
  info: {
    padding: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: Colors.text,
  },
  sales: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

