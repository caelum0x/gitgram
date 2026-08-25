/**
 * Canonical skills taxonomy.
 *
 * Promotes the latent "Skill" entity (ARCHITECTURE.md §3.2, §5.4 #3) from a bare
 * string attribute to a canonicalized token with a curated alias vocabulary.
 * This is the entity-link step of the matcher (ARCHITECTURE.md §3.5, step 1):
 * a Need's `requiredSkills`, a repo's `language`/`topics`, a user's `interests`,
 * and a pilot's `evidenceSkills` are all free-text tokens sourced from GitHub or
 * institutions. Without canonicalization an org that requires "JavaScript" never
 * matches a repo tagged "js", so match recall silently collapses.
 *
 * Design:
 * - `normalizeSkill` gives a stable comparison key (trim + lowercase + collapse
 *   internal whitespace). Backward compatible with the previous inline helper.
 * - `canonicalizeSkill` maps a normalized token to its canonical form via the
 *   alias index, falling back to the normalized token when unknown.
 * - `expandSkillAliases` / `expandSkillQueryTokens` widen a canonical skill back
 *   out to every known surface form so array-overlap DB filters (`hasSome`) catch
 *   aliased rows before they are re-canonicalized and scored.
 *
 * Pure and dependency-free: no Prisma, no I/O. Unit-testable in isolation.
 */

/**
 * Curated canonical skill vocabulary. Keys are canonical tokens (already in
 * normalized form); values are the additional aliases that resolve to them.
 * Keep entries lowercase and normalized — they are indexed as-is.
 */
const SKILL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  javascript: ['js', 'node', 'nodejs', 'node.js', 'ecmascript', 'es6'],
  typescript: ['ts'],
  python: ['py', 'python3'],
  react: ['reactjs', 'react.js'],
  'react native': ['react-native', 'reactnative', 'rn'],
  'next.js': ['next', 'nextjs'],
  'node.js backend': ['express', 'expressjs'],
  golang: ['go'],
  'c#': ['csharp', 'c-sharp', 'dotnet', '.net'],
  'c++': ['cpp', 'cplusplus'],
  postgresql: ['postgres', 'psql', 'pg'],
  kubernetes: ['k8s'],
  'machine learning': ['ml', 'machine-learning'],
  'artificial intelligence': ['ai'],
  'devops': ['dev-ops', 'ci/cd', 'cicd'],
  graphql: ['gql'],
  tailwindcss: ['tailwind', 'tailwind css'],
  postgres_prisma: ['prisma'],
};

/**
 * Reverse index: every alias (and every canonical key) → canonical token.
 * Built once at module load.
 */
const ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    index.set(canonical, canonical);
    for (const alias of aliases) {
      const key = normalizeSkill(alias);
      // First writer wins so an accidental duplicate alias cannot silently
      // repoint an existing canonical skill.
      if (key && !index.has(key)) index.set(key, canonical);
    }
  }
  return index;
})();

/**
 * Forward index: canonical token → the full set of surface tokens (canonical +
 * aliases) that should be queried for it.
 */
const CANONICAL_TO_TOKENS: ReadonlyMap<string, readonly string[]> = (() => {
  const index = new Map<string, readonly string[]>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    const tokens = new Set<string>([canonical]);
    for (const alias of aliases) {
      const key = normalizeSkill(alias);
      if (key) tokens.add(key);
    }
    index.set(canonical, Array.from(tokens));
  }
  return index;
})();

/**
 * Stable comparison key for a raw skill token: trimmed, lowercased, with
 * internal whitespace collapsed to a single space.
 */
export function normalizeSkill(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve a raw skill token to its canonical form. Unknown tokens fall back to
 * their normalized value so the matcher still compares like-for-like.
 */
export function canonicalizeSkill(value: string): string {
  const normalized = normalizeSkill(value);
  if (!normalized) return '';
  return ALIAS_TO_CANONICAL.get(normalized) ?? normalized;
}

/**
 * Canonicalize a list of raw skill tokens, dropping empties and de-duplicating
 * while preserving first-seen order.
 */
export function canonicalizeSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const canonical = canonicalizeSkill(value);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}

/**
 * Expand a canonical skill back to every known surface token (canonical +
 * aliases). Unknown tokens expand to themselves.
 */
export function expandSkillAliases(canonical: string): string[] {
  const key = normalizeSkill(canonical);
  const tokens = CANONICAL_TO_TOKENS.get(key);
  return tokens ? Array.from(tokens) : key ? [key] : [];
}

/**
 * Build the de-duplicated union of surface tokens for a set of canonical skills.
 * Use this for array-overlap DB filters (`hasSome` / `in`) so aliased rows are
 * retrieved before being re-canonicalized and scored.
 */
export function expandSkillQueryTokens(canonicalSkills: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const skill of canonicalSkills) {
    for (const token of expandSkillAliases(skill)) tokens.add(token);
  }
  return Array.from(tokens);
}
