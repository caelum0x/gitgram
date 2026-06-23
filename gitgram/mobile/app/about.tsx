import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Colors } from '../constants/Colors';
import Header from '../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AboutScreen() {
  const handleOpenLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Header title="About Gitgram" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.title}>Gitgram</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            Gitgram is a social platform for developers to share their GitHub projects, connect with other developers, and discover amazing open-source work.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Links</Text>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleOpenLink('https://gitgram.app')}
          >
            <Icon name="language" size={24} color={Colors.text} />
            <Text style={styles.linkText}>Website</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleOpenLink('https://github.com/gitgram')}
          >
            <Icon name="code" size={24} color={Colors.text} />
            <Text style={styles.linkText}>GitHub</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleOpenLink('https://twitter.com/gitgram')}
          >
            <Icon name="alternate-email" size={24} color={Colors.text} />
            <Text style={styles.linkText}>Twitter</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleOpenLink('https://gitgram.app/privacy')}
          >
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleOpenLink('https://gitgram.app/terms')}
          >
            <Text style={styles.linkText}>Terms of Service</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} Gitgram. All rights reserved.
          </Text>
        </View>
      </ScrollView>
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
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
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
    marginBottom: 8,
    gap: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  copyright: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

