/**
 * Team invitation email helpers.
 *
 * Builds and delivers the team-invitation email used by the teams router.
 * Kept separate so the route module stays focused and small.
 */

import { getEmailService } from "../services/email.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInviteUrl(token: string): string {
  const base = (process.env.APP_BASE_URL || "https://app.gitgram.app").replace(/\/$/, "");
  return `${base}/teams/invitations/${token}/accept`;
}

export interface InviteEmailParams {
  email: string;
  teamName: string;
  inviterEmail: string;
  role: string;
  token: string;
  expiresAt: Date;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  const acceptUrl = buildInviteUrl(params.token);
  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You've been invited to join ${escapeHtml(params.teamName)}</h2>
      <p>${escapeHtml(params.inviterEmail)} invited you to join the team
        <strong>${escapeHtml(params.teamName)}</strong> as a <strong>${escapeHtml(params.role)}</strong>.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation</a></p>
      <p style="color:#666;font-size:13px;">This invitation expires on ${params.expiresAt.toUTCString()}.</p>
      <p style="color:#999;font-size:12px;">If the button doesn't work, paste this link into your browser:<br>${acceptUrl}</p>
    </div>
  `;
  const text =
    `${params.inviterEmail} invited you to join the team "${params.teamName}" as ${params.role}.\n\n` +
    `Accept the invitation: ${acceptUrl}\n\n` +
    `This invitation expires on ${params.expiresAt.toUTCString()}.`;

  await getEmailService().send({
    to: params.email,
    subject: `You've been invited to join ${params.teamName}`,
    html,
    text,
  });
}
