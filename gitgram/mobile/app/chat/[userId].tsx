import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { messageService } from '../../services/messageService';
import { initializeSocket, disconnectSocket } from '../../services/socketService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../../utils/logger';
import { useHaptics } from '../../hooks/useHaptics';

const TYPING_DEBOUNCE_MS = 2000; // Stop typing after 2 seconds of no input

// Animated typing indicator component
const TypingIndicator = () => {
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDots = () => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(dot1Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot1Opacity, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2Opacity, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3Opacity, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      );
      animation.start();
      return animation;
    };

    const animation = animateDots();
    return () => animation.stop();
  }, [dot1Opacity, dot2Opacity, dot3Opacity]);

  return (
    <View style={typingStyles.container}>
      <View style={typingStyles.indicator}>
        <Text style={typingStyles.text}>typing</Text>
        <View style={typingStyles.dots}>
          <Animated.View style={[typingStyles.dot, { opacity: dot1Opacity }]} />
          <Animated.View style={[typingStyles.dot, { opacity: dot2Opacity }]} />
          <Animated.View style={[typingStyles.dot, { opacity: dot3Opacity }]} />
        </View>
      </View>
    </View>
  );
};

const typingStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginRight: 4,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textSecondary,
    marginHorizontal: 2,
  },
});

interface Message {
  id: string;
  content: string;
  mediaType?: string;
  mediaUrl?: string;
  senderId: string;
  recipientId: string;
  isRead: boolean;
  createdAt: string;
  sender?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const haptics = useHaptics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Emit typing start event
  const emitTypingStart = useCallback(() => {
    if (socketRef.current && !isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.emit('typing:start', { recipientId: userId });
    }
  }, [userId]);

  // Emit typing stop event
  const emitTypingStop = useCallback(() => {
    if (socketRef.current && isTypingRef.current) {
      isTypingRef.current = false;
      socketRef.current.emit('typing:stop', { recipientId: userId });
    }
  }, [userId]);

  // Handle typing with debounce
  const handleTypingDebounce = useCallback(() => {
    // Emit typing start
    emitTypingStart();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to emit typing stop after 2 seconds of no typing
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, TYPING_DEBOUNCE_MS);
  }, [emitTypingStart, emitTypingStop]);

  useEffect(() => {
    loadMessages();

    // Initialize socket connection
    const socket = initializeSocket();
    socketRef.current = socket;

    if (socket) {
      // Join user's room
      socket.emit('join', userId);

      // Listen for new messages
      socket.on('message', (message: Message) => {
        if (message.senderId === userId || message.recipientId === userId) {
          setMessages((prev) => [message, ...prev]);
          // Mark as read if it's from the other user
          if (message.senderId === userId) {
            messageService.markAsRead(message.id);
          }
        }
      });

      // Listen for message read receipts
      socket.on('messageRead', (messageId: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isRead: true } : msg
          )
        );
      });

      // Listen for typing status from the other user
      socket.on('typing:status', (data: { userId: string; isTyping: boolean }) => {
        // Only show typing indicator if it's from the user we're chatting with
        if (data.userId === userId) {
          setIsOtherUserTyping(data.isTyping);
        }
      });
    }

    return () => {
      // Clean up typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Emit typing stop when leaving the chat
      if (socketRef.current && isTypingRef.current) {
        socketRef.current.emit('typing:stop', { recipientId: userId });
      }
      if (socket) {
        socket.emit('leave', userId);
        disconnectSocket();
      }
    };
  }, [userId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await messageService.getMessages(userId);
      setMessages(response.messages || []);
    } catch (error) {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim() && !sending) return;

    try {
      setSending(true);
      haptics('Light');

      // Stop typing indicator when sending
      emitTypingStop();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      const response = await messageService.sendMessage(userId, messageText.trim());

      // Add message to list optimistically
      setMessages((prev) => [response.message, ...prev]);

      // Emit via socket
      if (socketRef.current) {
        socketRef.current.emit('sendMessage', {
          recipientId: userId,
          content: messageText.trim(),
        });
      }

      setMessageText('');
    } catch (error) {
      // Error handled silently
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSending(true);
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        const ext = asset.uri.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
        const mimeType = asset.mimeType || (isVideo ? `video/${ext}` : `image/${ext}`);

        // recipientId/content are appended by messageService.sendMessage.
        const formData = new FormData();
        formData.append('media', {
          uri: asset.uri,
          type: mimeType,
          name: `media.${ext}`,
        } as unknown as Blob);

        const response = await messageService.sendMessage(userId, '', formData);
        setMessages((prev) => [response.message, ...prev]);

        if (socketRef.current) {
          socketRef.current.emit('sendMessage', {
            recipientId: userId,
            mediaType: isVideo ? 'video' : 'image',
            mediaUrl: response.message.mediaUrl,
          });
        }
      }
    } catch (error) {
      logger.error('Send media error:', error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isSent = item.senderId !== userId;
    const isCurrentUser = !isSent;

    return (
      <View
        style={[
          styles.messageContainer,
          isCurrentUser ? styles.sentMessage : styles.receivedMessage,
        ]}
      >
        {item.mediaUrl && (
          <Image source={{ uri: item.mediaUrl }} style={styles.messageMedia} />
        )}
        {item.content && (
          <Text
            style={[
              styles.messageText,
              isCurrentUser ? styles.sentText : styles.receivedText,
            ]}
          >
            {item.content}
          </Text>
        )}
        <Text style={styles.messageTime}>
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        ListEmptyComponent={
          <EmptyState
            title="No messages yet"
            message="Start the conversation!"
            icon="💬"
          />
        }
        ListHeaderComponent={isOtherUserTyping ? <TypingIndicator /> : null}
        onContentSizeChange={() => flatListRef.current?.scrollToOffset({ offset: 0 })}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={handleSendMedia} style={styles.mediaButton}>
          <Text style={styles.mediaButtonText}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={(text) => {
            setMessageText(text);
            if (text.length > 0) {
              handleTypingDebounce();
            } else {
              emitTypingStop();
            }
          }}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textSecondary}
          multiline
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          disabled={sending || !messageText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  messageContainer: {
    maxWidth: '75%',
    marginVertical: 4,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
  },
  sentMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
  },
  messageText: {
    fontSize: 16,
  },
  sentText: {
    color: Colors.text,
  },
  receivedText: {
    color: Colors.text,
  },
  messageMedia: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageTime: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'flex-end',
    backgroundColor: Colors.background,
  },
  mediaButton: {
    padding: 8,
    marginRight: 8,
  },
  mediaButtonText: {
    fontSize: 24,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
});
