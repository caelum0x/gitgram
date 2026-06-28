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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';
import { messageService, type MessageReaction } from '../../services/messageService';
import { initializeSocket, disconnectSocket } from '../../services/socketService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { DateDivider } from '../../components/chat/DateDivider';
import { SwipeToReply } from '../../components/chat/SwipeToReply';
import { NewMessagesPill } from '../../components/chat/NewMessagesPill';
import { EmojiReactionPicker } from '../../components/chat/EmojiReactionPicker';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../../utils/logger';
import { useHaptics } from '../../hooks/useHaptics';

const TYPING_DEBOUNCE_MS = 2000; // Stop typing after 2 seconds of no input
// How far from the bottom (offset 0 in an inverted list) the user can be before
// an incoming message shows the "new messages" pill instead of auto-scrolling.
const NEAR_BOTTOM_THRESHOLD = 80;
// Maximum distinct reactions a single user may add to one message (mirrors the
// backend cap).
const MAX_REACTIONS_PER_USER = 5;

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
  reactions?: MessageReaction[];
  sender?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

// A list row is either a real message or a day divider injected between days.
type ChatRow =
  | { type: 'message'; message: Message }
  | { type: 'divider'; id: string; date: string };

/** True when two timestamps fall on different calendar days. */
function isDifferentDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  );
}

/**
 * Builds the inverted FlatList data: messages newest-first, with a date divider
 * inserted before the first message of each calendar day. Because the list is
 * inverted, the divider must sit *after* the day's oldest message in array order
 * so it renders visually above the day's messages.
 */
function buildRows(messagesNewestFirst: Message[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (let i = 0; i < messagesNewestFirst.length; i++) {
    const msg = messagesNewestFirst[i];
    rows.push({ type: 'message', message: msg });
    const older = messagesNewestFirst[i + 1];
    const isDayBoundary = !older || isDifferentDay(msg.createdAt, older.createdAt);
    if (isDayBoundary) {
      rows.push({
        type: 'divider',
        id: `divider-${msg.id}`,
        date: msg.createdAt,
      });
    }
  }
  return rows;
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const haptics = useHaptics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const flatListRef = useRef<FlatList<ChatRow>>(null);
  const socketRef = useRef<ReturnType<typeof initializeSocket>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  // Tracks whether the list is pinned near the newest message; used to decide
  // between auto-scrolling and showing the "new messages" pill.
  const isNearBottomRef = useRef(true);

  // Canonical inverted-list order is newest-first (index 0 = newest = the
  // visual bottom). Sorting a copy by createdAt makes ordering robust whether a
  // message arrived from the initial fetch (oldest-first) or a socket prepend
  // (newest-first), and gives buildRows a stable basis for day dividers.
  const orderedMessages = [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const rows = buildRows(orderedMessages);

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
    emitTypingStart();

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, TYPING_DEBOUNCE_MS);
  }, [emitTypingStart, emitTypingStop]);

  // Apply a reaction update pushed from the server (or returned by our own
  // mutation) to the matching message.
  const applyReactions = useCallback(
    (messageId: string, reactions: MessageReaction[]) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, reactions } : msg)),
      );
    },
    [],
  );

  useEffect(() => {
    loadMessages();

    const socket = initializeSocket();
    socketRef.current = socket;

    if (socket) {
      socket.emit('join', userId);

      socket.on('message', (message: Message) => {
        if (message.senderId === userId || message.recipientId === userId) {
          setMessages((prev) => [message, ...prev]);
          if (message.senderId === userId) {
            messageService.markAsRead(message.id);
            // An incoming message from the other user while the viewer is
            // reading history should surface the pill, not yank the list.
            if (!isNearBottomRef.current) {
              setShowNewMessagesPill(true);
            }
          }
        }
      });

      socket.on('messageRead', (messageId: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isRead: true } : msg
          )
        );
      });

      socket.on('typing:status', (data: { userId: string; isTyping: boolean }) => {
        if (data.userId === userId) {
          setIsOtherUserTyping(data.isTyping);
        }
      });

      // Real-time reaction updates from other participants.
      socket.on(
        'message:reaction',
        (data: { messageId: string; reactions: MessageReaction[] }) => {
          if (data.reactions) {
            applyReactions(data.messageId, data.reactions);
          }
        },
      );
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (socketRef.current && isTypingRef.current) {
        socketRef.current.emit('typing:stop', { recipientId: userId });
      }
      if (socket) {
        socket.emit('leave', userId);
        disconnectSocket();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await messageService.getMessages(userId);
      setMessages(response.messages || []);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowNewMessagesPill(false);
  }, []);

  const handleSend = async () => {
    if (!messageText.trim() && !sending) return;

    try {
      setSending(true);
      haptics('Light');

      emitTypingStop();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      const response = await messageService.sendMessage(userId, messageText.trim());

      setMessages((prev) => [response.message, ...prev]);

      if (socketRef.current) {
        socketRef.current.emit('sendMessage', {
          recipientId: userId,
          content: messageText.trim(),
        });
      }

      setMessageText('');
      // Sending our own message always returns focus to the newest message.
      setReplyingTo(null);
      scrollToBottom();
    } catch {
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
        scrollToBottom();
      }
    } catch (error) {
      logger.error('Send media error:', error);
    } finally {
      setSending(false);
    }
  };

  const handleReply = useCallback((message: Message) => {
    haptics('Light');
    setReplyingTo(message);
  }, [haptics]);

  // Toggle a reaction: remove it if the user already reacted with this emoji,
  // otherwise add it. The server returns the authoritative aggregated list.
  const handleSelectReaction = useCallback(
    async (emoji: string) => {
      const target = reactionTarget;
      if (!target) return;
      const alreadyReacted = target.reactions?.some(
        (r) => r.emoji === emoji && r.reactedByMe,
      );
      try {
        const response = alreadyReacted
          ? await messageService.removeReaction(target.id, emoji)
          : await messageService.addReaction(target.id, emoji);
        applyReactions(target.id, response.reactions);
      } catch (error) {
        logger.error('Reaction error:', error);
      }
    },
    [reactionTarget, applyReactions],
  );

  // Tapping an existing reaction chip toggles the current user's reaction.
  const handleToggleReactionChip = useCallback(
    async (message: Message, reaction: MessageReaction) => {
      haptics('Light');
      try {
        const response = reaction.reactedByMe
          ? await messageService.removeReaction(message.id, reaction.emoji)
          : await messageService.addReaction(message.id, reaction.emoji);
        applyReactions(message.id, response.reactions);
      } catch (error) {
        logger.error('Reaction error:', error);
      }
    },
    [haptics, applyReactions],
  );

  // Track whether the user is near the newest message so incoming socket
  // messages know whether to auto-scroll or show the pill.
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      const nearBottom = offset <= NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      if (nearBottom && showNewMessagesPill) {
        setShowNewMessagesPill(false);
      }
    },
    [showNewMessagesPill],
  );

  const renderMessageBubble = (item: Message) => {
    const isSent = item.senderId !== userId;
    const isCurrentUser = !isSent;
    const reactions = item.reactions ?? [];

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
        {reactions.length > 0 && (
          <View style={styles.reactionRow}>
            {reactions.map((reaction) => (
              <TouchableOpacity
                key={reaction.emoji}
                onPress={() => handleToggleReactionChip(item, reaction)}
                style={[
                  styles.reactionChip,
                  reaction.reactedByMe && styles.reactionChipActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${reaction.emoji} ${reaction.count} reaction${
                  reaction.count === 1 ? '' : 's'
                }`}
              >
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                {reaction.count > 1 && (
                  <Text style={styles.reactionCount}>{reaction.count}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderRow = ({ item }: { item: ChatRow }) => {
    if (item.type === 'divider') {
      return <DateDivider date={item.date} />;
    }
    const message = item.message;
    const isFromSelf = message.senderId !== userId;
    // Optimistic/temporary messages can have a generated id; still allow swipe.
    return (
      <SwipeToReply isFromSelf={isFromSelf} onReply={() => handleReply(message)}>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => {
            haptics('Medium');
            setReactionTarget(message);
          }}
          delayLongPress={300}
        >
          {renderMessageBubble(message)}
        </TouchableOpacity>
      </SwipeToReply>
    );
  };

  const myReactedEmojis =
    reactionTarget?.reactions
      ?.filter((r) => r.reactedByMe)
      .map((r) => r.emoji) ?? [];
  const reactionLimitReached = myReactedEmojis.length >= MAX_REACTIONS_PER_USER;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.listWrap}>
        <FlatList
          ref={flatListRef}
          data={rows}
          renderItem={renderRow}
          keyExtractor={(item) =>
            item.type === 'divider' ? item.id : item.message.id
          }
          inverted
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <EmptyState
              title="No messages yet"
              message="Start the conversation!"
              icon="💬"
            />
          }
          ListHeaderComponent={isOtherUserTyping ? <TypingIndicator /> : null}
        />
        <NewMessagesPill visible={showNewMessagesPill} onPress={scrollToBottom} />
      </View>

      {replyingTo && (
        <View style={styles.replyBanner}>
          <View style={styles.replyBannerBar} />
          <View style={styles.replyBannerContent}>
            <Text style={styles.replyBannerLabel}>
              Replying to{' '}
              {replyingTo.senderId === userId
                ? replyingTo.sender?.username || 'them'
                : 'yourself'}
            </Text>
            <Text style={styles.replyBannerText} numberOfLines={1}>
              {replyingTo.content || (replyingTo.mediaUrl ? 'Media' : '')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            style={styles.replyBannerClose}
          >
            <Icon name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

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

      <EmojiReactionPicker
        visible={reactionTarget !== null}
        reactedEmojis={myReactedEmojis}
        limitReached={reactionLimitReached}
        onClose={() => setReactionTarget(null)}
        onSelect={handleSelectReaction}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listWrap: {
    flex: 1,
    position: 'relative',
  },
  messageContainer: {
    maxWidth: '100%',
    marginVertical: 4,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
  },
  sentMessage: {
    backgroundColor: Colors.accent,
  },
  receivedMessage: {
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
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionChipActive: {
    backgroundColor: `${Colors.primary}33`,
    borderColor: Colors.primary,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  replyBannerBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: Colors.accent,
    marginRight: 10,
  },
  replyBannerContent: {
    flex: 1,
  },
  replyBannerLabel: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyBannerText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  replyBannerClose: {
    padding: 6,
    marginLeft: 8,
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
