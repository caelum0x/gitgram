import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { advertisementsService } from '../services/advertisementsService';

export default function AdsScreen() {
  const [ads, setAds] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'post',
    content: '',
    budget: '100',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadAds();
  }, []);

  const loadAds = async () => {
    const data = await advertisementsService.getAds();
    setAds(data);
  };

  const handleCreate = async () => {
    await advertisementsService.createAd(form);
    setShowForm(false);
    loadAds();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await advertisementsService.updateAd(id, { status });
    loadAds();
  };

  return (
    <View className="flex-1 bg-white dark:bg-gray-900">
      <View className="flex-row justify-between items-center p-4">
        <Text className="text-3xl font-bold">Advertisements</Text>
        <TouchableOpacity 
          onPress={() => setShowForm(true)}
          className="bg-blue-500 px-4 py-2 rounded"
        >
          <Text className="text-white font-bold">Create Ad</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        {ads.map(ad => (
          <View key={ad.id} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-1">
                <Text className="text-xs text-gray-500 mb-1">{ad.type.toUpperCase()}</Text>
                <Text>{ad.content}</Text>
              </View>
              <Picker
                selectedValue={ad.status}
                onValueChange={(value) => handleStatusChange(ad.id, value)}
                style={{ width: 120 }}
              >
                <Picker.Item label="Active" value="active" />
                <Picker.Item label="Paused" value="paused" />
                <Picker.Item label="Completed" value="completed" />
              </Picker>
            </View>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-xs text-gray-500">Budget</Text>
                <Text className="font-bold">${ad.budget}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500">Spent</Text>
                <Text className="font-bold">${ad.spent}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500">Impressions</Text>
                <Text className="font-bold">{ad.impressions}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500">Clicks</Text>
                <Text className="font-bold">{ad.clicks}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide">
        <View className="flex-1 bg-white dark:bg-gray-900 p-4">
          <Text className="text-2xl font-bold mb-4">Create Ad</Text>
          
          <Picker
            selectedValue={form.type}
            onValueChange={(value) => setForm({...form, type: value})}
          >
            <Picker.Item label="Post Ad" value="post" />
            <Picker.Item label="Story Ad" value="story" />
            <Picker.Item label="Reel Ad" value="reel" />
          </Picker>

          <TextInput
            value={form.content}
            onChangeText={(text) => setForm({...form, content: text})}
            placeholder="Ad content"
            multiline
            className="border p-3 rounded mb-4"
          />

          <TextInput
            value={form.budget}
            onChangeText={(text) => setForm({...form, budget: text})}
            placeholder="Budget ($)"
            keyboardType="numeric"
            className="border p-3 rounded mb-4"
          />

          <View className="flex-row gap-4 mb-4">
            <TouchableOpacity 
              onPress={handleCreate}
              className="flex-1 bg-blue-500 py-3 rounded items-center"
            >
              <Text className="text-white font-bold">Create</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setShowForm(false)}
              className="flex-1 bg-gray-300 py-3 rounded items-center"
            >
              <Text className="font-bold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
