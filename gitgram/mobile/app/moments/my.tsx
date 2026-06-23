import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { Image } from 'expo-image';
import { momentService } from '../../services/momentService';
import { useAuthStore } from '../../store/authStore';
import { logger } from '../../utils/logger';

export default function MyMomentsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadMyMoments();
    }
  }, [user]);

  const loadMyMoments = async () => {
    try {
      setLoading(true);
      const response = await momentService.getMoments(1, 50, user?.id);
      setMoments(response.moments || []);
    } catch (error) {
      logger.error('Load my moments error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMoment = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.momentCard}
      onPress={() => router.push(`/moments/${item.id}`)}
    >
      <View style={styles.momentContainer}>
        <View style={styles.screenshotContainer}>
          <Image source={{ uri: item.screenshotUrl }} style={styles.screenshot} />
        </View>
        <View style={styles.selfieContainer}>
          <Image source={{ uri: item.selfieUrl }} style={styles.selfie} />
        </View>
      </View>
      <View style={styles.momentInfo}>
        {item.caption && (
          <Text style={styles.caption} numberOfLines={1}>
            {item.caption}
          </Text>
        )}
        <View style={styles.stats}>
          <Text style={styles.statText}>❤️ {item.likesCount || 0}</Text>
          <Text style={styles.statText}>💬 {item.commentsCount || 0}</Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="My Moments" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="My Moments"
        rightIcon="add"
        onRightPress={() => router.push('/moments/create')}
      />
      {moments.length > 0 ? (
        <FlatList
          data={moments}
          renderItem={renderMoment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={2}
        />
      ) : (
        <EmptyState
          title="No moments yet"
          message="Create your first moment to share with the community!"
          icon="📸"
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
  listContent: {
    padding: 8,
  },
  momentCard: {
    flex: 1,
    margin: 4,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  momentContainer: {
    flexDirection: 'row',
    height: 150,
  },
  screenshotContainer: {
    flex: 2,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  selfieContainer: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  selfie: {
    width: '100%',
    height: '100%',
  },
  momentInfo: {
    padding: 8,
  },
  caption: {
    fontSize: 12,
    color: Colors.text,
    marginBottom: 4,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  statText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
});

