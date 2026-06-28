import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import { reelService } from '../../services/reelService';
import { githubService } from '../../services/githubService';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PostCard from '../../components/Post/PostCard';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../utils/logger';

import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved' | 'projects'>('posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [githubProjects, setGithubProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    postsCount: 0,
    followersCount: 0,
    followingCount: 0,
  });

  useEffect(() => {
    if (user) {
      loadProfileData();
    }
  }, [user, activeTab]);

  const loadProfileData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await userService.getUser(user.id);
      setStats({
        postsCount: response.postsCount || 0,
        followersCount: response.followersCount || 0,
        followingCount: response.followingCount || 0,
      });

      if (activeTab === 'posts') {
        const postsResponse = await postService.getPosts(1, 20, user.id);
        setPosts(postsResponse.posts || []);
      } else if (activeTab === 'reels') {
        const reelsResponse = await reelService.getReels(1, 20, user.id);
        setReels(reelsResponse.reels || []);
      } else if (activeTab === 'saved') {
        // Load saved posts
        const savedResponse = await api.get('/posts/saved');
        setSavedPosts(savedResponse.data.posts || []);
      } else if (activeTab === 'projects') {
        const projectsResponse = await githubService.getUserProjects();
        setGithubProjects(projectsResponse.projects || []);
      }
    } catch (error) {
      logger.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareProfile = async () => {
    if (!user) return;
    try {
      await Share.share({
        message: `Check out @${user.username} on Gitgram`,
        url: `https://gitgram.app/${user.username}`,
      });
    } catch (error) {
      logger.error('Share profile error:', error);
    }
  };

  if (!user) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{user.username}</Text>
        <TouchableOpacity style={styles.moreButton} onPress={() => router.push('/menu')}>
          <Icon name="menu" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileTop}>
            {/* Avatar */}
            <View>
              {user.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {user.username[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            {/* Stats */}
            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{stats.postsCount || 0}</Text>
                <Text style={styles.statLabel}>Projects</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {stats.followersCount >= 1000
                    ? `${(stats.followersCount / 1000).toFixed(1)}k`
                    : stats.followersCount}
                </Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{stats.followingCount || 0}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
            </View>
          </View>

          {/* Name, Username, Bio */}
          <View style={styles.userInfo}>
            <Text style={styles.name}>{user.username}</Text>
            <Text style={styles.username}>@{user.username}</Text>
            {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
          </View>

          {/* Own-profile actions: edit + share (Follow/Message belong on other users' profiles) */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.followButton}
              onPress={() => router.push('/(modals)/edit-profile')}
            >
              <Text style={styles.followButtonText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageButton} onPress={handleShareProfile}>
              <Text style={styles.messageButtonText}>Share Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sticky Tabs */}
        <View style={styles.stickyTabs}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
              onPress={() => setActiveTab('posts')}
            >
              <Icon name="grid-on" size={24} color={activeTab === 'posts' ? Colors.text : Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'projects' && styles.activeTab]}
              onPress={() => setActiveTab('projects')}
            >
              <Icon name="code" size={24} color={activeTab === 'projects' ? Colors.text : Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'reels' && styles.activeTab]}
              onPress={() => setActiveTab('reels')}
            >
              <Icon name="movie" size={24} color={activeTab === 'reels' ? Colors.text : Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
              onPress={() => setActiveTab('saved')}
            >
              <Icon name="bookmark-border" size={24} color={activeTab === 'saved' ? Colors.text : Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Saved Projects Button */}
        <TouchableOpacity
          style={styles.savedProjectsButton}
          onPress={() => router.push('/project/saved')}
        >
          <Icon name="bookmark" size={20} color={Colors.accent} />
          <Text style={styles.savedProjectsButtonText}>Saved Projects</Text>
        </TouchableOpacity>

        {/* Content */}
        {loading ? (
          <LoadingSpinner />
        ) : (
          <View style={styles.contentContainer}>
            {/* Grid Content */}
            {activeTab === 'posts' && posts.length > 0 && (
              <View style={styles.gridContainer}>
                {posts.map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.gridItem}
                    onPress={() => router.push(`/post/${post.id}`)}
                  >
                    {post.mediaUrl && post.mediaType === 'image' ? (
                      <Image
                        source={{ uri: post.mediaUrl }}
                        style={styles.gridImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.gridImage, styles.codePlaceholder]}>
                        <Text style={styles.codePlaceholderText}>💻</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {activeTab === 'reels' && reels.length > 0 && (
              <View style={styles.gridContainer}>
                {reels.map((reel) => (
                  <TouchableOpacity
                    key={reel.id}
                    style={[styles.gridItem, { height: 200 }]} // Taller for reels
                    onPress={() => router.push(`/reel/${reel.id}`)}
                  >
                    <Image
                      source={{ uri: reel.thumbnailUrl }}
                      style={styles.gridImage}
                      contentFit="cover"
                    />
                    <View style={styles.reelIconContainer}>
                      <Icon name="play-arrow" size={20} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {activeTab === 'saved' && savedPosts.length > 0 && (
              <View style={styles.gridContainer}>
                {savedPosts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.gridItem}
                    onPress={() => router.push(`/post/${item.id}`)}
                  >
                    {item.mediaUrl && item.mediaType === 'image' ? (
                      <Image
                        source={{ uri: item.mediaUrl }}
                        style={styles.gridImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.gridImage, styles.codePlaceholder]}>
                        <Text style={styles.codePlaceholderText}>💻</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {activeTab === 'projects' && githubProjects.length > 0 && (
              <View style={styles.projectsContainer}>
                {githubProjects.map((project) => (
                  <TouchableOpacity
                    key={project.id}
                    style={styles.projectCard}
                    onPress={() => router.push(`/project/${project.id}`)}
                  >
                    <Text style={styles.projectName}>{project.name}</Text>
                    {project.description && (
                      <Text style={styles.projectDescription} numberOfLines={2}>
                        {project.description}
                      </Text>
                    )}
                    <View style={styles.projectStats}>
                      <Text style={styles.projectStat}>⭐ {project.stars}</Text>
                      <Text style={styles.projectStat}>🍴 {project.forks}</Text>
                      {project.language && (
                        <Text style={styles.projectStat}>{project.language}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {((activeTab === 'posts' && posts.length === 0) ||
              (activeTab === 'reels' && reels.length === 0) ||
              (activeTab === 'projects' && githubProjects.length === 0) ||
              (activeTab === 'saved' && savedPosts.length === 0)) && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    No {activeTab} yet
                  </Text>
                </View>
              )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: Colors.text,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  moreButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIcon: {
    fontSize: 24,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    padding: 16,
    gap: 16,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: 'bold',
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statNumber: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  userInfo: {
    gap: 4,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  username: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  bio: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 8,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  followButton: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.015,
  },
  messageButton: {
    flex: 1,
    height: 40,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.015,
  },
  stickyTabs: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabs: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.text,
  },
  tabIcon: {
    fontSize: 24,
    color: Colors.textSecondary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0.5,
  },
  gridItem: {
    width: '33.33%',
    aspectRatio: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
  },
  codePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  codePlaceholderText: {
    fontSize: 32,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  reelIconContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  savedProjectsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  savedProjectsButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  projectsContainer: {
    padding: 16,
    gap: 16,
  },
  projectCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
  },
  projectName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  projectDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  projectStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  projectStat: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  contentContainer: {
    paddingBottom: 80, // Add padding for tab bar
  },
});

