/**
 * Stream parser for PTY output.
 * Uses marker profiles to detect user/assistant message boundaries.
 */

import { MarkerProfile } from "./markers.js";

export type ParserEvents = {
  /** Called with streaming assistant text chunks */
  onAssistantText: (text: string) => void;
  /** Called when assistant message is complete */
  onAssistantDone: (full: string) => void;
  /** Called when prompt is ready for user input */
  onPromptReady: () => void;
};

/**
 * Strip ANSI escape codes from a string.
 */
export function stripAnsi(s: string): string {
  // Remove ANSI escape sequences (colors, cursor movements, etc.)
  return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/**
 * State machine parser for interactive CLI transcript output.
 * Parses PTY output stream and emits structured events.
 */
export class TranscriptParser {
  private buf = "";
  private assistantBuf = "";
  private inAssistant = false;
  private promptReady = false;
  private rawBuf = ""; // Keep raw buffer for debugging

  constructor(
    private profile: MarkerProfile,
    private events: ParserEvents,
    private opts: { stripAnsi: boolean } = { stripAnsi: true }
  ) {}

  /**
   * Feed raw PTY data to the parser.
   */
  feed(rawChunk: string): void {
    this.rawBuf += rawChunk;
    const chunk = this.opts.stripAnsi ? stripAnsi(rawChunk) : rawChunk;
    this.buf += chunk;

    // Detect prompt ready (user can now input)
    if (!this.promptReady && this.matchesAny(this.profile.userPrompt, this.buf)) {
      this.promptReady = true;
      this.events.onPromptReady();
    }

    // Detect assistant response start
    if (!this.inAssistant && this.matchesAny(this.profile.assistantStart, this.buf)) {
      this.inAssistant = true;
      // Trim buffer to start after the first match
      this.buf = this.trimToAfterFirstMatch(this.profile.assistantStart, this.buf);
    }

    // If we're in assistant response mode
    if (this.inAssistant) {
      // Check for stop marker (assistant response ended)
      if (
        this.profile.assistantStop &&
        this.matchesAny(this.profile.assistantStop, this.buf)
      ) {
        // Extract text before the stop marker
        const full = this.assistantBuf + this.beforeFirstMatch(this.profile.assistantStop, this.buf);
        const cleaned = full.trim();

        if (cleaned) {
          this.events.onAssistantText(cleaned);
          this.events.onAssistantDone(cleaned);
        }

        // Reset for next turn
        this.inAssistant = false;
        this.assistantBuf = "";
        // Keep the part after stop marker (might contain prompt)
        this.buf = this.trimToAfterFirstMatch(this.profile.assistantStop, this.buf);
        return;
      }

      // No stop marker yet - stream the content
      const emit = this.buf;
      if (emit.trim()) {
        this.assistantBuf += emit;
        this.events.onAssistantText(emit);
      }
      this.buf = ""; // Consume the buffer
      this.boundAssistantBuffer();
    } else {
      // Not in assistant mode - bound the buffer to prevent memory issues
      if (this.buf.length > 50_000) {
        this.buf = this.buf.slice(-10_000);
      }
    }
  }

  /**
   * Force flush any remaining assistant content.
   * Call this when the session ends.
   */
  forceFlushAssistant(): void {
    const cleaned = this.assistantBuf.trim();
    if (cleaned) {
      this.events.onAssistantDone(cleaned);
    }
    this.assistantBuf = "";
    this.inAssistant = false;
  }

  /**
   * Reset parser state.
   */
  reset(): void {
    this.buf = "";
    this.assistantBuf = "";
    this.rawBuf = "";
    this.inAssistant = false;
    this.promptReady = false;
  }

  /**
   * Get the raw buffer content (for debugging).
   */
  getRawBuffer(): string {
    return this.rawBuf;
  }

  /**
   * Check if currently in assistant response mode.
   */
  isInAssistantMode(): boolean {
    return this.inAssistant;
  }

  /**
   * Check if prompt is ready for user input.
   */
  isPromptReady(): boolean {
    return this.promptReady;
  }

  private boundAssistantBuffer(): void {
    // Hard limit to prevent memory blowup (2MB max)
    if (this.assistantBuf.length > 2_000_000) {
      this.assistantBuf = this.assistantBuf.slice(-2_000_000);
    }
  }

  private matchesAny(regexes: RegExp[], s: string): boolean {
    return regexes.some((r) => r.test(s));
  }

  private trimToAfterFirstMatch(regexes: RegExp[], s: string): string {
    for (const r of regexes) {
      const m = r.exec(s);
      if (m && m.index !== undefined) {
        return s.slice(m.index + m[0].length);
      }
    }
    return s;
  }

  private beforeFirstMatch(regexes: RegExp[], s: string): string {
    let bestIndex: number | null = null;

    for (const r of regexes) {
      const m = r.exec(s);
      if (m && m.index !== undefined) {
        if (bestIndex === null || m.index < bestIndex) {
          bestIndex = m.index;
        }
      }
    }

    if (bestIndex === null) return s;
    return s.slice(0, bestIndex);
  }
}

/**
 * Simple line-based transcript parser for cases where marker detection isn't reliable.
 * Uses input timing to determine message boundaries.
 */
export class SimpleTranscriptParser {
  private assistantOutput = "";
  private lastUserSubmitTime = 0;
  private pendingFlush: NodeJS.Timeout | null = null;

  constructor(
    private onAssistantMessage: (content: string) => void,
    private flushDelayMs = 500
  ) {}

  /**
   * Call when user submits input (presses Enter).
   * Flushes any pending assistant output first.
   */
  userSubmit(): void {
    this.flushPendingAssistant();
    this.lastUserSubmitTime = Date.now();
  }

  /**
   * Feed assistant output data.
   */
  feedOutput(data: string): void {
    const cleaned = stripAnsi(data);
    this.assistantOutput += cleaned;

    // Debounce the flush
    if (this.pendingFlush) {
      clearTimeout(this.pendingFlush);
    }
    this.pendingFlush = setTimeout(() => {
      // Don't flush immediately after user input (echoed text)
      if (Date.now() - this.lastUserSubmitTime > 100) {
        // Keep collecting, will flush on next user submit
      }
    }, this.flushDelayMs);
  }

  /**
   * Force flush any pending assistant output.
   */
  flushPendingAssistant(): void {
    if (this.pendingFlush) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = null;
    }

    const content = this.assistantOutput.trim();
    if (content) {
      this.onAssistantMessage(content);
    }
    this.assistantOutput = "";
  }

  /**
   * Reset parser state.
   */
  reset(): void {
    this.assistantOutput = "";
    this.lastUserSubmitTime = 0;
    if (this.pendingFlush) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = null;
    }
  }
}
