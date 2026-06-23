import api from './api';
import { GITHUB_CLIENT_ID } from '../constants/Config';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export const authService = {
  login: async (credentials: LoginCredentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  githubAuth: async (code: string) => {
    const response = await api.post('/auth/github', { code });
    return response.data;
  },

  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  logout: async (refreshToken?: string) => {
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  forgotPassword: async (data: { email: string }) => {
    const response = await api.post('/auth/forgot-password', data);
    return response.data;
  },

  resetPassword: async (data: { token: string; password: string }) => {
    const response = await api.post('/auth/reset-password', data);
    return response.data;
  },

  verifyEmail: async (data: { token: string }) => {
    const response = await api.post('/auth/verify-email', data);
    return response.data;
  },

  resendVerification: async () => {
    const response = await api.post('/auth/resend-verification');
    return response.data;
  },

  verifyTwoFactor: async (data: { code: string }) => {
    const response = await api.post('/auth/verify-2fa', data);
    return response.data;
  },

  resendTwoFactor: async () => {
    const response = await api.post('/auth/resend-2fa');
    return response.data;
  },

  // Verify 2FA during login flow (no auth required, uses userId)
  verifyTwoFactorLogin: async (data: { userId: string; token: string }) => {
    const response = await api.post('/auth/2fa/verify-login', data);
    return response.data;
  },

  recoverAccount: async (data: { email?: string; username?: string }) => {
    const response = await api.post('/auth/recover-account', data);
    return response.data;
  },

  setupTwoFactor: async () => {
    const response = await api.post('/auth/2fa/setup');
    return response.data;
  },

  verifyTwoFactorSetup: async (data: { token: string; secret: string }) => {
    const response = await api.post('/auth/2fa/setup/verify', data);
    return response.data;
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await api.post('/auth/change-password', data);
    return response.data;
  },
};

