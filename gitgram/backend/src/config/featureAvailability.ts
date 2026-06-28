/**
 * Feature Availability Flags
 *
 * Centralizes "is this optional external-dependency feature actually usable in
 * this deployment?" checks. These features depend on services that may not be
 * provisioned in every environment (e.g. the GitNexus JSON-RPC service for AI
 * code analysis). Rather than letting requests hang or fail with opaque 500s
 * when the dependency is absent, routes consult these flags and return a clear
 * 503 "feature not available" response.
 *
 * Each flag is enabled when its dependency's connection env var is explicitly
 * configured, or when an explicit `*_ENABLED=true` override is set. An explicit
 * `*_ENABLED=false` always wins and disables the feature.
 */

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
}

/**
 * AI analysis (GitNexus) is available when GITNEXUS_URL is explicitly set, or
 * when AI_ANALYSIS_ENABLED=true. An explicit AI_ANALYSIS_ENABLED=false disables
 * it regardless of GITNEXUS_URL.
 */
export function isAiAnalysisEnabled(): boolean {
  const override = parseBool(process.env.AI_ANALYSIS_ENABLED);
  if (override !== undefined) {
    return override;
  }
  // Enabled only when an operator has explicitly pointed at a GitNexus service.
  return Boolean(process.env.GITNEXUS_URL && process.env.GITNEXUS_URL.trim().length > 0);
}

/**
 * Standard payload returned by routes when an optional feature is not
 * provisioned in the current deployment.
 */
export function featureUnavailablePayload(feature: string): { error: string; feature: string; available: false } {
  return {
    error: `The "${feature}" feature is not available in this deployment. The required external service is not configured.`,
    feature,
    available: false,
  };
}
