import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { moderationService } from '../../services/moderationService';

export default function ModerationScreen() {
  const [queue, setQueue] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('review');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    const [queueData, statsData] = await Promise.all([
      moderationService.getQueue(filter),
      moderationService.getStats(),
    ]);
    setQueue(queueData);
    setStats(statsData);
    setLoading(false);
  };

  const handleReview = async (id: string, decision: 'approve' | 'reject') => {
    await moderationService.reviewContent(id, decision);
    loadData();
  };

  if (loading) return <ActivityIndicator className="flex-1" />;

  return (
    <View className="flex-1 bg-white dark:bg-gray-900">
      <Text className="text-3xl font-bold p-4">Moderation</Text>

      {stats && (
        <ScrollView horizontal className="px-4 mb-4">
          <View className="bg-gray-100 p-3 rounded-lg mr-2">
            <Text className="text-xs text-gray-500">Total</Text>
            <Text className="text-2xl font-bold">{stats.total}</Text>
          </View>
          <View className="bg-green-100 p-3 rounded-lg mr-2">
            <Text className="text-xs text-green-700">Approved</Text>
            <Text className="text-2xl font-bold text-green-600">{stats.approved}</Text>
          </View>
          <View className="bg-red-100 p-3 rounded-lg mr-2">
            <Text className="text-xs text-red-700">Rejected</Text>
            <Text className="text-2xl font-bold text-red-600">{stats.rejected}</Text>
          </View>
          <View className="bg-yellow-100 p-3 rounded-lg mr-2">
            <Text className="text-xs text-yellow-700">Review</Text>
            <Text className="text-2xl font-bold text-yellow-600">{stats.review}</Text>
          </View>
        </ScrollView>
      )}

      <View className="flex-row px-4 mb-4">
        {['review', 'flag', 'reject'].map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            className={`px-4 py-2 rounded mr-2 ${filter === f ? 'bg-blue-500' : 'bg-gray-200'}`}
          >
            <Text className={filter === f ? 'text-white' : 'text-black'}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="flex-1 px-4">
        {queue.map(item => (
          <View key={item.id} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
            <Text className="text-xs text-gray-500 mb-2">
              {new Date(item.createdAt).toLocaleString()}
            </Text>
            <Text className="mb-2">{item.content}</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {item.flags.split(',').map((flag: string) => (
                <View key={flag} className="bg-red-100 px-2 py-1 rounded">
                  <Text className="text-red-700 text-xs">{flag}</Text>
                </View>
              ))}
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => handleReview(item.id, 'approve')}
                className="flex-1 bg-green-500 py-2 rounded items-center"
              >
                <Text className="text-white font-bold">Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleReview(item.id, 'reject')}
                className="flex-1 bg-red-500 py-2 rounded items-center"
              >
                <Text className="text-white font-bold">Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {queue.length === 0 && (
          <Text className="text-center text-gray-500 py-8">No items in queue</Text>
        )}
      </ScrollView>
    </View>
  );
}
