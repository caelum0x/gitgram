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
import { apiClient } from '../../../../services/gitgramApi';

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
  successBg: '#0D2B22',
  successBorder: '#16533E',
  closed: '#64748B',
  closedBg: '#1A1A2E',
  closedBorder: '#2D2D50',
  error: '#F87171',
  warning: '#FBBF24',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LabelRef {
  id: string;
  name: string;
  color: string;
}

interface UserRef {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  author: UserRef;
  assignees: UserRef[];
  labels: LabelRef[];
  milestone: { id: string; title: string } | null;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  isCollaborator: boolean;
}

interface IssueComment {
  id: string;
  author: UserRef;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentsResponse {
  comments: IssueComment[];
  nextCursor: string | null;
}

interface CommentResponse {
  comment: IssueComment;
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

// ---------------------------------------------------------------------------
// Markdown renderer (Text-based)
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
    return (
      <Text key={idx} style={md.paragraph}>{inline}{'\n'}</Text>
    );
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
  const initial = (username[0] ?? '?').toUpperCase();
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
      <Text style={[av.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
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
// State badge
// ---------------------------------------------------------------------------
function StateBadge({ state }: { state: 'open' | 'closed' }) {
  const isOpen = state === 'open';
  return (
    <View style={[
      badge.container,
      { backgroundColor: isOpen ? C.successBg : C.closedBg, borderColor: isOpen ? C.successBorder : C.closedBorder },
    ]}>
      <View style={[badge.dot, { backgroundColor: isOpen ? C.success : C.closed }]} />
      <Text style={[badge.text, { color: isOpen ? C.success : C.closed }]}>
        {isOpen ? 'Open' : 'Closed'}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
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
// Label pill
// ---------------------------------------------------------------------------
function LabelPill({ label }: { label: LabelRef }) {
  const hex = label.color.startsWith('#') ? label.color : `#${label.color}`;
  return (
    <View style={[pill.container, { borderColor: hex }]}>
      <View style={[pill.dot, { backgroundColor: hex }]} />
      <Text style={pill.text}>{label.name}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    marginRight: 5,
    marginBottom: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { color: C.textSec, fontSize: 11, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Comment item
// ---------------------------------------------------------------------------
interface CommentItemProps {
  comment: IssueComment;
}

function CommentItem({ comment }: CommentItemProps) {
  return (
    <View style={ci.container}>
      <View style={ci.header}>
        <Avatar uri={comment.author.avatarUrl} username={comment.author.username} size={32} />
        <View style={ci.meta}>
          <Text style={ci.username} numberOfLines={1}>
            {comment.author.displayName ?? comment.author.username}
          </Text>
          <Text style={ci.handle}>@{comment.author.username} · {timeAgo(comment.createdAt)}</Text>
        </View>
      </View>
      <View style={ci.body}>
        {renderMarkdown(comment.body)}
      </View>
    </View>
  );
}

const ci = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
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
  body: { padding: 14 },
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function IssueSkeleton() {
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
export default function IssueDetailScreen() {
  const { owner, name, number } = useLocalSearchParams<{ owner: string; name: string; number: string }>();
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [issueLoading, setIssueLoading] = useState(true);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [stateChanging, setStateChanging] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const enc = (s: string) => encodeURIComponent(s);
  const base = `/v1/repositories/${enc(owner ?? '')}/${enc(name ?? '')}`;
  const issueBase = `${base}/issues/${enc(number ?? '')}`;

  // ----- Fetch issue -----
  const fetchIssue = useCallback(async () => {
    if (!owner || !name || !number) return;
    setIssueLoading(true);
    setIssueError(null);
    try {
      const data = await apiClient<Issue>(issueBase);
      setIssue(data);
    } catch (err: unknown) {
      setIssueError(err instanceof Error ? err.message : 'Failed to load issue');
    } finally {
      setIssueLoading(false);
    }
  }, [owner, name, number, issueBase]);

  // ----- Fetch comments -----
  const fetchComments = useCallback(async (cursor?: string | null) => {
    if (!owner || !name || !number || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setCommentsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (cursor) params.set('cursor', cursor);
      const data = await apiClient<CommentsResponse>(`${issueBase}/comments?${params}`);
      const incoming = data.comments ?? [];
      setComments((prev) => cursor ? [...prev, ...incoming] : incoming);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // Keep existing comments on failure
    } finally {
      setCommentsLoading(false);
      loadingMoreRef.current = false;
    }
  }, [owner, name, number, issueBase]);

  useEffect(() => {
    fetchIssue();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setComments([]);
    setNextCursor(null);
    await Promise.all([fetchIssue(), fetchComments(null)]);
    setRefreshing(false);
  }, [fetchIssue, fetchComments]);

  // ----- Load more comments -----
  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMoreRef.current) fetchComments(nextCursor);
  }, [nextCursor, fetchComments]);

  // ----- Submit comment -----
  const handleSubmitComment = useCallback(async () => {
    const content = commentText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setCommentText('');
    try {
      const data = await apiClient<CommentResponse>(`${issueBase}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: content }),
      });
      setComments((prev) => [...prev, data.comment]);
      setIssue((prev) => prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev);
    } catch (err: unknown) {
      setCommentText(content);
      setSubmitError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, issueBase]);

  // ----- Toggle state -----
  const handleStateToggle = useCallback(async () => {
    if (!issue || stateChanging) return;
    const targetState = issue.state === 'open' ? 'closed' : 'open';
    setStateChanging(true);
    try {
      const updated = await apiClient<Issue>(`${issueBase}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ state: targetState }),
      });
      setIssue(updated);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update issue state');
    } finally {
      setStateChanging(false);
    }
  }, [issue, stateChanging, issueBase]);

  const canComment = commentText.trim().length > 0 && !submitting;

  // ----- Render comment -----
  const renderComment = useCallback(
    ({ item }: { item: IssueComment }) => <CommentItem key={item.id} comment={item} />,
    [],
  );

  const commentsFooter = commentsLoading && comments.length > 0
    ? <ActivityIndicator size="small" color={C.primary} style={s.footerLoader} />
    : nextCursor && !commentsLoading
      ? (
        <Pressable style={s.loadMoreBtn} onPress={handleLoadMore} accessibilityRole="button">
          <Text style={s.loadMoreText}>Load more comments</Text>
        </Pressable>
      )
      : null;

  // ----- Main render -----
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
          {issue ? `#${issue.number}` : 'Issue'}
        </Text>

        {issue !== null && (
          <View style={s.navBadge}>
            <StateBadge state={issue.state} />
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollRef}
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
          {/* Loading / error / content */}
          {issueLoading && issue === null ? (
            <IssueSkeleton />
          ) : issueError !== null ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{issueError}</Text>
              <Pressable onPress={fetchIssue} style={s.retryBtn} accessibilityRole="button">
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : issue !== null ? (
            <>
              {/* Issue header card */}
              <View style={s.issueCard}>
                {/* Title */}
                <Text style={s.issueTitle}>{issue.title}</Text>

                {/* Author row */}
                <View style={s.authorRow}>
                  <Avatar
                    uri={issue.author.avatarUrl}
                    username={issue.author.username}
                    size={24}
                  />
                  <Text style={s.authorText}>
                    <Text style={s.authorName}>
                      {issue.author.displayName ?? issue.author.username}
                    </Text>
                    {' opened '}
                    {timeAgo(issue.createdAt)}
                  </Text>
                </View>

                {/* Labels */}
                {issue.labels.length > 0 && (
                  <View style={s.labelsRow}>
                    {issue.labels.map((label) => (
                      <LabelPill key={label.id} label={label} />
                    ))}
                  </View>
                )}

                {/* Milestone */}
                {issue.milestone !== null && (
                  <View style={s.milestoneRow}>
                    <Text style={s.milestoneIcon}>{'🎯'}</Text>
                    <Text style={s.milestoneText}>{issue.milestone.title}</Text>
                  </View>
                )}

                {/* Assignees */}
                {issue.assignees.length > 0 && (
                  <View style={s.assigneesRow}>
                    <Text style={s.assigneesLabel}>Assignees</Text>
                    {issue.assignees.map((assignee) => (
                      <View key={assignee.id} style={s.assigneeChip}>
                        <Avatar uri={assignee.avatarUrl} username={assignee.username} size={18} />
                        <Text style={s.assigneeUsername}>@{assignee.username}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Issue body */}
              {issue.body !== null && issue.body.trim().length > 0 ? (
                <View style={s.bodyCard}>
                  {renderMarkdown(issue.body)}
                </View>
              ) : (
                <View style={s.bodyCard}>
                  <Text style={s.emptyBody}>No description provided.</Text>
                </View>
              )}

              {/* State toggle button (collaborators only) */}
              {issue.isCollaborator && (
                <View style={s.stateToggleSection}>
                  <Pressable
                    style={[
                      s.stateToggleBtn,
                      issue.state === 'open' ? s.closeBtnStyle : s.reopenBtnStyle,
                    ]}
                    onPress={handleStateToggle}
                    disabled={stateChanging}
                    accessibilityRole="button"
                    accessibilityLabel={issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                  >
                    {stateChanging ? (
                      <ActivityIndicator size="small" color={C.white} />
                    ) : (
                      <>
                        <Text style={s.stateToggleIcon}>
                          {issue.state === 'open' ? '✕' : '↺'}
                        </Text>
                        <Text style={s.stateToggleText}>
                          {issue.state === 'open' ? 'Close Issue' : 'Reopen Issue'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              {/* Comments header */}
              <View style={s.commentsHeader}>
                <Text style={s.commentsTitle}>
                  {issue.commentsCount > 0
                    ? `${issue.commentsCount} comment${issue.commentsCount > 1 ? 's' : ''}`
                    : 'No comments yet'}
                </Text>
                {commentsLoading && comments.length === 0 && (
                  <ActivityIndicator size="small" color={C.primary} />
                )}
              </View>

              {/* Comment list */}
              <FlatList<IssueComment>
                data={comments}
                renderItem={renderComment}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                  commentsLoading ? null : (
                    <Text style={s.emptyComments}>Be the first to comment.</Text>
                  )
                }
                ListFooterComponent={commentsFooter}
              />
            </>
          ) : null}
        </ScrollView>

        {/* Comment input */}
        <View style={s.inputWrapper}>
          {submitError !== null && (
            <View style={s.inputErrorBanner}>
              <Text style={s.inputErrorText} numberOfLines={2}>{submitError}</Text>
              <Pressable onPress={() => setSubmitError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.inputErrorDismiss}>{'✕'}</Text>
              </Pressable>
            </View>
          )}
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment..."
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={65536}
              returnKeyType="default"
              blurOnSubmit={false}
              accessibilityLabel="Comment input"
            />
            <Pressable
              onPress={canComment ? handleSubmitComment : undefined}
              style={[s.sendBtn, !canComment && s.sendBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: !canComment }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <Text style={[s.sendIcon, !canComment && s.sendIconDisabled]}>{'➤'}</Text>
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
  navBadge: { minWidth: 64, alignItems: 'flex-end' },

  // Issue card
  issueCard: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    padding: 16,
    paddingBottom: 18,
  },
  issueTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  authorText: { color: C.textMuted, fontSize: 13, flexShrink: 1 },
  authorName: { color: C.textSec, fontWeight: '600' },
  labelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  milestoneIcon: { fontSize: 13 },
  milestoneText: { color: C.primaryLight, fontSize: 13, fontWeight: '600' },
  assigneesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  assigneesLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.elevated,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  assigneeUsername: { color: C.textSec, fontSize: 12, fontWeight: '500' },

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

  // State toggle
  stateToggleSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  stateToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  closeBtnStyle: {
    backgroundColor: '#3B1F1F',
    borderColor: '#6B2828',
  },
  reopenBtnStyle: {
    backgroundColor: '#0D2B22',
    borderColor: C.successBorder,
  },
  stateToggleIcon: { color: C.white, fontSize: 14, fontWeight: '700' },
  stateToggleText: { color: C.white, fontSize: 15, fontWeight: '700' },

  // Comments
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    marginBottom: 10,
  },
  commentsTitle: { color: C.text, fontWeight: '700', fontSize: 14 },
  emptyComments: {
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

  // Comment input
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

  // Error / retry
  errorBox: { padding: 32, alignItems: 'center' },
  errorText: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  retryBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
