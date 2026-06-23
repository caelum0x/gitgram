import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { analyticsService } from '../services/analyticsService';

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [days]);

  const loadAnalytics = async () => {
    setLoading(true);
    const data = await analyticsService.getAnalytics(days);
    setAnalytics(data);
    setLoading(false);
  };

  if (loading) return <ActivityIndicator className="flex-1" />;

  return (
    <ScrollView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-3xl font-bold">Analytics</Text>
        <Picker
          selectedValue={days}
          onValueChange={setDays}
          style={{ width: 150 }}
        >
          <Picker.Item label="Last 7 days" value={7} />
          <Picker.Item label="Last 30 days" value={30} />
          <Picker.Item label="Last 90 days" value={90} />
        </Picker>
      </View>

      <View className="flex-row flex-wrap gap-4 mb-6">
        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg flex-1">
          <Text className="text-gray-500 text-sm mb-2">Total Views</Text>
          <Text className="text-3xl font-bold">{analytics?.totals?.views?.toLocaleString()}</Text>
        </View>
        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg flex-1">
          <Text className="text-gray-500 text-sm mb-2">Total Likes</Text>
          <Text className="text-3xl font-bold">{analytics?.totals?.likes?.toLocaleString()}</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-4 mb-6">
        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg flex-1">
          <Text className="text-gray-500 text-sm mb-2">Comments</Text>
          <Text className="text-3xl font-bold">{analytics?.totals?.comments?.toLocaleString()}</Text>
        </View>
        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg flex-1">
          <Text className="text-gray-500 text-sm mb-2">Followers</Text>
          <Text className="text-3xl font-bold">{analytics?.totals?.followers?.toLocaleString()}</Text>
        </View>
      </View>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
        <Text className="text-xl font-bold mb-4">Daily Breakdown</Text>
        {analytics?.analytics?.map((day: any) => (
          <View key={day.date} className="flex-row justify-between py-2 border-b border-gray-200">
            <Text>{new Date(day.date).toLocaleDateString()}</Text>
            <View className="flex-row gap-4">
              <Text className="text-sm">{day.views}v</Text>
              <Text className="text-sm">{day.likes}l</Text>
              <Text className="text-sm">{day.comments}c</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
