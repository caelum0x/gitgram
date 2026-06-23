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
import { storeService } from '../../services/storeService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function PurchaseHistoryScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPurchaseHistory();
  }, []);

  const loadPurchaseHistory = async () => {
    try {
      setLoading(true);
      const response = await storeService.getPurchaseHistory();
      setTransactions(response.transactions || []);
    } catch (error) {
      logger.error('Load purchase history error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#4caf50';
      case 'pending':
        return Colors.accent;
      case 'refunded':
        return Colors.error || '#ff4444';
      default:
        return Colors.textSecondary;
    }
  };

  const renderTransaction = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.transactionCard}
      onPress={() => router.push(`/store/item/${item.item.id}`)}
    >
      <View style={styles.transactionInfo}>
        <Text style={styles.itemTitle}>{item.item.title}</Text>
        <Text style={styles.sellerName}>Sold by: @{item.item.seller.username}</Text>
        <Text style={styles.transactionDate}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionAmount}>${item.amount}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        >
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Purchase History" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Purchase History" />
      {transactions.length > 0 ? (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No purchases yet"
          message="Items you purchase will appear here"
          icon="📦"
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
  listContent: {
    padding: 16,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  sellerName: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  transactionDetails: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.accent,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'uppercase',
  },
});

