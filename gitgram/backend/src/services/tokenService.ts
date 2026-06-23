import prisma from '../utils/prisma';
import { generateToken, verifyRefreshToken, generateAccessToken } from '../utils/jwt';

export const createTokens = async (userId: string) => {
  const { accessToken, refreshToken } = generateToken(userId);
  
  // Store refresh token in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      expiresAt,
    },
  });
  
  return { accessToken, refreshToken };
};

export const refreshAccessToken = async (refreshToken: string) => {
  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  
  // Check if token exists in database
  const session = await prisma.session.findUnique({
    where: { refreshToken },
  });
  
  if (!session || session.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  
  // Generate new access token
  const accessToken = generateAccessToken(decoded.userId);
  
  return { accessToken };
};

export const revokeRefreshToken = async (refreshToken: string) => {
  await prisma.session.deleteMany({
    where: { refreshToken },
  });
};

export const revokeAllUserTokens = async (userId: string) => {
  await prisma.session.deleteMany({
    where: { userId },
  });
};

// Cleanup expired tokens (should be run as a cron job)
export const cleanupExpiredTokens = async () => {
  await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
};

