import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import { messageService } from '../../services/messageService';
import { logger } from '../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function MessageSearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await messageService.searchMessages(searchQuery);
      setResults(response.messages || []);
    } catch (error) {
      logger.error('Search messages error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderResult = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => router.push(`/chat/${item.conversationId}`)}
    >
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultUsername}>@{item.user.username}</Text>
        <Text style={styles.resultMessage} numberOfLines={1}>
          {item.content}
        </Text>
        <Text style={styles.resultTime}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Search Messages" />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <Icon name="search" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        renderItem={renderResult}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
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
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
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
  resultInfo: {
    flex: 1,
  },
  resultUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  resultMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  resultTime: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

