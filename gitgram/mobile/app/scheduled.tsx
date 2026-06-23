import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scheduledPostsService } from '../services/scheduledPostsService';

export default function ScheduledPostsScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    const data = await scheduledPostsService.getScheduledPosts();
    setPosts(data);
  };

  const handleCreate = async () => {
    if (!content) return;
    await scheduledPostsService.createScheduledPost({
      content,
      mediaUrls: [],
      scheduledFor: scheduledFor.toISOString(),
    });
    setContent('');
    loadPosts();
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete', 'Delete this scheduled post?', [
      { text: 'Cancel' },
      { 
        text: 'Delete', 
        onPress: async () => {
          await scheduledPostsService.deleteScheduledPost(id);
          loadPosts();
        }
      }
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <Text className="text-3xl font-bold mb-6">Scheduled Posts</Text>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-6">
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          multiline
          numberOfLines={4}
          className="bg-white dark:bg-gray-700 p-3 rounded mb-4"
        />
        
        <TouchableOpacity 
          onPress={() => setShowPicker(true)}
          className="bg-gray-200 dark:bg-gray-700 p-3 rounded mb-4"
        >
          <Text>{scheduledFor.toLocaleString()}</Text>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={scheduledFor}
            mode="datetime"
            onChange={(event, date) => {
              setShowPicker(false);
              if (date) setScheduledFor(date);
            }}
          />
        )}

        <TouchableOpacity 
          onPress={handleCreate}
          className="bg-blue-500 py-3 rounded items-center"
        >
          <Text className="text-white font-bold">Schedule Post</Text>
        </TouchableOpacity>
      </View>

      <View className="space-y-4">
        {posts.map(post => (
          <View key={post.id} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <Text className="mb-2">{post.content}</Text>
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-gray-500">
                {new Date(post.scheduledFor).toLocaleString()}
              </Text>
              <TouchableOpacity onPress={() => handleDelete(post.id)}>
                <Text className="text-red-500">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {posts.length === 0 && (
          <Text className="text-center text-gray-500 py-8">No scheduled posts</Text>
        )}
      </View>
    </ScrollView>
  );
}
