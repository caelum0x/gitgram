export { AuthService } from './auth-service.js';
export { requireAuth, optionalAuth, requireAdmin, rateLimit } from './middleware.js';
export { 
  getStoredAuth, 
  saveAuth, 
  clearAuth, 
  isAuthenticated, 
  loginWithApiKey, 
  loginWithPassword, 
  loginWithBrowser,
  getAuthHeaders 
} from './cli-auth.js';
export type { StoredAuth } from './cli-auth.js';
export { logAudit, auditMiddleware, getAuditLogs } from './audit.js';
export { validateBody, validateQuery, isValidEmail, isValidId, isValidPath } from './validation.js';
export { createApiKey, listUserKeys, revokeKey, validateApiKey, storeKeyFromWebsite } from './api-keys.js';
export { DEFAULT_CONSENT_POLICY, ConsentError, loadConsent, saveConsent, assertConsent } from './consent-policy.js';
export type { ConsentPolicy, ConsentDocument, ConsentAction } from './consent-policy.js';
