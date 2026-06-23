import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';
import { Colors } from '../../constants/Colors';
import * as WebBrowser from 'expo-web-browser';
import { GITHUB_CLIENT_ID } from '../../constants/Config';
import { StatusBar } from 'expo-status-bar';

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await authService.login({ email, password });
      await login(response.user, response.accessToken, response.refreshToken);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Login Failed', error.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    try {
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email,repo`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          setLoading(true);
          try {
            const response = await authService.githubAuth(code);
            await login(response.user, response.accessToken, response.refreshToken);
            router.replace('/(tabs)/home');
          } catch (error: any) {
            Alert.alert('GitHub Login Failed', error.response?.data?.error || 'An error occurred');
          } finally {
            setLoading(false);
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to open GitHub login');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Logo and Headline */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoIcon}>💻</Text>
            </View>
            <Text style={styles.appName}>Gitgram</Text>
            <Text style={styles.tagline}>Where code tells a story.</Text>
          </View>

          <View style={styles.formCard}>
            {/* Login with GitHub Button */}
            <TouchableOpacity
              style={[styles.githubButton, loading && styles.buttonDisabled]}
              onPress={handleGitHubLogin}
              disabled={loading}
            >
              <Text style={styles.githubIcon}>🐙</Text>
              <Text style={styles.githubButtonText}>Continue with GitHub</Text>
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Username/Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email or Username</Text>
              <TextInput
                style={styles.input}
                placeholder="gitgram@example.com"
                placeholderTextColor="#666"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <View style={styles.passwordHeader}>
                <Text style={styles.label}>Password</Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={styles.forgotPassword}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {/* Log In Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              New to Gitgram?{' '}
              <Text style={styles.signUpLink} onPress={() => router.push('/(auth)/register')}>
                Create an account
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0C10', // Dark background
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#161b22',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  logoIcon: {
    fontSize: 32,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: '#8b949e',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#161b22',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#30363d',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  githubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    height: 50,
    gap: 10,
  },
  githubIcon: {
    fontSize: 22,
  },
  githubButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#30363d',
  },
  dividerText: {
    color: '#8b949e',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#c9d1d9',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotPassword: {
    color: '#58a6ff',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0d1117',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  loginButton: {
    backgroundColor: '#238636',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#8b949e',
    fontSize: 15,
  },
  signUpLink: {
    color: '#58a6ff',
    fontWeight: '700',
  },
});

