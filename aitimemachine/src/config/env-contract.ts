/**
 * Environment Contract
 *
 * Canonical definition of every environment variable the AITimeMachine
 * project recognises, its tier (required / production / optional), default
 * value, and a custom validator.
 *
 * This covers BOTH the CLI/MCP tool (src/) and the API server
 * (api-server/).  Variables that are only used by one side are tagged in
 * their description.
 *
 * Usage:
 *   import { validateEnvContract, getEnv } from './config/env-contract.js';
 *   validateEnvContract();   // call BEFORE any server/CLI startup code
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
  /** Custom validator -- return an error string, or null if valid */
  validate?: (value: string) => string | null;
}

export interface ContractResult {
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

function isPositiveInt(val: string): string | null {
  const num = parseInt(val, 10);
  if (isNaN(num) || num < 0) return 'must be a non-negative integer';
  return null;
}

function isUrl(val: string): string | null {
  if (!val.startsWith('http://') && !val.startsWith('https://')) {
    return 'must be a valid URL (http:// or https://)';
  }
  return null;
}

function isPolarMode(val: string): string | null {
  if (val !== 'sandbox' && val !== 'production') {
    return 'must be sandbox or production';
  }
  return null;
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
    description: 'HTTP listen port (API server)',
    tier: 'optional',
    defaultValue: '3001',
    validate: isPositiveInt,
  },

  // ── Database ──
  {
    name: 'DATABASE_URL',
    description: 'Neon PostgreSQL connection string (API server)',
    tier: 'required',
    secret: true,
    validate: isPostgresUrl,
  },

  // ── Networking ──
  {
    name: 'CORS_ORIGIN',
    description: 'Allowed CORS origin(s); restrict in production',
    tier: 'optional',
    defaultValue: '*',
  },
  {
    name: 'WEBSITE_URL',
    description: 'AITM website URL (for redirects, emails)',
    tier: 'optional',
    defaultValue: 'https://timemachine.gitgram.app',
  },

  // ── Auth ──
  {
    name: 'INTERNAL_SECRET',
    description: 'Shared secret for website-to-API internal calls',
    tier: 'production',
    secret: true,
  },
  {
    name: 'AITM_JWT_SECRET',
    description: 'JWT signing secret for session tokens (CLI/API)',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'CLERK_WEBHOOK_SECRET',
    description: 'Clerk webhook signing secret',
    tier: 'optional',
    secret: true,
  },

  // ── AWS / S3 ──
  {
    name: 'AWS_REGION',
    description: 'AWS region',
    tier: 'optional',
    defaultValue: 'us-east-1',
  },
  {
    name: 'AWS_ACCESS_KEY_ID',
    description: 'AWS IAM access key',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    description: 'AWS IAM secret key',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'KB_S3_BUCKET',
    description: 'S3 bucket for knowledge base blobs',
    tier: 'optional',
  },
  {
    name: 'KB_S3_PREFIX',
    description: 'Key prefix inside KB bucket',
    tier: 'optional',
    defaultValue: 'knowledge-base',
  },
  {
    name: 'KB_MAX_CONTENT_BYTES',
    description: 'Max inline content size in bytes',
    tier: 'optional',
    defaultValue: '500000',
    validate: isPositiveInt,
  },
  {
    name: 'KB_MAX_FILE_BYTES',
    description: 'Max file upload size in bytes',
    tier: 'optional',
    defaultValue: '1048576',
    validate: isPositiveInt,
  },
  {
    name: 'KB_S3_THRESHOLD_BYTES',
    description: 'Threshold to move content to S3 vs inline',
    tier: 'optional',
    defaultValue: '102400',
    validate: isPositiveInt,
  },
  {
    name: 'KB_EMBEDDINGS_ENABLED',
    description: 'Enable/disable embedding generation (true/false)',
    tier: 'optional',
    defaultValue: 'true',
  },
  {
    name: 'KB_EMBEDDING_MAX_BYTES',
    description: 'Max bytes per embedding chunk',
    tier: 'optional',
    defaultValue: '100000',
    validate: isPositiveInt,
  },

  // ── Polar.sh Billing ──
  {
    name: 'POLAR_ACCESS_TOKEN',
    description: 'Polar.sh API access token',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'POLAR_MODE',
    description: 'Polar environment (sandbox or production)',
    tier: 'optional',
    defaultValue: 'sandbox',
    validate: isPolarMode,
  },
  {
    name: 'POLAR_WEBHOOK_SECRET',
    description: 'Polar.sh webhook signing secret',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'POLAR_PRO_PRODUCT_ID',
    description: 'Polar product ID for Pro plan',
    tier: 'optional',
  },
  {
    name: 'POLAR_TEAM_PRODUCT_ID',
    description: 'Polar product ID for Team plan',
    tier: 'optional',
  },

  // ── Email ──
  {
    name: 'RESEND_API_KEY',
    description: 'Resend transactional email API key',
    tier: 'optional',
    secret: true,
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
  },
  {
    name: 'API_VERSION',
    description: 'Reported API version string',
    tier: 'optional',
    defaultValue: '1.0.0',
  },

  // ── LLM / AI ──
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API key (for LLM + embeddings)',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'ANTHROPIC_API_KEY',
    description: 'Anthropic API key (for LLM)',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'VOYAGE_API_KEY',
    description: 'Voyage AI API key (for embeddings)',
    tier: 'optional',
    secret: true,
  },

  // ── Web Search ──
  {
    name: 'BRAVE_SEARCH_API_KEY',
    description: 'Brave Search API key',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'SERPAPI_KEY',
    description: 'SerpAPI key (web search)',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'SERPER_API_KEY',
    description: 'Serper API key (web search)',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'FIRECRAWL_API_KEY',
    description: 'Firecrawl API key (web scraping)',
    tier: 'optional',
    secret: true,
  },

  // ── Data Privacy ──
  {
    name: 'REQUIRE_EXPLICIT_CONSENT',
    description: 'Require explicit user consent before data collection (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },

  // ── Redis ──
  {
    name: 'REDIS_URL',
    description: 'Redis URL for distributed rate limiting',
    tier: 'optional',
    validate: isRedisUrl,
  },

  // ── Background Workers ──
  {
    name: 'DELETE_WORKER_ENABLED',
    description: 'Enable background delete-request worker (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },
  {
    name: 'DELETE_WORKER_LIMIT',
    description: 'Batch size for delete worker',
    tier: 'optional',
    defaultValue: '50',
    validate: isPositiveInt,
  },
  {
    name: 'DELETE_WORKER_DRY_RUN',
    description: 'Delete worker dry-run mode (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },
  {
    name: 'DELETE_WORKER_USER_ID',
    description: 'Restrict delete worker to a single user ID',
    tier: 'optional',
  },
  {
    name: 'RETENTION_WORKER_ENABLED',
    description: 'Enable background retention worker (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },

  // ── CLI / MCP-specific ──
  {
    name: 'AITM_API_URL',
    description: 'API server URL for CLI/MCP connections',
    tier: 'optional',
    defaultValue: 'http://localhost:3001',
  },
  {
    name: 'AITM_API_KEY',
    description: 'API key for authenticating CLI/MCP requests',
    tier: 'optional',
    secret: true,
  },
  {
    name: 'AITM_CLOUD_SYNC',
    description: 'Enable cloud sync from CLI (true/false)',
    tier: 'optional',
    defaultValue: 'false',
  },
  {
    name: 'AITM_WEBSITE_URL',
    description: 'Website URL for CLI auth redirects',
    tier: 'optional',
    defaultValue: 'https://timemachine.gitgram.app',
  },
  {
    name: 'AITM_AUDIT_DIR',
    description: 'Custom directory for audit logs',
    tier: 'optional',
  },
  {
    name: 'AITM_HOME',
    description: 'Override home directory for AITM data',
    tier: 'optional',
  },
  {
    name: 'AITM_METRICS_ENDPOINT',
    description: 'Remote endpoint for MCP metrics',
    tier: 'optional',
  },
  {
    name: 'AITM_MCP_EXPERIMENTAL',
    description: 'Enable experimental MCP tools (0/1)',
    tier: 'optional',
    defaultValue: '0',
  },
  {
    name: 'AITM_DAEMON',
    description: 'Run daemon in foreground (0/1)',
    tier: 'optional',
    defaultValue: '0',
  },
  {
    name: 'AITM_AUTO_DAEMON',
    description: 'Auto-start daemon on CLI use (0/1)',
    tier: 'optional',
    defaultValue: '0',
  },
  {
    name: 'AITM_DEBUG',
    description: 'Enable debug stack traces (0/1)',
    tier: 'optional',
    defaultValue: '0',
  },
  {
    name: 'AITM_DISABLE_AUTOLISTEN',
    description: 'Disable auto-listen on import (for testing) (0/1)',
    tier: 'optional',
    defaultValue: '0',
  },
  {
    name: 'TM_DATA_DIR',
    description: 'Data directory for v3 store',
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
        continue;
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

  if (isProduction && env.CORS_ORIGIN === '*') {
    warnings.push('[CORS] Wildcard CORS origin (*) in production -- consider restricting');
  }

  if (isProduction && env.DATABASE_URL) {
    if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')) {
      warnings.push('[DB] DATABASE_URL points to localhost in production');
    }
  }

  // Partial S3 config
  const s3Keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'KB_S3_BUCKET'];
  const s3Set = s3Keys.filter((k) => !!env[k]);
  if (s3Set.length > 0 && s3Set.length < s3Keys.length) {
    const missing = s3Keys.filter((k) => !env[k]);
    warnings.push(`[AWS] Partial S3 config. Set: ${s3Set.join(', ')}. Missing: ${missing.join(', ')}`);
  }

  // Warn if no LLM key
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !isTest) {
    warnings.push('[AI] No LLM API key set (OPENAI_API_KEY or ANTHROPIC_API_KEY): AI features disabled');
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
    const resolved: Record<string, string | undefined> = {};
    for (const def of ENV_CONTRACT) {
      resolved[def.name] = process.env[def.name] || def.defaultValue;
    }
    return { valid: true, errors: [], warnings: [], resolved };
  }

  const result = runContractValidation();

  for (const w of result.warnings) {
    console.warn(`[env-contract] ${w}`);
  }

  if (!result.valid) {
    const divider = '='.repeat(60);
    const header = `\n${divider}\n  AITIMEMACHINE: ENVIRONMENT VALIDATION FAILED\n${divider}`;
    const body = result.errors.map((e) => `  ${e}`).join('\n');
    const footer = `${divider}\n  Fix the above errors and restart.\n${divider}\n`;
    const msg = `${header}\n${body}\n${footer}`;

    if (process.env.NODE_ENV === 'production') {
      console.error(msg);
      process.exit(1);
    } else {
      console.warn(`[DEV MODE] ${msg}`);
    }
  } else {
    console.log('[env-contract] All environment variables validated successfully.');
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

// Re-export validators for testing
export { isPostgresUrl, isRedisUrl, isPositiveInt, isUrl };
