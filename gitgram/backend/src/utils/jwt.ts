import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { config } from '../config/env';

// Use validated config - no fallback secrets
const getJwtSecret = (): string => {
  const secret = config.jwt.secret;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

export interface TokenPayload {
  userId: string;
  type?: 'access' | 'refresh';
}

export const generateAccessToken = (userId: string): string => {
  const payload = { userId, type: 'access' as const };
  const options: SignOptions = { expiresIn: config.jwt.expiresIn as StringValue };
  return jwt.sign(payload, getJwtSecret(), options);
};

export const generateRefreshToken = (userId: string): string => {
  const payload = { userId, type: 'refresh' as const };
  const options: SignOptions = { expiresIn: config.jwt.refreshExpiresIn as StringValue };
  return jwt.sign(payload, getJwtSecret(), options);
};

export const generateToken = (userId: string): { accessToken: string; refreshToken: string } => {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const decoded = verifyToken(token);
  if (decoded.type && decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const decoded = verifyToken(token);
  if (decoded.type && decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
};
