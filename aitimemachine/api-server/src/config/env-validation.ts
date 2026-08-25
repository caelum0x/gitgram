/**
 * Comprehensive Environment Variable Validation (Zod-based)
 *
 * Validates ALL required and optional env vars for the AITM API server at startup.
 * Fails fast with a clear summary of every missing or invalid variable.
 *
 * Usage:
 *   import { validateAllEnvVars, envConfig } from './config/env-validation.js';
 *   validateAllEnvVars(); // call early in startup
 *   // After validation, envConfig holds typed, validated values.
 */

import { z } from "zod";
import { logger } from "../lib/monitoring.js";

// ---------------------------------------------------------------------------
// Schema Definition
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // ── Core ──
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development")
    .describe("Runtime environment"),
  PORT: z
    .string()
    .default("3001")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("HTTP listen port"),

  // ── Database (required) ──
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required (Neon PostgreSQL connection string)" })
    .min(1, "DATABASE_URL cannot be empty")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string (postgresql:// or postgres://)"
    )
    .describe("Neon PostgreSQL connection string"),

  // ── Networking ──
  CORS_ORIGIN: z
    .string()
    .default("*")
    .describe("Allowed CORS origin(s)"),
  WEBSITE_URL: z
    .string()
    .default("https://timemachine.gitgram.app")
    .describe("AITM website URL (for redirects and emails)"),

  // ── Auth ──
  INTERNAL_SECRET: z
    .string()
    .optional()
    .describe("Shared secret for website-to-API internal calls"),
  ADOPTION_INGESTION_SECRET: z.string().min(32).optional()
    .describe("Current dedicated secret for adoption evidence collectors"),
  ADOPTION_INGESTION_SECRET_PREVIOUS: z.string().min(32).optional()
    .describe("Previous collector secret accepted during a bounded rotation"),
  OSS_COVERAGE_MAX_AGE_HOURS: z.string().default("168").transform(Number)
    .pipe(z.number().int().min(1).max(8760))
    .describe("Maximum age of the latest OSS coverage window before it is stale"),
  JWT_SECRET: z
    .string()
    .optional()
    .describe("Secret for signing session tokens"),
  CLERK_WEBHOOK_SECRET: z
    .string()
    .optional()
    .describe("Clerk webhook signing secret"),

  // ── AWS / S3 ──
  AWS_REGION: z
    .string()
    .default("us-east-1")
    .describe("AWS region"),
  AWS_ACCESS_KEY_ID: z
    .string()
    .optional()
    .describe("AWS IAM access key"),
  AWS_SECRET_ACCESS_KEY: z
    .string()
    .optional()
    .describe("AWS IAM secret key"),
  KB_S3_BUCKET: z
    .string()
    .default("")
    .describe("S3 bucket for knowledge base blobs"),
  KB_S3_PREFIX: z
    .string()
    .default("knowledge-base")
    .describe("Key prefix inside KB bucket"),
  KB_MAX_CONTENT_BYTES: z
    .string()
    .default("500000")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("Max inline content size (bytes)"),
  KB_MAX_FILE_BYTES: z
    .string()
    .default("1048576")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("Max file upload size (bytes)"),
  KB_S3_THRESHOLD_BYTES: z
    .string()
    .default("102400")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("Threshold to move content to S3 vs inline"),
  KB_EMBEDDINGS_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val !== "false")
    .describe("Enable/disable embedding generation"),
  KB_EMBEDDING_MAX_BYTES: z
    .string()
    .default("100000")
    .transform(Number)
    .pipe(z.number().int().positive())
    .describe("Max bytes per embedding chunk"),

  // ── Polar.sh Billing ──
  POLAR_ACCESS_TOKEN: z
    .string()
    .optional()
    .describe("Polar.sh API access token"),
  POLAR_MODE: z
    .enum(["sandbox", "production"])
    .default("sandbox")
    .describe("Polar.sh environment"),
  POLAR_WEBHOOK_SECRET: z
    .string()
    .optional()
    .describe("Polar.sh webhook signing secret"),
  POLAR_PRO_PRODUCT_ID: z
    .string()
    .default("")
    .describe("Polar product ID for Pro plan"),
  POLAR_TEAM_PRODUCT_ID: z
    .string()
    .default("")
    .describe("Polar product ID for Team plan"),

  // ── Email ──
  RESEND_API_KEY: z
    .string()
    .optional()
    .describe("Resend transactional email API key"),

  // ── Monitoring ──
  SENTRY_DSN: z
    .string()
    .optional()
    .describe("Sentry error-tracking DSN"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .describe("Logging verbosity"),
  API_VERSION: z
    .string()
    .default("1.0.0")
    .describe("Reported API version string"),

  // ── LLM / AI ──
  OPENAI_API_KEY: z
    .string()
    .optional()
    .describe("OpenAI API key (for LLM + embeddings)"),
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .describe("Anthropic API key (for LLM, alternative to OpenAI)"),
  VOYAGE_API_KEY: z
    .string()
    .optional()
    .describe("Voyage AI API key (for embeddings)"),

  // ── Web Search ──
  BRAVE_SEARCH_API_KEY: z
    .string()
    .optional()
    .describe("Brave Search API key"),
  SERPAPI_KEY: z
    .string()
    .optional()
    .describe("SerpAPI key (web search fallback)"),
  SERPER_API_KEY: z
    .string()
    .optional()
    .describe("Serper API key (web search fallback)"),
  FIRECRAWL_API_KEY: z
    .string()
    .optional()
    .describe("Firecrawl API key (web scraping)"),

  // ── Data Privacy ──
  REQUIRE_EXPLICIT_CONSENT: z
    .string()
    .default("false")
    .transform((val) => val === "true")
    .describe("Require explicit user consent before data collection"),

  // ── Redis ──
  REDIS_URL: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.startsWith("redis://") || val.startsWith("rediss://"),
      "REDIS_URL must be a Redis connection string (redis:// or rediss://)"
    )
    .describe("Redis connection for rate-limit store"),

  // ── Background Workers ──
  DELETE_WORKER_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true")
    .describe("Enable background delete-request worker"),
  DELETE_WORKER_LIMIT: z
    .string()
    .default("50")
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .describe("Batch size for delete worker"),
  DELETE_WORKER_DRY_RUN: z
    .string()
    .default("false")
    .transform((val) => val === "true")
    .describe("Delete worker dry-run mode"),
  DELETE_WORKER_USER_ID: z
    .string()
    .optional()
    .describe("Restrict delete worker to a single user ID"),
  RETENTION_WORKER_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true")
    .describe("Enable background retention worker"),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EnvConfig = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Singleton config
// ---------------------------------------------------------------------------

let _envConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!_envConfig) {
    throw new Error("Environment has not been validated yet. Call validateAllEnvVars() first.");
  }
  return _envConfig;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Parse and validate all environment variables.
 * On success, stores the config in a module-level singleton.
 * On failure, prints a detailed error report and exits the process.
 */
export function validateAllEnvVars(): EnvConfig {
  // Skip validation entirely in test mode
  if (process.env.NODE_ENV === "test") {
    _envConfig = envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test",
    });
    return _envConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const divider = "=".repeat(60);
    const header = `\n${divider}\n  AITM API: ENVIRONMENT VALIDATION FAILED\n${divider}`;
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  [${path}] ${issue.message}`;
    });
    const footer = `${divider}\n  Fix the above errors and restart.\n${divider}\n`;
    const fullMessage = `${header}\n${issues.join("\n")}\n${footer}`;

    logger.error(fullMessage);
    process.exit(1);
  }

  _envConfig = result.data;

  // Post-validation warnings (non-fatal)
  const warnings: string[] = [];

  if (!process.env.INTERNAL_SECRET) {
    warnings.push("INTERNAL_SECRET not set: internal API endpoints will be unprotected");
  }
  if (!process.env.RESEND_API_KEY) {
    warnings.push("RESEND_API_KEY not set: emails will be logged to console only");
  }
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    warnings.push("No LLM API key set (OPENAI_API_KEY or ANTHROPIC_API_KEY): AI features disabled");
  }
  if (!process.env.POLAR_ACCESS_TOKEN) {
    warnings.push("POLAR_ACCESS_TOKEN not set: billing features disabled");
  }

  // Warn on partial S3 config
  const s3Keys = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "KB_S3_BUCKET"];
  const s3Set = s3Keys.filter((k) => !!process.env[k]);
  if (s3Set.length > 0 && s3Set.length < s3Keys.length) {
    const missing = s3Keys.filter((k) => !process.env[k]);
    warnings.push(`Partial S3 config: set=[${s3Set.join(", ")}], missing=[${missing.join(", ")}]`);
  }

  // Production-specific warnings
  if (result.data.NODE_ENV === "production") {
    if (process.env.CORS_ORIGIN === "*") {
      warnings.push("CORS_ORIGIN is set to wildcard (*) in production -- consider restricting origins");
    }
    if (process.env.DATABASE_URL?.includes("localhost")) {
      warnings.push("DATABASE_URL points to localhost in production");
    }
  }

  for (const w of warnings) {
    logger.warn(w, { source: "env-validation" });
  }

  logger.info("All environment variables validated successfully", { source: "env-validation" });
  return _envConfig;
}
