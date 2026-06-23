import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../services/gitgramApi';
import type { UserProfile } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PURPLE = '#9333EA';
const PURPLE_DIM = 'rgba(147, 51, 234, 0.15)';
const BG = '#0F0F1A';
const SURFACE = '#1A1A2E';
const BORDER = '#2D2D50';
const TEXT = '#E2E8F0';
const TEXT_SEC = '#94A3B8';
const TEXT_HINT = '#64748B';
const AVATAR_BG = '#2D2D50';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingCompletePayload {
  interests: string[];
  followIds: string[];
}

interface SuggestedUsersResponse {
  users: UserProfile[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri: string | null;
  displayName: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, displayName, username, size = 48 }: AvatarProps) {
  const initials = (displayName ?? username).slice(0, 2).toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        accessibilityLabel={`${displayName ?? username} avatar`}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

interface UserRowProps {
  user: UserProfile;
  isFollowing: boolean;
  onToggle: (id: string) => void;
}

function UserRow({ user, isFollowing, onToggle }: UserRowProps) {
  return (
    <View style={styles.userRow}>
      <Avatar
        uri={user.avatarUrl}
        displayName={user.displayName}
        username={user.username}
      />

      <View style={styles.userInfo}>
        <Text style={styles.displayName} numberOfLines={1}>
          {user.displayName ?? user.username}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{user.username}
        </Text>
        {user.bio ? (
          <Text style={styles.bio} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.followBtn,
          isFollowing && styles.followBtnActive,
          pressed && styles.pressed,
        ]}
        onPress={() => onToggle(user.id)}
        accessibilityRole="button"
        accessibilityLabel={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
        accessibilityState={{ selected: isFollowing }}
      >
        <Text
          style={[
            styles.followBtnText,
            isFollowing && styles.followBtnTextActive,
          ]}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OnboardingFollowScreen() {
  const params = useLocalSearchParams<{ interests?: string }>();
  const interests: string[] = params.interests
    ? (JSON.parse(params.interests) as string[])
    : [];

  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------------------
  // Load suggested users
  // -------------------------------------------------------------------------

  const fetchSuggestedUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const query = interests.length > 0 ? `?interests=${interests.join(',')}` : '';
      const data = await apiClient<SuggestedUsersResponse>(
        `/v1/onboarding/suggested-users${query}`,
      );
      setSuggestedUsers(data.users);
    } catch {
      // Non-fatal: show empty state; user can still skip
      setSuggestedUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [interests.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSuggestedUsers();
  }, [fetchSuggestedUsers]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function toggleFollow(id: string) {
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleComplete() {
    setSubmitting(true);
    try {
      const payload: OnboardingCompletePayload = {
        interests,
        followIds: [...followingIds],
      };
      await apiClient<void>('/v1/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Could not complete onboarding', message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    // Skip still records interests but with no follows
    handleComplete();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const followingCount = followingIds.size;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          {/* Step indicator */}
          <View style={styles.stepRow}>
            <View style={styles.stepDotDone} />
            <View style={styles.stepDotDone} />
            <View style={[styles.stepDot, styles.stepDotActive]} />
          </View>

          <Text style={styles.heading}>Follow some developers</Text>
          <Text style={styles.subheading}>
            Based on your interests — follow anyone who inspires you.
          </Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* User list                                                         */}
        {/* ---------------------------------------------------------------- */}
        {loadingUsers ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator color={PURPLE} size="large" />
            <Text style={styles.loadingText}>Finding developers for you…</Text>
          </View>
        ) : suggestedUsers.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Text style={styles.emptyText}>
              No suggestions available right now. You can find people to follow
              once you're in the app.
            </Text>
          </View>
        ) : (
          <FlatList
            data={suggestedUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <UserRow
                user={item}
                isFollowing={followingIds.has(item.id)}
                onToggle={toggleFollow}
              />
            )}
          />
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.footer}>
          {followingCount > 0 ? (
            <Text style={styles.followCount}>
              Following {followingCount} developer{followingCount !== 1 ? 's' : ''}
            </Text>
          ) : (
            <Text style={styles.hint}>You can follow people later</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.continueBtn,
              submitting && styles.continueBtnDisabled,
              pressed && !submitting && styles.pressed,
            ]}
            onPress={handleComplete}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Finish onboarding and go to the app"
            accessibilityState={{ disabled: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.continueBtnText}>
                {followingCount > 0 ? 'Continue' : "Let's go"}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
            onPress={handleSkip}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Skip following and go to app"
          >
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    marginBottom: 20,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BORDER,
  },
  stepDotDone: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PURPLE,
    opacity: 0.5,
  },
  stepDotActive: {
    backgroundColor: PURPLE,
    width: 24,
    opacity: 1,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    color: TEXT_SEC,
    lineHeight: 21,
  },
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    color: TEXT_SEC,
    fontSize: 14,
  },
  emptyWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  emptyText: {
    color: TEXT_SEC,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    paddingBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    backgroundColor: AVATAR_BG,
  },
  avatarFallback: {
    backgroundColor: AVATAR_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '600',
  },
  username: {
    color: TEXT_SEC,
    fontSize: 13,
  },
  bio: {
    color: TEXT_HINT,
    fontSize: 12,
    marginTop: 1,
  },
  followBtn: {
    borderWidth: 1.5,
    borderColor: PURPLE,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  followBtnActive: {
    backgroundColor: PURPLE_DIM,
  },
  followBtnText: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: '600',
  },
  followBtnTextActive: {
    color: TEXT,
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  followCount: {
    textAlign: 'center',
    fontSize: 13,
    color: PURPLE,
    fontWeight: '500',
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: TEXT_HINT,
  },
  continueBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  continueBtnDisabled: {
    opacity: 0.65,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    color: TEXT_HINT,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});
