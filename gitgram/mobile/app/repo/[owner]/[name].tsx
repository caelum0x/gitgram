import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import repositoryService from '../../../services/repositoryService';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { logger } from '../../../utils/logger';

const REACTIONS = ['👍', '❤️', '🎉', '🚀', '👀', '🔥', '💯'] as const;
const COMMENTS_PAGE_SIZE = 20;

interface RepoUser {
  username?: string;
  avatar?: string | null;
}

interface RepoComment {
  id: string;
  content: string;
  user?: RepoUser;
}

interface RepoOrganization {
  id: string;
  name: string;
  slug: string;
}

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string | null;
  stars?: number;
  forks?: number;
  language?: string | null;
  htmlUrl?: string | null;
  isFollowing?: boolean;
  organization?: RepoOrganization | null;
}

function formatCount(value?: number): string {
  if (!value) return '0';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

export default function RepoDetail() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [repo, setRepo] = useState<Repository | null>(null);
  const [comments, setComments] = useState<RepoComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [commentsPage, setCommentsPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadRepo = useCallback(async () => {
    if (!owner || !name) return;
    setError(null);
    try {
      const [repoResponse, commentsData] = await Promise.all([
        repositoryService.get(owner, name),
        repositoryService.getComments(owner, name),
      ]);

      // Backend returns { repository, isFollowing }; tolerate either shape.
      const repository: Repository = repoResponse?.repository ?? repoResponse;
      setRepo(repository);
      setIsFollowing(Boolean(repoResponse?.isFollowing ?? repository?.isFollowing));

      const loadedComments: RepoComment[] = commentsData?.comments ?? [];
      setComments(loadedComments);
      setCommentsPage(1);
      setHasMoreComments(loadedComments.length >= COMMENTS_PAGE_SIZE);
    } catch (err) {
      logger.error('Failed to load repo', err);
      setError('Repository not found');
      setRepo(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, name]);

  useEffect(() => {
    loadRepo();
  }, [loadRepo]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadRepo();
  }, [loadRepo]);

  const handleLoadMoreComments = useCallback(async () => {
    if (!owner || !name || loadingMore || !hasMoreComments) return;
    setLoadingMore(true);
    try {
      const nextPage = commentsPage + 1;
      const data = await repositoryService.getComments(owner, name, nextPage, COMMENTS_PAGE_SIZE);
      const more: RepoComment[] = data?.comments ?? [];
      setComments((prev) => [...prev, ...more]);
      setCommentsPage(nextPage);
      setHasMoreComments(more.length >= COMMENTS_PAGE_SIZE);
    } catch (err) {
      logger.error('Failed to load more comments', err);
    } finally {
      setLoadingMore(false);
    }
  }, [owner, name, loadingMore, hasMoreComments, commentsPage]);

  const handleFollow = useCallback(async () => {
    if (!owner || !name || followLoading) return;
    setFollowLoading(true);
    const previous = isFollowing;
    setIsFollowing(!previous); // optimistic
    try {
      if (previous) {
        await repositoryService.unfollow(owner, name);
      } else {
        await repositoryService.follow(owner, name);
      }
    } catch (err) {
      logger.error('Failed to follow/unfollow', err);
      setIsFollowing(previous); // revert on failure
    } finally {
      setFollowLoading(false);
    }
  }, [owner, name, isFollowing, followLoading]);

  const handleReaction = useCallback(
    async (type: string) => {
      if (!owner || !name) return;
      setActiveReaction(type);
      try {
        await repositoryService.addReaction(owner, name, type);
      } catch (err) {
        logger.error('Failed to add reaction', err);
        setActiveReaction(null);
      }
    },
    [owner, name],
  );

  const handleAddComment = useCallback(async () => {
    if (!owner || !name || !newComment.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const response = await repositoryService.addComment(owner, name, newComment.trim());
      const created: RepoComment | undefined = response?.comment ?? response;
      if (created?.id) {
        setComments((prev) => [created, ...prev]);
      }
      setNewComment('');
    } catch (err) {
      logger.error('Failed to add comment', err);
    } finally {
      setPostingComment(false);
    }
  }, [owner, name, newComment, postingComment]);

  // The owner segment doubles as an organization slug on Gitgram. Opening it
  // routes to the org profile, which resolves by slug and shows a graceful
  // "not found" state for owners that are individual users rather than orgs.
  const handleOpenOwner = useCallback(() => {
    const slug = repo?.organization?.slug ?? repo?.owner ?? repo?.fullName?.split('/')[0];
    if (slug) {
      router.push(`/org/${slug}`);
    }
  }, [repo, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Repository" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (error || !repo) {
    return (
      <View style={styles.container}>
        <Header title="Repository" />
        <EmptyState
          title={error ?? 'Repository not found'}
          message="This repository may not exist or could not be loaded."
          icon="📦"
          actionLabel="Retry"
          onAction={loadRepo}
        />
      </View>
    );
  }

  const repoOwner = repo.owner ?? repo.fullName?.split('/')[0];

  return (
    <View style={styles.container}>
      <Header title={repo.name ?? 'Repository'} />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{repo.fullName}</Text>

          {repoOwner ? (
            <TouchableOpacity
              style={styles.ownerRow}
              onPress={handleOpenOwner}
              accessibilityRole="button"
              accessibilityLabel={`View ${repo.organization?.name ?? repoOwner} organization`}
            >
              <Icon name="business" size={16} color={Colors.accent} />
              <Text style={[styles.ownerText, styles.ownerLink]}>
                {repo.organization?.name ?? repoOwner}
              </Text>
              <Icon name="chevron-right" size={16} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}

          {repo.description ? (
            <Text style={styles.description}>{repo.description}</Text>
          ) : null}

          <View style={styles.stats}>
            <Text style={styles.stat}>⭐ {formatCount(repo.stars)}</Text>
            <Text style={styles.stat}>🍴 {formatCount(repo.forks)}</Text>
            {repo.language ? <Text style={styles.stat}>💻 {repo.language}</Text> : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, isFollowing && styles.btnFollowing]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <Text style={[styles.btnText, isFollowing && styles.btnFollowingText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>

            {repo.htmlUrl ? (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => Linking.openURL(repo.htmlUrl as string)}
              >
                <Text style={styles.btnSecondaryText}>View on GitHub</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.reactions}>
            {REACTIONS.map((emoji) => {
              const selected = activeReaction === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionPill, selected && styles.reactionPillActive]}
                  onPress={() => handleReaction(emoji)}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.comments}>
          <Text style={styles.sectionTitle}>Comments</Text>

          <View style={styles.commentInput}>
            <TextInput
              style={styles.input}
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment..."
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitBtn, (postingComment || !newComment.trim()) && styles.submitBtnDisabled]}
              onPress={handleAddComment}
              disabled={postingComment || !newComment.trim()}
            >
              {postingComment ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.submitText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Text style={styles.emptyCommentsText}>No comments yet. Be the first!</Text>
            </View>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Text style={styles.commentUser}>@{comment.user?.username ?? 'unknown'}</Text>
                <Text style={styles.commentBody}>{comment.content}</Text>
              </View>
            ))
          )}

          {hasMoreComments ? (
            <TouchableOpacity
              style={styles.loadMore}
              onPress={handleLoadMoreComments}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Text style={styles.loadMoreText}>Load more comments</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.text, marginBottom: 6 },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  ownerText: { fontSize: 14, color: Colors.textSecondary },
  ownerLink: { color: Colors.accent, fontWeight: '600' },
  description: { fontSize: 14, color: Colors.textSecondary, marginBottom: 12, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  stat: { fontSize: 14, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  btn: {
    flex: 1,
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnFollowing: { backgroundColor: Colors.muted },
  btnText: { color: Colors.white, fontWeight: '600' },
  btnFollowingText: { color: Colors.text },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnSecondaryText: { color: Colors.accent, fontWeight: '600' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  reactionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reactionPillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.muted,
  },
  emoji: { fontSize: 20 },
  comments: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 16 },
  commentInput: { marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    color: Colors.text,
    backgroundColor: Colors.surface,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: Colors.white, fontWeight: '600' },
  emptyComments: { paddingVertical: 24, alignItems: 'center' },
  emptyCommentsText: { color: Colors.textSecondary, fontSize: 14 },
  comment: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  commentUser: { fontWeight: '600', color: Colors.text, marginBottom: 4 },
  commentBody: { color: Colors.textSecondary, lineHeight: 20 },
  loadMore: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  loadMoreText: { color: Colors.accent, fontWeight: '600' },
});
