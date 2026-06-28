#!/usr/bin/env node
/**
 * ensure-engines.mjs — make a fresh deploy self-heal its first-party engines.
 *
 * engineManager resolves beads (`bd`), the vendored git binary, and the PAL
 * Python venv from aitimemachine/bin and aitimemachine/engines. Those artifacts
 * are produced by scripts/build-engines.sh. A deploy that skips that step makes
 * beads/pal features and /health/engines report "unavailable".
 *
 * This script runs as a `prestart` hook: it checks whether the engines resolve,
 * and if any are missing it invokes scripts/build-engines.sh once to build them
 * — so a fresh production deploy gets its engines without a manual step. It is
 * idempotent and best-effort: if the build toolchain is absent (e.g. a minimal
 * runtime image where engines were pre-built into the image), it logs a warning
 * and exits 0 rather than blocking startup.
 *
 * Set AITM_SKIP_ENGINE_BUILD=1 to skip entirely (e.g. images that bundle
 * prebuilt binaries and intentionally ship without a build toolchain).
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// api-server/scripts -> aitimemachine
const AITM_ROOT = path.resolve(__dirname, "../..");
const BIN_DIR = path.join(AITM_ROOT, "bin");
const ENGINES_DIR = path.join(AITM_ROOT, "engines");
const BUILD_SCRIPT = path.join(AITM_ROOT, "scripts", "build-engines.sh");

function log(msg) {
  process.stdout.write(`[ensure-engines] ${msg}\n`);
}

function enginesPresent() {
  const beads =
    existsSync(path.join(BIN_DIR, "bd")) ||
    existsSync(path.join(AITM_ROOT, "beads", "bd")) ||
    Boolean(process.env.BEADS_BINARY && existsSync(process.env.BEADS_BINARY));
  // git falls back to system PATH, so it is never "missing" in a blocking sense.
  const palVenv = process.env.PAL_VENV_DIR || path.join(ENGINES_DIR, "pal");
  const pal =
    existsSync(path.join(palVenv, "bin", "python")) ||
    existsSync(path.join(palVenv, "Scripts", "python.exe")) ||
    Boolean(process.env.PAL_PYTHON && existsSync(process.env.PAL_PYTHON));
  return { beads, pal, all: beads && pal };
}

function main() {
  if (process.env.AITM_SKIP_ENGINE_BUILD === "1") {
    log("AITM_SKIP_ENGINE_BUILD=1 set — skipping engine build check.");
    return;
  }

  const present = enginesPresent();
  if (present.all) {
    log("first-party engines already present (beads, pal). Nothing to build.");
    return;
  }

  if (!existsSync(BUILD_SCRIPT)) {
    log(
      `WARNING: missing engines (beads=${present.beads}, pal=${present.pal}) ` +
        `and build script not found at ${BUILD_SCRIPT}. ` +
        "beads/pal features and /health/engines will report degraded."
    );
    return;
  }

  log(
    `missing engines (beads=${present.beads}, pal=${present.pal}) — ` +
      "running scripts/build-engines.sh..."
  );

  const result = spawnSync("bash", [BUILD_SCRIPT], {
    cwd: AITM_ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    log(
      `WARNING: could not run build-engines.sh (${result.error.message}). ` +
        "Continuing startup — engine-dependent features will be degraded."
    );
    return;
  }
  if (result.status !== 0) {
    log(
      `WARNING: build-engines.sh exited with code ${result.status}. ` +
        "Some engines may be degraded; check /health/engines."
    );
    return;
  }

  const after = enginesPresent();
  log(
    `build complete (beads=${after.beads}, pal=${after.pal}). ` +
      (after.all ? "all engines resolved." : "some engines still unavailable — check toolchain.")
  );
}

main();
