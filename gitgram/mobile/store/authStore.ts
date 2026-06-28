import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { pushNotificationService } from '../services/pushNotificationService';
import { API_BASE_URL } from '../constants/Config';
import { logger } from '../utils/logger';

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  githubUsername?: string;
  bio?: string;
  isPrivate?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string | null, refreshToken: string | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  
  setUser: (user) => set({ user }),
  
  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
  
  login: async (user, accessToken, refreshToken) => {
    await AsyncStorage.setItem('accessToken', accessToken);
    await AsyncStorage.setItem('refreshToken', refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },
  
  logout: async () => {
    // Unregister push notifications before logging out
    await pushNotificationService.unregisterPushNotifications();

    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('user');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },
  
  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return null;

    try {
      // Use a bare axios call (not the shared `api` client) to avoid recursing
      // through api's request interceptor, which itself calls refreshAccessToken.
      // The base URL is sourced from Config so host/path stay consistent with
      // authService and the rest of the app.
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const accessToken: string | undefined = response.data?.accessToken;
      if (accessToken) {
        await AsyncStorage.setItem('accessToken', accessToken);
        set({ accessToken });
        return accessToken;
      }

      // No token returned, treat as failed refresh
      await get().logout();
      return null;
    } catch (error) {
      // Refresh token expired/invalid -> force logout so UI returns to auth flow
      logger.error('Error refreshing token:', error);
      await get().logout();
      return null;
    }
  },
  
  initialize: async () => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      const userStr = await AsyncStorage.getItem('user');
      
      if (accessToken && refreshToken && userStr) {
        const user = JSON.parse(userStr);
        set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      logger.error('Error initializing auth:', error);
      set({ isLoading: false });
    }
  },
}));

