import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';

export default function AccountHelpScreen() {
  return (
    <View style={styles.container}>
      <Header title="Create an Account" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Getting Started with Gitgram</Text>
          <Text style={styles.paragraph}>
            Gitgram connects developers and GitHub repositories in a social media format.
            Here's how to create your account:
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Sign Up with GitHub</Text>
          <Text style={styles.paragraph}>
            The easiest way to join Gitgram is to sign up with your GitHub account:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Tap "Continue with GitHub" on the login screen</Text>
            <Text style={styles.step}>2. Authorize Gitgram to access your GitHub profile</Text>
            <Text style={styles.step}>3. Your account will be created automatically</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Sign Up with Email</Text>
          <Text style={styles.paragraph}>
            You can also create an account using your email address:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Tap "Sign up with Email" on the login screen</Text>
            <Text style={styles.step}>2. Enter your email and create a password</Text>
            <Text style={styles.step}>3. Verify your email address</Text>
            <Text style={styles.step}>4. Complete your profile setup</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Linking Your GitHub Account</Text>
          <Text style={styles.paragraph}>
            If you signed up with email, you can link your GitHub account later to access additional features like repository sharing and project showcases.
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings</Text>
            <Text style={styles.step}>2. Tap "Linked Accounts"</Text>
            <Text style={styles.step}>3. Connect your GitHub account</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Profile Setup Tips</Text>
          <Text style={styles.paragraph}>
            Make your profile stand out:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Add a profile photo</Text>
            <Text style={styles.step}>- Write a bio about your coding interests</Text>
            <Text style={styles.step}>- Showcase your best repositories</Text>
            <Text style={styles.step}>- List your programming languages</Text>
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
