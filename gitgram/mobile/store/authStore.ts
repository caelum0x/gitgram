import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushNotificationService } from '../services/pushNotificationService';

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
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('accessToken', data.accessToken);
        set({ accessToken: data.accessToken });
        return data.accessToken;
      } else {
        // Refresh token expired, logout
        await get().logout();
        return null;
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
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
      console.error('Error initializing auth:', error);
      set({ isLoading: false });
    }
  },
}));

