/**
 * engineManager — single source of truth for resolving AITM's bundled
 * first-party engine paths.
 *
 * Every vendored repo merged into AITM is built by scripts/build-engines.sh into
 * `aitimemachine/bin` (beads, git) or `aitimemachine/engines` (pal venv). This
 * module resolves those bundled paths with first-party defaults — it deliberately
 * has NO external-URL fallbacks. Env overrides exist only for advanced/CI use.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** aitimemachine/ root, resolved from this compiled file (src or dist). */
function aitmRoot(): string {
  // .../aitimemachine/api-server/(src|dist)/services/engineManager → up 3 = aitimemachine
  return path.resolve(__dirname, "../../..");
}

const ROOT = aitmRoot();
const BIN_DIR = path.join(ROOT, "bin");
const ENGINES_DIR = path.join(ROOT, "engines");

function firstExisting(...candidates: Array<string | undefined>): string | null {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

export interface EngineResolution {
  /** Absolute path to the resolved artifact, or null if not built/available. */
  path: string | null;
  /** Where it came from: bundled build, env override, or system PATH fallback. */
  source: "bundled" | "env" | "system" | "unavailable";
}

/** beads `bd` binary — bundled build preferred, then env, then vendored source dir. */
export function resolveBeadsBinary(): EngineResolution {
  const env = process.env.BEADS_BINARY || process.env.BEADS_BIN;
  const bundled = path.join(BIN_DIR, "bd");
  const vendored = path.join(ROOT, "beads", "bd");
  if (env && fs.existsSync(env)) return { path: env, source: "env" };
  const found = firstExisting(bundled, vendored);
  if (found) return { path: found, source: "bundled" };
  return { path: null, source: "unavailable" };
}

/** git binary — bundled vendored-C build preferred, then env, then system PATH. */
export function resolveGitBinary(): EngineResolution {
  const env = process.env.AITM_GIT_BIN;
  const bundled = path.join(BIN_DIR, "git");
  if (env && fs.existsSync(env)) return { path: env, source: "env" };
  if (fs.existsSync(bundled)) return { path: bundled, source: "bundled" };
  return { path: "git", source: "system" }; // resolved on PATH at exec time
}

/** PAL python interpreter inside the bundled venv. */
export function resolvePalPython(): EngineResolution {
  const env = process.env.PAL_PYTHON;
  const venv = process.env.PAL_VENV_DIR || path.join(ENGINES_DIR, "pal");
  const unix = path.join(venv, "bin", "python");
  const win = path.join(venv, "Scripts", "python.exe");
  if (env && fs.existsSync(env)) return { path: env, source: "env" };
  const found = firstExisting(unix, win);
  if (found) return { path: found, source: "bundled" };
  return { path: null, source: "unavailable" };
}

/** PAL venv directory (for spawning the console script). */
export function palVenvDir(): string {
  return process.env.PAL_VENV_DIR || path.join(ENGINES_DIR, "pal");
}

/** Diagnostic snapshot of all bundled engines (used by health/status). */
export function enginePaths(): Record<string, EngineResolution> {
  return {
    beads: resolveBeadsBinary(),
    git: resolveGitBinary(),
    pal: resolvePalPython(),
  };
}

export const ENGINE_DIRS = { root: ROOT, bin: BIN_DIR, engines: ENGINES_DIR } as const;
