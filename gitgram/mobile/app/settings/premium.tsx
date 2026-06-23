import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { subscriptionService } from '../../services/subscriptionService';

const themes = [
  { id: 'default', name: 'Default', colors: ['#3B82F6', '#8B5CF6'] },
  { id: 'sunset', name: 'Sunset', colors: ['#F59E0B', '#EF4444'] },
  { id: 'ocean', name: 'Ocean', colors: ['#06B6D4', '#0EA5E9'] },
  { id: 'forest', name: 'Forest', colors: ['#10B981', '#059669'] },
];

export default function PremiumSettingsScreen() {
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedTheme, setSelectedTheme] = useState('default');

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    const data = await subscriptionService.getSubscription();
    setSubscription(data);
  };

  const isPremium = subscription?.plan !== 'free' && subscription?.status === 'active';

  if (!isPremium) {
    return (
      <View className="flex-1 bg-white dark:bg-gray-900 p-4">
        <Text className="text-3xl font-bold mb-4">Premium Features</Text>
        <View className="bg-yellow-100 p-4 rounded-lg">
          <Text className="text-yellow-800 mb-2">
            Upgrade to Premium or Creator to access these features.
          </Text>
          <TouchableOpacity className="bg-blue-500 py-2 rounded items-center mt-2">
            <Text className="text-white font-bold">View Plans</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <Text className="text-3xl font-bold mb-6">Premium Features</Text>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
        <Text className="text-xl font-bold mb-4">Custom Themes</Text>
        <View className="flex-row flex-wrap gap-2">
          {themes.map(theme => (
            <TouchableOpacity
              key={theme.id}
              onPress={() => setSelectedTheme(theme.id)}
              className={`p-3 rounded-lg border-2 ${
                selectedTheme === theme.id ? 'border-blue-500' : 'border-gray-200'
              }`}
            >
              <View className="flex-row gap-2 mb-2">
                <View 
                  className="w-8 h-8 rounded" 
                  style={{ backgroundColor: theme.colors[0] }} 
                />
                <View 
                  className="w-8 h-8 rounded" 
                  style={{ backgroundColor: theme.colors[1] }} 
                />
              </View>
              <Text className="text-sm font-medium">{theme.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
        <Text className="text-xl font-bold mb-2">Ad-Free Experience</Text>
        <View className="flex-row items-center gap-2">
          <View className="w-3 h-3 bg-green-500 rounded-full" />
          <Text className="text-green-600 font-medium">Active</Text>
        </View>
        <Text className="text-gray-600 mt-2">You won't see any advertisements</Text>
      </View>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
        <Text className="text-xl font-bold mb-2">Storage</Text>
        <Text className="text-sm text-gray-600 mb-2">
          {subscription.plan === 'creator' ? '100GB' : '10GB'} available
        </Text>
        <View className="bg-gray-200 rounded-full h-2">
          <View className="bg-blue-500 h-2 rounded-full" style={{ width: '25%' }} />
        </View>
      </View>

      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
        <Text className="text-xl font-bold mb-2">Priority Support</Text>
        <Text className="text-gray-600 mb-4">Get help faster with priority support</Text>
        <TouchableOpacity className="bg-blue-500 py-2 rounded items-center">
          <Text className="text-white font-bold">Contact Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
