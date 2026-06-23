import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Color palette — matches the gitgram dark theme used across the app
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  onlineGreen: '#22C55E',
  inputBg: '#1A1A2E',
  white: '#FFFFFF',
  error: '#F87171',
} as const;

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface MessagesResponse {
  messages: Message[];
  recipientUsername: string;
  recipientOnline: boolean;
  currentUserId: string;
}

interface SendMessageResponse {
  message: Message;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Generate a stable local-only id for optimistic messages before server assigns one
let optimisticCounter = 0;
function nextOptimisticId(): string {
  optimisticCounter += 1;
  return `optimistic-${optimisticCounter}`;
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isOptimistic?: boolean;
}

function MessageBubble({ message, isOwn, isOptimistic = false }: MessageBubbleProps) {
  return (
    <View
      style={[
        bubbleStyles.row,
        isOwn ? bubbleStyles.rowRight : bubbleStyles.rowLeft,
      ]}
    >
      <View
        style={[
          bubbleStyles.bubble,
          isOwn ? bubbleStyles.bubbleOwn : bubbleStyles.bubbleOther,
          isOptimistic && bubbleStyles.bubbleOptimistic,
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={message.content}
      >
        <Text
          style={[
            bubbleStyles.content,
            isOwn ? bubbleStyles.contentOwn : bubbleStyles.contentOther,
          ]}
        >
          {message.content}
        </Text>
      </View>
      <Text style={[bubbleStyles.timestamp, isOwn ? bubbleStyles.timestampRight : bubbleStyles.timestampLeft]}>
        {formatTimestamp(message.createdAt)}
      </Text>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#1A1A2E',
    borderBottomLeftRadius: 4,
  },
  bubbleOptimistic: {
    opacity: 0.65,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
  },
  contentOwn: {
    color: Colors.white,
  },
  contentOther: {
    color: '#E2E8F0',
  },
  timestamp: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  timestampRight: {
    alignSelf: 'flex-end',
  },
  timestampLeft: {
    alignSelf: 'flex-start',
  },
});

// ---------------------------------------------------------------------------
// ConversationHeader
// ---------------------------------------------------------------------------

interface ConversationHeaderProps {
  username: string;
  isOnline: boolean;
  onBack: () => void;
}

function ConversationHeader({ username, isOnline, onBack }: ConversationHeaderProps) {
  return (
    <View style={headerStyles.container}>
      <TouchableOpacity
        onPress={onBack}
        style={headerStyles.backButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={headerStyles.backArrow}>{'←'}</Text>
      </TouchableOpacity>

      <View style={headerStyles.identity}>
        <View style={headerStyles.userRow}>
          <Text style={headerStyles.username} numberOfLines={1}>
            {username}
          </Text>
          {isOnline ? (
            <View
              style={headerStyles.onlineDot}
              accessible
              accessibilityLabel="Online"
            />
          ) : null}
        </View>
        <Text style={headerStyles.statusText}>
          {isOnline ? 'Active now' : 'Offline'}
        </Text>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  backArrow: {
    color: Colors.primaryLight,
    fontSize: 22,
    fontWeight: '600',
  },
  identity: {
    flex: 1,
    justifyContent: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Colors.onlineGreen,
    marginTop: 1,
  },
  statusText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// MessageInput
// ---------------------------------------------------------------------------

interface MessageInputProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
}

function MessageInput({ value, onChange, onSend, isSending }: MessageInputProps) {
  const canSend = value.trim().length > 0 && !isSending;

  return (
    <View style={inputStyles.container}>
      <TextInput
        style={inputStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Message..."
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={1}
        // Limits display height to ~3 lines but does not truncate input
        maxHeight={80}
        returnKeyType="default"
        blurOnSubmit={false}
        accessibilityLabel="Message input"
      />

      <Pressable
        onPress={canSend ? onSend : undefined}
        style={[inputStyles.sendButton, !canSend && inputStyles.sendButtonDisabled]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        {isSending ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          // Unicode right-pointing arrow — no icon library required
          <Text style={[inputStyles.sendIcon, !canSend && inputStyles.sendIconDisabled]}>
            {'➤'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  sendIcon: {
    color: Colors.white,
    fontSize: 18,
  },
  sendIconDisabled: {
    color: Colors.textMuted,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [recipientUsername, setRecipientUsername] = useState<string>('');
  const [recipientOnline, setRecipientOnline] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  // ----- Fetch messages -----
  const fetchMessages = useCallback(async (): Promise<void> => {
    if (!conversationId) return;

    try {
      const data = await apiClient<MessagesResponse>(
        `/v1/messages/${encodeURIComponent(conversationId)}`,
      );

      setMessages((prev) => {
        // Keep optimistic messages that the server has not yet confirmed
        // (those whose id starts with "optimistic-") and merge with server list
        const serverIds = new Set(data.messages.map((m) => m.id));
        const pendingOptimistic = prev.filter(
          (m) => m.id.startsWith('optimistic-') && !serverIds.has(m.id),
        );
        return [...data.messages, ...pendingOptimistic];
      });

      setCurrentUserId(data.currentUserId);
      setRecipientUsername(data.recipientUsername);
      setRecipientOnline(data.recipientOnline);
      setError(null);
    } catch (err: unknown) {
      // On polling errors we surface the message once but do not clear the list
      const msg = err instanceof Error ? err.message : 'Failed to load messages';
      setError(msg);
    }
  }, [conversationId]);

  // Initial load
  useEffect(() => {
    setIsInitialLoading(true);
    fetchMessages().finally(() => setIsInitialLoading(false));
  }, [fetchMessages]);

  // 3-second polling
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchMessages();
    }, 3_000);

    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchMessages]);

  // ----- Send message -----
  const handleSend = useCallback(async (): Promise<void> => {
    const content = inputText.trim();
    if (!content || isSending || !conversationId) return;

    // Optimistic insert — prepend because FlatList is inverted
    const optimisticMessage: Message = {
      id: nextOptimisticId(),
      conversationId,
      senderId: currentUserId,
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [optimisticMessage, ...prev]);
    setInputText('');
    setIsSending(true);

    try {
      const data = await apiClient<SendMessageResponse>(
        `/v1/messages/${encodeURIComponent(conversationId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
      );

      // Replace the optimistic entry with the confirmed server message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMessage.id ? data.message : m,
        ),
      );
    } catch (err: unknown) {
      // Remove the failed optimistic message and restore the draft text
      setMessages((prev) =>
        prev.filter((m) => m.id !== optimisticMessage.id),
      );
      setInputText(content);
      setError(
        err instanceof Error ? err.message : 'Message failed to send. Try again.',
      );
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, conversationId, currentUserId]);

  // ----- Render message item -----
  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === currentUserId}
        isOptimistic={item.id.startsWith('optimistic-')}
      />
    ),
    [currentUserId],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // ----- Loading state -----
  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ConversationHeader
          username="Loading..."
          isOnline={false}
          onBack={() => router.back()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ConversationHeader
        username={recipientUsername || 'Conversation'}
        isOnline={recipientOnline}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {error ? (
          <View style={styles.errorBanner} accessible accessibilityRole="alert">
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => setError(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text style={styles.errorDismiss}>{'✕'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <FlatList<Message>
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No messages yet. Say hello!
              </Text>
            </View>
          }
          removeClippedSubviews
          maxToRenderPerBatch={20}
          windowSize={10}
          initialNumToRender={20}
        />

        <MessageInput
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          isSending={isSending}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen-level styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 12,
  },
  emptyContainer: {
    // With inverted FlatList the "bottom" is the visible top; padding provides breathing room
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1F1F',
    borderBottomWidth: 1,
    borderBottomColor: '#5C2D2D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  errorDismiss: {
    color: Colors.textMuted,
    fontSize: 16,
  },
});
