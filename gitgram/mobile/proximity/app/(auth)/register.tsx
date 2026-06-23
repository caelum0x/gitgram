import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { signup, apiClient, setAuthToken, API_BASE } from '../../services/gitgramApi';

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
const SUCCESS = '#10B981';
const ERROR = '#EF4444';
const AMBER = '#F59E0B';

const TERMS_URL = 'https://gitgram.app/terms';
const PRIVACY_URL = 'https://gitgram.app/privacy';
const GITHUB_OAUTH_URL = `${API_BASE}/v1/auth/github`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface PasswordStrength {
  label: string;
  color: string;
  pct: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

function validateUsername(value: string): UsernameStatus {
  if (value.length === 0) return 'idle';
  if (!USERNAME_RE.test(value)) return 'invalid';
  return 'idle';
}

function getPasswordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) return { label: '', color: 'transparent', pct: 0 };
  if (pw.length < 6) return { label: 'Weak', color: ERROR, pct: 25 };
  if (pw.length < 8) return { label: 'Fair', color: AMBER, pct: 50 };
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) {
    return { label: 'Strong', color: SUCCESS, pct: 100 };
  }
  return { label: 'Good', color: INDIGO, pct: 75 };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = loading || githubLoading;

  // -------------------------------------------------------------------------
  // Username availability — debounced API check
  // -------------------------------------------------------------------------

  const checkUsernameAvailability = useCallback(async (value: string) => {
    setUsernameStatus('checking');
    try {
      await apiClient<{ available: boolean }>(
        `/v1/users/check-username?username=${encodeURIComponent(value)}`,
        { skipAuth: true },
      );
      setUsernameStatus('available');
    } catch {
      setUsernameStatus('taken');
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const localStatus = validateUsername(username);
    if (localStatus === 'invalid' || username.length === 0) {
      setUsernameStatus(localStatus);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [username, checkUsernameAvailability]);

  const handleUsernameChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
    setUsername(cleaned);
  };

  // -------------------------------------------------------------------------
  // Form validation guard
  // -------------------------------------------------------------------------

  const validate = (): boolean => {
    if (!username || !email || !password || !confirmPw) {
      Alert.alert('Required', 'Please fill in all fields.');
      return false;
    }
    if (usernameStatus === 'invalid') {
      Alert.alert(
        'Invalid Username',
        'Username must be 3-30 characters and contain only letters, numbers, or underscores.',
      );
      return false;
    }
    if (usernameStatus === 'taken') {
      Alert.alert('Username Taken', 'Please choose a different username.');
      return false;
    }
    if (usernameStatus === 'checking') {
      Alert.alert('Please Wait', 'Still checking username availability.');
      return false;
    }
    if (password !== confirmPw) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return false;
    }
    if (!termsAccepted) {
      Alert.alert('Terms Required', 'Please accept the Terms of Service to continue.');
      return false;
    }
    return true;
  };

  // -------------------------------------------------------------------------
  // Email + password sign-up
  // -------------------------------------------------------------------------

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const { token } = await signup(username.trim(), email.trim(), password);
      await SecureStore.setItemAsync('gitgram_auth_token', token);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed. Please try again.';
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // GitHub OAuth sign-up
  // -------------------------------------------------------------------------

  const handleGitHubSignUp = async () => {
    if (!termsAccepted) {
      Alert.alert('Terms Required', 'Please accept the Terms of Service to continue.');
      return;
    }

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
          Alert.alert('GitHub Sign-Up', 'Authentication failed. No token received.');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GitHub sign-up failed.';
      Alert.alert('GitHub Sign-Up Failed', message);
    } finally {
      setGithubLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const strength = getPasswordStrength(password);
  const pwMismatch = Boolean(password && confirmPw && password !== confirmPw);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderUsernameHint = () => {
    switch (usernameStatus) {
      case 'checking':
        return (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={TEXT_SEC} style={styles.hintSpinner} />
            <Text style={styles.hintText}>Checking availability...</Text>
          </View>
        );
      case 'available':
        return <Text style={[styles.hintText, { color: SUCCESS }]}>Username available</Text>;
      case 'taken':
        return <Text style={[styles.hintText, { color: ERROR }]}>Username already taken</Text>;
      case 'invalid':
        return (
          <Text style={[styles.hintText, { color: ERROR }]}>
            3-30 characters: letters, numbers, underscores only
          </Text>
        );
      default:
        return null;
    }
  };

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ---------------------------------------------------------------- */}
          {/* Logo / brand                                                       */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.logoWrap}>
            <View style={styles.logoRow}>
              <Text style={[styles.logoText, { color: INDIGO }]}>Git</Text>
              <Text style={[styles.logoText, { color: PURPLE }]}>gram</Text>
            </View>
            <Text style={styles.tagline}>Create Account</Text>
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* Form                                                               */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.form}>
            {/* Username */}
            <View>
              <TextInput
                style={[
                  styles.input,
                  usernameStatus === 'available' && styles.inputOk,
                  (usernameStatus === 'taken' || usernameStatus === 'invalid') && styles.inputError,
                ]}
                placeholder="Username (3-30 chars)"
                placeholderTextColor={TEXT_SEC}
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!busy}
                accessibilityLabel="Username"
              />
              {renderUsernameHint()}
            </View>

            {/* Email */}
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={TEXT_SEC}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              editable={!busy}
              accessibilityLabel="Email address"
            />

            {/* Password + show/hide + strength */}
            <View>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Password"
                  placeholderTextColor={TEXT_SEC}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!busy}
                  accessibilityLabel="Password"
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPw((v) => !v)}
                  accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.eyeIcon}>{showPw ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>

              {password.length > 0 && (
                <>
                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        { width: `${strength.pct}%`, backgroundColor: strength.color },
                      ]}
                    />
                  </View>
                  {strength.label ? (
                    <Text style={[styles.hintText, { color: strength.color }]}>
                      {strength.label}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {/* Confirm password */}
            <View>
              <TextInput
                style={[styles.input, pwMismatch && styles.inputError]}
                placeholder="Confirm password"
                placeholderTextColor={TEXT_SEC}
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                editable={!busy}
                accessibilityLabel="Confirm password"
              />
              {pwMismatch && (
                <Text style={[styles.hintText, { color: ERROR }]}>Passwords do not match</Text>
              )}
            </View>

            {/* Terms of service checkbox */}
            <Pressable
              style={styles.termsRow}
              onPress={() => setTermsAccepted((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="Accept terms of service"
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.termsTxt}>
                I agree to the{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL(TERMS_URL)}
                  accessibilityRole="link"
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL(PRIVACY_URL)}
                  accessibilityRole="link"
                >
                  Privacy Policy
                </Text>
              </Text>
            </Pressable>

            {/* Create Account button */}
            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Create Account"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnTxt}>Create Account</Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerTxt}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign Up with GitHub */}
            <Pressable
              style={[styles.githubBtn, busy && styles.btnDisabled]}
              onPress={handleGitHubSignUp}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sign up with GitHub"
            >
              {githubLoading ? (
                <ActivityIndicator color={TEXT} />
              ) : (
                <>
                  <Text style={styles.githubIcon}>🐙</Text>
                  <Text style={styles.githubTxt}>Sign up with GitHub</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* Footer — sign in link                                              */}
          {/* ---------------------------------------------------------------- */}
          <Pressable
            style={styles.footer}
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
          >
            <Text style={styles.footerTxt}>
              {'Already have an account? '}
              <Text style={styles.footerLink}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 36 },
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
  inputOk: { borderColor: SUCCESS },
  inputError: { borderColor: ERROR },

  // Hint text
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 2 },
  hintSpinner: { marginRight: 6 },
  hintText: { fontSize: 12, color: TEXT_SEC, marginTop: 4, marginLeft: 2 },

  // Password row
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

  // Strength bar
  strengthTrack: {
    height: 3,
    backgroundColor: BORDER,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  strengthFill: { height: '100%', borderRadius: 2 },

  // Terms checkbox row
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  termsTxt: {
    flex: 1,
    fontSize: 13,
    color: TEXT_SEC,
    lineHeight: 19,
  },
  termsLink: { color: PURPLE, fontWeight: '500' },

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
    marginVertical: 2,
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
  footer: { alignItems: 'center', marginTop: 28 },
  footerTxt: { color: TEXT_SEC, fontSize: 14 },
  footerLink: { color: PURPLE, fontWeight: '600' },
});
