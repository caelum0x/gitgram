import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';

export default function TermsOfServiceScreen() {
  const handleOpenLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Header title="Terms of Service" />
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString()}</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.text}>
          By accessing and using Gitgram, you accept and agree to be bound by the terms and provision of this agreement.
        </Text>

        <Text style={styles.sectionTitle}>2. Use License</Text>
        <Text style={styles.text}>
          Permission is granted to temporarily use Gitgram for personal, non-commercial use. This is the grant of a license, not a transfer of title.
        </Text>

        <Text style={styles.sectionTitle}>3. User Content</Text>
        <Text style={styles.text}>
          You are responsible for all content you post on Gitgram. You agree not to post content that is illegal, harmful, or violates others' rights.
        </Text>

        <Text style={styles.sectionTitle}>4. Prohibited Uses</Text>
        <Text style={styles.text}>
          You may not use Gitgram in any way that could damage, disable, overburden, or impair the service or interfere with any other party's use of the service.
        </Text>

        <Text style={styles.sectionTitle}>5. Intellectual Property</Text>
        <Text style={styles.text}>
          All content on Gitgram, including but not limited to text, graphics, logos, and software, is the property of Gitgram or its content suppliers.
        </Text>

        <Text style={styles.sectionTitle}>6. Termination</Text>
        <Text style={styles.text}>
          We may terminate or suspend your account and access to the service immediately, without prior notice, for any reason, including breach of these Terms.
        </Text>

        <Text style={styles.sectionTitle}>7. Contact Us</Text>
        <Text style={styles.text}>
          If you have questions about these Terms, please contact us at legal@gitgram.app
        </Text>

        <Text style={styles.link} onPress={() => handleOpenLink('https://gitgram.app/terms')}>
          View full terms of service online
        </Text>
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 16,
  },
  link: {
    fontSize: 16,
    color: Colors.accent,
    textDecorationLine: 'underline',
    marginTop: 16,
    marginBottom: 32,
  },
});

