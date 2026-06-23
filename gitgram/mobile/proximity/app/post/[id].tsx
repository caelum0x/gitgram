import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { apiClient } from '../../services/gitgramApi';

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
  like: '#EF4444',
  likeOff: '#475569',
  bookmark: '#F59E0B',
  hashtag: '#A78BFA',
  codeBg: '#0D1117',
  error: '#F87171',
  white: '#FFFFFF',
  repoTagBg: '#1E3A5F',
  repoTagBorder: '#2563EB',
  repoTagText: '#60A5FA',
} as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
interface Author {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Reply {
  id: string;
  postId: string;
  parentId: string;
  author: Author;
  content: string;
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
}

interface Comment {
  id: string;
  postId: string;
  author: Author;
  content: string;
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
  replies?: Reply[];
  repliesCount?: number;
}

interface Post {
  id: string;
  authorId: string;
  author: Author;
  content: string;
  mediaUrls?: string[] | null;
  repositoryUrl: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommentsResponse {
  comments: Comment[];
  nextCursor: string | null;
}

interface SubmitCommentResponse {
  comment: Comment;
}

interface LikeResponse {
  postId: string;
  likesCount: number;
}

type SortOrder = 'latest' | 'top';
type ContentSegment = { type: 'text' | 'hashtag' | 'code'; value: string };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function parseContent(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const re = /(`[^`]+`|#[A-Za-z0-9_]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: raw.slice(lastIndex, match.index) });
    }
    const token = match[0];
    segments.push(
      token.startsWith('`')
        ? { type: 'code', value: token.slice(1, -1) }
        : { type: 'hashtag', value: token },
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: 'text', value: raw.slice(lastIndex) });
  }
  return segments;
}

function repoSlugFromUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\/github\.com\//, '').split('/').slice(0, 2).join('/') || null;
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 40 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[ss.avatarImg, circleStyle]}
        onError={() => setFailed(true)}
        accessibilityLabel={`${username} avatar`}
      />
    );
  }

  return (
    <View style={[ss.avatarPlaceholder, circleStyle]}>
      <Text style={[ss.avatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RichText component
// ---------------------------------------------------------------------------
interface RichTextProps {
  content: string;
  style?: object;
}

function RichText({ content, style }: RichTextProps) {
  const segments = useMemo(() => parseContent(content), [content]);
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        if (seg.type === 'hashtag') return <Text key={i} style={ss.hashtag}>{seg.value}</Text>;
        if (seg.type === 'code') return <Text key={i} style={ss.code}>{seg.value}</Text>;
        return <Text key={i}>{seg.value}</Text>;
      })}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// SortDropdown
// ---------------------------------------------------------------------------
interface SortDropdownProps {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
}

function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const label = value === 'latest' ? 'Latest' : 'Top';

  const pick = useCallback(
    (next: SortOrder) => { setOpen(false); onChange(next); },
    [onChange],
  );

  const handlePress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Latest', 'Top'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pick('latest');
          if (idx === 2) pick('top');
        },
      );
    } else {
      setOpen(true);
    }
  }, [pick]);

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={ss.sortTrigger}
        accessibilityRole="button"
        accessibilityLabel={`Sort by: ${label}`}
      >
        <Text style={ss.sortLabel}>{label}</Text>
        <Text style={ss.sortChevron}>{'▾'}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={ss.modalOverlay} onPress={() => setOpen(false)}>
          <View style={ss.bottomSheet}>
            <Text style={ss.sheetHeading}>Sort comments</Text>
            {(['latest', 'top'] as SortOrder[]).map((opt) => (
              <Pressable key={opt} style={ss.sheetOption} onPress={() => pick(opt)}>
                <Text style={[ss.sheetOptionText, value === opt && ss.sheetOptionActive]}>
                  {opt === 'latest' ? 'Latest' : 'Top'}
                </Text>
                {value === opt && <Text style={ss.sheetCheck}>{'✓'}</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// PostSection
// ---------------------------------------------------------------------------
interface PostSectionProps {
  post: Post;
  isOwner: boolean;
  onLikeToggle: () => void;
  onBookmarkToggle: () => void;
  onCommentPress: () => void;
  onMenuPress: () => void;
  likeLoading: boolean;
  bookmarkLoading: boolean;
}

function PostSection({
  post,
  isOwner: _isOwner,
  onLikeToggle,
  onBookmarkToggle,
  onCommentPress,
  onMenuPress,
  likeLoading,
  bookmarkLoading,
}: PostSectionProps) {
  const router = useRouter();
  const firstMedia = post.mediaUrls?.[0] ?? null;
  const repoSlug = repoSlugFromUrl(post.repositoryUrl);

  const goToProfile = useCallback(
    () => router.push(`/profile/${post.author.username}` as never),
    [router, post.author.username],
  );

  return (
    <View style={ss.postContainer}>
      {/* Author row */}
      <View style={ss.authorRow}>
        <Pressable onPress={goToProfile} accessibilityRole="link" accessibilityLabel={`View ${post.author.username} profile`}>
          <Avatar uri={post.author.avatarUrl} username={post.author.username} size={44} />
        </Pressable>

        <View style={ss.authorMeta}>
          <Pressable onPress={goToProfile}>
            <Text style={ss.displayName} numberOfLines={1}>
              {post.author.displayName ?? post.author.username}
            </Text>
            <Text style={ss.usernameTimestamp} numberOfLines={1}>
              @{post.author.username} · {timeAgo(post.createdAt)}
            </Text>
          </Pressable>

          {repoSlug !== null && (
            <View style={ss.repoTag}>
              <Text style={ss.repoTagIcon}>{'⎇'}</Text>
              <Text style={ss.repoTagText} numberOfLines={1}>{repoSlug}</Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={onMenuPress}
          style={({ pressed }) => [ss.menuButton, pressed && ss.menuButtonPressed]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Post options"
        >
          <Text style={ss.menuDots}>{'⋯'}</Text>
        </Pressable>
      </View>

      {/* Post text */}
      <RichText content={post.content} style={ss.postContent} />

      {/* Media */}
      {firstMedia !== null && (
        <Image
          source={{ uri: firstMedia }}
          style={ss.postMedia}
          resizeMode="cover"
          accessibilityLabel="Post image"
        />
      )}

      <View style={ss.divider} />

      {/* Action bar */}
      <View style={ss.actionBar}>
        {/* Like */}
        <Pressable
          style={({ pressed }) => [ss.actionButton, pressed && ss.actionButtonPressed]}
          onPress={onLikeToggle}
          disabled={likeLoading}
          accessibilityRole="button"
          accessibilityLabel={post.isLiked ? 'Unlike post' : 'Like post'}
        >
          {likeLoading ? (
            <ActivityIndicator size="small" color={C.like} />
          ) : (
            <Text style={[ss.actionIcon, { color: post.isLiked ? C.like : C.likeOff }]}>
              {post.isLiked ? '♥' : '♡'}
            </Text>
          )}
          <Text style={[ss.actionCount, { color: post.isLiked ? C.like : C.textMuted }]}>
            {formatCount(post.likesCount)}
          </Text>
        </Pressable>

        {/* Comment */}
        <Pressable
          style={({ pressed }) => [ss.actionButton, pressed && ss.actionButtonPressed]}
          onPress={onCommentPress}
          accessibilityRole="button"
          accessibilityLabel="Comment on post"
        >
          <Text style={[ss.actionIcon, { color: C.textMuted }]}>{'💬'}</Text>
          <Text style={ss.actionCount}>{formatCount(post.commentsCount)}</Text>
        </Pressable>

        {/* Share */}
        <Pressable
          style={({ pressed }) => [ss.actionButton, pressed && ss.actionButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Share post"
        >
          <Text style={[ss.actionIcon, { color: C.textMuted }]}>{'↗'}</Text>
          <Text style={ss.actionCount}>Share</Text>
        </Pressable>

        {/* Bookmark */}
        <Pressable
          style={({ pressed }) => [ss.actionButton, pressed && ss.actionButtonPressed]}
          onPress={onBookmarkToggle}
          disabled={bookmarkLoading}
          accessibilityRole="button"
          accessibilityLabel={post.isBookmarked ? 'Remove bookmark' : 'Bookmark post'}
        >
          {bookmarkLoading ? (
            <ActivityIndicator size="small" color={C.bookmark} />
          ) : (
            <Text style={[ss.actionIcon, { color: post.isBookmarked ? C.bookmark : C.likeOff }]}>
              {post.isBookmarked ? '🔖' : '🏷'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ReplyItem
// ---------------------------------------------------------------------------
interface ReplyItemProps {
  reply: Reply;
  onLikeToggle: (replyId: string, parentId: string) => void;
}

function ReplyItem({ reply, onLikeToggle }: ReplyItemProps) {
  return (
    <View style={ss.replyRow}>
      <Avatar uri={reply.author.avatarUrl} username={reply.author.username} size={28} />
      <View style={ss.flex}>
        <View style={ss.commentMeta}>
          <Text style={ss.replyUsername} numberOfLines={1}>
            {reply.author.displayName ?? reply.author.username}
          </Text>
          <Text style={ss.timestamp}>{timeAgo(reply.createdAt)}</Text>
        </View>

        <RichText content={reply.content} style={ss.replyContent} />

        <Pressable
          style={({ pressed }) => [ss.likeButton, pressed && ss.likeButtonPressed]}
          onPress={() => onLikeToggle(reply.id, reply.parentId)}
          accessibilityRole="button"
          accessibilityLabel={reply.isLiked ? 'Unlike reply' : 'Like reply'}
        >
          <Text style={[ss.likeIcon, { color: reply.isLiked ? C.like : C.likeOff }]}>
            {reply.isLiked ? '♥' : '♡'}
          </Text>
          {reply.likesCount > 0 && (
            <Text style={[ss.likeCount, { color: reply.isLiked ? C.like : C.textMuted }]}>
              {formatCount(reply.likesCount)}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------
interface CommentItemProps {
  comment: Comment;
  onLikeToggle: (commentId: string) => void;
  onReplyPress: (commentId: string, username: string) => void;
  onReplyLikeToggle: (replyId: string, parentId: string) => void;
}

function CommentItem({ comment, onLikeToggle, onReplyPress, onReplyLikeToggle }: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = comment.replies?.length ?? comment.repliesCount ?? 0;

  return (
    <View>
      <View style={ss.commentRow}>
        <Avatar uri={comment.author.avatarUrl} username={comment.author.username} size={34} />
        <View style={ss.flex}>
          <View style={ss.commentMeta}>
            <Text style={ss.commentUsername} numberOfLines={1}>
              {comment.author.displayName ?? comment.author.username}
            </Text>
            <Text style={ss.timestamp}>{timeAgo(comment.createdAt)}</Text>
          </View>

          <RichText content={comment.content} style={ss.commentContent} />

          <View style={ss.commentActions}>
            <Pressable
              style={({ pressed }) => [ss.likeButton, pressed && ss.likeButtonPressed]}
              onPress={() => onLikeToggle(comment.id)}
              accessibilityRole="button"
              accessibilityLabel={comment.isLiked ? 'Unlike comment' : 'Like comment'}
            >
              <Text style={[ss.likeIcon, { color: comment.isLiked ? C.like : C.likeOff }]}>
                {comment.isLiked ? '♥' : '♡'}
              </Text>
              {comment.likesCount > 0 && (
                <Text style={[ss.likeCount, { color: comment.isLiked ? C.like : C.textMuted }]}>
                  {formatCount(comment.likesCount)}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [ss.replyButton, pressed && ss.likeButtonPressed]}
              onPress={() => onReplyPress(comment.id, comment.author.username)}
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${comment.author.username}`}
            >
              <Text style={ss.replyButtonText}>Reply</Text>
            </Pressable>
          </View>

          {replyCount > 0 && (
            <Pressable
              onPress={() => setShowReplies((prev) => !prev)}
              style={ss.toggleReplies}
              accessibilityRole="button"
              accessibilityLabel={showReplies ? 'Hide replies' : `Show ${replyCount} replies`}
            >
              <View style={ss.replyConnector} />
              <Text style={ss.toggleRepliesText}>
                {showReplies
                  ? 'Hide replies'
                  : `View ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {showReplies &&
        comment.replies?.map((reply) => (
          <ReplyItem key={reply.id} reply={reply} onLikeToggle={onReplyLikeToggle} />
        ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CommentInput
// ---------------------------------------------------------------------------
interface CommentInputProps {
  inputRef: React.RefObject<TextInput>;
  value: string;
  replyingTo: string | null;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancelReply: () => void;
  isSubmitting: boolean;
}

function CommentInput({
  inputRef,
  value,
  replyingTo,
  onChange,
  onSubmit,
  onCancelReply,
  isSubmitting,
}: CommentInputProps) {
  const canSubmit = value.trim().length > 0 && !isSubmitting;

  return (
    <View style={ss.inputWrapper}>
      {replyingTo !== null && (
        <View style={ss.replyBanner}>
          <Text style={ss.replyBannerText}>
            Replying to <Text style={ss.replyBannerUsername}>@{replyingTo}</Text>
          </Text>
          <Pressable
            onPress={onCancelReply}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
          >
            <Text style={ss.cancelReplyIcon}>{'✕'}</Text>
          </Pressable>
        </View>
      )}

      <View style={ss.inputRow}>
        <TextInput
          ref={inputRef}
          style={ss.textInput}
          value={value}
          onChangeText={onChange}
          placeholder={replyingTo !== null ? `Reply to @${replyingTo}…` : 'Add a comment…'}
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={500}
          returnKeyType="default"
          blurOnSubmit={false}
          accessibilityLabel="Comment text input"
        />
        <Pressable
          onPress={canSubmit ? onSubmit : undefined}
          style={[ss.sendButton, !canSubmit && ss.sendButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <Text style={[ss.sendIcon, !canSubmit && ss.sendIconDisabled]}>{'➤'}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function PostDetailSkeleton() {
  return (
    <View style={ss.skeletonContainer}>
      <View style={ss.authorRow}>
        <View style={ss.skeletonAvatar} />
        <View style={ss.flex}>
          <View style={ss.skeletonName} />
          <View style={ss.skeletonHandle} />
        </View>
      </View>
      <View style={ss.skeletonLine} />
      <View style={[ss.skeletonLine, { width: '85%' }]} />
      <View style={[ss.skeletonLine, { width: '60%', marginBottom: 0 }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

// Replace with real auth context (e.g. useAuthContext().user.id)
const CURRENT_USER_ID = '';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Post state
  const [post, setPost] = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOrder>('latest');
  const loadingMoreRef = useRef(false);

  // Input state
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const isOwner = post?.authorId === CURRENT_USER_ID;

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const fetchPost = useCallback(async (): Promise<void> => {
    if (!id) return;
    setPostLoading(true);
    setPostError(null);
    try {
      const data = await apiClient<Post>(`/v1/posts/${encodeURIComponent(id)}`);
      setPost(data);
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      setPostLoading(false);
    }
  }, [id]);

  const fetchComments = useCallback(
    async (cursor?: string | null, sortOverride?: SortOrder): Promise<void> => {
      if (!id || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const params = new URLSearchParams({ limit: '20', sort: sortOverride ?? sort });
        if (cursor) params.set('cursor', cursor);
        const data = await apiClient<CommentsResponse>(
          `/v1/posts/${encodeURIComponent(id)}/comments?${params.toString()}`,
        );
        const incoming = data.comments ?? [];
        setComments((prev) => (cursor ? [...prev, ...incoming] : incoming));
        setNextCursor(data.nextCursor ?? null);
      } catch (err: unknown) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setCommentsLoading(false);
        loadingMoreRef.current = false;
      }
    },
    [id, sort],
  );

  useEffect(() => {
    fetchPost();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleSortChange = useCallback(
    (newSort: SortOrder) => {
      setSort(newSort);
      setComments([]);
      setNextCursor(null);
      fetchComments(null, newSort);
    },
    [fetchComments],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPost(), fetchComments(null)]);
    setRefreshing(false);
  }, [fetchPost, fetchComments]);

  const handlePostLikeToggle = useCallback(async (): Promise<void> => {
    if (!post || likeLoading) return;
    const wasLiked = post.isLiked;
    // Optimistic update
    setPost((p) =>
      p ? { ...p, isLiked: !wasLiked, likesCount: p.likesCount + (wasLiked ? -1 : 1) } : p,
    );
    setLikeLoading(true);
    try {
      const data = await apiClient<LikeResponse>(`/v1/posts/${post.id}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
      });
      setPost((p) => (p ? { ...p, likesCount: data.likesCount } : p));
    } catch {
      // Revert on error
      setPost((p) =>
        p ? { ...p, isLiked: wasLiked, likesCount: p.likesCount + (wasLiked ? 1 : -1) } : p,
      );
    } finally {
      setLikeLoading(false);
    }
  }, [post, likeLoading]);

  const handleBookmarkToggle = useCallback(async (): Promise<void> => {
    if (!post || bookmarkLoading) return;
    const wasBookmarked = post.isBookmarked ?? false;
    setPost((p) => (p ? { ...p, isBookmarked: !wasBookmarked } : p));
    setBookmarkLoading(true);
    try {
      await apiClient(`/v1/posts/${post.id}/bookmark`, {
        method: wasBookmarked ? 'DELETE' : 'POST',
      });
    } catch {
      setPost((p) => (p ? { ...p, isBookmarked: wasBookmarked } : p));
    } finally {
      setBookmarkLoading(false);
    }
  }, [post, bookmarkLoading]);

  const handleCommentLikeToggle = useCallback(
    async (commentId: string): Promise<void> => {
      const target = comments.find((c) => c.id === commentId);
      if (!target || !id) return;
      const wasLiked = target.isLiked;
      setComments((prev) =>
        prev.map((c) =>
          c.id !== commentId
            ? c
            : { ...c, isLiked: !wasLiked, likesCount: c.likesCount + (wasLiked ? -1 : 1) },
        ),
      );
      try {
        await apiClient(`/v1/posts/${id}/comments/${commentId}/like`, {
          method: wasLiked ? 'DELETE' : 'POST',
        });
      } catch {
        setComments((prev) =>
          prev.map((c) =>
            c.id !== commentId
              ? c
              : { ...c, isLiked: wasLiked, likesCount: c.likesCount + (wasLiked ? 1 : -1) },
          ),
        );
      }
    },
    [comments, id],
  );

  const handleReplyLikeToggle = useCallback(
    async (replyId: string, parentId: string): Promise<void> => {
      if (!id) return;
      const target = comments.find((c) => c.id === parentId)?.replies?.find((r) => r.id === replyId);
      if (!target) return;
      const wasLiked = target.isLiked;

      const updateReply = (liked: boolean) =>
        setComments((prev) =>
          prev.map((c) =>
            c.id !== parentId
              ? c
              : {
                  ...c,
                  replies: c.replies?.map((r) =>
                    r.id !== replyId
                      ? r
                      : { ...r, isLiked: liked, likesCount: r.likesCount + (liked ? 1 : -1) },
                  ),
                },
          ),
        );

      updateReply(!wasLiked);
      try {
        await apiClient(`/v1/posts/${id}/comments/${replyId}/like`, {
          method: wasLiked ? 'DELETE' : 'POST',
        });
      } catch {
        updateReply(wasLiked);
      }
    },
    [comments, id],
  );

  const handleSubmitComment = useCallback(async (): Promise<void> => {
    const content = commentText.trim();
    if (!content || submitting || !id) return;
    setSubmitting(true);
    setCommentText('');
    try {
      const body: Record<string, string> = { content };
      if (replyingToId) body.parentId = replyingToId;
      const data = await apiClient<SubmitCommentResponse>(`/v1/posts/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (replyingToId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id !== replyingToId
              ? c
              : {
                  ...c,
                  replies: [...(c.replies ?? []), { ...data.comment, parentId: replyingToId }],
                },
          ),
        );
      } else {
        setComments((prev) => [...prev, data.comment]);
      }
      setPost((p) => (p ? { ...p, commentsCount: p.commentsCount + 1 } : p));
      setReplyingToId(null);
      setReplyingToUsername(null);
    } catch (err: unknown) {
      setCommentText(content);
      setCommentsError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, id, replyingToId]);

  const handleReplyPress = useCallback((commentId: string, username: string) => {
    setReplyingToId(commentId);
    setReplyingToUsername(username);
    inputRef.current?.focus();
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingToId(null);
    setReplyingToUsername(null);
  }, []);

  const handleFocusCommentInput = useCallback(() => {
    setReplyingToId(null);
    setReplyingToUsername(null);
    inputRef.current?.focus();
  }, []);

  const confirmDelete = useCallback(() => {
    Alert.alert('Delete post', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          apiClient(`/v1/posts/${encodeURIComponent(id ?? '')}`, { method: 'DELETE' })
            .then(() => router.back())
            .catch(() => Alert.alert('Error', 'Could not delete the post. Please try again.'));
        },
      },
    ]);
  }, [id, router]);

  const handleMenuPress = useCallback(() => {
    const ownerOptions = ['Cancel', 'Edit post', 'Delete post'];
    const viewerOptions = ['Cancel', 'Report post'];
    const options = isOwner ? ownerOptions : viewerOptions;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex: isOwner ? 2 : undefined },
        (idx) => {
          if (isOwner && idx === 1) router.push(`/post/edit/${id}` as never);
          if (isOwner && idx === 2) confirmDelete();
          if (!isOwner && idx === 1) router.push(`/report?type=post&id=${id}` as never);
        },
      );
    } else {
      Alert.alert(
        'Post options',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          ...(isOwner
            ? [
                { text: 'Edit post', onPress: () => router.push(`/post/edit/${id}` as never) },
                { text: 'Delete post', style: 'destructive' as const, onPress: confirmDelete },
              ]
            : [
                {
                  text: 'Report post',
                  onPress: () => router.push(`/report?type=post&id=${id}` as never),
                },
              ]),
        ],
        { cancelable: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, id, router, confirmDelete]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMoreRef.current) fetchComments(nextCursor);
  }, [nextCursor, fetchComments]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
        comment={item}
        onLikeToggle={handleCommentLikeToggle}
        onReplyPress={handleReplyPress}
        onReplyLikeToggle={handleReplyLikeToggle}
      />
    ),
    [handleCommentLikeToggle, handleReplyPress, handleReplyLikeToggle],
  );

  const commentsListFooter = useMemo(() => {
    if (commentsLoading && comments.length > 0) {
      return (
        <View style={ss.loadMoreIndicator}>
          <ActivityIndicator size="small" color={C.primary} />
        </View>
      );
    }
    if (nextCursor && !commentsLoading) {
      return (
        <Pressable
          style={ss.loadMoreButton}
          onPress={handleLoadMore}
          accessibilityRole="button"
          accessibilityLabel="Load more comments"
        >
          <Text style={ss.loadMoreText}>Load more</Text>
        </Pressable>
      );
    }
    return null;
  }, [commentsLoading, comments.length, nextCursor, handleLoadMore]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={ss.safeArea}>
      {/* Header */}
      <View style={ss.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={ss.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={ss.backIcon}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={ss.navTitle} numberOfLines={1}>Post</Text>
        <View style={ss.navSpacer} />
      </View>

      <KeyboardAvoidingView
        style={ss.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollRef}
          style={ss.flex}
          contentContainerStyle={ss.scrollContent}
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
          {/* Post body */}
          {postLoading ? (
            <PostDetailSkeleton />
          ) : postError !== null ? (
            <View style={ss.errorBox}>
              <Text style={ss.errorText}>{postError}</Text>
              <Pressable onPress={fetchPost} style={ss.retryButton} accessibilityRole="button">
                <Text style={ss.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : post !== null ? (
            <PostSection
              post={post}
              isOwner={isOwner}
              onLikeToggle={handlePostLikeToggle}
              onBookmarkToggle={handleBookmarkToggle}
              onCommentPress={handleFocusCommentInput}
              onMenuPress={handleMenuPress}
              likeLoading={likeLoading}
              bookmarkLoading={bookmarkLoading}
            />
          ) : null}

          {/* Comments header */}
          {!postLoading && postError === null && (
            <View style={ss.commentsHeader}>
              <View style={ss.commentsHeaderLeft}>
                <Text style={ss.commentsTitle}>Comments</Text>
                {commentsLoading && comments.length === 0 ? (
                  <ActivityIndicator size="small" color={C.primary} style={ss.commentsSpinner} />
                ) : (
                  <Text style={ss.commentsCount}>
                    {formatCount(post?.commentsCount ?? comments.length)}
                  </Text>
                )}
              </View>
              <SortDropdown value={sort} onChange={handleSortChange} />
            </View>
          )}

          {/* Comments error banner */}
          {commentsError !== null && (
            <View style={ss.commentErrorBanner}>
              <Text style={ss.commentErrorText}>{commentsError}</Text>
              <TouchableOpacity
                onPress={() => setCommentsError(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
              >
                <Text style={ss.errorDismiss}>{'✕'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Comments list */}
          {!postLoading && postError === null && (
            <FlatList<Comment>
              data={comments}
              renderItem={renderComment}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={
                commentsLoading ? null : (
                  <View style={ss.emptyComments}>
                    <Text style={ss.emptyCommentsText}>No comments yet. Be the first!</Text>
                  </View>
                )
              }
              ListFooterComponent={commentsListFooter}
            />
          )}
        </ScrollView>

        {/* Comment input */}
        <CommentInput
          inputRef={inputRef}
          value={commentText}
          replyingTo={replyingToUsername}
          onChange={setCommentText}
          onSubmit={handleSubmitComment}
          onCancelReply={handleCancelReply}
          isSubmitting={submitting}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const ss = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Navigation bar
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: C.primaryLight, fontSize: 22, fontWeight: '600' },
  navTitle: {
    flex: 1,
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  navSpacer: { width: 40 },

  // Post container
  postContainer: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  authorRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  authorMeta: { flex: 1, gap: 4 },
  displayName: { color: C.text, fontWeight: '700', fontSize: 15, lineHeight: 20 },
  usernameTimestamp: { color: C.textMuted, fontSize: 12 },
  repoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: C.repoTagBg,
    borderWidth: 1,
    borderColor: C.repoTagBorder,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    gap: 4,
  },
  repoTagIcon: { color: C.repoTagText, fontSize: 11 },
  repoTagText: { color: C.repoTagText, fontSize: 11, fontWeight: '600', maxWidth: 200 },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginTop: 2,
  },
  menuButtonPressed: { backgroundColor: C.elevated },
  menuDots: { color: C.textMuted, fontSize: 22, letterSpacing: 1 },
  postContent: { color: C.text, fontSize: 16, lineHeight: 24, marginBottom: 14 },
  postMedia: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    marginBottom: 14,
    backgroundColor: C.elevated,
  },
  divider: { height: 1, backgroundColor: C.border, marginBottom: 4 },

  // Action bar
  actionBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
    flex: 1,
    justifyContent: 'center',
  },
  actionButtonPressed: { backgroundColor: C.elevated },
  actionIcon: { fontSize: 18, lineHeight: 22 },
  actionCount: { color: C.textMuted, fontSize: 13, fontWeight: '500' },

  // Avatar
  avatarImg: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: C.primaryDark,
  },
  avatarPlaceholder: {
    backgroundColor: C.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.primaryDark,
  },
  avatarInitial: { color: C.white, fontWeight: '700', textAlign: 'center' },

  // Rich text
  hashtag: { color: C.hashtag, fontWeight: '600' },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: C.codeBg,
    color: C.primaryLight,
    fontSize: 13,
  },

  // Sort dropdown
  sortTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
  },
  sortLabel: { color: C.textSec, fontSize: 12, fontWeight: '600' },
  sortChevron: { color: C.textMuted, fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: C.elevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  sheetHeading: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetOptionText: { color: C.text, fontSize: 16 },
  sheetOptionActive: { color: C.primary, fontWeight: '700' },
  sheetCheck: { color: C.primary, fontSize: 16, fontWeight: '700' },

  // Comments section
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.elevated,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  commentsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentsTitle: { color: C.text, fontWeight: '700', fontSize: 15 },
  commentsCount: { color: C.textMuted, fontSize: 13, fontWeight: '500' },
  commentsSpinner: { marginLeft: 4 },

  // Comment row
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
    backgroundColor: C.surface,
  },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  commentUsername: { color: C.text, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  timestamp: { color: C.textMuted, fontSize: 11 },
  commentContent: { color: C.textSec, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
  },
  likeButtonPressed: { backgroundColor: C.elevated },
  likeIcon: { fontSize: 14 },
  likeCount: { fontSize: 12, fontWeight: '500' },
  replyButton: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  replyButtonText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  toggleReplies: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  replyConnector: { width: 24, height: 1, backgroundColor: C.border },
  toggleRepliesText: { color: C.primaryLight, fontSize: 12, fontWeight: '600' },

  // Reply row
  replyRow: {
    flexDirection: 'row',
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
    backgroundColor: C.bg,
  },
  replyUsername: { color: C.textSec, fontWeight: '600', fontSize: 12, flexShrink: 1 },
  replyContent: { color: C.textSec, fontSize: 13, lineHeight: 19, marginBottom: 5 },

  // Comment input
  inputWrapper: { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: C.elevated,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  replyBannerText: { color: C.textMuted, fontSize: 12 },
  replyBannerUsername: { color: C.primaryLight, fontWeight: '600' },
  cancelReplyIcon: { color: C.textMuted, fontSize: 14, fontWeight: '700' },
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
    maxHeight: 88,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendButtonDisabled: { backgroundColor: C.elevated },
  sendIcon: { color: C.white, fontSize: 17 },
  sendIconDisabled: { color: C.textMuted },

  // Skeleton
  skeletonContainer: {
    padding: 16,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.elevated },
  skeletonName: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.elevated,
    marginBottom: 6,
  },
  skeletonHandle: { width: 80, height: 11, borderRadius: 5, backgroundColor: C.elevated },
  skeletonLine: {
    width: '100%',
    height: 13,
    borderRadius: 6,
    backgroundColor: C.elevated,
    marginTop: 14,
    marginBottom: 8,
  },

  // Error & empty states
  errorBox: { padding: 32, alignItems: 'center', backgroundColor: C.surface },
  errorText: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  retryButton: {
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: C.white, fontWeight: '700', fontSize: 14 },
  commentErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1F1F',
    borderBottomWidth: 1,
    borderBottomColor: '#5C2D2D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  commentErrorText: { flex: 1, color: C.error, fontSize: 13, lineHeight: 18 },
  errorDismiss: { color: C.textMuted, fontSize: 16 },
  emptyComments: { paddingVertical: 48, paddingHorizontal: 32, alignItems: 'center' },
  emptyCommentsText: { color: C.textMuted, fontSize: 15, textAlign: 'center' },
  loadMoreIndicator: { paddingVertical: 16, alignItems: 'center' },
  loadMoreButton: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    backgroundColor: C.elevated,
  },
  loadMoreText: { color: C.primaryLight, fontSize: 14, fontWeight: '600' },
});
