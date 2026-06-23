import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import NetworkStatus from '../../components/common/NetworkStatus';

export default function OfflineScreen() {
  return (
    <View style={styles.container}>
      <Header title="Offline" />
      <View style={styles.content}>
        <Text style={styles.emoji}>📡</Text>
        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.message}>
          Please check your internet connection and try again.
        </Text>
        <NetworkStatus />
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
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
});
