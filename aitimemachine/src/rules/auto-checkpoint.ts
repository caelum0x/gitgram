/**
 * Auto-checkpoint rule engine.
 * Automatically creates checkpoints based on terminal events (tests green, build green, errors).
 */

import type { Repo } from "../store/repo.js";

/**
 * Rule types for auto-checkpoint creation.
 */
export type AutoRule =
  | {
      kind: "term_success";
      matchCmd: RegExp;
      name: (cmd: string) => string;
    }
  | {
      kind: "term_failure";
      matchCmd: RegExp;
      name: (cmd: string, code: number) => string;
    }
  | {
      kind: "stderr_match";
      match: RegExp;
      name: (line: string) => string;
    };

/**
 * Default auto-checkpoint rules.
 * These rules trigger checkpoints based on common development events.
 */
export const DEFAULT_RULES: AutoRule[] = [
  // Test success rules
  {
    kind: "term_success",
    matchCmd: /\b(npm|pnpm|yarn|bun)\s+test\b/i,
    name: () => "Tests green",
  },
  {
    kind: "term_success",
    matchCmd: /\bvitest(\s+run)?\b/i,
    name: () => "Tests green",
  },
  {
    kind: "term_success",
    matchCmd: /\bjest\b/i,
    name: () => "Tests green",
  },
  {
    kind: "term_success",
    matchCmd: /\bpytest\b/i,
    name: () => "Tests green",
  },
  {
    kind: "term_success",
    matchCmd: /\bgo\s+test\b/i,
    name: () => "Tests green",
  },
  {
    kind: "term_success",
    matchCmd: /\bcargo\s+test\b/i,
    name: () => "Tests green",
  },

  // Build success rules
  {
    kind: "term_success",
    matchCmd: /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b/i,
    name: () => "Build green",
  },
  {
    kind: "term_success",
    matchCmd: /\btsc(\s+--|\s*$)/i,
    name: () => "Build green",
  },
  {
    kind: "term_success",
    matchCmd: /\bmake(\s+all|\s*$)/i,
    name: () => "Build green",
  },
  {
    kind: "term_success",
    matchCmd: /\bcargo\s+build\b/i,
    name: () => "Build green",
  },
  {
    kind: "term_success",
    matchCmd: /\bgo\s+build\b/i,
    name: () => "Build green",
  },

  // Failure rules (capture state at failure point)
  {
    kind: "term_failure",
    matchCmd: /\b(npm|pnpm|yarn|bun)\s+(test|build)\b/i,
    name: (cmd, code) => `Fail (exit ${code}): ${truncateCmd(cmd)}`,
  },
  {
    kind: "term_failure",
    matchCmd: /\b(vitest|jest|pytest|go\s+test|cargo\s+test)\b/i,
    name: (cmd, code) => `Test fail (exit ${code})`,
  },

  // Error detection in stderr
  {
    kind: "stderr_match",
    match: /\b(TypeError|ReferenceError|SyntaxError)\b/i,
    name: (line) => `JavaScript Error: ${truncateLine(line)}`,
  },
  {
    kind: "stderr_match",
    match: /\bpanic\s*:/i,
    name: (line) => `Panic: ${truncateLine(line)}`,
  },
  {
    kind: "stderr_match",
    match: /\bSegmentation fault\b/i,
    name: () => "Segmentation fault",
  },
  {
    kind: "stderr_match",
    match: /\bUnhandled(?:\s+rejection|\s+error)?\b/i,
    name: (line) => `Unhandled error: ${truncateLine(line)}`,
  },
  {
    kind: "stderr_match",
    match: /\bFATAL\s*ERROR\b/i,
    name: (line) => `Fatal error: ${truncateLine(line)}`,
  },
];

/**
 * Truncate a command for display in checkpoint names.
 */
function truncateCmd(cmd: string, maxLen = 40): string {
  const trimmed = cmd.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 3) + "...";
}

/**
 * Truncate a line for display in checkpoint names.
 */
function truncateLine(line: string, maxLen = 60): string {
  const trimmed = line.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 3) + "...";
}

export interface AutoCheckpointParams {
  repo: Repo;
  projectId: string;
  eventType: string;
  payload: {
    command?: string;
    exitCode?: number;
    stderrPreview?: string;
    [key: string]: unknown;
  };
  createCheckpoint: (name: string, scope: string) => Promise<void>;
  rules?: AutoRule[];
}

/**
 * Evaluate auto-checkpoint rules against an event.
 * Creates a checkpoint if any rule matches.
 */
export async function evaluateAutoCheckpoint(params: AutoCheckpointParams): Promise<boolean> {
  const rules = params.rules ?? DEFAULT_RULES;
  const { eventType, payload, createCheckpoint } = params;

  // Handle terminal exit events
  if (eventType === "term.exit") {
    const cmd = String(payload.command ?? "");
    const code = Number(payload.exitCode ?? 1);

    // Check success rules
    for (const rule of rules) {
      if (rule.kind === "term_success" && code === 0 && rule.matchCmd.test(cmd)) {
        await createCheckpoint(rule.name(cmd), "files+chat+terminal");
        return true;
      }
    }

    // Check failure rules
    for (const rule of rules) {
      if (rule.kind === "term_failure" && code !== 0 && rule.matchCmd.test(cmd)) {
        await createCheckpoint(rule.name(cmd, code), "files+chat+terminal");
        return true;
      }
    }

    // Check stderr match rules
    if (typeof payload.stderrPreview === "string") {
      const stderr = payload.stderrPreview;
      for (const rule of rules) {
        if (rule.kind === "stderr_match" && rule.match.test(stderr)) {
          // Find the matching line for context
          const lines = stderr.split("\n");
          const matchingLine = lines.find((line) => rule.match.test(line)) || stderr;
          await createCheckpoint(rule.name(matchingLine), "files+chat+terminal");
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get rule descriptions for display.
 */
export function describeRules(rules: AutoRule[] = DEFAULT_RULES): string[] {
  return rules.map((rule) => {
    switch (rule.kind) {
      case "term_success":
        return `On success (exit 0) for: ${rule.matchCmd.source}`;
      case "term_failure":
        return `On failure (exit != 0) for: ${rule.matchCmd.source}`;
      case "stderr_match":
        return `On stderr match: ${rule.match.source}`;
    }
  });
}

/**
 * Create a custom rule set by merging with defaults.
 */
export function createCustomRules(
  additions: AutoRule[],
  useDefaults = true
): AutoRule[] {
  if (useDefaults) {
    return [...DEFAULT_RULES, ...additions];
  }
  return additions;
}
