import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';
import StoryViewer from './StoryViewer';
import api from '../../services/api';

interface StoryGroup {
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  stories: Array<{
    id: string;
    mediaType: string;
    mediaUrl: string;
    expiresAt: string;
  }>;
}

export default function StoriesList() {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [selectedStoryGroup, setSelectedStoryGroup] = useState<number | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      const response = await api.get('/stories');
      setStoryGroups(response.data.stories || []);
    } catch (error) {
      console.error('Load stories error:', error);
    }
  };

  const handleStoryPress = (index: number) => {
    setSelectedStoryGroup(index);
  };

  const handleCloseViewer = () => {
    setSelectedStoryGroup(null);
  };

  if (storyGroups.length === 0) {
    return null;
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {storyGroups.map((group, index) => (
          <TouchableOpacity
            key={group.user.id}
            style={styles.storyItem}
            onPress={() => handleStoryPress(index)}
          >
            <View style={styles.avatarContainer}>
              {group.user.avatar ? (
                <Image
                  source={{ uri: group.user.avatar }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {group.user.username[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.username} numberOfLines={1}>
              {group.user.username}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedStoryGroup !== null && (
        <StoryViewer
          stories={storyGroups[selectedStoryGroup].stories.map((story) => ({
            ...story,
            user: storyGroups[selectedStoryGroup].user,
          }))}
          onClose={handleCloseViewer}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
  },
  storyItem: {
    alignItems: 'center',
    marginHorizontal: 4,
    width: 70,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarText: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  username: {
    color: Colors.text,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

