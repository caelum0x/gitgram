/**
 * SSO/SAML Enterprise Authentication Routes
 *
 * Provides configuration endpoints for enterprise SSO/SAML authentication.
 * Actual authentication is handled by Clerk - these routes manage the configuration.
 *
 * Enterprise features:
 * - SAML SSO configuration
 * - Enforce SSO-only login
 * - Domain verification
 * - Just-in-time provisioning settings
 */

import { Router, Response } from "express";
import crypto from "crypto";
import dns from "dns";
import { promisify } from "util";
import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { AuthenticatedRequest, apiKeyAuth } from "../middleware/auth.js";
import { requireScope, SCOPES } from "../middleware/scopeCheck.js";
import { asyncHandler } from "../middleware/errors.js";
import { Errors } from "../middleware/errors.js";

const resolveTxt = promisify(dns.resolveTxt);

const router = Router();

// ---------------------------------------------------------------------------
// Security: Redirect URI whitelist & CSRF state tracking
// ---------------------------------------------------------------------------

/** Allowed redirect URI origins for OAuth callbacks. */
const ALLOWED_REDIRECT_ORIGINS = new Set([
  process.env.WEBSITE_URL || 'http://localhost:3000',
  process.env.CORS_ORIGIN || '',
  'https://timemachine.gitgram.app',
  'http://localhost:3000',
  'http://localhost:3002',
].filter(Boolean));

/**
 * CLI auth callback port range.  The CLI picks a random port in
 * [CLI_PORT_MIN, CLI_PORT_MAX) for the local OAuth callback server.
 * These localhost origins are allowed so the browser-login flow works.
 */
const CLI_PORT_MIN = 19283;
const CLI_PORT_MAX = 19383; // exclusive upper bound (100 ports)

/** In-memory CSRF state store with expiry (5 min TTL). */
const pendingStates = new Map<string, number>();

/** Maximum number of pending states to prevent memory exhaustion. */
const MAX_PENDING_STATES = 10_000;

// Cleanup expired states every 5 minutes
const stateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [state, exp] of pendingStates) {
    if (exp < now) pendingStates.delete(state);
  }
}, 5 * 60 * 1000);
if (stateCleanup.unref) stateCleanup.unref();

/**
 * Generate a CSRF state token and store it with a 5-minute TTL.
 * Returns the hex-encoded token.
 */
function generateState(): string {
  // Evict oldest entries if the store is too large (DoS protection)
  if (pendingStates.size >= MAX_PENDING_STATES) {
    const now = Date.now();
    for (const [s, exp] of pendingStates) {
      if (exp < now) pendingStates.delete(s);
    }
    // If still at capacity after evicting expired, remove the oldest entries
    if (pendingStates.size >= MAX_PENDING_STATES) {
      const iter = pendingStates.keys();
      // Remove 10% of entries to make room
      const toRemove = Math.max(1, Math.floor(MAX_PENDING_STATES * 0.1));
      for (let i = 0; i < toRemove; i++) {
        const next = iter.next();
        if (next.done) break;
        pendingStates.delete(next.value);
      }
    }
  }
  const token = crypto.randomBytes(16).toString("hex");
  pendingStates.set(token, Date.now() + 5 * 60 * 1000);
  return token;
}

/**
 * Consume and validate a CSRF state token.
 * Returns true if the token was valid and not expired; the token is always
 * removed on use (one-time).
 */
function validateAndConsumeState(state: string | undefined): boolean {
  if (!state || typeof state !== "string") return false;
  const expiry = pendingStates.get(state);
  if (expiry === undefined) return false;
  pendingStates.delete(state); // one-time use
  return Date.now() <= expiry;
}

/**
 * Validate that a redirect URI belongs to an allowed origin.
 *
 * Security checks performed:
 *  1. The URI must be parseable as a valid URL.
 *  2. Only http: and https: schemes are allowed.
 *  3. Userinfo (user:pass@) in the authority is rejected to prevent open-
 *     redirect bypasses (e.g. https://evil.com@legit.com/).
 *  4. The hostname must not contain non-ASCII / punycode tricks that visually
 *     resemble allowed domains.
 *  5. The origin must either be in the static allowlist OR be a localhost
 *     origin on a port within the CLI callback range.
 */
function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);

    // 1. Only allow http(s) schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    // 2. Reject URIs with userinfo (credentials) in the authority component.
    //    new URL("http://evil.com@legit.com") sets .username = "evil.com"
    if (parsed.username || parsed.password) {
      return false;
    }

    // 3. Reject non-ASCII hostnames (IDN homograph / punycode attacks).
    //    encodeURIComponent on a pure-ASCII hostname is a no-op.
    if (parsed.hostname !== parsed.hostname.replace(/[^\x20-\x7E]/g, "")) {
      return false;
    }

    // 4. Check static allowlist by origin
    const origin = parsed.origin; // scheme + host (incl. port if non-default)
    if (ALLOWED_REDIRECT_ORIGINS.has(origin)) {
      return true;
    }

    // 5. Allow localhost within the CLI callback port range
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      const port = parseInt(parsed.port, 10);
      if (!isNaN(port) && port >= CLI_PORT_MIN && port < CLI_PORT_MAX) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// OAuth2 Provider Configurations
const OAUTH_PROVIDERS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}> = {
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
};

async function exchangeCodeForToken(provider: string, code: string, redirectUri: string): Promise<{ access_token: string; token_type: string }> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new Error(`${provider} OAuth not configured (missing env vars)`);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchUserInfo(provider: string, accessToken: string): Promise<{ id: string; email: string; name: string; avatar?: string }> {
  const config = OAUTH_PROVIDERS[provider];
  const res = await fetch(config.userInfoUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json', 'User-Agent': 'GitgramTimeMachine/1.0' },
  });

  if (!res.ok) throw new Error(`User info fetch failed: ${res.status}`);
  const data: any = await res.json();

  if (provider === 'github') {
    // GitHub may not include email in profile, fetch separately
    let email = data.email;
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json', 'User-Agent': 'GitgramTimeMachine/1.0' },
      });
      if (emailRes.ok) {
        const emails: any[] = await emailRes.json();
        const primary = emails.find(e => e.primary) || emails[0];
        email = primary?.email;
      }
    }
    return { id: String(data.id), email: email || '', name: data.name || data.login, avatar: data.avatar_url };
  }

  // Google
  return { id: data.id, email: data.email, name: data.name, avatar: data.picture };
}

// --- Public OAuth2 endpoints (no auth required) ---

/**
 * GET /v1/sso/authorize/:provider
 * Generate OAuth authorization URL for GitHub or Google
 */
router.get(
  "/authorize/:provider",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { provider } = req.params;
    const { redirect_uri } = req.query;

    const config = OAUTH_PROVIDERS[provider];
    if (!config) {
      throw Errors.invalidParameter("provider", `Supported: ${Object.keys(OAUTH_PROVIDERS).join(", ")}`);
    }

    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    if (!clientId) {
      throw Errors.internal(`${provider} OAuth not configured on this server`);
    }

    // Validate redirect URI against whitelist
    const callbackUri = (redirect_uri as string) || `${req.protocol}://${req.get("host")}/v1/sso/callback/${provider}`;
    if (redirect_uri && !isAllowedRedirectUri(callbackUri)) {
      throw Errors.invalidParameter("redirect_uri", "Redirect URI is not in the allowed list");
    }

    // Always generate a fresh server-side CSRF state token.
    // A client-supplied state is ignored to prevent attacker-controlled values
    // from being stored in the pending-states map.
    const csrfState = generateState();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUri,
      scope: config.scopes.join(" "),
      response_type: "code",
      state: csrfState,
    });

    if (provider === "google") {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    }

    res.json({
      authorization_url: `${config.authUrl}?${params.toString()}`,
      provider,
      state: params.get("state"),
    });
  })
);

/**
 * POST /v1/sso/callback/:provider
 * Handle OAuth callback - exchange code for token and return user info
 */
router.post(
  "/callback/:provider",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { provider } = req.params;
    const { code, redirect_uri, state } = req.body;

    if (!code) throw Errors.missingParameter("code");

    // Validate CSRF state parameter (one-time use, expires after 5 min)
    if (!validateAndConsumeState(state)) {
      throw Errors.invalidParameter("state", "Invalid or expired OAuth state. Please restart the login flow.");
    }

    const config = OAUTH_PROVIDERS[provider];
    if (!config) {
      throw Errors.invalidParameter("provider", `Supported: ${Object.keys(OAUTH_PROVIDERS).join(", ")}`);
    }

    // Validate redirect URI against whitelist
    const callbackUri = redirect_uri || `${req.protocol}://${req.get("host")}/v1/sso/callback/${provider}`;
    if (redirect_uri && !isAllowedRedirectUri(callbackUri)) {
      throw Errors.invalidParameter("redirect_uri", "Redirect URI is not in the allowed list");
    }

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(
      provider,
      code,
      callbackUri
    );

    // Fetch user info
    const userInfo = await fetchUserInfo(provider, tokenData.access_token);

    if (!userInfo.email) {
      throw Errors.internal("Could not retrieve email from OAuth provider");
    }

    // Upsert user in database
    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, userInfo.email))
      .limit(1);

    let userId: string;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
    } else {
      userId = `user_${crypto.randomBytes(8).toString("hex")}`;
      await db.insert(schema.users).values({
        id: userId,
        email: userInfo.email,
      });
    }

    // Create a session token
    const sessionToken = `sess_${crypto.randomBytes(32).toString("hex")}`;

    res.json({
      user: {
        id: userId,
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.avatar,
        provider,
        provider_id: userInfo.id,
      },
      session_token: sessionToken,
      token_type: "bearer",
      message: "SSO authentication successful",
    });
  })
);

// --- Authenticated routes (require API key) ---

// Apply auth to all subsequent routes
router.use(apiKeyAuth);

/**
 * SSO Configuration interface stored in organization metadata
 */
interface SSOConfig {
  enabled: boolean;
  provider: "saml" | "oidc" | null;
  enforceSSO: boolean; // Require SSO for all users
  allowedDomains: string[]; // Email domains allowed for SSO
  saml?: {
    metadataUrl?: string;
    entityId?: string;
    acsUrl?: string;
    sloUrl?: string;
    certificate?: string;
    signatureAlgorithm?: "sha256" | "sha512";
  };
  oidc?: {
    issuer?: string;
    clientId?: string;
    // Client secret is stored securely in Clerk, not here
  };
  jitProvisioning: boolean; // Auto-create users on first login
  defaultRole: "member" | "admin";
}

const DEFAULT_SSO_CONFIG: SSOConfig = {
  enabled: false,
  provider: null,
  enforceSSO: false,
  allowedDomains: [],
  jitProvisioning: true,
  defaultRole: "member",
};

/**
 * GET /v1/sso/config/:orgId
 * Get SSO configuration for an organization
 */
router.get(
  "/config/:orgId",
  requireScope(SCOPES.READ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const userId = req.user!.userId;

    // Verify user is admin of the organization
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw Errors.permissionDenied("Only organization admins can view SSO settings");
    }

    // Get organization
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw Errors.notFound("Organization", orgId);
    }

    // Check enterprise plan
    if (org.plan !== "enterprise") {
      return res.json({
        sso: null,
        message: "SSO/SAML is only available on Enterprise plans",
        upgrade_url: "https://timemachine.gitgram.app/pricing",
      });
    }

    // Get SSO config from org metadata (or return defaults)
    const metadata = (org as any).metadata || {};
    const ssoConfig: SSOConfig = metadata.sso || DEFAULT_SSO_CONFIG;

    // Don't expose sensitive fields
    const safeConfig = {
      ...ssoConfig,
      saml: ssoConfig.saml ? {
        metadataUrl: ssoConfig.saml.metadataUrl,
        entityId: ssoConfig.saml.entityId,
        acsUrl: ssoConfig.saml.acsUrl,
        sloUrl: ssoConfig.saml.sloUrl,
        signatureAlgorithm: ssoConfig.saml.signatureAlgorithm,
        // certificate is sensitive, don't expose
      } : undefined,
      oidc: ssoConfig.oidc ? {
        issuer: ssoConfig.oidc.issuer,
        clientId: ssoConfig.oidc.clientId,
        // client secret is never exposed
      } : undefined,
    };

    res.json({
      org_id: orgId,
      sso: safeConfig,
      clerk_setup_url: "https://dashboard.clerk.com/apps/{app_id}/instances/{instance_id}/saml-connections",
    });
  })
);

/**
 * PUT /v1/sso/config/:orgId
 * Update SSO configuration for an organization (Enterprise only)
 */
router.put(
  "/config/:orgId",
  requireScope(SCOPES.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const userId = req.user!.userId;
    const updates = req.body;

    // Verify user is owner of the organization
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership || membership.role !== "owner") {
      throw Errors.permissionDenied("Only organization owners can modify SSO settings");
    }

    // Get organization
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw Errors.notFound("Organization", orgId);
    }

    // Check enterprise plan
    if (org.plan !== "enterprise") {
      return res.status(403).json({
        error: {
          type: "forbidden",
          code: "enterprise_required",
          message: "SSO/SAML configuration is only available on Enterprise plans",
          upgrade_url: "https://timemachine.gitgram.app/pricing",
        },
      });
    }

    // Validate domains
    if (updates.allowedDomains) {
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
      for (const domain of updates.allowedDomains) {
        if (!domainRegex.test(domain)) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "invalid_domain",
              message: `Invalid domain format: ${domain}`,
            },
          });
        }
      }
    }

    // Validate SAML metadata if metadataUrl is provided
    if (updates.saml?.metadataUrl) {
      try {
        const metaRes = await fetch(updates.saml.metadataUrl, {
          headers: { Accept: "application/xml, text/xml" },
          signal: AbortSignal.timeout(10000),
        });
        if (!metaRes.ok) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "saml_metadata_unreachable",
              message: `SAML metadata URL returned HTTP ${metaRes.status}`,
            },
          });
        }
        const metadataXml = await metaRes.text();
        if (!metadataXml.includes("<EntityDescriptor") && !metadataXml.includes("<md:EntityDescriptor")) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "saml_metadata_invalid",
              message: "SAML metadata does not contain a valid EntityDescriptor element",
            },
          });
        }
        if (!metadataXml.includes("SingleSignOnService") && !metadataXml.includes("md:SingleSignOnService")) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "saml_metadata_invalid",
              message: "SAML metadata does not contain a SingleSignOnService binding",
            },
          });
        }
        // If entityId is provided, validate it matches the metadata
        if (updates.saml.entityId && !metadataXml.includes(updates.saml.entityId)) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "saml_entity_id_mismatch",
              message: `The provided entityId does not match the metadata document`,
            },
          });
        }
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "saml_metadata_timeout",
              message: "SAML metadata URL request timed out",
            },
          });
        }
        return res.status(400).json({
          error: {
            type: "validation_error",
            code: "saml_metadata_unreachable",
            message: `Failed to fetch SAML metadata: ${err.message}`,
          },
        });
      }
    }

    // Validate OIDC discovery if issuer is provided
    if (updates.oidc?.issuer) {
      try {
        const discoveryUrl = `${updates.oidc.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
        const oidcRes = await fetch(discoveryUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!oidcRes.ok) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "oidc_discovery_unreachable",
              message: `OIDC discovery endpoint returned HTTP ${oidcRes.status}`,
            },
          });
        }
        const oidcConfig: any = await oidcRes.json();
        const requiredFields = ["authorization_endpoint", "token_endpoint", "jwks_uri"];
        const missingFields = requiredFields.filter((f) => !oidcConfig[f]);
        if (missingFields.length > 0) {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "oidc_discovery_invalid",
              message: `OIDC discovery document missing required fields: ${missingFields.join(", ")}`,
            },
          });
        }
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          return res.status(400).json({
            error: {
              type: "validation_error",
              code: "oidc_discovery_timeout",
              message: "OIDC discovery endpoint request timed out",
            },
          });
        }
        return res.status(400).json({
          error: {
            type: "validation_error",
            code: "oidc_discovery_unreachable",
            message: `Failed to fetch OIDC discovery: ${err.message}`,
          },
        });
      }

      // Validate clientId is non-empty if provided
      if (updates.oidc.clientId !== undefined && (!updates.oidc.clientId || typeof updates.oidc.clientId !== "string")) {
        return res.status(400).json({
          error: {
            type: "validation_error",
            code: "oidc_client_id_invalid",
            message: "OIDC clientId must be a non-empty string",
          },
        });
      }
    }

    // Build updated SSO config
    const metadata = (org as any).metadata || {};
    const currentConfig: SSOConfig = metadata.sso || DEFAULT_SSO_CONFIG;

    const newConfig: SSOConfig = {
      ...currentConfig,
      enabled: updates.enabled ?? currentConfig.enabled,
      provider: updates.provider ?? currentConfig.provider,
      enforceSSO: updates.enforceSSO ?? currentConfig.enforceSSO,
      allowedDomains: updates.allowedDomains ?? currentConfig.allowedDomains,
      jitProvisioning: updates.jitProvisioning ?? currentConfig.jitProvisioning,
      defaultRole: updates.defaultRole ?? currentConfig.defaultRole,
      saml: updates.saml ? { ...currentConfig.saml, ...updates.saml } : currentConfig.saml,
      oidc: updates.oidc ? { ...currentConfig.oidc, ...updates.oidc } : currentConfig.oidc,
    };

    // Save SSO config to organization metadata
    const updatedMetadata = { ...metadata, sso: newConfig };
    await db
      .update(schema.organizations)
      .set({ metadata: updatedMetadata, updatedAt: new Date() })
      .where(eq(schema.organizations.id, orgId));

    res.json({
      org_id: orgId,
      sso: newConfig,
      message: "SSO configuration saved successfully.",
      next_steps: [
        "1. Go to Clerk Dashboard → SAML Connections",
        "2. Add your Identity Provider (IdP) metadata",
        "3. Configure attribute mapping",
        "4. Test the connection",
        "5. Enable SSO enforcement once verified",
      ],
      clerk_setup_url: "https://dashboard.clerk.com",
    });
  })
);

/**
 * POST /v1/sso/verify-domain/:orgId
 * Verify domain ownership for SSO
 */
router.post(
  "/verify-domain/:orgId",
  requireScope(SCOPES.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const { domain } = req.body;
    const userId = req.user!.userId;

    if (!domain) {
      throw Errors.missingParameter("domain");
    }

    // Verify user is admin/owner
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw Errors.permissionDenied("organization");
    }

    // Generate verification token
    const verificationToken = `aitm-verify=${crypto.randomBytes(16).toString("hex")}`;
    const verificationId = `dv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Persist to domainVerifications table
    await db.insert(schema.domainVerifications).values({
      id: verificationId,
      orgId,
      domain,
      verificationToken,
      verified: false,
    });

    res.json({
      id: verificationId,
      domain,
      verification_method: "dns",
      verification_token: verificationToken,
      instructions: [
        `Add a TXT record to ${domain}:`,
        `Name: _aitimemachine`,
        `Value: ${verificationToken}`,
        `Then call POST /v1/sso/verify-domain/${orgId}/check with { domain: "${domain}" }`,
      ],
      expires_in: 86400,
    });
  })
);

/**
 * POST /v1/sso/verify-domain/:orgId/check
 * Check domain verification status
 */
router.post(
  "/verify-domain/:orgId/check",
  requireScope(SCOPES.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const { domain } = req.body;

    if (!domain) {
      throw Errors.missingParameter("domain");
    }

    // Look up the verification record
    const [verification] = await db
      .select()
      .from(schema.domainVerifications)
      .where(
        and(
          eq(schema.domainVerifications.orgId, orgId),
          eq(schema.domainVerifications.domain, domain)
        )
      )
      .limit(1);

    if (!verification) {
      throw Errors.notFound("Domain verification", domain);
    }

    if (verification.verified) {
      return res.json({
        domain,
        verified: true,
        verified_at: verification.verifiedAt,
        message: "Domain is already verified.",
      });
    }

    // Perform real DNS TXT record lookup
    let verified = false;
    try {
      const records = await resolveTxt(`_aitimemachine.${domain}`);
      // records is an array of arrays of strings
      const allRecords = records.flat();
      verified = allRecords.some(
        (record) => record === verification.verificationToken
      );
    } catch (err: any) {
      // DNS lookup failed - domain not found or no TXT records
      if (err.code !== "ENOTFOUND" && err.code !== "ENODATA") {
        throw Errors.internal(`DNS lookup failed: ${err.message}`);
      }
    }

    if (verified) {
      await db
        .update(schema.domainVerifications)
        .set({ verified: true, verifiedAt: new Date() })
        .where(eq(schema.domainVerifications.id, verification.id));
    }

    res.json({
      domain,
      verified,
      message: verified
        ? "Domain verified successfully!"
        : "Domain verification is pending. Please add the TXT record and try again.",
      help_url: "https://timemachine.gitgram.app/docs/enterprise/domain-verification",
    });
  })
);

/**
 * GET /v1/sso/providers
 * List supported SSO providers
 */
router.get(
  "/providers",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      providers: [
        {
          id: "saml",
          name: "SAML 2.0",
          description: "Security Assertion Markup Language - Works with Okta, Azure AD, OneLogin, etc.",
          supported: true,
          setup_guide: "https://timemachine.gitgram.app/docs/enterprise/saml-setup",
        },
        {
          id: "oidc",
          name: "OpenID Connect",
          description: "Modern authentication protocol - Works with Auth0, Google Workspace, etc.",
          supported: true,
          setup_guide: "https://timemachine.gitgram.app/docs/enterprise/oidc-setup",
        },
        {
          id: "google",
          name: "Google Workspace",
          description: "Direct integration with Google Workspace domains",
          supported: true,
          setup_guide: "https://timemachine.gitgram.app/docs/enterprise/google-sso",
        },
        {
          id: "azure",
          name: "Microsoft Azure AD",
          description: "Direct integration with Azure Active Directory",
          supported: true,
          setup_guide: "https://timemachine.gitgram.app/docs/enterprise/azure-sso",
        },
        {
          id: "okta",
          name: "Okta",
          description: "Direct integration with Okta",
          supported: true,
          setup_guide: "https://timemachine.gitgram.app/docs/enterprise/okta-sso",
        },
      ],
    });
  })
);

/**
 * GET /v1/sso/status/:orgId
 * Get SSO status and login URL for an organization
 */
router.get(
  "/status/:orgId",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;

    // Get organization (public info)
    const [org] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        plan: schema.organizations.plan,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw Errors.notFound("Organization", orgId);
    }

    // Check if enterprise with SSO
    const hasSSO = org.plan === "enterprise";

    res.json({
      org_id: orgId,
      org_name: org.name,
      org_slug: org.slug,
      sso_enabled: hasSSO,
      sso_login_url: hasSSO ? `https://timemachine.gitgram.app/sso/${org.slug}` : null,
      message: hasSSO
        ? "SSO is available for this organization"
        : "Upgrade to Enterprise for SSO access",
    });
  })
);

/**
 * POST /v1/sso/callback/enterprise/:orgId
 * Handle enterprise SSO callback with JIT provisioning.
 *
 * Although this route is behind apiKeyAuth, we still require a valid CSRF
 * state token to mitigate cross-site request forgery from authenticated
 * sessions (defense in depth).
 */
router.post(
  "/callback/enterprise/:orgId",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const { email, name, provider_id, state, redirect_uri } = req.body;

    // Validate CSRF state parameter
    if (!validateAndConsumeState(state)) {
      throw Errors.invalidParameter("state", "Invalid or expired OAuth state. Please restart the login flow.");
    }

    // Validate redirect_uri if supplied
    if (redirect_uri && !isAllowedRedirectUri(redirect_uri)) {
      throw Errors.invalidParameter("redirect_uri", "Redirect URI is not in the allowed list");
    }

    if (!email) {
      throw Errors.missingParameter("email");
    }

    // Get organization
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw Errors.notFound("Organization", orgId);
    }

    if (org.plan !== "enterprise") {
      return res.status(403).json({
        error: {
          type: "forbidden",
          code: "enterprise_required",
          message: "Enterprise SSO is only available on Enterprise plans",
        },
      });
    }

    // Get SSO config
    const metadata = (org as any).metadata || {};
    const ssoConfig: SSOConfig = metadata.sso || DEFAULT_SSO_CONFIG;

    if (!ssoConfig.enabled) {
      return res.status(403).json({
        error: {
          type: "forbidden",
          code: "sso_not_enabled",
          message: "SSO is not enabled for this organization",
        },
      });
    }

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existingUser) {
      // User exists - check if they're already a member
      const [existingMember] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, orgId),
            eq(schema.orgMembers.userId, existingUser.id)
          )
        )
        .limit(1);

      if (existingMember) {
        return res.json({
          user: { id: existingUser.id, email: existingUser.email },
          provisioned: false,
          message: "User already exists and is a member of this organization",
        });
      }

      // User exists but not a member - add them if JIT is enabled
      if (!ssoConfig.jitProvisioning) {
        return res.status(403).json({
          error: {
            type: "forbidden",
            code: "jit_disabled",
            message: "Just-in-time provisioning is disabled. Contact your organization admin.",
          },
        });
      }

      const memberId = `mem_${crypto.randomBytes(12).toString("hex")}`;
      await db.insert(schema.orgMembers).values({
        id: memberId,
        orgId,
        userId: existingUser.id,
        role: ssoConfig.defaultRole || "member",
      });

      return res.json({
        user: { id: existingUser.id, email: existingUser.email },
        provisioned: true,
        message: "Existing user added to organization via JIT provisioning",
      });
    }

    // User doesn't exist - JIT provision if enabled
    if (!ssoConfig.jitProvisioning) {
      return res.status(403).json({
        error: {
          type: "forbidden",
          code: "jit_disabled",
          message: "Just-in-time provisioning is disabled. Contact your organization admin.",
        },
      });
    }

    // Create new user
    const userId = `user_${crypto.randomBytes(8).toString("hex")}`;
    await db.insert(schema.users).values({
      id: userId,
      email,
    });

    // Add to organization
    const memberId = `mem_${crypto.randomBytes(12).toString("hex")}`;
    await db.insert(schema.orgMembers).values({
      id: memberId,
      orgId,
      userId,
      role: ssoConfig.defaultRole || "member",
    });

    res.status(201).json({
      user: { id: userId, email, name },
      provisioned: true,
      message: "New user created and added to organization via JIT provisioning",
    });
  })
);

// Export OAuth security utilities for reuse in other route modules
export { isAllowedRedirectUri, generateState, validateAndConsumeState };

export default router;
