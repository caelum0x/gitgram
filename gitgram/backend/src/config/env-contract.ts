/**
 * Environment Contract
 *
 * Canonical definition of every environment variable the Gitgram backend
 * recognises, its tier (required / production / optional), default value,
 * and a custom validator.
 *
 * This module is the SINGLE SOURCE OF TRUTH.  All other env-related code
 * (env.ts, env-validation.ts, .env.example, ENV_MATRIX.md) derive from it.
 *
 * Usage:
 *   import { validateEnvContract, getEnv } from './config/env-contract';
 *   validateEnvContract();   // call BEFORE any server startup code
 *   const cfg = getEnv();    // typed, validated config singleton
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnvTier = 'required' | 'production' | 'optional';

export interface EnvVarDef {
  /** Variable name exactly as it appears in process.env */
  name: string;
  /** Human-readable description */
  description: string;
  /** When the variable is mandatory */
  tier: EnvTier;
  /** Whether this variable holds a secret that must not be logged */
  secret?: boolean;
  /** Default value (undefined = no default, must be supplied) */
  defaultValue?: string;
  /** Custom validator -- return an error message string, or null if valid */
  validate?: (value: string) => string | null;
}

export interface ContractResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  resolved: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Validators (reusable)
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

const FORBIDDEN_DEFAULTS = [
  'default-secret', 'change-in-production', 'secret',
  'password', 'changeme', 'your-secret', 'xxx',
];

function noForbiddenDefaults(val: string): string | null {
  const lower = val.toLowerCase();
  for (const f of FORBIDDEN_DEFAULTS) {
    if (lower.includes(f)) return `contains a forbidden default pattern: "${f}"`;
  }
  return null;
}

function secretValidator(val: string): string | null {
  return minLength(32)(val) || noForbiddenDefaults(val);
}

// ---------------------------------------------------------------------------
// The Contract -- full variable registry
// ---------------------------------------------------------------------------

export const ENV_CONTRACT: EnvVarDef[] = [
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
    secret: true,
    validate: isPostgresUrl,
  },

  // ── Redis ──
  {
    name: 'REDIS_URL',
    description: 'Redis connection string (falls back to in-memory cache)',
    tier: 'optional',
    validate: isRedisUrl,
  },

  // ── JWT / Auth ──
  {
    name: 'JWT_SECRET',
    description: 'Secret for signing access tokens (min 32 chars in production)',
    tier: 'required',
    secret: true,
    validate: secretValidator,
  },
  {
    name: 'JWT_REFRESH_SECRET',
    description: 'Secret for signing refresh tokens (min 32 chars in production)',
    tier: 'production',
    secret: true,
    validate: secretValidator,
  },
  {
    name: 'JWT_EXPIRES_IN',
    description: 'Access token TTL (e.g. 15m, 1h)',
    tier: 'optional',
    defaultValue: '15m',
  },
  {
    name: 'REFRESH_TOKEN_EXPIRES_IN',
    description: 'Refresh token TTL (e.g. 7d, 30d)',
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
    description: 'Base URL of the Next.js frontend (used in emails, CORS, OAuth)',
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
    secret: true,
  },
  {
    name: 'GITHUB_TOKEN',
    description: 'GitHub personal access token for API calls',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'GITHUB_WEBHOOK_SECRET',
    description: 'Secret for verifying GitHub webhook payloads',
    tier: 'optional',
    secret: true,
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
    secret: true,
  },
  {
    name: 'GOOGLE_REDIRECT_URI',
    description: 'Google OAuth redirect URI (defaults to {FRONTEND_URL}/auth/google/callback)',
    tier: 'optional',
  },

  // ── Google Maps ──
  {
    name: 'GOOGLE_MAPS_API_KEY',
    description: 'Google Maps Geocoding API key',
    tier: 'optional',
    secret: true,
  },

  // ── AWS S3 ──
  {
    name: 'AWS_ACCESS_KEY_ID',
    description: 'AWS IAM access key for S3',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    description: 'AWS IAM secret key for S3',
    tier: 'optional',
    secret: true,
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
    description: 'Media storage backend: "local" or "s3"',
    tier: 'optional',
    defaultValue: 'local',
  },
  {
    name: 'CDN_URL',
    description: 'CDN base URL for media assets',
    tier: 'optional',
  },
  {
    name: 'ENABLE_IMAGE_OPTIMIZATION',
    description: 'Enable Sharp image optimization (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },
  {
    name: 'ENABLE_WEBP',
    description: 'Enable WebP conversion for images (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },

  // ── Polar.sh ──
  {
    name: 'POLAR_ACCESS_TOKEN',
    description: 'Polar.sh organization access token',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'POLAR_WEBHOOK_SECRET',
    description: 'Polar.sh webhook signing secret',
    tier: 'optional',
    secret: true,
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
  },

  // ── Email ──
  {
    name: 'RESEND_API_KEY',
    description: 'Resend transactional email API key',
    tier: 'optional',
    secret: true,
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
  {
    name: 'LOG_LEVEL',
    description: 'Logging level: debug | info | warn | error',
    tier: 'optional',
    defaultValue: 'info',
  },
  {
    name: 'LAUNCHDARKLY_SDK_KEY',
    description: 'LaunchDarkly SDK key for feature flags',
    tier: 'optional',
    secret: true,
  },

  // ── Analytics ──
  {
    name: 'MIXPANEL_TOKEN',
    description: 'Mixpanel analytics token',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'MIXPANEL_HOST',
    description: 'Mixpanel API host URL',
    tier: 'optional',
  },
  {
    name: 'AMPLITUDE_API_KEY',
    description: 'Amplitude analytics API key',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'AMPLITUDE_SERVER_URL',
    description: 'Amplitude server URL',
    tier: 'optional',
  },

  // ── Third-party ──
  {
    name: 'GIPHY_API_KEY',
    description: 'Giphy API key for GIF search',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'JAMENDO_CLIENT_ID',
    description: 'Jamendo API client ID for music search',
    tier: 'optional',
  },

  // ── Media processing ──
  {
    name: 'VIDEO_TEMP_DIR',
    description: 'Temporary directory for video transcoding',
    tier: 'optional',
  },
  {
    name: 'MEDIA_TEMP_DIR',
    description: 'Temporary directory for media transcoding pipeline',
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
    description: 'NSFW detection confidence threshold (0.0 - 1.0)',
    tier: 'optional',
    defaultValue: '0.6',
    validate: isFloat01,
  },

  // ── Admin settings ──
  {
    name: 'REGISTRATION_ENABLED',
    description: 'Enable user registration (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },
  {
    name: 'EMAIL_VERIFICATION_REQUIRED',
    description: 'Require email verification (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },
  {
    name: 'TWO_FACTOR_ENABLED',
    description: 'Enable 2FA support (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },
  {
    name: 'MAINTENANCE_MODE',
    description: 'Enable maintenance mode (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },
  {
    name: 'MAX_POST_LENGTH',
    description: 'Maximum post character length',
    tier: 'optional',
    defaultValue: '2000',
    validate: isPositiveInt,
  },
  {
    name: 'MAX_MEDIA_PER_POST',
    description: 'Maximum media attachments per post',
    tier: 'optional',
    defaultValue: '10',
    validate: isPositiveInt,
  },
  {
    name: 'MAX_FILE_SIZE',
    description: 'Maximum file upload size in bytes',
    tier: 'optional',
    defaultValue: '10485760',
    validate: isPositiveInt,
  },
  {
    name: 'RATE_LIMIT',
    description: 'Global API rate limit per window',
    tier: 'optional',
    defaultValue: '100',
    validate: isPositiveInt,
  },

  // ── URLs ──
  {
    name: 'API_URL',
    description: 'Public API base URL (for webhook registration)',
    tier: 'optional',
    defaultValue: 'http://localhost:4000',
  },
  {
    name: 'APP_URL',
    description: 'Public app URL (for payment return URLs)',
    tier: 'optional',
    defaultValue: 'http://localhost:3000',
  },

  // ── AITM Integration ──
  {
    name: 'AITM_API_URL',
    description: 'Gitgram TimeMachine API base URL (for change stories)',
    tier: 'optional',
  },
  {
    name: 'AITM_ENCRYPTION_SECRET',
    description: 'Encryption secret for AITM data bridge',
    tier: 'optional',
    secret: true,
  },

  // ── Security ──
  {
    name: 'IP_HASH_SALT',
    description: 'Salt for hashing IP addresses in bot prevention',
    tier: 'optional',
    defaultValue: 'gitgram',
  },
  {
    name: 'BACKUP_DIR',
    description: 'Directory for database backups',
    tier: 'optional',
  },
  {
    name: 'FEATURE_FLAGS',
    description: 'Comma-separated list of locally enabled feature flags',
    tier: 'optional',
  },
];

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

export function runContractValidation(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ContractResult {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolved: Record<string, string | undefined> = {};

  for (const def of ENV_CONTRACT) {
    const raw = env[def.name];
    const value = raw || def.defaultValue;
    resolved[def.name] = value;

    // Tier-based presence check
    if (!raw) {
      if (def.tier === 'required' && !isTest) {
        errors.push(`[MISSING] ${def.name} -- ${def.description}`);
        continue;
      }
      if (def.tier === 'production' && isProduction) {
        errors.push(`[MISSING] ${def.name} -- ${def.description} (required in production)`);
        continue;
      }
      if (def.tier === 'optional' && !def.defaultValue) {
        continue; // silently skip
      }
    }

    // Run custom validator on the effective value
    if (value && def.validate) {
      const err = def.validate(value);
      if (err) {
        const msg = `[INVALID] ${def.name}: ${err}`;
        if (isProduction || def.tier === 'required') {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }

  // ── Cross-field validations ──

  // CORS in production
  if (isProduction && env.CORS_ORIGIN) {
    for (const origin of env.CORS_ORIGIN.split(',')) {
      const trimmed = origin.trim();
      if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
        warnings.push(`[CORS] Origin contains localhost in production: ${trimmed}`);
      }
      if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://localhost')) {
        warnings.push(`[CORS] Origin should use HTTPS in production: ${trimmed}`);
      }
    }
  }

  // DB in production
  if (isProduction && env.DATABASE_URL) {
    if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')) {
      warnings.push('[DB] DATABASE_URL points to localhost in production');
    }
  }

  // Partial S3 config
  const s3Keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
  const s3Set = s3Keys.filter((k) => !!env[k]);
  if (s3Set.length > 0 && s3Set.length < s3Keys.length) {
    const missing = s3Keys.filter((k) => !env[k]);
    warnings.push(`[AWS] Partial S3 config. Set: ${s3Set.join(', ')}. Missing: ${missing.join(', ')}`);
  }

  // Partial Polar config
  const polarKeys = ['POLAR_ACCESS_TOKEN', 'POLAR_WEBHOOK_SECRET'];
  const polarSet = polarKeys.filter((k) => !!env[k]);
  if (polarSet.length > 0 && polarSet.length < polarKeys.length) {
    const missing = polarKeys.filter((k) => !env[k]);
    warnings.push(`[POLAR] Partial Polar config. Set: ${polarSet.join(', ')}. Missing: ${missing.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, warnings, resolved };
}

// ---------------------------------------------------------------------------
// Public API -- validate & fail fast
// ---------------------------------------------------------------------------

/**
 * Validate all env vars against the contract.
 * In production: exits the process on failure.
 * In development: logs warnings but allows startup.
 * In test: skips validation entirely.
 */
export function validateEnvContract(): ContractResult {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    // Return a passing result in test mode
    const resolved: Record<string, string | undefined> = {};
    for (const def of ENV_CONTRACT) {
      resolved[def.name] = process.env[def.name] || def.defaultValue;
    }
    return { valid: true, errors: [], warnings: [], resolved };
  }

  const result = runContractValidation();

  // Use logger if available, fall back to console for startup path
  const log = (() => {
    try { return require('../utils/logger').default; }
    catch { return { info: console.log, warn: console.warn, error: console.error }; }
  })();

  for (const w of result.warnings) {
    log.warn(`[env-contract] ${w}`);
  }

  if (!result.valid) {
    const divider = '='.repeat(60);
    const header = `\n${divider}\n  GITGRAM BACKEND: ENVIRONMENT VALIDATION FAILED\n${divider}`;
    const body = result.errors.map((e) => `  ${e}`).join('\n');
    const footer = `${divider}\n  Fix the above errors and restart.\n${divider}\n`;
    const msg = `${header}\n${body}\n${footer}`;

    if (process.env.NODE_ENV === 'production') {
      log.error(msg);
      process.exit(1);
    } else {
      log.warn(`[DEV MODE] ${msg}`);
    }
  } else {
    log.info('[env-contract] All environment variables validated successfully.');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Typed config singleton
// ---------------------------------------------------------------------------

let _env: ContractResult | null = null;

export function getEnv(): Record<string, string | undefined> {
  if (!_env) {
    _env = validateEnvContract();
  }
  return _env.resolved;
}

// Re-export the contract for introspection by tests and tooling
export { secretValidator, isPostgresUrl, isRedisUrl, isPositiveInt, isFloat01 };
