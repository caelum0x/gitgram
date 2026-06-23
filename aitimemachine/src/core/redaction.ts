import path from "node:path";

export type RedactionResult = {
  isRedacted: boolean;
  reason?: string;
  patterns?: string[];
};

export type RedactionEvent = {
  timestamp: string;
  filePath: string;
  reason: string;
  patterns: string[];
};

/**
 * Secret patterns to detect
 */
const SECRET_PATTERNS = [
  // AWS
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS Secret Key", regex: /aws.{0,20}['\"][0-9a-zA-Z/+]{40}['\"]/ },

  // GitHub
  { name: "GitHub Token", regex: /ghp_[0-9a-zA-Z]{36}/g },
  { name: "GitHub OAuth", regex: /gho_[0-9a-zA-Z]{36}/g },

  // Private Keys
  { name: "RSA Private Key", regex: /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: "SSH Private Key", regex: /-----BEGIN (EC|DSA) PRIVATE KEY-----/ },

  // JWT
  { name: "JWT Token", regex: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/ },

  // Generic API Keys
  { name: "Generic API Key", regex: /(api[_-]?key|apikey|api[_-]?secret)['\"]?\s*[:=]\s*['\"]?[0-9a-zA-Z]{20,}['\"]?/i },

  // Solana
  { name: "Solana Private Key", regex: /[1-9A-HJ-NP-Za-km-z]{88}/g }, // Base58, 88 chars (risky - might have false positives)

  // Database URLs with passwords
  { name: "Database URL", regex: /(mongodb|postgres|mysql):\/\/[^:]+:[^@]+@/ },

  // Generic tokens
  { name: "Bearer Token", regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g },
];

/**
 * Filename patterns that indicate sensitive files
 */
const SENSITIVE_FILENAMES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials.json",
  "secrets.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "wallet*.json",
  "*private*key*",
];

/**
 * Check if a file should be redacted based on content
 */
export function shouldRedactContent(
  content: Buffer,
  filePath: string
): RedactionResult {
  // Check filename first (faster)
  const filenameCheck = shouldRedactFilename(filePath);
  if (filenameCheck.isRedacted) {
    return filenameCheck;
  }

  // Skip binary files (heuristic: if >50% non-printable, it's binary)
  if (isBinary(content)) {
    return { isRedacted: false };
  }

  // Check content for secret patterns
  const text = content.toString("utf8");
  const matchedPatterns: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      matchedPatterns.push(pattern.name);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      isRedacted: true,
      reason: "Content contains secret patterns",
      patterns: matchedPatterns,
    };
  }

  return { isRedacted: false };
}

/**
 * Check if a filename indicates it's sensitive
 */
export function shouldRedactFilename(filePath: string): RedactionResult {
  const basename = path.basename(filePath);
  const lowerBasename = basename.toLowerCase();

  for (const pattern of SENSITIVE_FILENAMES) {
    if (pattern.includes("*")) {
      // Simple glob matching
      const regexPattern = pattern.replace(/\*/g, ".*");
      if (new RegExp(`^${regexPattern}$`, "i").test(basename)) {
        return {
          isRedacted: true,
          reason: "Filename matches sensitive pattern",
          patterns: [pattern],
        };
      }
    } else if (lowerBasename === pattern.toLowerCase()) {
      return {
        isRedacted: true,
        reason: "Filename is sensitive",
        patterns: [pattern],
      };
    }
  }

  return { isRedacted: false };
}

/**
 * Create redacted placeholder content
 */
export function createRedactedPlaceholder(
  filePath: string,
  reason: string,
  patterns: string[]
): Buffer {
  const placeholder = {
    _redacted: true,
    filePath,
    reason,
    patterns,
    timestamp: new Date().toISOString(),
    message:
      "This file was redacted because it contains sensitive data. Original content is NOT stored.",
  };

  return Buffer.from(JSON.stringify(placeholder, null, 2), "utf8");
}

/**
 * Heuristic to detect binary files
 */
function isBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;

  // Sample first 8KB
  const sample = buffer.slice(0, Math.min(8192, buffer.length));
  let nonPrintable = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Count non-printable ASCII (excluding common whitespace)
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++;
    }
  }

  // If >20% non-printable, consider it binary
  return nonPrintable / sample.length > 0.2;
}

/**
 * Create a redaction event for logging
 */
export function createRedactionEvent(
  filePath: string,
  result: RedactionResult
): RedactionEvent {
  return {
    timestamp: new Date().toISOString(),
    filePath,
    reason: result.reason ?? "Unknown",
    patterns: result.patterns ?? [],
  };
}

/**
 * Scan a directory of files and report what would be redacted
 */
export function scanForSecrets(
  files: Array<{ path: string; content: Buffer }>
): Array<{ path: string; result: RedactionResult }> {
  const results: Array<{ path: string; result: RedactionResult }> = [];

  for (const file of files) {
    const result = shouldRedactContent(file.content, file.path);
    if (result.isRedacted) {
      results.push({ path: file.path, result });
    }
  }

  return results;
}
