/**
 * Prompt marker profiles for parsing PTY output from different AI CLI tools.
 * Used by the TranscriptParser to detect user/assistant message boundaries.
 */

export type MarkerProfile = {
  name: string;
  /** Markers indicating user input prompt is shown */
  userPrompt: RegExp[];
  /** Markers indicating assistant response begins */
  assistantStart: RegExp[];
  /** Optional markers indicating assistant response ended */
  assistantStop?: RegExp[];
};

/**
 * Built-in marker profiles for common AI CLI tools.
 * The parser tries profiles in order and uses the first match.
 */
export const MARKER_PROFILES: MarkerProfile[] = [
  {
    name: "claude_code",
    // Claude Code shows prompts like ">" or "You:" before user input
    userPrompt: [
      /(^|\n)\s*>\s*$/m,
      /(^|\n)\s*(You|User)\s*:\s*$/m,
      /\n\s*claude\s*>\s*$/m,
    ],
    // Assistant response starts after prompt, usually with text or tool calls
    assistantStart: [
      /(^|\n)\s*(Claude|Assistant)\s*:\s*/m,
      // Tool use often starts with these patterns
      /(^|\n)\s*\[Tool:/m,
      /(^|\n)\s*Running:/m,
    ],
    assistantStop: [
      // Stop when we see user prompt again
      /(^|\n)\s*>\s*$/m,
      /(^|\n)\s*(You|User)\s*:\s*$/m,
    ],
  },
  {
    name: "aider",
    userPrompt: [
      /aider>\s*$/m,
      /(^|\n)>\s*$/m,
    ],
    assistantStart: [
      /(^|\n)(assistant|ASSISTANT)\s*:/m,
    ],
    assistantStop: [
      /aider>\s*$/m,
    ],
  },
  {
    name: "generic",
    // Fallback for unknown tools - basic prompt detection
    userPrompt: [/>\s*$/m, /\$\s*$/m],
    assistantStart: [/./m], // Any output is treated as assistant
  },
];

/**
 * Get the marker profile by name.
 */
export function getMarkerProfile(name: string): MarkerProfile | undefined {
  return MARKER_PROFILES.find((p) => p.name === name);
}

/**
 * Get the default marker profile (claude_code).
 */
export function getDefaultMarkerProfile(): MarkerProfile {
  return MARKER_PROFILES[0];
}
