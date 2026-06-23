import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import PostCard from '../../components/Post/PostCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import { useAuthStore } from '../../store/authStore';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({
    postsCount: 0,
    followersCount: 0,
    followingCount: 0,
  });

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const [userResponse, postsResponse] = await Promise.all([
        userService.getUser(userId!),
        postService.getPosts(1, 20, userId),
      ]);
      setUser(userResponse.user || userResponse);
      setPosts(postsResponse.posts || []);
      setStats({
        postsCount: userResponse.postsCount || 0,
        followersCount: userResponse.followersCount || 0,
        followingCount: userResponse.followingCount || 0,
      });
      setIsFollowing(userResponse.isFollowing || false);
    } catch (error) {
      logger.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    try {
      await userService.followUser(userId!);
      setIsFollowing(true);
      setStats((prev) => ({
        ...prev,
        followersCount: prev.followersCount + 1,
      }));
    } catch (error) {
      logger.error('Follow error:', error);
    }
  };

  const handleUnfollow = async () => {
    try {
      await userService.unfollowUser(userId!);
      setIsFollowing(false);
      setStats((prev) => ({
        ...prev,
        followersCount: prev.followersCount - 1,
      }));
    } catch (error) {
      logger.error('Unfollow error:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Profile" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Header title="Profile" />
        <EmptyState title="User not found" message="This user may not exist" />
      </View>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <View style={styles.container}>
      <Header
        title={user.username}
        rightIcon="more-vert"
        onRightPress={() => {
          // Show user menu
        }}
      />
      <ScrollView style={styles.content}>
        {/* Profile Header */}
        <View style={styles.header}>
          {user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{user.username[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.username}>@{user.username}</Text>
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {/* Stats */}
          <View style={styles.stats}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push(`/profile/${userId}/posts`)}
            >
              <Text style={styles.statNumber}>{stats.postsCount}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push(`/profile/${userId}/followers`)}
            >
              <Text style={styles.statNumber}>{stats.followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push(`/profile/${userId}/following`)}
            >
              <Text style={styles.statNumber}>{stats.followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          {isOwnProfile ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push('/(modals)/edit-profile')}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton]}
              onPress={isFollowing ? handleUnfollow : handleFollow}
            >
              <Text style={styles.followButtonText}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Posts Grid */}
        {posts.length > 0 ? (
          <FlatList
            data={posts}
            renderItem={({ item }) => <PostCard post={item} />}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ListEmptyComponent={
              <EmptyState title="No posts yet" message="This user hasn't posted anything" />
            }
          />
        ) : (
          <EmptyState title="No posts yet" message="This user hasn't posted anything" />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  editButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  followButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  followingButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});

