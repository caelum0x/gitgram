/**
 * a2a-skills.test.ts
 *
 * Verifies that the A2A skill catalogue derives one skill per enabled MCP tool
 * (not just the 7 curated time-machine skills) so the agent's full capability
 * set is reachable via message/send.
 */

import { describe, it, expect } from 'vitest';
import {
  CURATED_A2A_SKILLS,
  getEnabledA2ASkills,
  getSkillDefinition,
} from '../lib/a2a-skills.js';

describe('A2A skill catalogue', () => {
  it('keeps the curated short-id skills addressable', () => {
    for (const skill of CURATED_A2A_SKILLS) {
      const def = getSkillDefinition(skill.id);
      expect(def).toBeDefined();
      expect(def?.toolName).toBe(skill.toolName);
    }
  });

  it('exposes a skill keyed by the canonical tool name (full catalogue)', () => {
    // Integration tools are experimental-gated; with experimental enabled the
    // long-form tool-name ids must resolve to a skill.
    const githubSkill = getSkillDefinition('github_create_issue');
    expect(githubSkill).toBeDefined();
    expect(githubSkill?.toolName).toBe('github_create_issue');

    const palSkill = getSkillDefinition('pal_execute');
    expect(palSkill).toBeDefined();
    expect(palSkill?.toolName).toBe('pal_execute');
  });

  it('only advertises skills whose tool is enabled', () => {
    const stableOnly = getEnabledA2ASkills({ includeExperimental: false });
    const ids = stableOnly.map((s) => s.id);
    // Curated stable skills (diff -> tm_diff is stable) appear.
    expect(ids).toContain('diff');
    // Experimental tool-name skills do not appear without experimental flag.
    expect(ids).not.toContain('pal_execute');

    const withExperimental = getEnabledA2ASkills({ includeExperimental: true });
    const expIds = withExperimental.map((s) => s.id);
    expect(expIds).toContain('pal_execute');
    expect(expIds).toContain('github_create_issue');
    expect(expIds).toContain('gn_query');
    expect(expIds).toContain('ws_files');
    expect(expIds).toContain('beads_list_tasks');
  });

  it('respects DISABLED_TOOLS', () => {
    const skills = getEnabledA2ASkills({
      includeExperimental: true,
      disabledTools: 'pal_execute',
    });
    expect(skills.map((s) => s.id)).not.toContain('pal_execute');
  });

  it('the public skill shape never leaks the internal toolName field', () => {
    const skills = getEnabledA2ASkills({ includeExperimental: true });
    for (const skill of skills) {
      expect('toolName' in skill).toBe(false);
    }
  });
});
