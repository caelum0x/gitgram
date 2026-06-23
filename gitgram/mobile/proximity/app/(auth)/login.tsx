import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { login, setAuthToken, API_BASE } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDIGO = '#4F46E5';
const PURPLE = '#9333EA';
const BG = '#0F0F1A';
const SURFACE = '#1A1A2E';
const BORDER = '#2D2D50';
const TEXT = '#E2E8F0';
const TEXT_SEC = '#94A3B8';

const GITHUB_OAUTH_URL = `${API_BASE}/v1/auth/github`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  const busy = loading || githubLoading;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your username / email and password.');
      return;
    }

    setLoading(true);
    try {
      const { token } = await login(identifier.trim(), password);
      await SecureStore.setItemAsync('gitgram_auth_token', token);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      Alert.alert('Sign In Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubOAuth = async () => {
    setGithubLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        GITHUB_OAUTH_URL,
        'gitgram://auth/callback',
      );

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get('token');
        if (token) {
          await setAuthToken(token);
          await SecureStore.setItemAsync('gitgram_auth_token', token);
          router.replace('/(tabs)');
        } else {
          Alert.alert('GitHub Sign-In', 'Authentication failed. No token received.');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GitHub sign-in failed.';
      Alert.alert('GitHub Sign-In Failed', message);
    } finally {
      setGithubLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Logo                                                                 */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.logoWrap}>
          <View style={styles.logoRow}>
            <Text style={[styles.logoText, { color: INDIGO }]}>Git</Text>
            <Text style={[styles.logoText, { color: PURPLE }]}>gram</Text>
          </View>
          <Text style={styles.tagline}>The social network for developers</Text>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Form                                                                 */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.form}>
          {/* Email / username */}
          <TextInput
            style={styles.input}
            placeholder="Username or email"
            placeholderTextColor={TEXT_SEC}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            editable={!busy}
            accessibilityLabel="Username or email"
          />

          {/* Password row */}
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Password"
              placeholderTextColor={TEXT_SEC}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!busy}
              accessibilityLabel="Password"
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>

          {/* Forgot password */}
          <Pressable
            style={styles.forgotWrap}
            onPress={() => router.push('/forgot-password')}
          >
            <Text style={styles.forgotTxt}>Forgot password?</Text>
          </Pressable>

          {/* Login button */}
          <Pressable
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnTxt}>Sign In</Text>
            )}
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerTxt}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* GitHub OAuth */}
          <Pressable
            style={[styles.githubBtn, busy && styles.btnDisabled]}
            onPress={handleGitHubOAuth}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Continue with GitHub"
          >
            {githubLoading ? (
              <ActivityIndicator color={TEXT} />
            ) : (
              <>
                <Text style={styles.githubIcon}>🐙</Text>
                <Text style={styles.githubTxt}>Continue with GitHub</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Footer — sign up link                                                */}
        {/* ------------------------------------------------------------------ */}
        <Pressable
          style={styles.footer}
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="button"
        >
          <Text style={styles.footerTxt}>
            {"Don't have an account? "}
            <Text style={styles.footerLink}>Sign up</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  flex: { flex: 1 },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 44 },
  logoRow: { flexDirection: 'row' },
  logoText: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 14, color: TEXT_SEC, marginTop: 6 },

  // Form
  form: { gap: 12 },
  input: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: TEXT,
    fontSize: 16,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
  },
  eyeIcon: { fontSize: 17 },

  // Forgot password
  forgotWrap: { alignSelf: 'flex-end' },
  forgotTxt: { color: INDIGO, fontSize: 13, fontWeight: '500' },

  // Primary button
  primaryBtn: {
    backgroundColor: INDIGO,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: INDIGO,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerTxt: { color: TEXT_SEC, fontSize: 12 },

  // GitHub button
  githubBtn: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  githubIcon: { fontSize: 18 },
  githubTxt: { color: TEXT, fontSize: 15, fontWeight: '600' },

  // Footer
  footer: { alignItems: 'center', marginTop: 36 },
  footerTxt: { color: TEXT_SEC, fontSize: 14 },
  footerLink: { color: '#9333EA', fontWeight: '600' },
});
