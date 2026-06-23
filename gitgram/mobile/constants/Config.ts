import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

export const API_BASE_URL = extra.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
export const GITHUB_CLIENT_ID = extra.githubClientId || process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '';
export const SOCKET_URL = extra.socketUrl || process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';
export const API_VERSION = 'v1';

