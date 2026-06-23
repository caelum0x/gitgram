import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { messageService } from '../../services/messageService';
import { logger } from '../../utils/logger';

export default function ChatMediaScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMedia();
  }, [userId]);

  const loadMedia = async () => {
    try {
      const response = await messageService.getChatMedia(userId!);
      setMedia(response.media || []);
    } catch (error) {
      logger.error('Load media error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMedia = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.mediaItem}
      onPress={() => {
        // View media in full screen
      }}
    >
      <Image source={{ uri: item.url }} style={styles.mediaImage} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Media" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Media" />
      {media.length > 0 ? (
        <FlatList
          data={media}
          renderItem={renderMedia}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState title="No media" message="Shared media will appear here" />
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
    padding: 1,
  },
  mediaItem: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 1,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
});

