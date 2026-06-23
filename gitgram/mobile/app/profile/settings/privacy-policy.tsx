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

export default function PrivacyPolicyScreen() {
  const handleOpenLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Header title="Privacy Policy" />
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString()}</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.text}>
          We collect information that you provide directly to us, including when you create an account, post content, or communicate with us.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.text}>
          We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.
        </Text>

        <Text style={styles.sectionTitle}>3. Information Sharing</Text>
        <Text style={styles.text}>
          We do not sell your personal information. We may share your information in certain limited circumstances, such as with your consent or to comply with legal obligations.
        </Text>

        <Text style={styles.sectionTitle}>4. Data Security</Text>
        <Text style={styles.text}>
          We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
        </Text>

        <Text style={styles.sectionTitle}>5. Your Rights</Text>
        <Text style={styles.text}>
          You have the right to access, update, or delete your personal information. You can also opt out of certain data collection practices.
        </Text>

        <Text style={styles.sectionTitle}>6. Contact Us</Text>
        <Text style={styles.text}>
          If you have questions about this Privacy Policy, please contact us at privacy@gitgram.app
        </Text>

        <Text style={styles.link} onPress={() => handleOpenLink('https://gitgram.app/privacy')}>
          View full privacy policy online
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

