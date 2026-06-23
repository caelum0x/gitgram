import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { storyService } from '../../services/storyService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface Highlight {
  id: string;
  name: string;
  coverImage?: string;
  storiesCount: number;
}

export default function StoryHighlightsScreen() {
  const router = useRouter();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHighlights();
  }, []);

  const loadHighlights = async () => {
    try {
      const response = await storyService.getHighlights();
      setHighlights(response.highlights || []);
    } catch (error) {
      logger.error('Load highlights error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderHighlight = ({ item }: { item: Highlight }) => (
    <TouchableOpacity
      style={styles.highlightItem}
      onPress={() => router.push(`/story/highlight/${item.id}`)}
    >
      {item.coverImage ? (
        <Image source={{ uri: item.coverImage }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Icon name="collections" size={32} color={Colors.textSecondary} />
        </View>
      )}
      <Text style={styles.highlightName}>{item.name}</Text>
      <Text style={styles.highlightCount}>{item.storiesCount} stories</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Story Highlights" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Story Highlights"
        rightIcon="add"
        onRightPress={() => router.push('/story/highlights/create')}
      />
      {highlights.length > 0 ? (
        <FlatList
          data={highlights}
          renderItem={renderHighlight}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No highlights"
          message="Create highlights to keep your favorite stories"
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
  highlightItem: {
    flex: 1,
    margin: 8,
    alignItems: 'center',
  },
  cover: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
    backgroundColor: Colors.surface,
  },
  coverPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  highlightName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  highlightCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

