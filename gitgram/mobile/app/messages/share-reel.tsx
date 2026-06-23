import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { messageService } from '../../services/messageService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ShareReelToMessageScreen() {
  const { reelId } = useLocalSearchParams<{ reelId: string }>();
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await messageService.getConversations();
      setConversations(response.conversations || []);
    } catch (error) {
      logger.error('Load conversations error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (conversationId: string) => {
    try {
      await messageService.shareReel(conversationId, reelId!);
      Alert.alert('Success', 'Reel shared', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Share reel error:', error);
      Alert.alert('Error', 'Failed to share reel');
    }
  };

  const renderConversation = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => handleShare(item.id)}
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
      <View style={styles.conversationInfo}>
        <Text style={styles.conversationName}>
          {item.isGroup ? item.name : `@${item.username}`}
        </Text>
        {item.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        )}
      </View>
      <Icon name="send" size={24} color={Colors.accent} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Share to Message" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Share to Message" />
      <FlatList
        data={conversations}
        renderItem={renderConversation}
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
  listContent: {
    padding: 16,
  },
  conversationItem: {
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
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

