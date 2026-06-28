/**
 * Natural Language Time Travel Parser
 *
 * Parses natural language queries into structured time travel operations
 */

import type { CheckpointRow } from "../store/repo.js";

/**
 * Narrow read interface the natural-language parser depends on. Both the
 * SqliteRepo (used by src/mcp/server.ts) and the engine-backed adapter (used by
 * the shipped CLI natural-language commands) satisfy this contract, so the
 * parser works against whichever checkpoint store is populated.
 */
export interface CheckpointReader {
  listCheckpointsNewestFirst(projectId: string, limit: number): CheckpointRow[];
  getCheckpoint(projectId: string, checkpointId: string): CheckpointRow | null;
  searchCheckpoints(projectId: string, query: string): CheckpointRow[];
}

export interface TimeQuery {
  type: "absolute" | "relative" | "event" | "unknown";
  raw: string;

  // For absolute times
  date?: Date;

  // For relative times
  relativeAmount?: number;
  relativeUnit?: "minutes" | "hours" | "days" | "weeks";

  // For event-based queries
  eventPattern?: string;
  eventType?: "test" | "build" | "deploy" | "commit" | "any";
  eventState?: "passed" | "failed" | "green" | "red" | "before" | "after";
}

type ScoredCheckpoint = {
  checkpoint: CheckpointRow;
  score: number;
  reason: string;
};

type ErrorHistoryMarker = {
  checkpoint: CheckpointRow;
  confidence: number;
  reasons: string[];
};

type ErrorHistoryTimelineEntry = {
  checkpoint: CheckpointRow;
  status: "good" | "bad" | "unknown";
};

/**
 * Parse natural language time references into structured queries
 */
export function parseTimeQuery(query: string): TimeQuery {
  const normalizedQuery = query.toLowerCase().trim();

  // Check for relative time patterns
  const relativePatterns = [
    /(\d+)\s*(minutes?|mins?)\s*ago/,
    /(\d+)\s*(hours?|hrs?)\s*ago/,
    /(\d+)\s*(days?)\s*ago/,
    /(\d+)\s*(weeks?)\s*ago/,
  ];

  for (const pattern of relativePatterns) {
    const match = normalizedQuery.match(pattern);
    if (match) {
      const amount = parseInt(match[1], 10);
      let unit: "minutes" | "hours" | "days" | "weeks" = "hours";

      if (match[2].startsWith("min")) unit = "minutes";
      else if (match[2].startsWith("hour") || match[2].startsWith("hr")) unit = "hours";
      else if (match[2].startsWith("day")) unit = "days";
      else if (match[2].startsWith("week")) unit = "weeks";

      return {
        type: "relative",
        raw: query,
        relativeAmount: amount,
        relativeUnit: unit,
      };
    }
  }

  // Check for named relative times
  if (normalizedQuery.includes("yesterday")) {
    return {
      type: "relative",
      raw: query,
      relativeAmount: 1,
      relativeUnit: "days",
    };
  }

  if (normalizedQuery.includes("last week")) {
    return {
      type: "relative",
      raw: query,
      relativeAmount: 1,
      relativeUnit: "weeks",
    };
  }

  // Check for event-based patterns
  const testPatterns = [
    /when.*tests?\s*(started?\s*)?(failing|failed|broke|broken)/i,
    /when.*tests?\s*(started?\s*)?(passing|passed|green|working)/i,
    /tests?\s*(were|was|started?)?\s*(green|passing)/i,
    /tests?\s*(were|was|started?)?\s*(red|failing)/i,
    /before.*tests?\s*broke/i,
    /last\s*(time\s*)?(tests?\s*)?(passed|green)/i,
  ];

  for (const pattern of testPatterns) {
    if (pattern.test(normalizedQuery)) {
      const isGreen = /passing|passed|green|working/.test(normalizedQuery);
      return {
        type: "event",
        raw: query,
        eventType: "test",
        eventState: isGreen ? "green" : "red",
        eventPattern: "test",
      };
    }
  }

  // Check for build patterns
  const buildPatterns = [
    /when.*build\s*(started?\s*)?(failing|failed|broke|broken)/i,
    /when.*build\s*(started?\s*)?(passing|passed|green|working)/i,
    /build\s*(was|were|started?)?\s*(green|passing)/i,
    /build\s*(was|were|started?)?\s*(red|failing|broken)/i,
    /before.*build\s*broke/i,
    /last\s*(time\s*)?build\s*(passed|green|succeeded)/i,
  ];

  for (const pattern of buildPatterns) {
    if (pattern.test(normalizedQuery)) {
      const isGreen = /passing|passed|green|working|succeeded/.test(normalizedQuery);
      return {
        type: "event",
        raw: query,
        eventType: "build",
        eventState: isGreen ? "green" : "red",
        eventPattern: "build",
      };
    }
  }

  // Check for general "when" queries
  if (normalizedQuery.includes("when")) {
    // Extract what they're asking about
    const whatMatch = normalizedQuery.match(/when.*(?:was|did|were)\s+(.+?)(?:\s+added|\s+changed|\s+created|\s+removed|\s+deleted|\s+broke|$)/);
    if (whatMatch) {
      return {
        type: "event",
        raw: query,
        eventType: "any",
        eventPattern: whatMatch[1].trim(),
      };
    }
  }

  // Fallback: treat as keyword search
  return {
    type: "event",
    raw: query,
    eventType: "any",
    eventPattern: normalizedQuery.replace(/^(when|what|why|how)\s*/i, ""),
  };
}

/**
 * Find checkpoints matching a natural language time query
 */
export function findCheckpointsForQuery(
  repo: CheckpointReader,
  projectId: string,
  query: TimeQuery,
  limit: number = 10
): { checkpointId: string; name: string; createdAt: string; score: number }[] {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 100);

  if (query.type === "relative" && query.relativeAmount && query.relativeUnit) {
    // Filter by time range
    const now = new Date();
    let cutoff = new Date(now);

    switch (query.relativeUnit) {
      case "minutes":
        cutoff.setMinutes(cutoff.getMinutes() - query.relativeAmount);
        break;
      case "hours":
        cutoff.setHours(cutoff.getHours() - query.relativeAmount);
        break;
      case "days":
        cutoff.setDate(cutoff.getDate() - query.relativeAmount);
        break;
      case "weeks":
        cutoff.setDate(cutoff.getDate() - query.relativeAmount * 7);
        break;
    }

    const filtered = checkpoints.filter(cp => {
      const cpDate = new Date(cp.createdAt);
      return cpDate >= cutoff && cpDate <= now;
    });

    return filtered.slice(0, limit).map(cp => ({
      checkpointId: cp.checkpointId,
      name: cp.name,
      createdAt: cp.createdAt,
      score: 1.0,
    }));
  }

  if (query.type === "event") {
    // Search by event pattern
    const scored = checkpoints.map(cp => {
      let score = 0;
      const nameLower = cp.name.toLowerCase();

      // Check for test/build state
      if (query.eventType === "test") {
        if (query.eventState === "green" && /tests?\s*(passed|green|passing)/.test(nameLower)) {
          score += 10;
        } else if (query.eventState === "red" && /tests?\s*(failed|red|failing)/.test(nameLower)) {
          score += 10;
        }
      } else if (query.eventType === "build") {
        if (query.eventState === "green" && /build\s*(passed|green|succeeded)/.test(nameLower)) {
          score += 10;
        } else if (query.eventState === "red" && /build\s*(failed|red|broken)/.test(nameLower)) {
          score += 10;
        }
      }

      // Check for pattern match
      if (query.eventPattern) {
        const patterns = query.eventPattern.split(/\s+/);
        for (const p of patterns) {
          if (p.length > 2 && nameLower.includes(p)) {
            score += 5;
          }
        }
      }

      return { ...cp, score };
    });

    return scored
      .filter(cp => cp.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map(cp => ({
        checkpointId: cp.checkpointId,
        name: cp.name,
        createdAt: cp.createdAt,
        score: cp.score,
      }));
  }

  // Fallback: return most recent
  return checkpoints.slice(0, limit).map(cp => ({
    checkpointId: cp.checkpointId,
    name: cp.name,
    createdAt: cp.createdAt,
    score: 0.5,
  }));
}

/**
 * Find the last "green" checkpoint (tests passed, build succeeded)
 */
export function findLastGreenCheckpoint(
  repo: CheckpointReader,
  projectId: string
): { checkpointId: string; name: string; createdAt: string } | null {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 100);

  const greenPatterns = [
    /tests?\s*(passed|green|passing)/i,
    /build\s*(passed|green|succeeded)/i,
    /all\s*(tests?\s*)?(passed|green)/i,
    /ci\s*(passed|green)/i,
  ];

  for (const cp of checkpoints) {
    for (const pattern of greenPatterns) {
      if (pattern.test(cp.name)) {
        return {
          checkpointId: cp.checkpointId,
          name: cp.name,
          createdAt: cp.createdAt,
        };
      }
    }
  }

  return null;
}

/**
 * Analyze what changed between two checkpoints
 */
export interface ChangeAnalysis {
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  summary: string;
}

export function analyzeChanges(
  oldManifest: { files: { path: string; hash: string; size: number }[] },
  newManifest: { files: { path: string; hash: string; size: number }[] }
): ChangeAnalysis {
  const oldFiles = new Map(oldManifest.files.map(f => [f.path, f]));
  const newFiles = new Map(newManifest.files.map(f => [f.path, f]));

  const filesAdded: string[] = [];
  const filesRemoved: string[] = [];
  const filesModified: string[] = [];

  // Find added and modified files
  for (const [path, file] of newFiles) {
    const oldFile = oldFiles.get(path);
    if (!oldFile) {
      filesAdded.push(path);
    } else if (oldFile.hash !== file.hash) {
      filesModified.push(path);
    }
  }

  // Find removed files
  for (const path of oldFiles.keys()) {
    if (!newFiles.has(path)) {
      filesRemoved.push(path);
    }
  }

  // Generate summary
  const parts: string[] = [];
  if (filesAdded.length > 0) {
    parts.push(`${filesAdded.length} file(s) added`);
  }
  if (filesRemoved.length > 0) {
    parts.push(`${filesRemoved.length} file(s) removed`);
  }
  if (filesModified.length > 0) {
    parts.push(`${filesModified.length} file(s) modified`);
  }

  const summary = parts.length > 0 ? parts.join(", ") : "No changes detected";

  return {
    filesAdded,
    filesRemoved,
    filesModified,
    summary,
  };
}

/**
 * Generate a human-readable explanation of changes
 */
export function explainChanges(analysis: ChangeAnalysis): string {
  const lines: string[] = [];

  lines.push(`## Change Summary`);
  lines.push(analysis.summary);
  lines.push("");

  if (analysis.filesAdded.length > 0) {
    lines.push("### Added Files");
    for (const f of analysis.filesAdded.slice(0, 10)) {
      lines.push(`+ ${f}`);
    }
    if (analysis.filesAdded.length > 10) {
      lines.push(`  ... and ${analysis.filesAdded.length - 10} more`);
    }
    lines.push("");
  }

  if (analysis.filesRemoved.length > 0) {
    lines.push("### Removed Files");
    for (const f of analysis.filesRemoved.slice(0, 10)) {
      lines.push(`- ${f}`);
    }
    if (analysis.filesRemoved.length > 10) {
      lines.push(`  ... and ${analysis.filesRemoved.length - 10} more`);
    }
    lines.push("");
  }

  if (analysis.filesModified.length > 0) {
    lines.push("### Modified Files");
    for (const f of analysis.filesModified.slice(0, 10)) {
      lines.push(`~ ${f}`);
    }
    if (analysis.filesModified.length > 10) {
      lines.push(`  ... and ${analysis.filesModified.length - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Parse a "back to" natural language request
 */
export function parseBackToQuery(query: string): {
  type: "last-green" | "time-ago" | "keyword" | "checkpoint-id" | "before-keyword";
  value?: string;
  timeAmount?: number;
  timeUnit?: string;
} {
  const normalizedQuery = query.toLowerCase().trim();

  // Check for "last green" / "when tests passed"
  if (
    /last\s*(time\s*)?(tests?\s*)?(passed|green|working)/.test(normalizedQuery) ||
    /when\s*(tests?\s*)?(were\s*)?(green|passing)/.test(normalizedQuery) ||
    /before\s*(tests?\s*)?(broke|failed)/.test(normalizedQuery)
  ) {
    return { type: "last-green" };
  }

  // Check for relative time
  const timeMatch = normalizedQuery.match(/(\d+)\s*(minutes?|hours?|days?|weeks?)\s*ago/);
  if (timeMatch) {
    return {
      type: "time-ago",
      timeAmount: parseInt(timeMatch[1], 10),
      timeUnit: timeMatch[2].replace(/s$/, ""),
    };
  }

  // Check for "yesterday"
  if (normalizedQuery.includes("yesterday")) {
    return { type: "time-ago", timeAmount: 1, timeUnit: "day" };
  }

  // Check if it looks like a checkpoint ID
  if (/^cp_[a-f0-9]+$/i.test(query.trim())) {
    return { type: "checkpoint-id", value: query.trim() };
  }

  // Default: keyword search
  return { type: "keyword", value: normalizedQuery };
}

/**
 * Advanced Natural Language Parser for AITimeMachine
 *
 * Parses complex queries like:
 * - "before docker changes"
 * - "when tests passed"
 * - "30 minutes ago"
 * - "before I added the API endpoint"
 * - "when auth was working"
 */
export interface AdvancedQuery {
  intent: "restore" | "find" | "compare" | "show" | "undo";
  timeSpec?: {
    type: "relative" | "absolute" | "event";
    minutes?: number;
    hours?: number;
    days?: number;
    date?: Date;
  };
  searchTerms: string[];
  modifiers: {
    before?: boolean;
    after?: boolean;
    when?: boolean;
    last?: boolean;
  };
  confidence: number;
  explanation: string;
}

/**
 * Parse advanced natural language query
 */
export function parseAdvancedQuery(query: string): AdvancedQuery {
  const lower = query.toLowerCase().trim();
  const result: AdvancedQuery = {
    intent: "find",
    searchTerms: [],
    modifiers: {},
    confidence: 50,
    explanation: "",
  };

  // Detect intent
  if (/^(go\s*back|restore|revert|undo|reset)/.test(lower)) {
    result.intent = "restore";
    result.confidence += 20;
  } else if (/^(show|what|when|where|find|search)/.test(lower)) {
    result.intent = "find";
    result.confidence += 10;
  } else if (/^(compare|diff|difference)/.test(lower)) {
    result.intent = "compare";
    result.confidence += 20;
  } else if (/^undo/.test(lower)) {
    result.intent = "undo";
    result.confidence += 30;
  }

  // Parse time specifications

  // Relative time: "30 minutes ago", "2 hours ago"
  const minuteMatch = lower.match(/(\d+)\s*(?:min(?:ute)?s?)\s*ago/);
  const hourMatch = lower.match(/(\d+)\s*(?:h(?:ou)?r?s?)\s*ago/);
  const dayMatch = lower.match(/(\d+)\s*(?:day?s?)\s*ago/);

  if (minuteMatch) {
    result.timeSpec = { type: "relative", minutes: parseInt(minuteMatch[1]) };
    result.confidence += 25;
    result.explanation = `Going back ${minuteMatch[1]} minutes`;
  } else if (hourMatch) {
    result.timeSpec = { type: "relative", hours: parseInt(hourMatch[1]) };
    result.confidence += 25;
    result.explanation = `Going back ${hourMatch[1]} hours`;
  } else if (dayMatch) {
    result.timeSpec = { type: "relative", days: parseInt(dayMatch[1]) };
    result.confidence += 25;
    result.explanation = `Going back ${dayMatch[1]} days`;
  }

  // Named times
  if (lower.includes("yesterday")) {
    result.timeSpec = { type: "relative", days: 1 };
    result.confidence += 20;
    result.explanation = "Going back to yesterday";
  } else if (lower.includes("last week")) {
    result.timeSpec = { type: "relative", days: 7 };
    result.confidence += 20;
    result.explanation = "Going back to last week";
  } else if (lower.includes("this morning")) {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    result.timeSpec = { type: "absolute", date: now };
    result.confidence += 15;
    result.explanation = "Going back to this morning";
  }

  // Parse modifiers
  if (lower.includes("before")) {
    result.modifiers.before = true;
    result.confidence += 10;

    // Extract what we're looking for "before"
    const beforeMatch = lower.match(/before\s+(?:the\s+)?(?:i\s+)?(?:made\s+|added\s+|created\s+|changed\s+)?(.+?)(?:\s+changes?|\s+broke|$)/i);
    if (beforeMatch) {
      result.searchTerms.push(...beforeMatch[1].trim().split(/\s+/).filter(t => t.length > 2));
      result.explanation = `Finding state before "${beforeMatch[1].trim()}"`;
    }
  }

  if (lower.includes("when")) {
    result.modifiers.when = true;
    result.confidence += 5;

    // Extract what we're looking for
    const whenMatch = lower.match(/when\s+(?:the\s+)?(.+?)(?:\s+was\s+|\s+were\s+|\s+worked|\s+passed|\s+broke|$)/i);
    if (whenMatch) {
      result.searchTerms.push(...whenMatch[1].trim().split(/\s+/).filter(t => t.length > 2));
      result.explanation = `Finding when "${whenMatch[1].trim()}" was in desired state`;
    }
  }

  if (lower.includes("last")) {
    result.modifiers.last = true;
    result.confidence += 10;
  }

  // Common development keywords that increase confidence
  const devKeywords = [
    "docker", "api", "test", "build", "deploy", "config", "database", "db",
    "auth", "login", "server", "client", "frontend", "backend", "fix",
    "feature", "bug", "error", "crash", "refactor", "component", "function",
    "css", "style", "route", "endpoint", "migration", "schema"
  ];

  for (const keyword of devKeywords) {
    if (lower.includes(keyword)) {
      if (!result.searchTerms.includes(keyword)) {
        result.searchTerms.push(keyword);
      }
      result.confidence += 5;
    }
  }

  // Check for test/build status queries
  if (/tests?\s*(pass|green|work)/i.test(lower)) {
    result.searchTerms.push("tests", "pass", "green");
    result.explanation = "Finding last time tests passed";
    result.confidence += 20;
  }
  if (/build\s*(pass|success|green)/i.test(lower)) {
    result.searchTerms.push("build", "pass", "success");
    result.explanation = "Finding last successful build";
    result.confidence += 20;
  }

  // Cap confidence at 100
  result.confidence = Math.min(100, result.confidence);

  // Generate explanation if not already set
  if (!result.explanation) {
    if (result.searchTerms.length > 0) {
      result.explanation = `Searching for "${result.searchTerms.join(", ")}"`;
    } else {
      result.explanation = "General checkpoint search";
      result.confidence = Math.max(30, result.confidence - 20);
    }
  }

  return result;
}

/**
 * Find the best checkpoint matching an advanced query
 */
export function findCheckpointForAdvancedQuery(
  repo: CheckpointReader,
  projectId: string,
  query: AdvancedQuery,
  limit: number = 10
): ScoredCheckpoint[] {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 200);
  const now = new Date();

  // First, filter by time if specified
  let candidates = checkpoints;

  if (query.timeSpec) {
    let targetTime = new Date();

    if (query.timeSpec.type === "relative") {
      if (query.timeSpec.minutes) targetTime.setMinutes(targetTime.getMinutes() - query.timeSpec.minutes);
      if (query.timeSpec.hours) targetTime.setHours(targetTime.getHours() - query.timeSpec.hours);
      if (query.timeSpec.days) targetTime.setDate(targetTime.getDate() - query.timeSpec.days);

      // Find checkpoint closest to target time
      candidates = checkpoints.filter(cp => new Date(cp.createdAt) <= targetTime);
    } else if (query.timeSpec.type === "absolute" && query.timeSpec.date) {
      targetTime = query.timeSpec.date;
      candidates = checkpoints.filter(cp => new Date(cp.createdAt) <= targetTime);
    }
  }

  // Score each checkpoint
  const scored = candidates.map(cp => {
    let score = 0;
    const reasons: string[] = [];
    const nameLower = cp.name.toLowerCase();

    // Match search terms
    for (const term of query.searchTerms) {
      if (nameLower.includes(term.toLowerCase())) {
        score += 15;
        reasons.push(`Matches "${term}"`);
      }
    }

    // Boost for "before" modifier - we want the checkpoint before the matching one
    if (query.modifiers.before) {
      // If this checkpoint matches the search but we want BEFORE, look at next one
      const hasMatch = query.searchTerms.some(term => nameLower.includes(term.toLowerCase()));
      if (!hasMatch) {
        // Good - this is before the matching checkpoint
        score += 10;
      } else {
        // This is the matching checkpoint - we want the one before
        score -= 20;
      }
    }

    // Boost for good state indicators
    if (/pass|green|success|working|stable|before/i.test(nameLower)) {
      score += 5;
      reasons.push("Good state indicator");
    }

    // Reduce score for bad state indicators (unless looking for when broke)
    if (/fail|error|broke|bug|fix/i.test(nameLower)) {
      if (!query.searchTerms.some(t => /fail|error|broke/.test(t))) {
        score -= 10;
      }
    }

    // Slight preference for recent checkpoints
    const ageMinutes = (now.getTime() - new Date(cp.createdAt).getTime()) / 60000;
    if (ageMinutes < 60) score += 5;
    else if (ageMinutes < 360) score += 2;

    return {
      checkpoint: cp,
      score,
      reason: reasons.length > 0 ? reasons.join(", ") : "Time-based match"
    };
  });

  // Sort by score and return top results
  return scored
    .filter(s => s.score > 0 || candidates.length < 5) // Include all if few candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Find potential error points in checkpoint history
 */
export function analyzeErrorHistory(
  repo: CheckpointReader,
  projectId: string,
  lookbackMinutes: number = 120
): {
  suspectedBreakPoint?: ErrorHistoryMarker;
  lastKnownGood?: ErrorHistoryMarker;
  timeline: ErrorHistoryTimelineEntry[];
} {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 100);
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);
  const recent = checkpoints.filter(cp => new Date(cp.createdAt) >= cutoff);

  const goodPatterns = [
    /tests?\s*(pass|green|passing)/i,
    /build\s*(pass|success|green)/i,
    /working/i,
    /stable/i,
    /before\s/i,
  ];

  const badPatterns = [
    /tests?\s*(fail|red|failing)/i,
    /build\s*(fail|broke|broken)/i,
    /error/i,
    /crash/i,
    /bug/i,
    /fix\s/i,
  ];

  const timeline: ErrorHistoryTimelineEntry[] = [];
  let lastKnownGood: ErrorHistoryMarker | undefined;
  let suspectedBreakPoint: ErrorHistoryMarker | undefined;

  for (let i = 0; i < recent.length; i++) {
    const cp = recent[i];
    const nameLower = cp.name.toLowerCase();

    let status: "good" | "bad" | "unknown" = "unknown";
    const reasons: string[] = [];

    // Check for good indicators
    for (const pattern of goodPatterns) {
      if (pattern.test(nameLower)) {
        status = "good";
        reasons.push("Good indicator in name");
        break;
      }
    }

    // Check for bad indicators
    for (const pattern of badPatterns) {
      if (pattern.test(nameLower)) {
        status = "bad";
        reasons.push("Error indicator in name");
        break;
      }
    }

    timeline.push({ checkpoint: cp, status });

    // Track last known good
    if (status === "good" && !lastKnownGood) {
      lastKnownGood = {
        checkpoint: cp,
        confidence: 70,
        reasons
      };
    }

    // Track suspected break point (transition from good to bad)
    if (status === "bad" && !suspectedBreakPoint) {
      suspectedBreakPoint = {
        checkpoint: cp,
        confidence: 60,
        reasons
      };

      // Increase confidence if previous was good
      if (i + 1 < recent.length) {
        const prevStatus = timeline[i]?.status;
        if (prevStatus === "good") {
          suspectedBreakPoint.confidence = 85;
          suspectedBreakPoint.reasons.push("Follows a known good state");
        }
      }
    }
  }

  return {
    suspectedBreakPoint,
    lastKnownGood,
    timeline
  };
}
