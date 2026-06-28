import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { logger } from '../../utils/logger';

export default function AboutScreen() {
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const links = [
    {
      id: 'terms',
      label: 'Terms of Service',
      icon: 'description',
      url: 'https://gitgram.app/terms',
    },
    {
      id: 'privacy',
      label: 'Privacy Policy',
      icon: 'privacy-tip',
      url: 'https://gitgram.app/privacy',
    },
    {
      id: 'github',
      label: 'GitHub Repository',
      icon: 'code',
      url: 'https://github.com/gitgram/gitgram',
    },
    {
      id: 'support',
      label: 'Support',
      icon: 'help',
      url: 'https://gitgram.app/support',
    },
  ];

  const handleLinkPress = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      logger.error('Failed to open URL:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="About" />
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>📱</Text>
          <Text style={styles.appName}>Gitgram</Text>
          <Text style={styles.version}>Version {appVersion}</Text>
        </View>

        <Text style={styles.description}>
          Gitgram is a social platform for GitHub projects. Share your code, discover amazing projects, and connect with developers around the world.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          {links.map((link) => (
            <TouchableOpacity
              key={link.id}
              style={styles.linkItem}
              onPress={() => handleLinkPress(link.url)}
            >
              <Icon name={link.icon} size={24} color={Colors.accent} />
              <Text style={styles.linkLabel}>{link.label}</Text>
              <Icon name="open-in-new" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credits</Text>
          <Text style={styles.creditText}>
            Built with ❤️ by the Gitgram team
          </Text>
          <Text style={styles.creditText}>
            © {new Date().getFullYear()} Gitgram. All rights reserved.
          </Text>
        </View>
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
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  linkLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  creditText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
});

