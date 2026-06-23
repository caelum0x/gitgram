import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Image } from 'expo-image';
import { momentService } from '../../../services/momentService';
import { logger } from '../../../utils/logger';

export default function MomentReactionsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [likes, setLikes] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'likes' | 'comments'>('likes');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadReactions(id);
    }
  }, [id, activeTab]);

  const loadReactions = async (momentId: string) => {
    try {
      setLoading(true);
      const response = await momentService.getMomentReactions(momentId);
      if (activeTab === 'likes') {
        setLikes(response.likes || []);
      } else {
        setComments(response.comments || []);
      }
    } catch (error) {
      logger.error('Load reactions error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderLike = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => router.push(`/profile/${item.user.id}`)}
    >
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.user.username}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderComment = ({ item }: { item: any }) => (
    <View style={styles.commentItem}>
      <TouchableOpacity
        style={styles.commentHeader}
        onPress={() => router.push(`/profile/${item.user.id}`)}
      >
        {item.user.avatar ? (
          <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.user.username[0].toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.username}>@{item.user.username}</Text>
      </TouchableOpacity>
      <Text style={styles.commentText}>{item.content}</Text>
      <Text style={styles.timestamp}>
        {new Date(item.createdAt).toLocaleString()}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Reactions" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Reactions" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'likes' && styles.activeTab]}
          onPress={() => setActiveTab('likes')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'likes' && styles.activeTabText,
            ]}
          >
            Likes ({likes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'comments' && styles.activeTab]}
          onPress={() => setActiveTab('comments')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'comments' && styles.activeTabText,
            ]}
          >
            Comments ({comments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'likes' ? (
        likes.length > 0 ? (
          <FlatList
            data={likes}
            renderItem={renderLike}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <EmptyState
            title="No likes yet"
            message="Be the first to like this moment!"
            icon="❤️"
          />
        )
      ) : comments.length > 0 ? (
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No comments yet"
          message="Be the first to comment on this moment!"
          icon="💬"
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.text,
  },
  listContent: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  commentItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  commentText: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 8,
  },
});

