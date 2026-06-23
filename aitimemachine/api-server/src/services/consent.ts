import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export type ConsentType = "operational_capture" | "training_export";

export interface ConsentDecision {
  allowed: boolean;
  source: "project" | "organization" | "default";
  reason: string;
}

export async function checkConsent(
  userId: string,
  projectId: string,
  consentType: ConsentType
): Promise<ConsentDecision> {
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    return { allowed: false, source: "default", reason: "project_not_found" };
  }

  // Prefer project-level consent, then org-level fallback.
  const [projectConsent] = await db
    .select()
    .from(schema.consents)
    .where(
      and(
        eq(schema.consents.projectId, projectId),
        eq(schema.consents.consentType, consentType),
        lte(schema.consents.effectiveFrom, new Date()),
        or(isNull(schema.consents.effectiveTo), gte(schema.consents.effectiveTo, new Date()))
      )
    )
    .orderBy(desc(schema.consents.effectiveFrom))
    .limit(1);

  if (projectConsent) {
    return {
      allowed: !!projectConsent.granted,
      source: "project",
      reason: projectConsent.granted ? "project_consent_granted" : "project_consent_denied",
    };
  }

  if (project.orgId) {
    const [orgConsent] = await db
      .select()
      .from(schema.consents)
      .where(
        and(
          eq(schema.consents.organizationId, project.orgId),
          eq(schema.consents.consentType, consentType),
          lte(schema.consents.effectiveFrom, new Date()),
          or(isNull(schema.consents.effectiveTo), gte(schema.consents.effectiveTo, new Date()))
        )
      )
      .orderBy(desc(schema.consents.effectiveFrom))
      .limit(1);

    if (orgConsent) {
      return {
        allowed: !!orgConsent.granted,
        source: "organization",
        reason: orgConsent.granted ? "org_consent_granted" : "org_consent_denied",
      };
    }
  }

  // Compatibility mode: allow by default unless explicitly required.
  const requireExplicit = process.env.REQUIRE_EXPLICIT_CONSENT === "true";
  return {
    allowed: !requireExplicit,
    source: "default",
    reason: requireExplicit ? "missing_explicit_consent" : "default_allow_compat_mode",
  };
}
