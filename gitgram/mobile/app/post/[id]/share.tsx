import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Clipboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function SharePostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const shareOptions = [
    {
      id: 'native',
      label: 'Share via...',
      icon: 'share',
      action: async () => {
        try {
          await Share.share({
            message: `Check out this post on Gitgram! https://gitgram.app/post/${id}`,
          });
        } catch (error) {
          Alert.alert('Error', 'Failed to share');
        }
      },
    },
    {
      id: 'copy',
      label: 'Copy Link',
      icon: 'content-copy',
      action: async () => {
        Clipboard.setString(`https://gitgram.app/post/${id}`);
        Alert.alert('Success', 'Link copied to clipboard');
      },
    },
    {
      id: 'message',
      label: 'Send in Message',
      icon: 'message',
      action: () => {
        router.push(`/messages?sharePostId=${id}`);
      },
    },
    {
      id: 'story',
      label: 'Add to Story',
      icon: 'add-circle',
      action: () => {
        router.push(`/create-story?sharePostId=${id}`);
      },
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <Header title="Share Post" />
      <View style={styles.content}>
        {shareOptions.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.option}
            onPress={option.action}
          >
            <Icon name={option.icon} size={24} color={Colors.accent} />
            <Text style={styles.optionText}>{option.label}</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
});
