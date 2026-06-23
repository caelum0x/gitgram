/**
 * Git Engine
 *
 * A typed, first-party wrapper around a real `git` binary. AITM's CAS/tree
 * checkpoint system is its own content-addressed store; this engine lets AITM
 * additionally produce *real* git history (commits, branches, diffs) so a
 * checkpoint can be mirrored into a conventional repository.
 *
 * Binary resolution (`resolveGitBinary`):
 *   1. An explicit override (constructor option or `AITM_GIT_BIN`).
 *   2. A bundled binary at `<package-root>/bin/git` (preferred — deterministic,
 *      version-pinned, shipped with AITM).
 *   3. The system `git` on `PATH` (fallback).
 *
 * Every method shells out with `execFile` (no shell interpolation — arguments
 * are passed as an argv array, so paths/messages cannot inject shell syntax)
 * and returns a parsed, fully-typed result. No `any`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// ============================================================================
// Errors
// ============================================================================

/** Raised when a git invocation exits non-zero or cannot be spawned. */
export class GitEngineError extends Error {
  public readonly args: readonly string[];
  public readonly exitCode: number | null;
  public readonly stderr: string;

  constructor(
    message: string,
    args: readonly string[],
    exitCode: number | null,
    stderr: string
  ) {
    super(message);
    this.name = "GitEngineError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// ============================================================================
// Result types
// ============================================================================

export interface GitCommandResult {
  /** Raw stdout (trailing newline trimmed). */
  stdout: string;
  /** Raw stderr (trailing newline trimmed). */
  stderr: string;
  /** Process exit code; 0 on success. */
  exitCode: number;
}

export interface CommitResult {
  /** Full 40-char SHA of the created commit. */
  commitHash: string;
}

export interface DiffOptions {
  /** Compare staged changes against HEAD (`--cached`). */
  staged?: boolean;
  /** Optional explicit revision range or refs (e.g. `["HEAD~1", "HEAD"]`). */
  refs?: readonly string[];
  /** Limit the diff to these pathspecs. */
  paths?: readonly string[];
  /** Produce a name-only summary instead of a full patch. */
  nameOnly?: boolean;
}

/** A single porcelain status entry. */
export interface StatusEntry {
  /** Two-character XY status code (e.g. ` M`, `A `, `??`). */
  code: string;
  /** Path relative to the repo root. */
  path: string;
  /** Original path for renames/copies, when present. */
  origPath?: string;
}

export interface StatusResult {
  /** Current branch name, or `null` when detached/unknown. */
  branch: string | null;
  /** Parsed status entries. */
  entries: StatusEntry[];
  /** True when the working tree has no changes. */
  clean: boolean;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

export interface LogEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  /** ISO-8601 author date. */
  date: string;
  subject: string;
}

export interface LogOptions {
  /** Max number of commits to return. */
  maxCount?: number;
  /** Start ref (default: HEAD). */
  ref?: string;
}

// ============================================================================
// Binary resolution
// ============================================================================

/**
 * Resolves the path to the git binary to use.
 *
 * Order of preference: explicit override → bundled `bin/git` → system `git`.
 * The bundled path is checked relative to this module's package root so it
 * works regardless of the caller's cwd.
 */
export function resolveGitBinary(override?: string): string {
  const explicit = override ?? process.env.AITM_GIT_BIN;
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit.trim();
  }

  // This module lives at <root>/src/core/git-engine.ts (source) or
  // <root>/lib/core/git-engine.js (built). Walk up to the package root and
  // look for a bundled binary at <root>/bin/git.
  const here = path.dirname(fileURLToPath(import.meta.url));
  // here = .../src/core or .../lib/core → package root is two levels up.
  const packageRoot = path.resolve(here, "..", "..");
  const bundled = path.join(
    packageRoot,
    "bin",
    process.platform === "win32" ? "git.exe" : "git"
  );
  if (existsSync(bundled)) {
    return bundled;
  }

  // Fall back to the system git on PATH.
  return "git";
}

// ============================================================================
// GitEngine
// ============================================================================

export interface GitEngineOptions {
  /** Working directory all commands run in (repo root). Defaults to cwd. */
  cwd?: string;
  /** Explicit git binary path; overrides bundled/system resolution. */
  gitBinary?: string;
  /** Per-command timeout in ms (default: 60_000). */
  timeoutMs?: number;
  /** Max stdout/stderr buffer in bytes (default: 64 MiB). */
  maxBufferBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

export class GitEngine {
  private readonly cwd: string;
  private readonly gitBinary: string;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(options: GitEngineOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.gitBinary = resolveGitBinary(options.gitBinary);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;
  }

  /** The resolved git binary path used by this engine. */
  public getBinary(): string {
    return this.gitBinary;
  }

  /**
   * Runs an arbitrary git subcommand. Used by the typed methods and by the
   * `aitm git <...>` CLI passthrough. Throws {@link GitEngineError} on failure.
   */
  public async run(args: readonly string[]): Promise<GitCommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync(
        this.gitBinary,
        [...args],
        {
          cwd: this.cwd,
          timeout: this.timeoutMs,
          maxBuffer: this.maxBufferBytes,
          windowsHide: true,
          encoding: "utf8",
        }
      );
      return {
        stdout: stripTrailingNewline(stdout),
        stderr: stripTrailingNewline(stderr),
        exitCode: 0,
      };
    } catch (error: unknown) {
      throw toGitEngineError(error, args);
    }
  }

  // ── init ───────────────────────────────────────────────────────────────

  /** Initialise a new repository (idempotent — re-running is harmless). */
  public async init(bare = false): Promise<GitCommandResult> {
    const args = bare ? ["init", "--bare"] : ["init"];
    return this.run(args);
  }

  // ── add ────────────────────────────────────────────────────────────────

  /** Stage the given pathspecs (defaults to all changes: `-A`). */
  public async add(paths: readonly string[] = ["-A"]): Promise<GitCommandResult> {
    const pathspec = paths.length > 0 ? paths : ["-A"];
    return this.run(["add", "--", ...pathspec]);
  }

  // ── commit ───────────────────────────────────────────────────────────────

  /**
   * Create a commit with the given message. When `allowEmpty` is true a commit
   * is produced even with no staged changes. Returns the new commit's SHA.
   */
  public async commit(
    message: string,
    options: { allowEmpty?: boolean; authorName?: string; authorEmail?: string } = {}
  ): Promise<CommitResult> {
    const args: string[] = ["commit", "-m", message];
    if (options.allowEmpty === true) {
      args.push("--allow-empty");
    }
    if (
      options.authorName !== undefined &&
      options.authorEmail !== undefined
    ) {
      args.push("--author", `${options.authorName} <${options.authorEmail}>`);
    }
    await this.run(args);
    const head = await this.run(["rev-parse", "HEAD"]);
    return { commitHash: head.stdout.trim() };
  }

  // ── diff ───────────────────────────────────────────────────────────────

  /** Produce a diff. Returns the raw patch (or name-only list) text. */
  public async diff(options: DiffOptions = {}): Promise<string> {
    const args: string[] = ["diff"];
    if (options.staged === true) {
      args.push("--cached");
    }
    if (options.nameOnly === true) {
      args.push("--name-only");
    }
    if (options.refs !== undefined && options.refs.length > 0) {
      args.push(...options.refs);
    }
    if (options.paths !== undefined && options.paths.length > 0) {
      args.push("--", ...options.paths);
    }
    const result = await this.run(args);
    return result.stdout;
  }

  // ── status ───────────────────────────────────────────────────────────────

  /** Return a parsed porcelain v1 status. */
  public async status(): Promise<StatusResult> {
    const result = await this.run([
      "status",
      "--porcelain=v1",
      "--branch",
      "-z",
    ]);
    return parsePorcelainStatus(result.stdout);
  }

  // ── branch ───────────────────────────────────────────────────────────────

  /** List local branches with a `current` flag. */
  public async branch(): Promise<BranchInfo[]> {
    const result = await this.run([
      "branch",
      "--list",
      "--format=%(HEAD)%09%(refname:short)",
    ]);
    return parseBranchList(result.stdout);
  }

  /** Create a new branch (optionally from a start point). */
  public async createBranch(
    name: string,
    startPoint?: string
  ): Promise<GitCommandResult> {
    const args = ["branch", name];
    if (startPoint !== undefined) {
      args.push(startPoint);
    }
    return this.run(args);
  }

  // ── log ────────────────────────────────────────────────────────────────

  /** Return parsed commit log entries (newest first). */
  public async log(options: LogOptions = {}): Promise<LogEntry[]> {
    // Use a unit-separator (US, 0x1f) field delimiter and a record-separator
    // (RS, 0x1e) row delimiter so subjects containing arbitrary text parse
    // unambiguously.
    const FIELD = "";
    const RECORD = "";
    const format = ["%H", "%an", "%ae", "%aI", "%s"].join(FIELD) + RECORD;
    const args = ["log", `--pretty=format:${format}`];
    if (options.maxCount !== undefined) {
      args.push(`--max-count=${options.maxCount}`);
    }
    if (options.ref !== undefined) {
      args.push(options.ref);
    }
    const result = await this.run(args);
    return parseLog(result.stdout, FIELD, RECORD);
  }

  // ── show ───────────────────────────────────────────────────────────────

  /** Show a commit/object. Returns raw text. */
  public async show(ref = "HEAD"): Promise<string> {
    const result = await this.run(["show", ref]);
    return result.stdout;
  }

  /** True when `cwd` is inside a git work tree. */
  public async isRepository(): Promise<boolean> {
    try {
      const result = await this.run(["rev-parse", "--is-inside-work-tree"]);
      return result.stdout.trim() === "true";
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Parsing helpers (pure, unit-testable)
// ============================================================================

function stripTrailingNewline(s: string): string {
  return s.replace(/\r?\n$/, "");
}

interface ExecError {
  code?: number;
  stderr?: string | Buffer;
  message?: string;
}

function isExecError(value: unknown): value is ExecError {
  return typeof value === "object" && value !== null;
}

function toGitEngineError(
  error: unknown,
  args: readonly string[]
): GitEngineError {
  if (isExecError(error)) {
    const stderr =
      typeof error.stderr === "string"
        ? error.stderr
        : Buffer.isBuffer(error.stderr)
          ? error.stderr.toString("utf8")
          : "";
    const exitCode = typeof error.code === "number" ? error.code : null;
    const message =
      typeof error.message === "string" ? error.message : "git command failed";
    return new GitEngineError(
      `git ${args.join(" ")} failed: ${stripTrailingNewline(stderr) || message}`,
      args,
      exitCode,
      stripTrailingNewline(stderr)
    );
  }
  return new GitEngineError(
    `git ${args.join(" ")} failed: ${String(error)}`,
    args,
    null,
    ""
  );
}

/**
 * Parse `git status --porcelain=v1 --branch -z` output.
 *
 * The `-z` flag NUL-separates entries. The first token is the branch header
 * (`## branch...`). Rename/copy entries emit two NUL-separated path fields.
 */
export function parsePorcelainStatus(raw: string): StatusResult {
  const tokens = raw.split(" ").filter((t) => t.length > 0);
  let branch: string | null = null;
  const entries: StatusEntry[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) {
      continue;
    }
    if (token.startsWith("## ")) {
      branch = parseBranchHeader(token.slice(3));
      continue;
    }
    // Entry format: "XY <path>". X/Y are status codes, then a space, then path.
    const code = token.slice(0, 2);
    const entryPath = token.slice(3);
    // Renames/copies (R/C) put the original path in the next NUL field.
    if ((code[0] === "R" || code[0] === "C") && i + 1 < tokens.length) {
      const origPath = tokens[i + 1];
      i += 1;
      entries.push({ code, path: entryPath, origPath });
    } else {
      entries.push({ code, path: entryPath });
    }
  }

  return { branch, entries, clean: entries.length === 0 };
}

function parseBranchHeader(header: string): string | null {
  // Examples: "main", "main...origin/main [ahead 1]",
  // "No commits yet on main", "HEAD (no branch)".
  if (header.startsWith("No commits yet on ")) {
    return header.slice("No commits yet on ".length).trim() || null;
  }
  const sep = header.indexOf("...");
  const name = (sep >= 0 ? header.slice(0, sep) : header).trim();
  if (name.length === 0 || name === "HEAD (no branch)") {
    return null;
  }
  return name;
}

/** Parse `git branch --format=%(HEAD)%09%(refname:short)` output. */
export function parseBranchList(raw: string): BranchInfo[] {
  if (raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const [headFlag, name = ""] = line.split("\t");
      return { name: name.trim(), current: headFlag === "*" };
    })
    .filter((b) => b.name.length > 0);
}

/** Parse the delimited `git log` output produced by {@link GitEngine.log}. */
export function parseLog(
  raw: string,
  field: string,
  record: string
): LogEntry[] {
  if (raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(record)
    .map((r) => r.replace(/^\r?\n/, ""))
    .filter((r) => r.trim().length > 0)
    .map((r) => {
      const [hash = "", authorName = "", authorEmail = "", date = "", subject = ""] =
        r.split(field);
      return {
        hash: hash.trim(),
        authorName,
        authorEmail,
        date,
        subject,
      };
    });
}
