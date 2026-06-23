import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { postService } from '../../services/postService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function HashtagSearchScreen() {
  const { query } = useLocalSearchParams<{ query?: string }>();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(query || '');
  const [hashtags, setHashtags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setHashtags([]);
      return;
    }

    setLoading(true);
    try {
      const response = await postService.searchPosts(`#${searchQuery}`, 1, 20);
      // Extract unique hashtags from posts
      const uniqueHashtags = new Map();
      (response.posts || []).forEach((post: any) => {
        (post.hashtags || []).forEach((tag: string) => {
          if (tag.toLowerCase().includes(searchQuery.toLowerCase())) {
            if (!uniqueHashtags.has(tag)) {
              uniqueHashtags.set(tag, {
                tag,
                postsCount: 0,
              });
            }
            uniqueHashtags.get(tag).postsCount++;
          }
        });
      });
      setHashtags(Array.from(uniqueHashtags.values()));
    } catch (error) {
      logger.error('Search hashtags error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    handleSearch();
  };

  const renderHashtag = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.hashtagItem}
      onPress={() => router.push(`/hashtag/${item.tag.replace('#', '')}`)}
    >
      <Icon name="tag" size={24} color={Colors.accent} />
      <View style={styles.hashtagInfo}>
        <Text style={styles.hashtagName}>{item.tag}</Text>
        <Text style={styles.hashtagCount}>
          {item.postsCount} {item.postsCount === 1 ? 'post' : 'posts'}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Search Hashtags" />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search hashtags..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <Icon name="search" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {loading && hashtags.length === 0 ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={hashtags}
          renderItem={renderHashtag}
          keyExtractor={(item) => item.tag}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            searchQuery.trim() ? (
              <EmptyState
                title="No hashtags found"
                message={`No hashtags match "${searchQuery}"`}
              />
            ) : (
              <EmptyState
                title="Search hashtags"
                message="Enter a hashtag to search"
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  hashtagInfo: {
    flex: 1,
  },
  hashtagName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  hashtagCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

