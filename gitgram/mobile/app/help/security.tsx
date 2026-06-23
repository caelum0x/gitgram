import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';

export default function SecurityHelpScreen() {
  return (
    <View style={styles.container}>
      <Header title="Account Security" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Keeping Your Account Safe</Text>
          <Text style={styles.paragraph}>
            Protect your Gitgram account with these security features and best practices.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Two-Factor Authentication (2FA)</Text>
          <Text style={styles.paragraph}>
            Add an extra layer of security to your account:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Security</Text>
            <Text style={styles.step}>2. Tap "Two-Factor Authentication"</Text>
            <Text style={styles.step}>3. Choose your method (authenticator app)</Text>
            <Text style={styles.step}>4. Scan the QR code with your authenticator</Text>
            <Text style={styles.step}>5. Save your backup codes securely</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Password Best Practices</Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Use at least 12 characters</Text>
            <Text style={styles.step}>- Mix uppercase, lowercase, numbers, and symbols</Text>
            <Text style={styles.step}>- Don't reuse passwords from other sites</Text>
            <Text style={styles.step}>- Use a password manager</Text>
            <Text style={styles.step}>- Change your password regularly</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Login Activity</Text>
          <Text style={styles.paragraph}>
            Review where you're logged in:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Security {">"} Login Activity</Text>
            <Text style={styles.step}>2. See all active sessions</Text>
            <Text style={styles.step}>3. Log out of unfamiliar devices</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Linked GitHub Account</Text>
          <Text style={styles.paragraph}>
            If you signed in with GitHub:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Keep your GitHub account secure</Text>
            <Text style={styles.step}>- Enable 2FA on GitHub as well</Text>
            <Text style={styles.step}>- Review GitHub app permissions periodically</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Recognize Phishing</Text>
          <Text style={styles.paragraph}>
            Protect yourself from scams:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Gitgram will never ask for your password via email</Text>
            <Text style={styles.step}>- Check URLs before entering credentials</Text>
            <Text style={styles.step}>- Be suspicious of urgent security alerts</Text>
            <Text style={styles.step}>- Report suspicious messages or accounts</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Account Recovery</Text>
          <Text style={styles.paragraph}>
            If you lose access to your account:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Use "Forgot Password" on the login screen</Text>
            <Text style={styles.step}>2. Check your email for reset instructions</Text>
            <Text style={styles.step}>3. If using 2FA, use your backup codes</Text>
            <Text style={styles.step}>4. Contact support if you're still locked out</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Deleting Your Account</Text>
          <Text style={styles.paragraph}>
            If you want to permanently delete your account:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Account</Text>
            <Text style={styles.step}>2. Tap "Delete Account"</Text>
            <Text style={styles.step}>3. You have 30 days to change your mind</Text>
            <Text style={styles.step}>4. After 30 days, all data is permanently deleted</Text>
          </View>
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
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  steps: {
    paddingLeft: 8,
  },
  step: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 28,
  },
});
