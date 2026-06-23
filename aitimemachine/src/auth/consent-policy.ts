import * as fs from "fs";
import * as path from "path";
import { logAudit } from "./audit.js";

export interface ConsentPolicy {
  operational_capture: boolean;
  training_export: boolean;
}

export interface ConsentDocument {
  version: 1;
  updatedAt: string;
  orgId?: string;
  projectId?: string;
  policy: ConsentPolicy;
}

export const DEFAULT_CONSENT_POLICY: ConsentPolicy = {
  // PRD default: operational capture enabled
  operational_capture: true,
  // PRD default: training export disabled unless explicitly opted in
  training_export: false,
};

export class ConsentError extends Error {
  code = "CONSENT_REQUIRED";
  status = 403;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "ConsentError";
  }
}

export type ConsentAction = "capture" | "export_operational" | "export_training";

function consentPath(projectPath: string): string {
  return path.join(projectPath, ".aitimemachine", "consent.json");
}

export function loadConsent(projectPath: string): ConsentDocument {
  const file = consentPath(projectPath);
  if (!fs.existsSync(file)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      policy: { ...DEFAULT_CONSENT_POLICY },
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<ConsentDocument>;
    return {
      version: 1,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
      orgId: parsed.orgId,
      projectId: parsed.projectId,
      policy: {
        operational_capture: parsed.policy?.operational_capture ?? DEFAULT_CONSENT_POLICY.operational_capture,
        training_export: parsed.policy?.training_export ?? DEFAULT_CONSENT_POLICY.training_export,
      },
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      policy: { ...DEFAULT_CONSENT_POLICY },
    };
  }
}

let consentSeq = 0;

export function saveConsent(projectPath: string, updates: Partial<ConsentDocument>): ConsentDocument {
  const current = loadConsent(projectPath);
  const next: ConsentDocument = {
    version: 1,
    updatedAt: `${new Date().toISOString()}.${++consentSeq}`,
    orgId: updates.orgId ?? current.orgId,
    projectId: updates.projectId ?? current.projectId,
    policy: {
      operational_capture: updates.policy?.operational_capture ?? current.policy.operational_capture,
      training_export: updates.policy?.training_export ?? current.policy.training_export,
    },
  };

  const file = consentPath(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function isAllowed(policy: ConsentPolicy, action: ConsentAction): boolean {
  if (action === "capture") return policy.operational_capture;
  if (action === "export_operational") return policy.operational_capture;
  return policy.training_export;
}

export function assertConsent(
  projectPath: string,
  action: ConsentAction,
  context: { source: string; userId?: string; resource?: string }
): void {
  const doc = loadConsent(projectPath);
  if (isAllowed(doc.policy, action)) {
    return;
  }

  const requiredConsent = action === "export_training" ? "training_export" : "operational_capture";
  const message = `Consent policy denies ${action}. Required consent: ${requiredConsent}`;

  try {
    logAudit({
      userId: context.userId,
      action: `consent.denied.${action}`,
      resource: context.resource || context.source,
      success: false,
      details: {
        source: context.source,
        requiredConsent,
        policy: doc.policy,
        orgId: doc.orgId,
        projectId: doc.projectId,
        projectPath,
      },
    });
  } catch {
    // Audit I/O failures must not bypass consent denial.
  }

  throw new ConsentError(message, {
    source: context.source,
    requiredConsent,
    policy: doc.policy,
    orgId: doc.orgId,
    projectId: doc.projectId,
  });
}
