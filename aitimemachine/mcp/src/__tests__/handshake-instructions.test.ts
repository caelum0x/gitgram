/**
 * handshake-instructions.test.ts
 *
 * Verifies the handshake instructions string advertised at initialize time:
 * a stable preamble (discovery path + experimental gating) plus per-family
 * hints derived from the currently enabled tool set.
 */

import { describe, it, expect } from 'vitest';
import { buildHandshakeInstructions } from '../lib/handshake-instructions.js';

describe('buildHandshakeInstructions', () => {
  it('always includes the discovery path and experimental-gating preamble', () => {
    const text = buildHandshakeInstructions({ includeExperimental: false });
    expect(text).toContain('tm_get_tool_info');
    expect(text).toContain('tm://capabilities');
    expect(text).toContain('AITM_EXPERIMENTAL_TOOLS=1');
    expect(text).toContain('DISABLED_TOOLS');
  });

  it('mentions stable always-on families (time-travel)', () => {
    const text = buildHandshakeInstructions({ includeExperimental: false });
    expect(text).toContain('before_action');
    expect(text).toContain('after_action');
  });

  it('omits experimental-only family hints unless experimental is enabled', () => {
    const stableOnly = buildHandshakeInstructions({ includeExperimental: false });
    // task-tracker (beads) tools are all experimental, so their hint is hidden.
    expect(stableOnly).not.toContain('beads_ready');

    const withExperimental = buildHandshakeInstructions({
      includeExperimental: true,
    });
    expect(withExperimental).toContain('beads_ready');
  });

  it('reports the enabled tool count', () => {
    const text = buildHandshakeInstructions({ includeExperimental: false });
    expect(text).toMatch(/\d+ tools enabled/);
  });
});
