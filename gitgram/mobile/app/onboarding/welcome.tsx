import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🚀</Text>
        <Text style={styles.title}>Welcome to Gitgram</Text>
        <Text style={styles.subtitle}>
          The social platform for GitHub projects. Share your code, discover amazing projects, and connect with developers.
        </Text>

        <View style={styles.features}>
          <View style={styles.feature}>
            <Text style={styles.featureEmoji}>📱</Text>
            <Text style={styles.featureText}>Share your projects</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureEmoji}>🔍</Text>
            <Text style={styles.featureText}>Discover code</Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureEmoji}>👥</Text>
            <Text style={styles.featureText}>Connect with developers</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.secondaryButtonText}>Already have an account?</Text>
          </TouchableOpacity>
        </View>
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
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 48,
  },
  features: {
    width: '100%',
    marginBottom: 48,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  featureEmoji: {
    fontSize: 24,
  },
  featureText: {
    fontSize: 16,
    color: Colors.text,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: Colors.text,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
  },
});
