import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIN_DISK_SPACE_MB = 100; // 100 MB minimum
const REQUIRED_DIRS = ["blobs", "sessions", "backups"];

type PreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  details?: {
    diskSpaceMB?: number;
    configValid?: boolean;
    dirsCreated?: string[];
  };
};

export function runInitPreflight(projectRoot: string): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: PreflightResult["details"] = {};

  // Check project path exists and is a directory
  try {
    const stat = fs.statSync(projectRoot);
    if (!stat.isDirectory()) {
      errors.push("Project path is not a directory.");
    }
  } catch {
    errors.push("Project path does not exist.");
  }

  // Check project directory is readable/writable
  try {
    fs.accessSync(projectRoot, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    errors.push("Project directory is not readable/writable.");
  }

  // Check data directory
  const dataDir = path.join(os.homedir(), ".aitimemachine");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    errors.push("Cannot create or write to ~/.aitimemachine.");
  }

  // Check disk space
  try {
    const diskSpace = getDiskSpaceMB(dataDir);
    details.diskSpaceMB = diskSpace;
    if (diskSpace < MIN_DISK_SPACE_MB) {
      errors.push(`Insufficient disk space: ${diskSpace}MB available, ${MIN_DISK_SPACE_MB}MB required.`);
    } else if (diskSpace < MIN_DISK_SPACE_MB * 5) {
      warnings.push(`Low disk space: ${diskSpace}MB available.`);
    }
  } catch {
    warnings.push("Could not determine available disk space.");
  }

  // Check/create required directories
  const dirsCreated: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    const dirPath = path.join(dataDir, dir);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        dirsCreated.push(dir);
      }
      fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      errors.push(`Cannot create or access required directory: ${dir}`);
    }
  }
  details.dirsCreated = dirsCreated;

  // Check existing database
  const dbPath = path.join(dataDir, "db.sqlite");
  if (fs.existsSync(dbPath)) {
    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      errors.push("Existing database is not readable/writable.");
    }
  }

  // Validate config if exists
  const configPath = path.join(dataDir, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      JSON.parse(configContent);
      details.configValid = true;
    } catch {
      warnings.push("Config file exists but is invalid JSON. Will use defaults.");
      details.configValid = false;
    }
  }

  // Warning for home directory
  if (projectRoot === os.homedir()) {
    warnings.push("Initializing at home directory may include many unrelated files.");
  }

  // Warning for nested projects
  const parentProjects = findParentProjects(projectRoot, dataDir);
  if (parentProjects.length > 0) {
    warnings.push(`Parent directory is already tracked: ${parentProjects[0]}`);
  }

  return { ok: errors.length === 0, errors, warnings, details };
}

/**
 * Get available disk space in MB for the given path
 */
function getDiskSpaceMB(dirPath: string): number {
  // Use df command on Unix-like systems
  if (process.platform !== "win32") {
    try {
      const { execSync } = require("child_process");
      const result = execSync(`df -m "${dirPath}" | tail -1 | awk '{print $4}'`, {
        encoding: "utf-8",
      });
      return parseInt(result.trim(), 10) || 0;
    } catch {
      return Infinity; // Assume enough space if we can't check
    }
  }
  // Windows: approximate using fs.statfs (Node 18+)
  return Infinity;
}

/**
 * Find any parent directories that are already tracked projects
 */
function findParentProjects(projectRoot: string, dataDir: string): string[] {
  const dbPath = path.join(dataDir, "db.sqlite");
  if (!fs.existsSync(dbPath)) return [];

  // Simple check: look for .aitimemachine markers in parent directories
  const parents: string[] = [];
  let current = path.dirname(projectRoot);
  const root = path.parse(current).root;

  while (current !== root) {
    const marker = path.join(current, ".tm_internal");
    if (fs.existsSync(marker)) {
      parents.push(current);
    }
    current = path.dirname(current);
  }

  return parents;
}

/**
 * Validate environment for running daemon
 */
export function runDaemonPreflight(): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split(".").map(Number);
  if (major < 18) {
    errors.push(`Node.js 18+ required, found ${nodeVersion}`);
  }

  // Check if another daemon is running
  const dataDir = path.join(os.homedir(), ".aitimemachine");
  const pidFile = path.join(dataDir, "daemon.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim());
      process.kill(pid, 0); // Check if process exists
      warnings.push(`Daemon already running (PID: ${pid})`);
    } catch {
      // Process doesn't exist, stale PID file
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
