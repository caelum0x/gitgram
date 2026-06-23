import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { storyService } from '../../../services/storyService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CreateHighlightScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [selectedStories, setSelectedStories] = useState<string[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      const response = await storyService.getStories(1, 100);
      setStories(response.stories || []);
    } catch (error) {
      logger.error('Load stories error:', error);
    }
  };

  const toggleStory = (storyId: string) => {
    setSelectedStories((prev) =>
      prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for the highlight');
      return;
    }

    if (selectedStories.length === 0) {
      Alert.alert('Error', 'Please select at least one story');
      return;
    }

    setLoading(true);
    try {
      await storyService.createHighlight({ name, storyIds: selectedStories });
      Alert.alert('Success', 'Highlight created', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Create highlight error:', error);
      Alert.alert('Error', 'Failed to create highlight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="New Highlight"
        rightIcon="check"
        onRightPress={handleCreate}
      />
      <View style={styles.form}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Highlight name"
          placeholderTextColor={Colors.textSecondary}
          value={name}
          onChangeText={setName}
          maxLength={30}
        />
      </View>

      <Text style={styles.sectionTitle}>Select Stories</Text>
      <FlatList
        data={stories}
        numColumns={3}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.storyItem}
            onPress={() => toggleStory(item.id)}
          >
            {item.mediaUrl && (
              <Image source={{ uri: item.mediaUrl }} style={styles.storyImage} />
            )}
            {selectedStories.includes(item.id) && (
              <View style={styles.checkmark}>
                <Icon name="check-circle" size={24} color={Colors.accent} />
              </View>
            )}
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  form: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    padding: 16,
    paddingBottom: 8,
  },
  listContent: {
    padding: 16,
  },
  storyItem: {
    width: '33.33%',
    aspectRatio: 9 / 16,
    padding: 2,
    position: 'relative',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});

