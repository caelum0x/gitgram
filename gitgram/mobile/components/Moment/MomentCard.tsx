import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Image } from 'expo-image';
import { momentService } from '../../services/momentService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface MomentCardProps {
  moment: {
    id: string;
    screenshotUrl: string;
    selfieUrl: string;
    caption?: string;
    user: {
      id: string;
      username: string;
      avatar?: string;
    };
    likesCount: number;
    commentsCount: number;
    createdAt: string;
  };
}

export default function MomentCard({ moment }: MomentCardProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(moment.likesCount);

  const handleLike = async () => {
    try {
      const response = await momentService.likeMoment(moment.id);
      setIsLiked(response.liked);
      setLikesCount((prev) => (response.liked ? prev + 1 : prev - 1));
    } catch (error) {
      logger.error('Like moment error:', error);
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push(`/moments/${moment.id}`)}
    >
      <View style={styles.momentContainer}>
        <View style={styles.screenshotContainer}>
          <Image source={{ uri: moment.screenshotUrl }} style={styles.screenshot} />
        </View>
        <View style={styles.selfieContainer}>
          <Image source={{ uri: moment.selfieUrl }} style={styles.selfie} />
        </View>
      </View>

      <View style={styles.infoContainer}>
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
          <Text style={styles.caption} numberOfLines={2}>
            {moment.caption}
          </Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              handleLike();
            }}
          >
            <Icon
              name={isLiked ? 'favorite' : 'favorite-border'}
              size={20}
              color={isLiked ? Colors.error || '#ff4444' : Colors.text}
            />
            <Text style={styles.actionText}>{likesCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/moments/${moment.id}/reactions`);
            }}
          >
            <Icon name="comment" size={20} color={Colors.text} />
            <Text style={styles.actionText}>{moment.commentsCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  momentContainer: {
    flexDirection: 'row',
    height: 200,
  },
  screenshotContainer: {
    flex: 2,
    backgroundColor: Colors.background,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  selfieContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
  },
  selfie: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    padding: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  caption: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 14,
    color: Colors.text,
  },
});

