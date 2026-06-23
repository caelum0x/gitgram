import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  elevated: '#232340',
  inputBg: '#1E1E38',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  success: '#34D399',
  successBg: '#0A2318',
  successBorder: '#16533E',
  successElevated: '#0D2B22',
  closed: '#64748B',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DiscussionStatus = 'open' | 'closed' | 'answered';

interface UserRef {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
}

interface Discussion {
  number: number;
  title: string;
  status: DiscussionStatus;
  category: string;
  categorySlug: string;
  body: string;
  author: UserRef;
  createdAt: string;
  replyCount: number;
  reactionCount: number;
  isAnswered: boolean;
  acceptedAnswerId: string | null;
  isCollaborator: boolean;
}

interface DiscussionReply {
  id: string;
  author: UserRef;
  body: string;
  createdAt: string;
  reactionCount: number;
  isAcceptedAnswer: boolean;
}

interface RepliesResponse {
  replies: DiscussionReply[];
  nextCursor: string | null;
}

interface ReplyResponse {
  reply: DiscussionReply;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s ago`;
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryColor(slug: string): string {
  switch (slug) {
    case 'announcements': return '#F59E0B';
    case 'q_and_a': return '#3B82F6';
    case 'ideas': return '#EC4899';
    case 'show_and_tell': return '#10B981';
    case 'general': return '#8B5CF6';
    default: return C.primaryLight;
  }
}

// ---------------------------------------------------------------------------
// Markdown renderer (Text-based, same pattern as issue detail)
// ---------------------------------------------------------------------------
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    if (line.startsWith('### ')) {
      return <Text key={idx} style={md.h3}>{line.slice(4)}{'\n'}</Text>;
    }
    if (line.startsWith('## ')) {
      return <Text key={idx} style={md.h2}>{line.slice(3)}{'\n'}</Text>;
    }
    if (line.startsWith('# ')) {
      return <Text key={idx} style={md.h1}>{line.slice(2)}{'\n'}</Text>;
    }
    if (line.startsWith('> ')) {
      return (
        <View key={idx} style={md.blockquoteContainer}>
          <Text style={md.blockquote}>{line.slice(2)}</Text>
        </View>
      );
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return <Text key={idx} style={md.listItem}>{'  •  '}{line.slice(2)}{'\n'}</Text>;
    }
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    const inline = parts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <Text key={pIdx} style={md.inlineCode}>{part.slice(1, -1)}</Text>;
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <Text key={pIdx} style={md.bold}>{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <Text key={pIdx} style={md.italic}>{part.slice(1, -1)}</Text>;
      }
      return <Text key={pIdx}>{part}</Text>;
    });
    return <Text key={idx} style={md.paragraph}>{inline}{'\n'}</Text>;
  });
}

const md = StyleSheet.create({
  h1: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  h2: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  h3: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  paragraph: { color: C.textSec, fontSize: 14, lineHeight: 22 },
  listItem: { color: C.textSec, fontSize: 14, lineHeight: 22 },
  blockquoteContainer: {
    borderLeftWidth: 3,
    borderLeftColor: C.primaryLight,
    paddingLeft: 10,
    marginVertical: 2,
  },
  blockquote: { color: C.textMuted, fontSize: 14, fontStyle: 'italic' },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: C.elevated,
    color: C.primaryLight,
    fontSize: 13,
  },
  bold: { color: C.text, fontWeight: '700' },
  italic: { color: C.textSec, fontStyle: 'italic' },
});

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri: string | null | undefined;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 36 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[av.img, circle]}
        onError={() => setFailed(true)}
        accessibilityLabel={`${username} avatar`}
      />
    );
  }
  return (
    <View style={[av.placeholder, circle]}>
      <Text style={[av.initial, { fontSize: size * 0.4 }]}>
        {(username[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const av = StyleSheet.create({
  img: { overflow: 'hidden', borderWidth: 1.5, borderColor: C.primaryDark },
  placeholder: {
    backgroundColor: C.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.primaryDark,
  },
  initial: { color: C.white, fontWeight: '700', textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: DiscussionStatus }) {
  const config = {
    open: { label: 'Open', color: C.primary, bg: '#1A0B3B', border: '#3B1F7A' },
    closed: { label: 'Closed', color: C.closed, bg: C.surface, border: C.border },
    answered: { label: 'Answered', color: C.success, bg: C.successBg, border: C.successBorder },
  }[status];

  return (
    <View style={[sb.container, { backgroundColor: config.bg, borderColor: config.border }]}>
      <View style={[sb.dot, { backgroundColor: config.color }]} />
      <Text style={[sb.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------
function CategoryBadge({ label, slug }: { label: string; slug: string }) {
  const color = categoryColor(slug);
  return (
    <View style={[cbg.container, { borderColor: color }]}>
      <Text style={[cbg.text, { color }]}>{label}</Text>
    </View>
  );
}

const cbg = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

// ---------------------------------------------------------------------------
// Accepted answer card
// ---------------------------------------------------------------------------
interface AcceptedAnswerCardProps {
  reply: DiscussionReply;
}

function AcceptedAnswerCard({ reply }: AcceptedAnswerCardProps) {
  return (
    <View style={aa.container}>
      <View style={aa.header}>
        <Text style={aa.headerIcon}>✓</Text>
        <Text style={aa.headerLabel}>Accepted Answer</Text>
        <View style={aa.headerSpacer} />
        <Avatar uri={reply.author.avatarUrl} username={reply.author.username} size={20} />
        <Text style={aa.authorText}>{reply.author.username}</Text>
        <Text style={aa.timeText}>{timeAgo(reply.createdAt)}</Text>
      </View>
      <View style={aa.body}>
        {renderMarkdown(reply.body)}
      </View>
    </View>
  );
}

const aa = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.successBorder,
    backgroundColor: C.successBg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.successElevated,
    borderBottomWidth: 1,
    borderBottomColor: C.successBorder,
    gap: 6,
  },
  headerIcon: { color: C.success, fontSize: 14, fontWeight: '700' },
  headerLabel: { color: C.success, fontSize: 12, fontWeight: '700' },
  headerSpacer: { flex: 1 },
  authorText: { color: C.success, fontSize: 11, fontWeight: '600' },
  timeText: { color: C.textMuted, fontSize: 11 },
  body: { padding: 14 },
});

// ---------------------------------------------------------------------------
// Reply item
// ---------------------------------------------------------------------------
interface ReplyItemProps {
  reply: DiscussionReply;
  canMarkAnswer: boolean;
  onMarkAnswer: (id: string) => void;
  markingAnswerId: string | null;
}

function ReplyItem({ reply, canMarkAnswer, onMarkAnswer, markingAnswerId }: ReplyItemProps) {
  const isMarking = markingAnswerId === reply.id;

  return (
    <View style={[ri.container, reply.isAcceptedAnswer && ri.containerAnswered]}>
      <View style={ri.header}>
        <Avatar uri={reply.author.avatarUrl} username={reply.author.username} size={32} />
        <View style={ri.meta}>
          <Text style={ri.username} numberOfLines={1}>
            {reply.author.displayName ?? reply.author.username}
          </Text>
          <Text style={ri.handle}>@{reply.author.username} · {timeAgo(reply.createdAt)}</Text>
        </View>
        {reply.isAcceptedAnswer && (
          <View style={ri.answerBadge}>
            <Text style={ri.answerBadgeText}>✓</Text>
          </View>
        )}
      </View>

      <View style={ri.body}>
        {renderMarkdown(reply.body)}
      </View>

      {/* Reactions + mark-as-answer */}
      <View style={ri.footer}>
        {reply.reactionCount > 0 && (
          <View style={ri.reactionChip}>
            <Text style={ri.reactionText}>🎉 {reply.reactionCount}</Text>
          </View>
        )}

        {canMarkAnswer && !reply.isAcceptedAnswer && (
          <Pressable
            style={[ri.markBtn, isMarking && ri.markBtnDisabled]}
            onPress={() => onMarkAnswer(reply.id)}
            disabled={isMarking}
            accessibilityRole="button"
            accessibilityLabel="Mark as accepted answer"
          >
            {isMarking ? (
              <ActivityIndicator size="small" color={C.success} />
            ) : (
              <Text style={ri.markBtnText}>Mark as answer</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const ri = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  containerAnswered: {
    borderColor: C.successBorder,
    backgroundColor: C.successBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
    backgroundColor: C.elevated,
  },
  meta: { flex: 1 },
  username: { color: C.text, fontWeight: '600', fontSize: 13 },
  handle: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  answerBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.successBg,
    borderWidth: 1.5,
    borderColor: C.successBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerBadgeText: { color: C.success, fontSize: 12, fontWeight: '700' },
  body: { padding: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  reactionChip: {},
  reactionText: { color: C.textMuted, fontSize: 12 },
  markBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.successBorder,
    backgroundColor: C.successBg,
  },
  markBtnDisabled: { opacity: 0.5 },
  markBtnText: { color: C.success, fontSize: 12, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function DiscussionSkeleton() {
  return (
    <View style={sk.container}>
      <View style={sk.titleLine} />
      <View style={sk.shortLine} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <View style={sk.chip} />
        <View style={[sk.chip, { width: 56 }]} />
      </View>
      <View style={[sk.line, { marginTop: 20 }]} />
      <View style={sk.line} />
      <View style={[sk.line, { width: '70%' }]} />
    </View>
  );
}

const sk = StyleSheet.create({
  container: { padding: 16 },
  titleLine: { width: '85%', height: 18, borderRadius: 9, backgroundColor: C.elevated, marginBottom: 10 },
  shortLine: { width: 140, height: 13, borderRadius: 6, backgroundColor: C.elevated },
  chip: { width: 72, height: 24, borderRadius: 12, backgroundColor: C.elevated },
  line: { width: '100%', height: 13, borderRadius: 6, backgroundColor: C.elevated, marginBottom: 8 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DiscussionDetailScreen() {
  const { owner, name, number } = useLocalSearchParams<{
    owner: string;
    name: string;
    number: string;
  }>();
  const router = useRouter();

  const enc = (s: string) => encodeURIComponent(s);
  const base = `/v1/repositories/${enc(owner ?? '')}/${enc(name ?? '')}`;
  const discussionBase = `${base}/discussions/${enc(number ?? '')}`;

  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [loadingDiscussion, setLoadingDiscussion] = useState(true);
  const [discussionError, setDiscussionError] = useState<string | null>(null);

  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  const [acceptedAnswer, setAcceptedAnswer] = useState<DiscussionReply | null>(null);
  const [markingAnswerId, setMarkingAnswerId] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inputRef = useRef<TextInput>(null);

  // ----- Fetch discussion -----
  const fetchDiscussion = useCallback(async () => {
    if (!owner || !name || !number) return;
    setLoadingDiscussion(true);
    setDiscussionError(null);
    try {
      const data = await apiClient<Discussion>(discussionBase);
      setDiscussion(data);
    } catch (err: unknown) {
      setDiscussionError(err instanceof Error ? err.message : 'Failed to load discussion');
    } finally {
      setLoadingDiscussion(false);
    }
  }, [owner, name, number, discussionBase]);

  // ----- Fetch replies -----
  const fetchReplies = useCallback(
    async (cursor?: string | null) => {
      if (!owner || !name || !number || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setRepliesLoading(true);
      try {
        const params = new URLSearchParams({ limit: '25' });
        if (cursor) params.set('cursor', cursor);
        const data = await apiClient<RepliesResponse>(`${discussionBase}/replies?${params}`);
        const incoming = data.replies ?? [];

        setReplies((prev) => {
          const merged = cursor ? [...prev, ...incoming] : incoming;
          // Sync accepted answer from replies list
          const answered = merged.find((r) => r.isAcceptedAnswer) ?? null;
          setAcceptedAnswer(answered);
          return merged;
        });
        setNextCursor(data.nextCursor ?? null);
      } catch {
        // Keep existing replies on failure
      } finally {
        setRepliesLoading(false);
        loadingMoreRef.current = false;
      }
    },
    [owner, name, number, discussionBase],
  );

  useEffect(() => {
    fetchDiscussion();
    fetchReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setReplies([]);
    setNextCursor(null);
    setAcceptedAnswer(null);
    loadingMoreRef.current = false;
    await Promise.all([fetchDiscussion(), fetchReplies(null)]);
    setRefreshing(false);
  }, [fetchDiscussion, fetchReplies]);

  // ----- Load more -----
  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMoreRef.current) fetchReplies(nextCursor);
  }, [nextCursor, fetchReplies]);

  // ----- Submit reply -----
  const handleSubmitReply = useCallback(async () => {
    const content = replyText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setReplyText('');
    try {
      const data = await apiClient<ReplyResponse>(`${discussionBase}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: content }),
      });
      setReplies((prev) => [...prev, data.reply]);
      setDiscussion((prev) =>
        prev !== null ? { ...prev, replyCount: prev.replyCount + 1 } : prev,
      );
    } catch (err: unknown) {
      setReplyText(content);
      setSubmitError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  }, [replyText, submitting, discussionBase]);

  // ----- Mark as answer -----
  const handleMarkAnswer = useCallback(
    async (replyId: string) => {
      if (markingAnswerId !== null) return;
      setMarkingAnswerId(replyId);
      try {
        await apiClient(`${discussionBase}/accepted-answer`, {
          method: 'PUT',
          body: JSON.stringify({ replyId }),
        });
        setReplies((prev) =>
          prev.map((r) => ({ ...r, isAcceptedAnswer: r.id === replyId })),
        );
        setAcceptedAnswer(replies.find((r) => r.id === replyId) ?? null);
        setDiscussion((prev) =>
          prev !== null ? { ...prev, isAnswered: true, status: 'answered', acceptedAnswerId: replyId } : prev,
        );
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to mark answer');
      } finally {
        setMarkingAnswerId(null);
      }
    },
    [markingAnswerId, discussionBase, replies],
  );

  const canMarkAnswer = discussion?.isCollaborator === true && discussion?.categorySlug === 'q_and_a';
  const canReply = replyText.trim().length > 0 && !submitting;

  // ----- Render reply -----
  const renderReply = useCallback(
    ({ item }: { item: DiscussionReply }) => (
      <ReplyItem
        key={item.id}
        reply={item}
        canMarkAnswer={canMarkAnswer}
        onMarkAnswer={handleMarkAnswer}
        markingAnswerId={markingAnswerId}
      />
    ),
    [canMarkAnswer, handleMarkAnswer, markingAnswerId],
  );

  const repliesFooter =
    repliesLoading && replies.length > 0 ? (
      <ActivityIndicator size="small" color={C.primary} style={s.footerLoader} />
    ) : nextCursor && !repliesLoading ? (
      <Pressable style={s.loadMoreBtn} onPress={handleLoadMore} accessibilityRole="button">
        <Text style={s.loadMoreText}>Load more replies</Text>
      </Pressable>
    ) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={s.safeArea}>
      {/* Nav bar */}
      <View style={s.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backIcon}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={s.navTitle} numberOfLines={1}>
          {discussion !== null ? `#${discussion.number}` : 'Discussion'}
        </Text>

        {discussion !== null && (
          <View style={s.navBadge}>
            <StatusBadge status={discussion.status} />
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
        >
          {loadingDiscussion && discussion === null ? (
            <DiscussionSkeleton />
          ) : discussionError !== null ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{discussionError}</Text>
              <Pressable onPress={fetchDiscussion} style={s.retryBtn} accessibilityRole="button">
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : discussion !== null ? (
            <>
              {/* Discussion header card */}
              <View style={s.headerCard}>
                <Text style={s.discussionTitle}>{discussion.title}</Text>

                {/* Category + status row */}
                <View style={s.metaTagsRow}>
                  <CategoryBadge label={discussion.category} slug={discussion.categorySlug} />
                  {discussion.isAnswered && (
                    <View style={s.answeredBadge}>
                      <Text style={s.answeredBadgeText}>✓ Answered</Text>
                    </View>
                  )}
                </View>

                {/* Author row */}
                <View style={s.authorRow}>
                  <Avatar
                    uri={discussion.author.avatarUrl}
                    username={discussion.author.username}
                    size={22}
                  />
                  <Text style={s.authorText}>
                    <Text style={s.authorName}>
                      {discussion.author.displayName ?? discussion.author.username}
                    </Text>
                    {' started '}
                    {timeAgo(discussion.createdAt)}
                  </Text>
                </View>

                {/* Reactions + reply count */}
                <View style={s.statsRow}>
                  {discussion.reactionCount > 0 && (
                    <Text style={s.statText}>🎉 {discussion.reactionCount}</Text>
                  )}
                  <Text style={s.statText}>
                    💬 {discussion.replyCount} {discussion.replyCount === 1 ? 'reply' : 'replies'}
                  </Text>
                </View>
              </View>

              {/* Opening post body */}
              <View style={s.bodyCard}>
                {discussion.body.trim().length > 0 ? (
                  renderMarkdown(discussion.body)
                ) : (
                  <Text style={s.emptyBody}>No description provided.</Text>
                )}
              </View>

              {/* Accepted answer section (Q&A) */}
              {acceptedAnswer !== null && (
                <>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionIcon}>✓</Text>
                    <Text style={[s.sectionTitle, { color: C.success }]}>Accepted Answer</Text>
                  </View>
                  <AcceptedAnswerCard reply={acceptedAnswer} />
                </>
              )}

              {/* Replies section */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionIcon}>💬</Text>
                <Text style={s.sectionTitle}>
                  {replies.length > 0
                    ? `${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}`
                    : 'Replies'}
                </Text>
                {repliesLoading && replies.length === 0 && (
                  <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />
                )}
              </View>

              <FlatList<DiscussionReply>
                data={replies}
                renderItem={renderReply}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                  repliesLoading ? null : (
                    <Text style={s.emptyReplies}>No replies yet. Start the conversation.</Text>
                  )
                }
                ListFooterComponent={repliesFooter}
              />
            </>
          ) : null}
        </ScrollView>

        {/* Reply input */}
        <View style={s.inputWrapper}>
          {submitError !== null && (
            <View style={s.inputErrorBanner}>
              <Text style={s.inputErrorText} numberOfLines={2}>{submitError}</Text>
              <Pressable
                onPress={() => setSubmitError(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.inputErrorDismiss}>{'✕'}</Text>
              </Pressable>
            </View>
          )}
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Write a reply..."
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={65536}
              returnKeyType="default"
              blurOnSubmit={false}
              accessibilityLabel="Reply input"
            />
            <Pressable
              onPress={canReply ? handleSubmitReply : undefined}
              style={[s.sendBtn, !canReply && s.sendBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Post reply"
              accessibilityState={{ disabled: !canReply }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <Text style={[s.sendIcon, !canReply && s.sendIconDisabled]}>{'➤'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Nav
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: C.primaryLight, fontSize: 22, fontWeight: '600' },
  navTitle: {
    flex: 1,
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  navBadge: { minWidth: 80, alignItems: 'flex-end' },

  // Header card
  headerCard: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    padding: 16,
    paddingBottom: 18,
    gap: 10,
  },
  discussionTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  metaTagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  answeredBadge: {
    backgroundColor: C.successBg,
    borderWidth: 1,
    borderColor: C.successBorder,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  answeredBadgeText: { color: C.success, fontSize: 10, fontWeight: '700' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorText: { color: C.textMuted, fontSize: 13, flexShrink: 1 },
  authorName: { color: C.textSec, fontWeight: '600' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statText: { color: C.textMuted, fontSize: 12 },

  // Body card
  bodyCard: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  emptyBody: { color: C.textMuted, fontSize: 14, fontStyle: 'italic' },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    marginBottom: 10,
    gap: 6,
  },
  sectionIcon: { fontSize: 14 },
  sectionTitle: { color: C.text, fontWeight: '700', fontSize: 14 },

  // Replies
  emptyReplies: {
    color: C.textMuted,
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 14,
  },
  footerLoader: { paddingVertical: 16 },
  loadMoreBtn: {
    marginHorizontal: 16,
    marginVertical: 10,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    backgroundColor: C.elevated,
  },
  loadMoreText: { color: C.primaryLight, fontSize: 14, fontWeight: '600' },

  // Reply input
  inputWrapper: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  inputErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1F1F',
    borderBottomWidth: 1,
    borderBottomColor: '#5C2D2D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  inputErrorText: { flex: 1, color: C.error, fontSize: 12 },
  inputErrorDismiss: { color: C.textMuted, fontSize: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 90,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendBtnDisabled: { backgroundColor: C.elevated },
  sendIcon: { color: C.white, fontSize: 17 },
  sendIconDisabled: { color: C.textMuted },

  // Error
  errorBox: { padding: 32, alignItems: 'center' },
  errorText: {
    color: C.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
