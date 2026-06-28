// Centralized runtime configuration for the proximity mobile app.
// API base URL is resolved from the Expo public env var with a localhost
// fallback for development, matching the inline pattern used across screens.

export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';
