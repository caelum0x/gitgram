# Gitgram Backend -- Environment Variable Matrix

> Generated from `src/config/env-contract.ts` -- the single source of truth.

## Legend

| Symbol | Meaning |
|--------|---------|
| **REQ** | Required -- server will not start without it |
| **PROD** | Required in production only |
| **OPT** | Optional -- sensible default or feature disabled when absent |
| (secret) | Value must never be logged or committed |

---

## Variable Matrix by Environment

| Variable | Dev | Staging | Prod | Default | Secret | Description |
|----------|-----|---------|------|---------|--------|-------------|
| `NODE_ENV` | OPT | OPT | OPT | `development` | | Runtime environment |
| `PORT` | OPT | OPT | OPT | `4000` | | HTTP listen port |
| **`DATABASE_URL`** | **REQ** | **REQ** | **REQ** | -- | yes | PostgreSQL connection string |
| `REDIS_URL` | OPT | OPT | OPT | -- | | Redis URL (falls back to in-memory) |
| **`JWT_SECRET`** | **REQ** | **REQ** | **REQ** | -- | yes | Access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | OPT | OPT | **PROD** | -- | yes | Refresh token signing secret |
| `JWT_EXPIRES_IN` | OPT | OPT | OPT | `15m` | | Access token TTL |
| `REFRESH_TOKEN_EXPIRES_IN` | OPT | OPT | OPT | `7d` | | Refresh token TTL |
| `BCRYPT_ROUNDS` | OPT | OPT | OPT | `12` | | bcrypt cost factor |
| `FRONTEND_URL` | OPT | OPT | **PROD** | -- | | Next.js frontend base URL |
| `CORS_ORIGIN` | OPT | OPT | OPT | -- | | Comma-separated CORS origins |
| `GITHUB_CLIENT_ID` | OPT | OPT | OPT | -- | | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | OPT | OPT | OPT | -- | yes | GitHub OAuth App client secret |
| `GITHUB_TOKEN` | OPT | OPT | OPT | -- | yes | GitHub PAT for API calls |
| `GITHUB_WEBHOOK_SECRET` | OPT | OPT | OPT | -- | yes | GitHub webhook payload secret |
| `GOOGLE_CLIENT_ID` | OPT | OPT | OPT | -- | | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OPT | OPT | OPT | -- | yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OPT | OPT | OPT | -- | | Google OAuth redirect URI |
| `GOOGLE_MAPS_API_KEY` | OPT | OPT | OPT | -- | yes | Google Maps Geocoding API key |
| `AWS_ACCESS_KEY_ID` | OPT | OPT | OPT | -- | yes | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | OPT | OPT | OPT | -- | yes | AWS IAM secret key |
| `AWS_S3_BUCKET` | OPT | OPT | OPT | `gitgram-uploads` | | S3 media upload bucket |
| `AWS_REGION` | OPT | OPT | OPT | `us-east-1` | | AWS region |
| `STORAGE_TYPE` | OPT | OPT | OPT | `local` | | Storage backend (`local` or `s3`) |
| `CDN_URL` | OPT | OPT | OPT | -- | | CDN base URL for media |
| `ENABLE_IMAGE_OPTIMIZATION` | OPT | OPT | OPT | `true` | | Sharp image optimization |
| `ENABLE_WEBP` | OPT | OPT | OPT | `true` | | WebP conversion |
| `POLAR_ACCESS_TOKEN` | OPT | OPT | OPT | -- | yes | Polar.sh organization access token |
| `POLAR_WEBHOOK_SECRET` | OPT | OPT | OPT | -- | yes | Polar.sh webhook secret |
| `POLAR_PREMIUM_PRODUCT_ID` | OPT | OPT | OPT | -- | | Polar.sh Premium plan Product ID |
| `POLAR_CREATOR_PRODUCT_ID` | OPT | OPT | OPT | -- | | Polar.sh Creator plan Product ID |
| `POLAR_MODE` | OPT | OPT | OPT | `sandbox` | | Polar.sh environment (sandbox/production) |
| `DODO_PAYMENTS_API_KEY` | OPT | OPT | OPT | -- | yes | DodoPay API key |
| `DODO_PAYMENTS_SECRET_KEY` | OPT | OPT | OPT | -- | yes | DodoPay secret key |
| `DODO_WEBHOOK_SECRET` | OPT | OPT | OPT | -- | yes | DodoPay webhook secret |
| `RESEND_API_KEY` | OPT | OPT | OPT | -- | yes | Resend email API key |
| `EMAIL_FROM` | OPT | OPT | OPT | `Gitgram <noreply@gitgram.app>` | | Default email sender |
| `SENTRY_DSN` | OPT | OPT | OPT | -- | | Sentry error tracking DSN |
| `LOG_LEVEL` | OPT | OPT | OPT | `info` | | Logging level |
| `LAUNCHDARKLY_SDK_KEY` | OPT | OPT | OPT | -- | yes | Feature flags SDK key |
| `MIXPANEL_TOKEN` | OPT | OPT | OPT | -- | yes | Mixpanel analytics token |
| `MIXPANEL_HOST` | OPT | OPT | OPT | -- | | Mixpanel API host |
| `AMPLITUDE_API_KEY` | OPT | OPT | OPT | -- | yes | Amplitude API key |
| `AMPLITUDE_SERVER_URL` | OPT | OPT | OPT | -- | | Amplitude server URL |
| `GIPHY_API_KEY` | OPT | OPT | OPT | -- | yes | Giphy GIF search API key |
| `JAMENDO_CLIENT_ID` | OPT | OPT | OPT | -- | | Jamendo music API client ID |
| `VIDEO_TEMP_DIR` | OPT | OPT | OPT | -- | | Video transcoding temp dir |
| `MEDIA_TEMP_DIR` | OPT | OPT | OPT | -- | | Media pipeline temp dir |
| `MEDIA_RETENTION_DAYS` | OPT | OPT | OPT | `30` | | Days before orphan media purge |
| `ORPHAN_MEDIA_HOURS` | OPT | OPT | OPT | `24` | | Hours before unlinked upload cleanup |
| `MAX_DAILY_IMAGE_UPLOADS` | OPT | OPT | OPT | `50` | | Max image uploads/user/day |
| `MAX_DAILY_VIDEO_UPLOADS` | OPT | OPT | OPT | `10` | | Max video uploads/user/day |
| `MAX_STORAGE_PER_USER_MB` | OPT | OPT | OPT | `5120` | | Per-user storage quota (MB) |
| `NSFW_THRESHOLD` | OPT | OPT | OPT | `0.6` | | NSFW detection threshold (0.0-1.0) |
| `REGISTRATION_ENABLED` | OPT | OPT | OPT | `true` | | Enable user registration |
| `EMAIL_VERIFICATION_REQUIRED` | OPT | OPT | OPT | `true` | | Require email verification |
| `TWO_FACTOR_ENABLED` | OPT | OPT | OPT | `true` | | Enable 2FA support |
| `MAINTENANCE_MODE` | OPT | OPT | OPT | `false` | | Maintenance mode toggle |
| `MAX_POST_LENGTH` | OPT | OPT | OPT | `2000` | | Max post character length |
| `MAX_MEDIA_PER_POST` | OPT | OPT | OPT | `10` | | Max media per post |
| `MAX_FILE_SIZE` | OPT | OPT | OPT | `10485760` | | Max file upload size (bytes) |
| `RATE_LIMIT` | OPT | OPT | OPT | `100` | | Global API rate limit |
| `API_URL` | OPT | OPT | OPT | `http://localhost:4000` | | Public API base URL |
| `APP_URL` | OPT | OPT | OPT | `http://localhost:3000` | | Public app URL |
| `AITM_API_URL` | OPT | OPT | OPT | -- | | Gitgram TimeMachine API URL |
| `AITM_ENCRYPTION_SECRET` | OPT | OPT | OPT | -- | yes | AITM data bridge encryption key |
| `IP_HASH_SALT` | OPT | OPT | OPT | `gitgram` | | Salt for IP hashing |
| `BACKUP_DIR` | OPT | OPT | OPT | -- | | Database backup directory |
| `FEATURE_FLAGS` | OPT | OPT | OPT | -- | | Comma-separated local feature flags |

---

## Notes

1. **Secrets** should never be committed to source control. Use a secrets manager (e.g., AWS Secrets Manager, Doppler) in staging/production.
2. In **development**, the server logs warnings for missing optional variables and continues. In **production**, missing required/production-tier variables cause an immediate exit.
3. The contract module (`src/config/env-contract.ts`) validates all variables at startup before any Express routes are registered.
4. Partial configurations (e.g., setting `AWS_ACCESS_KEY_ID` without `AWS_SECRET_ACCESS_KEY`) produce warnings.
