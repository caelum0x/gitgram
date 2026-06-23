import axios from 'axios';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}

interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture: string;
}

interface AuthResult {
  user: {
    id: string;
    email: string;
    username: string | null;
    avatar: string | null;
    githubUsername?: string | null;
  };
  account: any;
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

/**
 * Exchange GitHub authorization code for access token
 */
export const getGitHubAccessToken = async (code: string): Promise<string> => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth not configured');
  }

  const response = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
    },
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (response.data.error) {
    logger.error('GitHub OAuth error:', response.data);
    throw new Error(response.data.error_description || 'GitHub authentication failed');
  }

  return response.data.access_token;
};

/**
 * Get GitHub user info using access token
 */
export const getGitHubUser = async (accessToken: string): Promise<GitHubUser> => {
  const response = await axios.get('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Get primary email if not public
  if (!response.data.email) {
    const emailsResponse = await axios.get('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const primaryEmail = emailsResponse.data.find(
      (e: { primary: boolean; verified: boolean }) => e.primary && e.verified
    );

    if (primaryEmail) {
      response.data.email = primaryEmail.email;
    }
  }

  return response.data;
};

/**
 * Authenticate with GitHub OAuth
 */
export const authenticateWithGitHub = async (code: string): Promise<AuthResult> => {
  const githubAccessToken = await getGitHubAccessToken(code);
  const githubUser = await getGitHubUser(githubAccessToken);

  if (!githubUser.email) {
    throw new Error('Email not available from GitHub. Please make your email public or add a verified email.');
  }

  // Check if user exists with this GitHub ID
  let user = await prisma.user.findUnique({
    where: { githubId: githubUser.id.toString() },
  });

  let isNewUser = false;

  if (!user) {
    // Check if user exists with this email
    user = await prisma.user.findUnique({
      where: { email: githubUser.email },
    });

    if (user) {
      // Link GitHub to existing account
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAccessToken: githubAccessToken,
          avatar: user.avatar || githubUser.avatar_url,
        },
      });
    } else {
      // Create new user
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          email: githubUser.email,
          githubId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          githubAccessToken: githubAccessToken,
          username: githubUser.login,
          displayName: githubUser.name || githubUser.login,
          avatar: githubUser.avatar_url,
          emailVerified: true, // GitHub emails are verified
        },
      });

      // Create account
      await prisma.account.create({
        data: {
          type: 'USER',
          username: githubUser.login,
          displayName: githubUser.name || githubUser.login,
          avatar: githubUser.avatar_url,
          userId: user.id,
        },
      });
    }
  } else {
    // Update GitHub access token
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        githubAccessToken: githubAccessToken,
        githubUsername: githubUser.login,
      },
    });
  }

  // Get or create account
  let account = await prisma.account.findFirst({
    where: { userId: user.id },
  });

  if (!account) {
    account = await prisma.account.create({
      data: {
        type: 'USER',
        username: user.username || githubUser.login,
        displayName: user.displayName || githubUser.name || githubUser.login,
        avatar: user.avatar,
        userId: user.id,
      },
    });
  }

  // Generate tokens
  const accessToken = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
  );

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  logger.info(`GitHub auth successful for user ${user.id} (${isNewUser ? 'new' : 'existing'})`);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      githubUsername: user.githubUsername,
    },
    account,
    accessToken,
    refreshToken,
    isNewUser,
  };
};

/**
 * Exchange Google authorization code for tokens
 */
export const getGoogleTokens = async (code: string): Promise<{ accessToken: string; idToken: string }> => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured');
  }

  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (response.data.error) {
    logger.error('Google OAuth error:', response.data);
    throw new Error(response.data.error_description || 'Google authentication failed');
  }

  return {
    accessToken: response.data.access_token,
    idToken: response.data.id_token,
  };
};

/**
 * Get Google user info
 */
export const getGoogleUser = async (accessToken: string): Promise<GoogleUser> => {
  const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
};

/**
 * Authenticate with Google OAuth
 */
export const authenticateWithGoogle = async (code: string): Promise<AuthResult> => {
  const { accessToken: googleAccessToken } = await getGoogleTokens(code);
  const googleUser = await getGoogleUser(googleAccessToken);

  if (!googleUser.verified_email) {
    throw new Error('Email not verified with Google');
  }

  // Check if user exists with this Google ID
  let user = await prisma.user.findUnique({
    where: { googleId: googleUser.id },
  });

  let isNewUser = false;

  if (!user) {
    // Check if user exists with this email
    user = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (user) {
      // Link Google to existing account
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.id,
          avatar: user.avatar || googleUser.picture,
        },
      });
    } else {
      // Create new user
      isNewUser = true;
      const username = googleUser.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');

      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          googleId: googleUser.id,
          username,
          displayName: googleUser.name,
          avatar: googleUser.picture,
          emailVerified: true,
        },
      });

      // Create account
      await prisma.account.create({
        data: {
          type: 'USER',
          username,
          displayName: googleUser.name,
          avatar: googleUser.picture,
          userId: user.id,
        },
      });
    }
  }

  // Get or create account
  let account = await prisma.account.findFirst({
    where: { userId: user.id },
  });

  if (!account) {
    account = await prisma.account.create({
      data: {
        type: 'USER',
        username: user.username || googleUser.email.split('@')[0],
        displayName: user.displayName || googleUser.name,
        avatar: user.avatar,
        userId: user.id,
      },
    });
  }

  // Generate tokens
  const accessToken = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
  );

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  logger.info(`Google auth successful for user ${user.id} (${isNewUser ? 'new' : 'existing'})`);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
    },
    account,
    accessToken,
    refreshToken,
    isNewUser,
  };
};
