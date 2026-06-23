import ignore from "ignore";

export function makeIgnoreMatcher(patterns: string[]) {
  const ig = ignore();
  ig.add(patterns);
  return (relPosix: string) => ig.ignores(relPosix);
}

// Sensible defaults for prod:
export const DEFAULT_IGNORES = [
  ".git/**",
  "node_modules/**",
  ".venv/**",
  "dist/**",
  "build/**",
  ".next/**",
  "target/**",
  "*.log",
  ".DS_Store",
];
