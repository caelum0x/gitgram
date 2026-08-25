/**
 * Unit tests for skillTaxonomyService.
 *
 * Pure functions — no Prisma, no I/O. These lock the canonicalization contract
 * the talent matcher relies on (ARCHITECTURE.md §3.5 step 1).
 */
import {
  canonicalizeSkill,
  canonicalizeSkills,
  expandSkillAliases,
  expandSkillQueryTokens,
  normalizeSkill,
} from '../../src/services/skillTaxonomyService';

describe('skillTaxonomyService.normalizeSkill', () => {
  it('trims, lowercases, and collapses internal whitespace', () => {
    expect(normalizeSkill('  React   Native ')).toBe('react native');
    expect(normalizeSkill('TypeScript')).toBe('typescript');
    expect(normalizeSkill('')).toBe('');
  });
});

describe('skillTaxonomyService.canonicalizeSkill', () => {
  it('resolves known aliases to their canonical token', () => {
    expect(canonicalizeSkill('js')).toBe('javascript');
    expect(canonicalizeSkill('Node.js')).toBe('javascript');
    expect(canonicalizeSkill('TS')).toBe('typescript');
    expect(canonicalizeSkill('reactjs')).toBe('react');
    expect(canonicalizeSkill('k8s')).toBe('kubernetes');
    expect(canonicalizeSkill('Go')).toBe('golang');
  });

  it('is idempotent on canonical tokens', () => {
    expect(canonicalizeSkill('javascript')).toBe('javascript');
    expect(canonicalizeSkill('react native')).toBe('react native');
  });

  it('falls back to the normalized token when unknown', () => {
    expect(canonicalizeSkill('  Rust ')).toBe('rust');
    expect(canonicalizeSkill('COBOL')).toBe('cobol');
  });

  it('returns an empty string for blank input', () => {
    expect(canonicalizeSkill('   ')).toBe('');
  });
});

describe('skillTaxonomyService.canonicalizeSkills', () => {
  it('canonicalizes, de-duplicates by canonical form, and preserves order', () => {
    expect(canonicalizeSkills(['JavaScript', 'js', 'node', 'React', 'reactjs'])).toEqual([
      'javascript',
      'react',
    ]);
  });

  it('drops blank tokens', () => {
    expect(canonicalizeSkills(['  ', 'ts', ''])).toEqual(['typescript']);
  });
});

describe('skillTaxonomyService.expandSkillAliases', () => {
  it('expands a canonical skill to every known surface token', () => {
    const tokens = expandSkillAliases('javascript');
    expect(tokens).toContain('javascript');
    expect(tokens).toContain('js');
    expect(tokens).toContain('node.js');
    // no duplicates
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('expands an unknown token to itself', () => {
    expect(expandSkillAliases('rust')).toEqual(['rust']);
  });

  it('returns an empty array for blank input', () => {
    expect(expandSkillAliases('   ')).toEqual([]);
  });
});

describe('skillTaxonomyService.expandSkillQueryTokens', () => {
  it('unions the surface tokens of several canonical skills without duplicates', () => {
    const tokens = expandSkillQueryTokens(['javascript', 'typescript']);
    expect(tokens).toContain('js');
    expect(tokens).toContain('javascript');
    expect(tokens).toContain('ts');
    expect(tokens).toContain('typescript');
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
