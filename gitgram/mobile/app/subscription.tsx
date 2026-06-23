import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { subscriptionService } from '../services/subscriptionService';

export default function SubscriptionScreen() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    const data = await subscriptionService.getSubscription();
    setSubscription(data);
    setLoading(false);
  };

  const handleUpgrade = async (plan: string) => {
    const { url } = await subscriptionService.createCheckout(plan);
    // Open Polar checkout in browser
  };

  if (loading) return <ActivityIndicator />;

  return (
    <ScrollView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <Text className="text-3xl font-bold mb-6">Subscription</Text>

      <View className="space-y-4">
        <View className="border border-gray-200 rounded-lg p-4">
          <Text className="text-xl font-bold mb-2">Free</Text>
          <Text className="text-3xl font-bold mb-4">$0<Text className="text-sm">/mo</Text></Text>
          <Text className="mb-2">✓ Basic features</Text>
          <Text className="mb-2">✓ 100 posts/month</Text>
          <Text className="mb-4">✓ 1GB storage</Text>
          {subscription?.plan === 'free' && (
            <View className="bg-gray-300 py-2 rounded items-center">
              <Text>Current Plan</Text>
            </View>
          )}
        </View>

        <View className="border-2 border-blue-500 rounded-lg p-4">
          <View className="bg-blue-500 px-2 py-1 rounded self-start mb-2">
            <Text className="text-white text-xs">POPULAR</Text>
          </View>
          <Text className="text-xl font-bold mb-2">Premium</Text>
          <Text className="text-3xl font-bold mb-4">$9<Text className="text-sm">/mo</Text></Text>
          <Text className="mb-2">✓ Verified badge</Text>
          <Text className="mb-2">✓ Custom themes</Text>
          <Text className="mb-2">✓ Ad-free</Text>
          <Text className="mb-4">✓ 10GB storage</Text>
          <TouchableOpacity 
            onPress={() => handleUpgrade('premium')}
            className="bg-blue-500 py-3 rounded items-center"
          >
            <Text className="text-white font-bold">Upgrade</Text>
          </TouchableOpacity>
        </View>

        <View className="border border-gray-200 rounded-lg p-4">
          <Text className="text-xl font-bold mb-2">Creator</Text>
          <Text className="text-3xl font-bold mb-4">$29<Text className="text-sm">/mo</Text></Text>
          <Text className="mb-2">✓ All Premium features</Text>
          <Text className="mb-2">✓ Advanced analytics</Text>
          <Text className="mb-2">✓ Content scheduling</Text>
          <Text className="mb-4">✓ 100GB storage</Text>
          <TouchableOpacity 
            onPress={() => handleUpgrade('creator')}
            className="bg-blue-500 py-3 rounded items-center"
          >
            <Text className="text-white font-bold">Upgrade</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
