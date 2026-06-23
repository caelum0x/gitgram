/**
 * Comprehensive Environment Variable Validation
 *
 * Validates ALL required and optional env vars at startup.
 * Fails fast with a clear summary of every missing or invalid variable.
 *
 * Usage:
 *   import { validateAllEnvVars } from './config/env-validation';
 *   validateAllEnvVars(); // call before any other imports that use env vars
 */

import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnvTier = 'required' | 'production' | 'optional';

interface EnvVarSpec {
  /** Environment variable name */
  name: string;
  /** Human-readable description */
  description: string;
  /** When it is needed */
  tier: EnvTier;
  /** Default value when not set (undefined = no default) */
  defaultValue?: string;
  /** Custom validator (return error string or null) */
  validate?: (value: string) => string | null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  resolved: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function isPostgresUrl(val: string): string | null {
  if (!val.startsWith('postgresql://') && !val.startsWith('postgres://')) {
    return 'must be a PostgreSQL connection string (postgresql:// or postgres://)';
  }
  return null;
}

function isRedisUrl(val: string): string | null {
  if (!val.startsWith('redis://') && !val.startsWith('rediss://')) {
    return 'must be a Redis connection string (redis:// or rediss://)';
  }
  return null;
}

function minLength(n: number) {
  return (val: string): string | null => {
    if (val.length < n) return `must be at least ${n} characters (got ${val.length})`;
    return null;
  };
}

function isPositiveInt(val: string): string | null {
  const num = parseInt(val, 10);
  if (isNaN(num) || num < 0) return 'must be a non-negative integer';
  return null;
}

function isFloat01(val: string): string | null {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0 || num > 1) return 'must be a float between 0.0 and 1.0';
  return null;
}

function noForbiddenDefaults(val: string): string | null {
  const forbidden = [
    'default-secret', 'change-in-production', 'secret',
    'password', 'changeme', 'your-secret', 'xxx',
  ];
  const lower = val.toLowerCase();
  for (const f of forbidden) {
    if (lower.includes(f)) {
      return `contains a forbidden default pattern: "${f}"`;
    }
  }
  return null;
}

function secretValidator(val: string): string | null {
  return minLength(32)(val) || noForbiddenDefaults(val);
}

// ---------------------------------------------------------------------------
// Full Variable Registry
// ---------------------------------------------------------------------------

const ENV_VARS: EnvVarSpec[] = [
  // ── Core ──
  {
    name: 'NODE_ENV',
    description: 'Runtime environment (development | staging | production | test)',
    tier: 'optional',
    defaultValue: 'development',
  },
  {
    name: 'PORT',
    description: 'HTTP listen port',
    tier: 'optional',
    defaultValue: '4000',
    validate: isPositiveInt,
  },

  // ── Database ──
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    tier: 'required',
    validate: isPostgresUrl,
  },

  // ── Redis ──
  {
    name: 'REDIS_URL',
    description: 'Redis connection string (falls back to in-memory cache)',
    tier: 'optional',
    validate: isRedisUrl,
  },

  // ── JWT ──
  {
    name: 'JWT_SECRET',
    description: 'Secret for signing access tokens',
    tier: 'required',
    validate: secretValidator,
  },
  {
    name: 'JWT_REFRESH_SECRET',
    description: 'Secret for signing refresh tokens',
    tier: 'production',
    validate: secretValidator,
  },
  {
    name: 'JWT_EXPIRES_IN',
    description: 'Access token TTL (e.g. 15m)',
    tier: 'optional',
    defaultValue: '15m',
  },
  {
    name: 'REFRESH_TOKEN_EXPIRES_IN',
    description: 'Refresh token TTL (e.g. 7d)',
    tier: 'optional',
    defaultValue: '7d',
  },
  {
    name: 'BCRYPT_ROUNDS',
    description: 'bcrypt cost factor',
    tier: 'optional',
    defaultValue: '12',
    validate: isPositiveInt,
  },

  // ── Frontend / CORS ──
  {
    name: 'FRONTEND_URL',
    description: 'Base URL of the Next.js frontend',
    tier: 'production',
  },
  {
    name: 'CORS_ORIGIN',
    description: 'Comma-separated allowed CORS origins',
    tier: 'optional',
  },

  // ── GitHub OAuth ──
  {
    name: 'GITHUB_CLIENT_ID',
    description: 'GitHub OAuth App client ID',
    tier: 'optional',
  },
  {
    name: 'GITHUB_CLIENT_SECRET',
    description: 'GitHub OAuth App client secret',
    tier: 'optional',
  },
  {
    name: 'GITHUB_TOKEN',
    description: 'GitHub personal access token for API calls',
    tier: 'optional',
  },
  {
    name: 'GITHUB_WEBHOOK_SECRET',
    description: 'Secret for verifying GitHub webhook payloads',
    tier: 'optional',
  },

  // ── Google OAuth ──
  {
    name: 'GOOGLE_CLIENT_ID',
    description: 'Google OAuth client ID',
    tier: 'optional',
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    description: 'Google OAuth client secret',
    tier: 'optional',
  },
  {
    name: 'GOOGLE_REDIRECT_URI',
    description: 'Google OAuth redirect URI',
    tier: 'optional',
  },

  // ── AWS S3 ──
  {
    name: 'AWS_ACCESS_KEY_ID',
    description: 'AWS IAM access key for S3',
    tier: 'optional',
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    description: 'AWS IAM secret key for S3',
    tier: 'optional',
  },
  {
    name: 'AWS_S3_BUCKET',
    description: 'S3 bucket for media uploads',
    tier: 'optional',
    defaultValue: 'gitgram-uploads',
  },
  {
    name: 'AWS_REGION',
    description: 'AWS region',
    tier: 'optional',
    defaultValue: 'us-east-1',
  },
  {
    name: 'STORAGE_TYPE',
    description: 'Media storage backend (local or s3)',
    tier: 'optional',
    defaultValue: 'local',
  },

  // ── Polar.sh ──
  {
    name: 'POLAR_ACCESS_TOKEN',
    description: 'Polar.sh organization access token',
    tier: 'optional',
  },
  {
    name: 'POLAR_WEBHOOK_SECRET',
    description: 'Polar.sh webhook signing secret',
    tier: 'optional',
  },
  {
    name: 'POLAR_PREMIUM_PRODUCT_ID',
    description: 'Polar.sh Product ID for Premium plan',
    tier: 'optional',
  },
  {
    name: 'POLAR_CREATOR_PRODUCT_ID',
    description: 'Polar.sh Product ID for Creator plan',
    tier: 'optional',
  },
  {
    name: 'POLAR_MODE',
    description: 'Polar.sh environment (sandbox or production)',
    tier: 'optional',
    defaultValue: 'sandbox',
  },

  // ── DodoPay (alternative payment) ──
  {
    name: 'DODO_PAYMENTS_API_KEY',
    description: 'DodoPay API key',
    tier: 'optional',
  },
  {
    name: 'DODO_PAYMENTS_SECRET_KEY',
    description: 'DodoPay secret key',
    tier: 'optional',
  },
  {
    name: 'DODO_WEBHOOK_SECRET',
    description: 'DodoPay webhook signing secret',
    tier: 'optional',
  },

  // ── Email ──
  {
    name: 'RESEND_API_KEY',
    description: 'Resend transactional email API key',
    tier: 'optional',
  },
  {
    name: 'EMAIL_FROM',
    description: 'Default sender address for emails',
    tier: 'optional',
    defaultValue: 'Gitgram <noreply@gitgram.app>',
  },

  // ── Monitoring ──
  {
    name: 'SENTRY_DSN',
    description: 'Sentry error-tracking DSN',
    tier: 'optional',
  },

  // ── Third-party ──
  {
    name: 'GIPHY_API_KEY',
    description: 'Giphy API key for GIF search',
    tier: 'optional',
  },

  // ── Media processing ──
  {
    name: 'VIDEO_TEMP_DIR',
    description: 'Temporary directory for video transcoding',
    tier: 'optional',
  },
  {
    name: 'MEDIA_RETENTION_DAYS',
    description: 'Days before orphan media is purged',
    tier: 'optional',
    defaultValue: '30',
    validate: isPositiveInt,
  },
  {
    name: 'ORPHAN_MEDIA_HOURS',
    description: 'Hours before unlinked uploads are cleaned',
    tier: 'optional',
    defaultValue: '24',
    validate: isPositiveInt,
  },
  {
    name: 'MAX_DAILY_IMAGE_UPLOADS',
    description: 'Max image uploads per user per day',
    tier: 'optional',
    defaultValue: '50',
    validate: isPositiveInt,
  },
  {
    name: 'MAX_DAILY_VIDEO_UPLOADS',
    description: 'Max video uploads per user per day',
    tier: 'optional',
    defaultValue: '10',
    validate: isPositiveInt,
  },
  {
    name: 'MAX_STORAGE_PER_USER_MB',
    description: 'Per-user storage quota in MB',
    tier: 'optional',
    defaultValue: '5120',
    validate: isPositiveInt,
  },
  {
    name: 'NSFW_THRESHOLD',
    description: 'NSFW detection confidence threshold',
    tier: 'optional',
    defaultValue: '0.6',
    validate: isFloat01,
  },

  // ── URLs ──
  {
    name: 'API_URL',
    description: 'Public API base URL (for webhook registration)',
    tier: 'optional',
    defaultValue: 'https://api.gitgram.com',
  },
  {
    name: 'APP_URL',
    description: 'Public app URL (for payment return URLs)',
    tier: 'optional',
    defaultValue: 'http://localhost:3000',
  },
];

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

export function runValidation(): ValidationResult {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolved: Record<string, string | undefined> = {};

  for (const spec of ENV_VARS) {
    const raw = process.env[spec.name];
    const value = raw || spec.defaultValue;
    resolved[spec.name] = value;

    // Check presence based on tier
    if (!raw) {
      if (spec.tier === 'required' && !isTest) {
        errors.push(`[MISSING] ${spec.name} -- ${spec.description}`);
        continue;
      }
      if (spec.tier === 'production' && isProduction) {
        errors.push(`[MISSING] ${spec.name} -- ${spec.description} (required in production)`);
        continue;
      }
      if (spec.tier === 'optional' && !spec.defaultValue) {
        // Silently skip unset optional vars with no default
        continue;
      }
    }

    // Run custom validator on the effective value
    if (value && spec.validate) {
      const err = spec.validate(value);
      if (err) {
        const msg = `[INVALID] ${spec.name}: ${err}`;
        if (isProduction || spec.tier === 'required') {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }

  // Cross-field validations
  if (isProduction && process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',');
    for (const origin of origins) {
      const trimmed = origin.trim();
      if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
        warnings.push(`[CORS] Origin contains localhost in production: ${trimmed}`);
      }
      if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://localhost')) {
        warnings.push(`[CORS] Origin should use HTTPS in production: ${trimmed}`);
      }
    }
  }

  if (isProduction && process.env.DATABASE_URL) {
    if (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')) {
      warnings.push('[DB] DATABASE_URL points to localhost in production -- is this intentional?');
    }
  }

  // Warn if S3 is configured partially
  const s3Keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
  const s3Set = s3Keys.filter(k => !!process.env[k]);
  if (s3Set.length > 0 && s3Set.length < s3Keys.length) {
    const missing = s3Keys.filter(k => !process.env[k]);
    warnings.push(`[AWS] Partial S3 config detected. Set: ${s3Set.join(', ')}. Missing: ${missing.join(', ')}`);
  }

  // Warn if Polar is configured partially
  const polarKeys = ['POLAR_ACCESS_TOKEN', 'POLAR_WEBHOOK_SECRET'];
  const polarSet = polarKeys.filter(k => !!process.env[k]);
  if (polarSet.length > 0 && polarSet.length < polarKeys.length) {
    const missing = polarKeys.filter(k => !process.env[k]);
    warnings.push(`[POLAR] Partial Polar config. Set: ${polarSet.join(', ')}. Missing: ${missing.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resolved,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate all environment variables and fail fast if critical vars are missing.
 * In development mode, missing production-only vars are logged as warnings.
 * In production mode, any missing required var causes process.exit(1).
 */
export function validateAllEnvVars(): void {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) return; // Skip validation in test mode

  const result = runValidation();

  // Log warnings
  for (const warning of result.warnings) {
    logger.warn(`[env-validation] ${warning}`);
  }

  if (!result.valid) {
    const divider = '='.repeat(60);
    const header = '\n' + divider + '\n  ENVIRONMENT VALIDATION FAILED\n' + divider;
    const body = result.errors.map(e => `  ${e}`).join('\n');
    const footer = divider + '\n  Fix the above errors and restart.\n' + divider + '\n';
    const fullMessage = `${header}\n${body}\n${footer}`;

    if (process.env.NODE_ENV === 'production') {
      logger.error(fullMessage);
      process.exit(1);
    } else {
      logger.warn(`[DEV MODE] ${fullMessage}`);
    }
  } else {
    logger.info('[env-validation] All environment variables validated successfully.');
  }
}
