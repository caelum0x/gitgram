import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import EmptyState from '../../components/common/EmptyState';

export default function ReelDraftsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Header title="Reel Drafts" />
      <View style={styles.content}>
        <EmptyState
          title="Reel drafts are unavailable"
          message="This app currently publishes reels directly and does not persist draft reels."
        />
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/(modals)/create-reel')}
        >
          <Text style={styles.buttonText}>Create a Reel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  button: {
    marginTop: 20,
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
