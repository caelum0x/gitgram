import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import repositoryService from '../../services/repositoryService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { listenSoftReset } from '../../utils/events';
import { logger } from '../../utils/logger';

interface User {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  githubUsername?: string;
}

interface Post {
  id: string;
  content?: string;
  mediaUrl?: string;
  mediaType: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  likesCount: number;
  commentsCount: number;
}

interface Project {
  id: string;
  name: string;
  fullName?: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
  avatarUrl?: string;
}

export default function ExploreScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    users: User[];
    posts: Post[];
  }>({ users: [], posts: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'projects' | 'users' | 'trending'>('projects');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [trendingProjects, setTrendingProjects] = useState<Project[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (activeTab === 'projects' || activeTab === 'trending') {
      loadTrendingProjects();
    }
    if (activeTab === 'users') {
      loadSuggestedUsers();
    }
  }, [activeTab, selectedLanguage]);

  // Soft reset: re-pressing the Explore tab scrolls to top and reloads the
  // active tab's content.
  useEffect(() => {
    const unlisten = listenSoftReset(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      if (activeTab === 'users') {
        loadSuggestedUsers();
      } else {
        loadTrendingProjects();
      }
    });
    return unlisten;
  }, [activeTab, selectedLanguage]);

  const loadTrendingProjects = async () => {
    try {
      setLoading(true);
      const language = selectedLanguage.toLowerCase() === 'all' ? undefined : selectedLanguage.toLowerCase();
      const response = await repositoryService.getTrending(language);
      const repos = response.repositories || [];

      // Map API response to Project interface
      setTrendingProjects(
        repos.map((repo: any, index: number) => ({
          id: repo.id || `trending-${index}`,
          name: repo.name,
          fullName: repo.fullName || `${repo.owner}/${repo.name}`,
          description: repo.description,
          stars: repo.stars || 0,
          forks: repo.forks || 0,
          language: repo.language,
          avatarUrl: repo.avatarUrl,
        }))
      );
    } catch (error) {
      logger.error('Load trending projects error:', error);
      setTrendingProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestedUsers = async () => {
    try {
      setLoading(true);
      const response = await userService.searchUsers('');
      setSuggestedUsers(response.users?.slice(0, 10) || []);
    } catch (error) {
      logger.error('Load suggested users error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults({ users: [], posts: [] });
      return;
    }

    // Check if it's a GitHub URL
    if (query.includes('github.com/') || query.match(/^[^\/]+\/[^\/]+$/)) {
      try {
        const parsed = await repositoryService.parseUrl(query);
        if (parsed.owner && parsed.name) {
          router.push(`/repo/${parsed.owner}/${parsed.name}`);
          return;
        }
      } catch (e) {
        // Not a valid GitHub URL, continue with normal search
      }
    }

    try {
      setLoading(true);
      const [usersResponse, postsResponse] = await Promise.all([
        userService.searchUsers(query),
        postService.searchPosts(query),
      ]);

      setSearchResults({
        users: usersResponse.users || [],
        posts: postsResponse.posts || [],
      });
    } catch (error) {
      logger.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => router.push(`/profile/${item.id}`)}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>
            {item.username.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        {item.bio && <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>}
      </View>
    </TouchableOpacity>
  );

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity
      style={styles.postItem}
      onPress={() => router.push(`/post/${item.id}`)}
    >
      {item.mediaUrl && item.mediaType === 'image' && (
        <Image source={{ uri: item.mediaUrl }} style={styles.postImage} />
      )}
      <View style={styles.postOverlay}>
        <Text style={styles.postStats}>
          ❤️ {item.likesCount} 💬 {item.commentsCount}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderProject = ({ item }: { item: Project }) => (
    <TouchableOpacity 
      style={styles.projectCard}
      onPress={() => {
        const [owner, name] = (item.fullName || item.name).split('/');
        if (owner && name) {
          router.push(`/repo/${owner}/${name}`);
        }
      }}
    >
      <View style={styles.projectCardContent}>
        <Text style={styles.projectName}>{item.fullName || item.name}</Text>
        {item.description && (
          <Text style={styles.projectDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.projectStats}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>⭐</Text>
            <Text style={styles.statText}>
              {item.stars >= 1000 ? `${(item.stars / 1000).toFixed(0)}k` : item.stars}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>🍴</Text>
            <Text style={styles.statText}>
              {item.forks >= 1000 ? `${(item.forks / 1000).toFixed(0)}k` : item.forks}
            </Text>
          </View>
          {item.language && (
            <View style={styles.statItem}>
              <View style={[styles.languageDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.statText}>{item.language}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.starButton}>
          <Text style={styles.starButtonIcon}>⭐</Text>
          <Text style={styles.starButtonText}>Star</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderSuggestedUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
      ) : (
        <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>
            {item.username.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userCardInfo}>
        <Text style={styles.userCardName}>{item.username}</Text>
        {item.bio && (
          <Text style={styles.userCardBio} numberOfLines={1}>
            {item.bio}
          </Text>
        )}
      </View>
      <TouchableOpacity style={styles.followUserButton}>
        <Text style={styles.followUserButtonText}>Follow</Text>
      </TouchableOpacity>
    </View>
  );

  const languages = ['All', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java'];

  return (
    <View style={styles.container}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🔗</Text>
        </View>
        <Text style={styles.headerTitle}>Discover</Text>
        <TouchableOpacity
          style={styles.headerRight}
          onPress={() => router.push('/(tabs)/notifications')}
        >
          <Text style={styles.headerRightIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects, languages, users..."
            placeholderTextColor={Colors.textSecondary}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (text.trim()) {
                handleSearch(text);
              }
            }}
          />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'projects' && styles.activeTab]}
            onPress={() => setActiveTab('projects')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'projects' && styles.activeTabText,
              ]}
            >
              Projects
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.activeTab]}
            onPress={() => setActiveTab('users')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'users' && styles.activeTabText,
              ]}
            >
              Users
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trending' && styles.activeTab]}
            onPress={() => setActiveTab('trending')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'trending' && styles.activeTabText,
              ]}
            >
              Trending
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scrollView}>
        {activeTab === 'projects' && (
          <>
            {/* Section Header */}
            <Text style={styles.sectionHeader}>Trending This Week</Text>

            {/* Language Chips */}
            <View style={styles.chipsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {languages.map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.chip,
                      selectedLanguage.toLowerCase() === lang.toLowerCase() &&
                        styles.chipActive,
                    ]}
                    onPress={() => setSelectedLanguage(lang)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedLanguage.toLowerCase() === lang.toLowerCase() &&
                          styles.chipTextActive,
                      ]}
                    >
                      {lang}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Project Cards */}
            {loading ? (
              <LoadingSpinner />
            ) : trendingProjects.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No trending projects found</Text>
                <Text style={styles.emptyStateSubtext}>Try a different language filter</Text>
              </View>
            ) : (
              <View style={styles.projectsContainer}>
                {trendingProjects.map((project) => (
                  <View key={project.id}>
                    {renderProject({ item: project })}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {/* Section Header */}
            <Text style={styles.sectionHeader}>Developers to Follow</Text>

            {/* User Cards */}
            {loading ? (
              <LoadingSpinner />
            ) : (
              <View style={styles.usersContainer}>
                {suggestedUsers.map((user) => (
                  <View key={user.id}>
                    {renderSuggestedUser({ item: user })}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === 'trending' && (
          <View style={styles.trendingContainer}>
            <Text style={styles.sectionHeader}>Trending This Week</Text>
            {loading ? (
              <LoadingSpinner />
            ) : trendingProjects.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No trending projects found</Text>
                <Text style={styles.emptyStateSubtext}>Check back later for new trending repositories</Text>
              </View>
            ) : (
              <View style={styles.projectsContainer}>
                {trendingProjects.map((project) => (
                  <View key={project.id}>
                    {renderProject({ item: project })}
                  </View>
                ))}
              </View>
            )}
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
    backgroundColor: Colors.background,
  },
  headerLeft: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerRight: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightIcon: {
    fontSize: 24,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchIconContainer: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchIcon: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingLeft: 4,
    color: Colors.text,
    fontSize: 16,
  },
  tabsContainer: {
    paddingHorizontal: 16,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingBottom: 13,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.015,
  },
  activeTabText: {
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  sectionHeader: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    marginRight: 12,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Colors.text,
  },
  projectsContainer: {
    padding: 16,
    gap: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  bio: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  postItem: {
    width: 120,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  postOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  postStats: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  projectCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
  },
  projectCardContent: {
    gap: 16,
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
  },
  projectStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 16,
  },
  statText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  languageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  starButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
    height: 40,
    gap: 8,
  },
  starButtonIcon: {
    fontSize: 18,
  },
  starButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.015,
  },
  usersContainer: {
    padding: 16,
    gap: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userCardInfo: {
    flex: 1,
  },
  userCardName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userCardBio: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  followUserButton: {
    height: 36,
    minWidth: 84,
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  followUserButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.015,
  },
  trendingContainer: {
    paddingBottom: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
