/**
 * tool-diagnostics.test.ts
 *
 * Verifies the configured-but-hidden discoverability diagnostic: when a user
 * sets an integration's enabling env var but its tools stay hidden because they
 * are experimental and AITM_EXPERIMENTAL_TOOLS is unset, the diagnostic flags
 * the family with an actionable hint.
 */

import { describe, it, expect } from 'vitest';
import {
  formatHiddenFamiliesWarning,
  getConfiguredButHiddenFamilies,
} from '../lib/tool-diagnostics.js';

describe('getConfiguredButHiddenFamilies', () => {
  it('flags GitHub as hidden when GITHUB_TOKEN is set but experimental is off', () => {
    const diagnostics = getConfiguredButHiddenFamilies(
      { includeExperimental: false },
      { GITHUB_TOKEN: 'ghp_x' }
    );
    const github = diagnostics.find((d) => d.label.startsWith('GitHub'));
    expect(github).toBeDefined();
    expect(github?.hiddenToolCount).toBeGreaterThan(0);
    expect(github?.setEnv).toContain('GITHUB_TOKEN');
  });

  it('reports nothing when experimental tools are enabled', () => {
    const diagnostics = getConfiguredButHiddenFamilies(
      { includeExperimental: true },
      { GITHUB_TOKEN: 'ghp_x', AITM_API_URL: 'http://localhost:3001' }
    );
    expect(diagnostics).toHaveLength(0);
  });

  it('reports nothing when no integration env is configured', () => {
    const diagnostics = getConfiguredButHiddenFamilies(
      { includeExperimental: false },
      {}
    );
    expect(diagnostics).toHaveLength(0);
  });

  it('flags multiple families at once', () => {
    const diagnostics = getConfiguredButHiddenFamilies(
      { includeExperimental: false },
      { GITHUB_TOKEN: 'ghp_x', AITM_API_URL: 'http://localhost:3001', AITM_PAL_ENABLED: '1' }
    );
    const labels = diagnostics.map((d) => d.label);
    expect(labels.some((l) => l.startsWith('GitHub'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Workspace'))).toBe(true);
    expect(labels.some((l) => l.startsWith('PAL'))).toBe(true);
  });

  it('treats AITM_*_ENABLED=0 as not configured', () => {
    const diagnostics = getConfiguredButHiddenFamilies(
      { includeExperimental: false },
      { AITM_BEADS_ENABLED: '0' }
    );
    expect(diagnostics).toHaveLength(0);
  });
});

describe('formatHiddenFamiliesWarning', () => {
  it('returns null when there is nothing to warn about', () => {
    expect(formatHiddenFamiliesWarning([])).toBeNull();
  });

  it('produces an actionable AITM_EXPERIMENTAL_TOOLS hint', () => {
    const warning = formatHiddenFamiliesWarning([
      { label: 'GitHub (github_*)', hiddenToolCount: 7, setEnv: ['GITHUB_TOKEN'] },
    ]);
    expect(warning).toMatch(/CONFIGURED but HIDDEN/);
    expect(warning).toMatch(/AITM_EXPERIMENTAL_TOOLS=1/);
    expect(warning).toMatch(/GITHUB_TOKEN/);
  });
});
