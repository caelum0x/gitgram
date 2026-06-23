/**
 * Privacy utilities for data export
 * Handles redaction of sensitive information
 */

import * as path from 'path';

/**
 * Redaction pattern configuration
 */
export interface RedactionPattern {
  name: string;
  regex: RegExp;
  replacement?: string;
}

/**
 * Redaction configuration
 */
export interface RedactionConfig {
  patterns: RedactionPattern[];
  sensitiveFilenames: string[];
  redactPaths: boolean;
  customRedactor?: (text: string) => string;
}

/**
 * Redaction result
 */
export interface RedactionResult {
  original: string;
  redacted: string;
  patternsMatched: string[];
  redactionCount: number;
}

/**
 * Default secret patterns to detect and redact
 */
export const DEFAULT_SECRET_PATTERNS: RedactionPattern[] = [
  // AWS
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_ACCESS_KEY]' },
  { name: 'AWS Secret Key', regex: /aws.{0,20}['"][0-9a-zA-Z/+]{40}['"]/gi, replacement: '[AWS_SECRET_KEY]' },

  // GitHub
  { name: 'GitHub Token', regex: /ghp_[0-9a-zA-Z]{36}/g, replacement: '[GITHUB_TOKEN]' },
  { name: 'GitHub OAuth', regex: /gho_[0-9a-zA-Z]{36}/g, replacement: '[GITHUB_OAUTH]' },
  { name: 'GitHub App Token', regex: /ghu_[0-9a-zA-Z]{36}/g, replacement: '[GITHUB_USER_TOKEN]' },
  { name: 'GitHub Refresh Token', regex: /ghr_[0-9a-zA-Z]{36}/g, replacement: '[GITHUB_REFRESH_TOKEN]' },

  // Private Keys
  { name: 'RSA Private Key', regex: /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |OPENSSH )?PRIVATE KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },
  { name: 'SSH Private Key', regex: /-----BEGIN (EC|DSA) PRIVATE KEY-----[\s\S]*?-----END (EC|DSA) PRIVATE KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },

  // JWT
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[JWT_TOKEN]' },

  // Generic API Keys
  { name: 'API Key Assignment', regex: /(api[_-]?key|apikey|api[_-]?secret)['"]?\s*[:=]\s*['"]?[0-9a-zA-Z]{20,}['"]?/gi, replacement: '$1=[REDACTED_API_KEY]' },
  { name: 'API Key Header', regex: /(x-api-key|authorization):\s*['"]?[^\s'"]{20,}['"]?/gi, replacement: '$1: [REDACTED]' },

  // OpenAI
  { name: 'OpenAI API Key', regex: /sk-[0-9a-zA-Z]{48}/g, replacement: '[OPENAI_API_KEY]' },
  { name: 'OpenAI Project Key', regex: /sk-proj-[0-9a-zA-Z-_]{40,}/g, replacement: '[OPENAI_PROJECT_KEY]' },

  // Anthropic
  { name: 'Anthropic API Key', regex: /sk-ant-[0-9a-zA-Z-_]{40,}/g, replacement: '[ANTHROPIC_API_KEY]' },

  // Database URLs with passwords
  { name: 'Database URL', regex: /(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi, replacement: '$1://[USER]:[PASSWORD]@[HOST]' },

  // Bearer tokens
  { name: 'Bearer Token', regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, replacement: 'Bearer [REDACTED_TOKEN]' },

  // Passwords in common formats
  { name: 'Password Assignment', regex: /(password|passwd|pwd|secret)['"]?\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, replacement: '$1=[REDACTED_PASSWORD]' },

  // Email addresses (optional - for PII)
  { name: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },

  // IP addresses (optional - for privacy)
  { name: 'IP Address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },

  // Phone numbers (optional - for PII)
  { name: 'Phone Number', regex: /\b\+?[\d\s\-()]{10,}\b/g, replacement: '[PHONE_REDACTED]' },
];

/**
 * Default patterns that indicate sensitive filenames
 */
export const DEFAULT_SENSITIVE_FILENAMES: string[] = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  'credentials.json',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'wallet*.json',
  '*private*key*',
  '.npmrc',
  '.pypirc',
  'config/secrets*',
  '*credentials*',
];

/**
 * Default redaction configuration
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  patterns: DEFAULT_SECRET_PATTERNS,
  sensitiveFilenames: DEFAULT_SENSITIVE_FILENAMES,
  redactPaths: false,
};

/**
 * Create a minimal redaction config (only critical secrets)
 */
export function createMinimalRedactionConfig(): RedactionConfig {
  const criticalPatterns = DEFAULT_SECRET_PATTERNS.filter(p =>
    ['AWS Access Key', 'AWS Secret Key', 'GitHub Token', 'RSA Private Key',
     'SSH Private Key', 'OpenAI API Key', 'Anthropic API Key', 'Database URL'].includes(p.name)
  );

  return {
    patterns: criticalPatterns,
    sensitiveFilenames: DEFAULT_SENSITIVE_FILENAMES.slice(0, 10),
    redactPaths: false,
  };
}

/**
 * Create a strict redaction config (includes PII)
 */
export function createStrictRedactionConfig(): RedactionConfig {
  return {
    patterns: DEFAULT_SECRET_PATTERNS,
    sensitiveFilenames: DEFAULT_SENSITIVE_FILENAMES,
    redactPaths: true,
  };
}

/**
 * Redactor class for applying redaction rules
 */
export class Redactor {
  private config: RedactionConfig;

  constructor(config: Partial<RedactionConfig> = {}) {
    this.config = {
      ...DEFAULT_REDACTION_CONFIG,
      ...config,
    };
  }

  /**
   * Add a custom redaction pattern
   */
  addPattern(pattern: RedactionPattern): void {
    this.config.patterns.push(pattern);
  }

  /**
   * Remove a pattern by name
   */
  removePattern(name: string): void {
    this.config.patterns = this.config.patterns.filter(p => p.name !== name);
  }

  /**
   * Check if a filename matches sensitive patterns
   */
  isSensitiveFilename(filePath: string): boolean {
    const basename = path.basename(filePath).toLowerCase();
    const fullPath = filePath.toLowerCase();

    for (const pattern of this.config.sensitiveFilenames) {
      if (pattern.includes('*')) {
        // Simple glob matching
        const regexPattern = pattern.replace(/\*/g, '.*').replace(/\./g, '\\.');
        if (new RegExp(`^${regexPattern}$`, 'i').test(basename)) {
          return true;
        }
        // Also check against full path
        if (new RegExp(regexPattern, 'i').test(fullPath)) {
          return true;
        }
      } else if (basename === pattern.toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Redact sensitive information from text
   */
  redact(text: string): RedactionResult {
    let redacted = text;
    const patternsMatched: string[] = [];
    let redactionCount = 0;

    for (const pattern of this.config.patterns) {
      // Reset lastIndex for global regexes
      pattern.regex.lastIndex = 0;

      const matches = text.match(pattern.regex);
      if (matches && matches.length > 0) {
        patternsMatched.push(pattern.name);
        redactionCount += matches.length;

        // Create a fresh regex for replacement
        const replaceRegex = new RegExp(pattern.regex.source, pattern.regex.flags);
        redacted = redacted.replace(replaceRegex, pattern.replacement || '[REDACTED]');
      }
    }

    // Apply custom redactor if provided
    if (this.config.customRedactor) {
      redacted = this.config.customRedactor(redacted);
    }

    return {
      original: text,
      redacted,
      patternsMatched,
      redactionCount,
    };
  }

  /**
   * Redact a file path if configured
   */
  redactPath(filePath: string): string {
    if (!this.config.redactPaths) {
      return filePath;
    }

    // Redact user home directory
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home && filePath.startsWith(home)) {
      filePath = filePath.replace(home, '~');
    }

    // Redact username patterns
    const usernamePatterns = [
      /\/Users\/[^/]+/g,
      /\/home\/[^/]+/g,
      /C:\\Users\\[^\\]+/gi,
    ];

    for (const pattern of usernamePatterns) {
      filePath = filePath.replace(pattern, (match) => {
        if (match.startsWith('/Users/')) return '/Users/[USER]';
        if (match.startsWith('/home/')) return '/home/[USER]';
        return 'C:\\Users\\[USER]';
      });
    }

    return filePath;
  }

  /**
   * Redact an entire object recursively
   */
  redactObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
      const value = obj[key];

      if (typeof value === 'string') {
        const redacted = this.redact(value);
        result[key] = redacted.redacted;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Check if text contains any secrets
   */
  containsSecrets(text: string): { hasSecrets: boolean; patterns: string[] } {
    const patterns: string[] = [];

    for (const pattern of this.config.patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        patterns.push(pattern.name);
      }
    }

    return {
      hasSecrets: patterns.length > 0,
      patterns,
    };
  }

  /**
   * Get statistics about what would be redacted
   */
  analyzeText(text: string): {
    totalSecrets: number;
    byPattern: Record<string, number>;
  } {
    const byPattern: Record<string, number> = {};
    let totalSecrets = 0;

    for (const pattern of this.config.patterns) {
      pattern.regex.lastIndex = 0;
      const matches = text.match(pattern.regex);
      if (matches) {
        byPattern[pattern.name] = matches.length;
        totalSecrets += matches.length;
      }
    }

    return { totalSecrets, byPattern };
  }
}

/**
 * Create a redactor with default settings
 */
export function createDefaultRedactor(): Redactor {
  return new Redactor();
}

/**
 * Create a minimal redactor (only critical secrets)
 */
export function createMinimalRedactor(): Redactor {
  return new Redactor(createMinimalRedactionConfig());
}

/**
 * Create a strict redactor (includes PII)
 */
export function createStrictRedactor(): Redactor {
  return new Redactor(createStrictRedactionConfig());
}

/**
 * Quick utility to redact text with default settings
 */
export function redactText(text: string): string {
  const redactor = new Redactor();
  return redactor.redact(text).redacted;
}

/**
 * Quick utility to check if text contains secrets
 */
export function hasSecrets(text: string): boolean {
  const redactor = new Redactor();
  return redactor.containsSecrets(text).hasSecrets;
}
