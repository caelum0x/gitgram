/**
 * Email Service
 *
 * Provides email sending capabilities with multiple provider support:
 * - Resend (production, requires RESEND_API_KEY)
 * - Console (development fallback, logs to stdout)
 *
 * Provider is auto-detected from environment variables:
 * - RESEND_API_KEY → resend
 * - else → console
 */

// ============================================================================
// Types
// ============================================================================

import { logger } from "../lib/monitoring.js";

export type EmailProvider = "resend" | "console";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  provider: string;
}

// ============================================================================
// Email Service
// ============================================================================

const DEFAULT_FROM = "noreply@gitgram.app";

export class EmailService {
  private provider: EmailProvider;
  private apiKey?: string;

  constructor() {
    this.provider = process.env.RESEND_API_KEY ? "resend" : "console";
    this.apiKey = process.env.RESEND_API_KEY;
  }

  /**
   * Send an email
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    const from = options.from || DEFAULT_FROM;

    switch (this.provider) {
      case "resend":
        return this.sendWithResend({ ...options, from });
      case "console":
      default:
        return this.sendWithConsole({ ...options, from });
    }
  }

  /**
   * Send via Resend API
   */
  private async sendWithResend(options: EmailOptions & { from: string }): Promise<EmailResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: options.from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend API error: ${res.status} ${error}`);
    }

    const data: any = await res.json();
    return {
      id: data.id || `resend_${Date.now()}`,
      provider: "resend",
    };
  }

  /**
   * Console fallback — logs email to stdout (development/testing)
   */
  private sendWithConsole(options: EmailOptions & { from: string }): Promise<EmailResult> {
    const id = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.info("Email sent via console fallback", { id, from: options.from, to: Array.isArray(options.to) ? options.to.join(",") : options.to, subject: options.subject });
    return Promise.resolve({ id, provider: "console" });
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: EmailProvider; hasApiKey: boolean } {
    return {
      provider: this.provider,
      hasApiKey: !!this.apiKey,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) {
    instance = new EmailService();
  }
  return instance;
}
