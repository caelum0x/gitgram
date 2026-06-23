import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { useAuthStore } from '../../../store/authStore';
import { logger } from '../../../utils/logger';
import { userService } from '../../../services/userService';
import { Image } from 'expo-image';

export default function SwitchAccountScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await userService.getLinkedAccounts();
      const linkedAccounts = response.accounts || [];
      // Add current account
      if (user) {
        setAccounts([{ ...user, isCurrent: true }, ...linkedAccounts]);
      } else {
        setAccounts(linkedAccounts);
      }
    } catch (error) {
      logger.error('Load accounts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === user?.id) {
      Alert.alert('Info', 'You are already using this account');
      return;
    }

    try {
      await userService.switchAccount(accountId);
      Alert.alert('Success', 'Account switched successfully');
      router.replace('/(tabs)/home');
    } catch (error) {
      logger.error('Switch account error:', error);
      Alert.alert('Error', 'Failed to switch account');
    }
  };

  const renderAccount = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.accountItem, item.isCurrent && styles.currentAccount]}
      onPress={() => handleSwitchAccount(item.id)}
      disabled={item.isCurrent}
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
      <View style={styles.accountInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        {item.name && <Text style={styles.name}>{item.name}</Text>}
      </View>
      {item.isCurrent && (
        <Text style={styles.currentBadge}>Current</Text>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Switch Account" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Switch Account" />
      {accounts.length > 0 ? (
        <FlatList
          data={accounts}
          renderItem={renderAccount}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No other accounts"
          message="Link additional accounts to switch between them"
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
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  currentAccount: {
    backgroundColor: Colors.surface,
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
  accountInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  currentBadge: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
  },
});

