import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';

export default function PrivacyHelpScreen() {
  return (
    <View style={styles.container}>
      <Header title="Privacy Settings" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Managing Your Privacy</Text>
          <Text style={styles.paragraph}>
            Control who can see your content and interact with you on Gitgram.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Private Account</Text>
          <Text style={styles.paragraph}>
            Make your account private to control who follows you:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings</Text>
            <Text style={styles.step}>2. Tap "Privacy"</Text>
            <Text style={styles.step}>3. Enable "Private Account"</Text>
          </View>
          <Text style={styles.paragraph}>
            When your account is private:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Only approved followers can see your posts</Text>
            <Text style={styles.step}>- You must approve follow requests</Text>
            <Text style={styles.step}>- Your profile is hidden from search</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Blocking Users</Text>
          <Text style={styles.paragraph}>
            Block users who are bothering you:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to their profile</Text>
            <Text style={styles.step}>2. Tap the three dots menu</Text>
            <Text style={styles.step}>3. Select "Block"</Text>
          </View>
          <Text style={styles.paragraph}>
            Blocked users cannot:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- See your profile or posts</Text>
            <Text style={styles.step}>- Send you messages</Text>
            <Text style={styles.step}>- Follow you or mention you</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Story Privacy</Text>
          <Text style={styles.paragraph}>
            Control who sees your stories:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Hide stories from specific users</Text>
            <Text style={styles.step}>- Create close friends lists</Text>
            <Text style={styles.step}>- Disable story replies</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Message Privacy</Text>
          <Text style={styles.paragraph}>
            Control who can message you:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Privacy {">"} Messages</Text>
            <Text style={styles.step}>2. Choose: Everyone, Followers, or No one</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Activity Status</Text>
          <Text style={styles.paragraph}>
            Hide when you're online:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Privacy</Text>
            <Text style={styles.step}>2. Disable "Show Activity Status"</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Data & Downloads</Text>
          <Text style={styles.paragraph}>
            You can download all your data:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to Settings {">"} Privacy {">"} Data Export</Text>
            <Text style={styles.step}>2. Request your data</Text>
            <Text style={styles.step}>3. Download when ready</Text>
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
