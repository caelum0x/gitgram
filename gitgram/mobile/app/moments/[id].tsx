import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { Image } from 'expo-image';
import { momentService } from '../../services/momentService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function MomentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [moment, setMoment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    if (id) {
      loadMoment(id);
    }
  }, [id]);

  const loadMoment = async (momentId: string) => {
    try {
      setLoading(true);
      const response = await momentService.getMoment(momentId);
      setMoment(response.moment);
      setIsLiked(response.moment.isLiked || false);
      setLikesCount(response.moment.likesCount || 0);
    } catch (error: any) {
      logger.error('Load moment error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to load moment.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      const response = await momentService.likeMoment(id);
      setIsLiked(response.liked);
      setLikesCount((prev) => (response.liked ? prev + 1 : prev - 1));
    } catch (error) {
      logger.error('Like moment error:', error);
    }
  };

  const handleComment = () => {
    router.push(`/moments/${id}/comments`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Moment" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!moment) {
    return (
      <View style={styles.container}>
        <Header title="Moment" />
        <EmptyState title="Moment not found" message="This moment could not be found" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Moment" />
      <View style={styles.momentContainer}>
        <View style={styles.imagesContainer}>
          <View style={styles.screenshotContainer}>
            <Image source={{ uri: moment.screenshotUrl }} style={styles.screenshot} />
          </View>
          <View style={styles.selfieContainer}>
            <Image source={{ uri: moment.selfieUrl }} style={styles.selfie} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.userInfo}>
            {moment.user.avatar ? (
              <Image source={{ uri: moment.user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {moment.user.username[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.username}>@{moment.user.username}</Text>
          </View>

          {moment.caption && (
            <Text style={styles.caption}>{moment.caption}</Text>
          )}

          {moment.location && (
            <View style={styles.locationContainer}>
              <Icon name="location-on" size={16} color={Colors.textSecondary} />
              <Text style={styles.location}>{moment.location}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLike}
            >
              <Icon
                name={isLiked ? 'favorite' : 'favorite-border'}
                size={24}
                color={isLiked ? Colors.error || '#ff4444' : Colors.text}
              />
              <Text style={styles.actionText}>{likesCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleComment}
            >
              <Icon name="comment" size={24} color={Colors.text} />
              <Text style={styles.actionText}>{moment.commentsCount || 0}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <Icon name="share" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.timestamp}>
            {new Date(moment.createdAt).toLocaleString()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  momentContainer: {
    flex: 1,
  },
  imagesContainer: {
    flexDirection: 'row',
    height: 300,
  },
  screenshotContainer: {
    flex: 2,
    backgroundColor: Colors.surface,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  selfieContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
  },
  selfie: {
    width: '100%',
    height: '100%',
  },
  content: {
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  caption: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  location: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

