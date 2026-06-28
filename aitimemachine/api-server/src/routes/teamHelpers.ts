/**
 * Validation schemas and ID/slug helpers for the teams router.
 * Extracted to keep the route module focused and under the size limit.
 */

import crypto from "crypto";
import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z.string().min(3).max(50).optional(),
  description: z.string().max(500).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  slug: z.string().min(3).max(50).optional(),
  description: z.string().max(500).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export function generateTeamId(): string {
  return `team_${crypto.randomBytes(12).toString("hex")}`;
}

export function generateMemberId(): string {
  return `mem_${crypto.randomBytes(12).toString("hex")}`;
}

export function generateInviteCode(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateInvitationId(): string {
  return `inv_${crypto.randomBytes(12).toString("hex")}`;
}

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}
