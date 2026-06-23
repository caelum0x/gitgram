import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { logger } from '../../utils/logger';
import { userService } from '../../services/userService';
import api from '../../services/api';

interface SuggestedUser {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
}

interface FollowSuggestionsProps {
  maxItems?: number;
  title?: string;
}

interface UserCardProps {
  user: SuggestedUser;
  onFollowed: (userId: string) => void;
}

function UserCard({ user, onFollowed }: UserCardProps) {
  const [loading, setLoading] = useState(false);

  const handleFollow = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.post(`/api/v1/social/follow/${user.id}`);
      onFollowed(user.id);
    } catch (error: unknown) {
      logger.error('FollowSuggestions: follow failed', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={cardStyles.container}>
      {user.avatar ? (
        <Image
          source={{ uri: user.avatar }}
          style={cardStyles.avatar}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={cardStyles.avatarPlaceholder}>
          <Text style={cardStyles.avatarInitial}>
            {user.username[0].toUpperCase()}
          </Text>
        </View>
      )}

      <Text style={cardStyles.username} numberOfLines={1}>
        {user.username}
      </Text>

      {user.bio ? (
        <Text style={cardStyles.bio} numberOfLines={1}>
          {user.bio}
        </Text>
      ) : (
        <Text style={cardStyles.bioEmpty} numberOfLines={1}>
          No bio yet
        </Text>
      )}

      <TouchableOpacity
        style={[cardStyles.followBtn, loading && cardStyles.followBtnDisabled]}
        onPress={handleFollow}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={cardStyles.followBtnText}>Follow</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function FollowSuggestions({
  maxItems = 10,
  title = 'Suggested for you',
}: FollowSuggestionsProps) {
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await userService.getSuggestedUsers(1, maxItems);
        if (!cancelled) {
          const list: SuggestedUser[] = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
            ? data
            : [];
          setUsers(list.slice(0, maxItems));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          logger.error('FollowSuggestions: fetch failed', err);
          setError('Could not load suggestions.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSuggestions();
    return () => { cancelled = true; };
  }, [maxItems]);

  const handleFollowed = useCallback((userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#7C3AED" />
      </View>
    );
  }

  if (error || users.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={users}
        horizontal
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <UserCard user={item} onFollowed={handleFollowed} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const AVATAR_SIZE = 80;

const cardStyles = StyleSheet.create({
  container: {
    width: 140,
    backgroundColor: '#16213E',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0F3460',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  username: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
  },
  bio: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    width: '100%',
    lineHeight: 15,
  },
  bioEmpty: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  followBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    width: '100%',
  },
  followBtnDisabled: {
    opacity: 0.6,
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#1A1A2E',
    paddingVertical: 16,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  separator: {
    width: 10,
  },
  loadingContainer: {
    backgroundColor: '#1A1A2E',
    paddingVertical: 20,
    alignItems: 'center',
  },
});
