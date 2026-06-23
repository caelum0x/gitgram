import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { API_BASE_URL } from '../../../constants/Config';

const TOKEN_KEY = 'gitgram_auth_token';

export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

interface LoginResponse {
  token: string;
  user: User;
}

interface UseAuthReturn {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  checkAuth: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function fetchCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Token validation failed');
  }

  const json = (await response.json()) as { data: User };
  return json.data;
}

async function fetchLogin(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const json = (await response.json()) as { error?: string };
    throw new Error(json.error ?? 'Login failed');
  }

  return (await response.json()) as LoginResponse;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        setUser(null);
        return null;
      }

      const validatedUser = await fetchCurrentUser(token);
      setUser(validatedUser);
      return validatedUser;
    } catch {
      // Token expired or invalid — clear it silently
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setUser(null);
      return null;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const { token, user: loggedInUser } = await fetchLogin(email, password);
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      setUser(loggedInUser);
      router.replace('/(tabs)' as never);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setUser(null);
      router.replace('/login' as never);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Validate stored token on mount
  useEffect(() => {
    setIsLoading(true);
    checkAuth().finally(() => {
      setIsLoading(false);
    });
  }, [checkAuth]);

  return {
    isAuthenticated: user !== null,
    user,
    isLoading,
    checkAuth,
    login,
    logout,
  };
}
