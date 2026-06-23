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
import { logger } from '../../utils/logger';
import { momentService } from '../../services/momentService';

export default function MomentsFeedScreen() {
  const router = useRouter();
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMoments();
  }, []);

  const loadMoments = async () => {
    try {
      setLoading(true);
      const response = await momentService.getMoments();
      setMoments(response.moments || []);
    } catch (error) {
      logger.error('Load moments error:', error);
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
        <Text style={styles.username}>@{item.user.username}</Text>
        {item.caption && (
          <Text style={styles.caption} numberOfLines={2}>
            {item.caption}
          </Text>
        )}
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Moments" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Moments"
        rightIcon="add"
        onRightPress={() => router.push('/moments/create')}
      />
      {moments.length > 0 ? (
        <FlatList
          data={moments}
          renderItem={renderMoment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No moments yet"
          message="Share your coding moments with the community!"
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
    padding: 16,
  },
  momentCard: {
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
  momentInfo: {
    padding: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  caption: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

