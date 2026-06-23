import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Input } from '../../components/ui/Input';
import { Colors } from '../../constants/Colors';
import { messageService } from '../../services/messageService';
import { userService } from '../../services/userService';
import { useAuthStore } from '../../store/authStore';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface ChatParticipant {
  id: string;
  username: string;
  avatar?: string;
  name?: string;
}

interface Conversation {
  id: string;
  participants: ChatParticipant[];
  lastMessage?: { content: string };
  lastMessageAt: string;
}

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // New chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatParticipant[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await messageService.getConversations();
      setConversations(response.conversations || []);
    } catch (error) {
      console.error('Load conversations error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Search users for new chat
  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const response = await userService.searchUsers(query);
      // Filter out current user from results
      const filteredUsers = (response.users || []).filter(
        (u: ChatParticipant) => u.id !== user?.id
      );
      setSearchResults(filteredUsers);
    } catch (error) {
      console.error('Search users error:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (showNewChatModal) {
        searchUsers(userSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [userSearchQuery, showNewChatModal]);

  // Handle starting a new chat with selected user
  const handleStartChat = (selectedUser: ChatParticipant) => {
    setShowNewChatModal(false);
    setUserSearchQuery('');
    setSearchResults([]);
    // Navigate to chat screen with user ID
    router.push(`/chat/${selectedUser.id}`);
  };

  // Open new chat modal
  const handleOpenNewChat = () => {
    setShowNewChatModal(true);
  };

  // Close new chat modal
  const handleCloseNewChat = () => {
    setShowNewChatModal(false);
    setUserSearchQuery('');
    setSearchResults([]);
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const otherUser = item.participants.find((p) => p.id !== user?.id);
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/messages/chat/${item.id}`)}
      >
        <View style={styles.avatarContainer}>
          {otherUser?.avatar ? (
            <Image source={{ uri: otherUser.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <ThemedText style={styles.avatarText}>
                {otherUser?.username[0].toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold">{otherUser?.username}</ThemedText>
            <ThemedText type="caption">
              {new Date(item.lastMessageAt).toLocaleDateString()}
            </ThemedText>
          </View>
          <ThemedText numberOfLines={1} style={styles.messagePreview}>
            {item.lastMessage?.content || 'Start a conversation'}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerBar}>
        <ThemedText type="title">Messages</ThemedText>
        <TouchableOpacity onPress={handleOpenNewChat}>
          <Icon name="edit" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Input
          placeholder="Search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />

      {/* New Chat Modal */}
      <Modal
        visible={showNewChatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseNewChat}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseNewChat}>
              <ThemedText style={styles.cancelButton}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
              New Message
            </ThemedText>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.userSearchContainer}>
            <ThemedText style={styles.toLabel}>To:</ThemedText>
            <TextInput
              style={styles.userSearchInput}
              placeholder="Search users..."
              placeholderTextColor={Colors.textSecondary}
              value={userSearchQuery}
              onChangeText={setUserSearchQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {searchLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => handleStartChat(item)}
                >
                  <View style={styles.userAvatarContainer}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
                    ) : (
                      <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
                        <ThemedText style={styles.userAvatarText}>
                          {item.username?.[0]?.toUpperCase() || '?'}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <View style={styles.userInfo}>
                    <ThemedText type="defaultSemiBold">{item.username}</ThemedText>
                    {item.name && (
                      <ThemedText style={styles.userName}>{item.name}</ThemedText>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                userSearchQuery.trim() ? (
                  <View style={styles.emptyContainer}>
                    <ThemedText style={styles.emptyText}>No users found</ThemedText>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <ThemedText style={styles.emptyText}>
                      Search for a user to message
                    </ThemedText>
                  </View>
                )
              }
              contentContainerStyle={styles.userList}
            />
          )}
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  searchInput: {
    marginBottom: 0,
  },
  list: {
    paddingVertical: 10,
  },
  item: {
    flexDirection: 'row',
    padding: 16,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messagePreview: {
    color: Colors.textSecondary,
  },
  // New Chat Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 16,
  },
  cancelButton: {
    color: Colors.primary,
    fontSize: 16,
  },
  headerSpacer: {
    width: 50,
  },
  userSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toLabel: {
    color: Colors.textSecondary,
    marginRight: 8,
    fontSize: 16,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    paddingVertical: 4,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  userList: {
    paddingVertical: 8,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
  },
  userAvatarContainer: {
    marginRight: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
