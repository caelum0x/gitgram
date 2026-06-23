/**
 * Privacy Redactor - Apply privacy rules to exported data
 */

export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

export interface RedactionMatch {
  rule: string;
  value: string;
  start: number;
  end: number;
}

export interface RedactionQualityMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // API keys and tokens
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/g, replacement: '[REDACTED_API_KEY]', description: 'OpenAI API key' },
  { pattern: /\b(sk-ant-[a-zA-Z0-9-]{20,})\b/g, replacement: '[REDACTED_API_KEY]', description: 'Anthropic API key' },
  { pattern: /\b(ghp_[a-zA-Z0-9]{36,})\b/g, replacement: '[REDACTED_TOKEN]', description: 'GitHub PAT' },
  { pattern: /\b(gho_[a-zA-Z0-9]{36,})\b/g, replacement: '[REDACTED_TOKEN]', description: 'GitHub OAuth token' },
  { pattern: /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g, replacement: '[REDACTED_TOKEN]', description: 'Slack token' },
  { pattern: /\b(AKIA[0-9A-Z]{16})\b/g, replacement: '[REDACTED_AWS_KEY]', description: 'AWS Access Key' },

  // Passwords and secrets
  { pattern: /password\s*[=:]\s*["']?([^"'\s]+)["']?/gi, replacement: 'password=[REDACTED]', description: 'Password' },
  { pattern: /secret\s*[=:]\s*["']?([^"'\s]+)["']?/gi, replacement: 'secret=[REDACTED]', description: 'Secret' },
  { pattern: /token\s*[=:]\s*["']?([^"'\s]+)["']?/gi, replacement: 'token=[REDACTED]', description: 'Token' },

  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]', description: 'Email' },

  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[REDACTED_IP]', description: 'IP Address' },

  // Credit card numbers (basic pattern)
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_CC]', description: 'Credit Card' },

  // SSH private keys
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]', description: 'Private Key' },

  // JWT tokens
  { pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g, replacement: '[REDACTED_JWT]', description: 'JWT Token' },
];

export class PrivacyRedactor {
  private rules: RedactionRule[];
  private customPatterns: RegExp[] = [];

  constructor(rules: RedactionRule[] = DEFAULT_REDACTION_RULES) {
    this.rules = rules;
  }

  /**
   * Add a custom redaction pattern
   */
  addPattern(pattern: RegExp, replacement: string = '[REDACTED]', description: string = 'Custom'): void {
    this.rules.push({ pattern, replacement, description });
  }

  /**
   * Redact sensitive data from a string
   */
  redact(text: string): string {
    let result = text;
    for (const rule of this.rules) {
      result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
  }

  /**
   * Redact sensitive data from an object (deep)
   */
  redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.redact(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item)) as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Always redact values for sensitive-looking keys
        if (this.isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as T;
    }

    return obj;
  }

  /**
   * Check if a key name looks sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i, /secret/i, /token/i, /apikey/i, /api_key/i,
      /private/i, /credential/i, /auth/i, /bearer/i, /access_key/i,
    ];
    return sensitivePatterns.some(p => p.test(key));
  }

  /**
   * Get redaction statistics
   */
  getRedactionStats(text: string): { rule: string; count: number }[] {
    const stats: { rule: string; count: number }[] = [];

    for (const rule of this.rules) {
      const matches = text.match(rule.pattern);
      if (matches && matches.length > 0) {
        stats.push({ rule: rule.description, count: matches.length });
      }
    }

    return stats;
  }

  /**
   * Detect sensitive matches with location metadata.
   */
  detect(text: string): RedactionMatch[] {
    const matches: RedactionMatch[] = [];

    for (const rule of this.rules) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const full = match[0];
        if (!full) continue;
        matches.push({
          rule: rule.description,
          value: full,
          start: match.index,
          end: match.index + full.length,
        });
        if (full.length === 0) {
          regex.lastIndex += 1;
        }
      }
    }

    return matches;
  }

  /**
   * Evaluate precision/recall against labeled secrets.
   */
  evaluate(
    samples: Array<{ text: string; expectedSecrets: string[] }>
  ): RedactionQualityMetrics {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const sample of samples) {
      const predicted = new Set(this.detect(sample.text).map(m => this.normalizeMatch(m.value)));
      const expected = new Set(sample.expectedSecrets.map(v => this.normalizeMatch(v)));

      for (const candidate of predicted) {
        if (expected.has(candidate)) truePositives++;
        else falsePositives++;
      }

      for (const candidate of expected) {
        if (!predicted.has(candidate)) falseNegatives++;
      }
    }

    const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
    const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
    };
  }

  private normalizeMatch(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
