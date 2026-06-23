import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  TextInput,
  TouchableOpacity 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '../../../components/ui/ThemedView';
import { ThemedText } from '../../../components/ui/ThemedText';
import Header from '../../../components/navigation/Header';
import { Colors } from '../../../constants/Colors';
import { messageService } from '../../../services/messageService';
import { useAuthStore } from '../../../store/authStore';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (id) {
      loadMessages();
    }
  }, [id]);

  const loadMessages = async () => {
    try {
      const response = await messageService.getMessages(id);
      setMessages(response.messages || []);
    } catch (error) {
      console.error('Load messages error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    try {
      const tempId = Date.now().toString();
      const tempMessage = {
        id: tempId,
        content: newMessage,
        senderId: user?.id,
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => [tempMessage, ...prev]);
      setNewMessage('');

      await messageService.sendMessage(id, newMessage);
      // Ideally replace temp message with real one from response
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessageContainer : styles.theirMessageContainer
      ]}>
        <View style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.theirBubble
        ]}>
          <ThemedText style={isMe ? styles.myText : styles.theirText}>
            {item.content}
          </ThemedText>
        </View>
        <ThemedText style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Header title="Chat" />
      
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        inverted
        contentContainerStyle={styles.list}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Message..."
            placeholderTextColor={Colors.textSecondary}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!newMessage.trim()}
          >
            <Icon name="send" size={24} color={newMessage.trim() ? Colors.primary : Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirMessageContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 4,
  },
  myBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
  },
  myText: {
    color: '#FFFFFF',
  },
  theirText: {
    color: Colors.text,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 40,
    maxHeight: 100,
    color: Colors.text,
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 12,
    padding: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
