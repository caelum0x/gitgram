/**
 * Environment Variable Validation
 * Production-grade configuration validation at startup
 */

import logger from '../utils/logger';
import crypto from 'crypto';

interface EnvConfig {
  // Required in all environments
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  DATABASE_URL: string;

  // Required in production
  FRONTEND_URL?: string;
  REDIS_URL?: string;

  // Optional with defaults
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  BCRYPT_ROUNDS: number;
}

const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
] as const;

const PRODUCTION_REQUIRED_ENV_VARS = [
  'FRONTEND_URL',
] as const;

const FORBIDDEN_DEFAULT_VALUES = [
  'default-secret',
  'change-in-production',
  'secret',
  'password',
  'changeme',
  'your-secret',
  'xxx',
];

class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

const developmentSecrets = new Map<string, string>();

function getSecretValue(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', isProduction: boolean): string {
  const value = process.env[name];
  if (value) {
    return value;
  }

  if (isProduction) {
    throw new EnvValidationError(`Missing production-required environment variable: ${name}`);
  }

  if (!developmentSecrets.has(name)) {
    logger.warn(`[DEV MODE] ${name} is missing; using a generated in-memory secret for this process.`);
    developmentSecrets.set(name, crypto.randomBytes(48).toString('hex'));
  }

  return developmentSecrets.get(name)!;
}

function validateSecretStrength(name: string, value: string): void {
  // Check minimum length
  if (value.length < 32) {
    throw new EnvValidationError(
      `${name} must be at least 32 characters long for security. Current length: ${value.length}`
    );
  }

  // Check for forbidden default values
  const lowerValue = value.toLowerCase();
  for (const forbidden of FORBIDDEN_DEFAULT_VALUES) {
    if (lowerValue.includes(forbidden)) {
      throw new EnvValidationError(
        `${name} contains a forbidden default value pattern: "${forbidden}". Please use a strong, unique secret.`
      );
    }
  }
}

export function validateEnvironment(): EnvConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check production-required variables
  if (isProduction) {
    for (const varName of PRODUCTION_REQUIRED_ENV_VARS) {
      if (!process.env[varName]) {
        errors.push(`Missing production-required environment variable: ${varName}`);
      }
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    try {
      validateSecretStrength('JWT_SECRET', process.env.JWT_SECRET);
    } catch (e) {
      if (e instanceof EnvValidationError) {
        if (isProduction) {
          errors.push(e.message);
        } else {
          logger.warn(`[DEV WARNING] ${e.message}`);
        }
      }
    }
  }

  // Validate JWT_REFRESH_SECRET strength
  if (process.env.JWT_REFRESH_SECRET) {
    try {
      validateSecretStrength('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
    } catch (e) {
      if (e instanceof EnvValidationError) {
        if (isProduction) {
          errors.push(e.message);
        } else {
          logger.warn(`[DEV WARNING] ${e.message}`);
        }
      }
    }
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
    }

    // Warn if using localhost in production
    if (isProduction && (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1'))) {
      logger.warn('DATABASE_URL points to localhost in production - is this intentional?');
    }
  }

  // Validate CORS_ORIGIN in production
  if (isProduction && process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',');
    for (const origin of origins) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        logger.warn(`CORS_ORIGIN contains localhost: ${origin} - remove for production`);
      }
      if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) {
        logger.warn(`CORS_ORIGIN should use HTTPS in production: ${origin}`);
      }
    }
  }

  // If there are critical errors, fail startup
  if (errors.length > 0) {
    const errorMessage = `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;

    if (isProduction) {
      logger.error(errorMessage);
      throw new EnvValidationError(errorMessage);
    } else {
      logger.warn(`[DEV MODE] ${errorMessage}`);
    }
  }

  // Return validated config
  return {
    JWT_SECRET: getSecretValue('JWT_SECRET', isProduction),
    JWT_REFRESH_SECRET: getSecretValue('JWT_REFRESH_SECRET', isProduction),
    DATABASE_URL: process.env.DATABASE_URL!,
    FRONTEND_URL: process.env.FRONTEND_URL,
    REDIS_URL: process.env.REDIS_URL,
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  };
}

// Singleton config - validated once at startup
let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = validateEnvironment();
  }
  return _config;
}

// Export for use in other modules
export const config = {
  get jwt() {
    return {
      secret: getConfig().JWT_SECRET,
      refreshSecret: getConfig().JWT_REFRESH_SECRET,
      expiresIn: getConfig().JWT_EXPIRES_IN,
      refreshExpiresIn: getConfig().REFRESH_TOKEN_EXPIRES_IN,
    };
  },
  get bcrypt() {
    return {
      rounds: getConfig().BCRYPT_ROUNDS,
    };
  },
  get isProduction() {
    return getConfig().NODE_ENV === 'production';
  },
  get isDevelopment() {
    return getConfig().NODE_ENV === 'development';
  },
};
