import * as crypto from "crypto";
import { loadConsent, type ConsentAction } from "../auth/consent-policy.js";
import { logAudit } from "../auth/audit.js";

type ExportConsentAction = Extract<ConsentAction, "export_operational" | "export_training">;

export interface ExportTrace {
  exportId: string;
  consentSnapshotId: string;
  auditId: string;
}

export interface ExportTraceContext {
  exportId: string;
  consentSnapshotId: string;
  startAuditId: string;
  projectPath: string;
  action: ExportConsentAction;
  source: string;
  resource?: string;
}

function requiredConsent(action: ExportConsentAction): "operational_capture" | "training_export" {
  return action === "export_training" ? "training_export" : "operational_capture";
}

function createConsentSnapshotId(projectPath: string, action: ExportConsentAction): string {
  const consent = loadConsent(projectPath);
  const payload = JSON.stringify({
    version: consent.version,
    updatedAt: consent.updatedAt,
    orgId: consent.orgId || null,
    projectId: consent.projectId || null,
    policy: consent.policy,
    requiredConsent: requiredConsent(action),
  });
  return `consent_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}

export function beginExportTrace(params: {
  projectPath: string;
  action: ExportConsentAction;
  source: string;
  resource?: string;
  userId?: string;
}): ExportTraceContext {
  const exportId = `exp_${crypto.randomUUID()}`;
  const consentSnapshotId = createConsentSnapshotId(params.projectPath, params.action);
  const startAuditId = logAudit({
    userId: params.userId,
    action: "export.trace.start",
    resource: params.resource || params.projectPath,
    success: true,
    details: {
      exportId,
      consentSnapshotId,
      source: params.source,
      exportAction: params.action,
      projectPath: params.projectPath,
      requiredConsent: requiredConsent(params.action),
    },
  });

  return {
    exportId,
    consentSnapshotId,
    startAuditId,
    projectPath: params.projectPath,
    action: params.action,
    source: params.source,
    resource: params.resource,
  };
}

export function completeExportTrace(
  trace: ExportTraceContext,
  params: {
    success: boolean;
    userId?: string;
    outputPath?: string;
    stats?: Record<string, unknown>;
    error?: unknown;
  }
): ExportTrace {
  const auditId = logAudit({
    userId: params.userId,
    action: params.success ? "export.trace.success" : "export.trace.failure",
    resource: trace.resource || params.outputPath || trace.projectPath,
    success: params.success,
    details: {
      exportId: trace.exportId,
      consentSnapshotId: trace.consentSnapshotId,
      linkedStartAuditId: trace.startAuditId,
      source: trace.source,
      exportAction: trace.action,
      outputPath: params.outputPath,
      stats: params.stats,
      error: params.error ? String(params.error) : undefined,
    },
  });

  return {
    exportId: trace.exportId,
    consentSnapshotId: trace.consentSnapshotId,
    auditId,
  };
}
