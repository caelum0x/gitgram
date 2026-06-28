/**
 * PyPI archive access.
 *
 * PyPI does not expose a per-file CDN like unpkg, so to list/read/grep file
 * contents we download a package's wheel (a ZIP archive) and parse it in
 * memory. Wheels use the standard ZIP format with STORE (0) or DEFLATE (8)
 * compression, both of which are decompressible with Node's built-in `zlib`
 * (no third-party dependency required).
 *
 * Downloaded+parsed archives are cached briefly to avoid re-downloading on
 * back-to-back list/read/grep calls for the same package version.
 */

import zlib from "node:zlib";
import { logger } from "../lib/monitoring.js";

const PYPI_JSON = "https://pypi.org/pypi";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024; // 60 MB safety cap
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PypiFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

interface ParsedArchive {
  /** Map of file path -> raw uncompressed bytes. */
  files: Map<string, Buffer>;
  fetchedAt: number;
}

interface PypiReleaseFile {
  url: string;
  filename: string;
  packagetype: string; // "bdist_wheel" | "sdist" | ...
  yanked?: boolean;
}

interface PypiJson {
  info: { version: string };
  releases: Record<string, PypiReleaseFile[]>;
  urls: PypiReleaseFile[];
}

const archiveCache = new Map<string, ParsedArchive>();

function cacheKey(pkg: string, version: string): string {
  return `${pkg.toLowerCase()}@${version}`;
}

/**
 * Resolve the concrete version and the best wheel download URL for a package.
 * Prefers a built wheel (bdist_wheel); returns null when none is available.
 */
async function resolveWheelUrl(
  packageName: string,
  version: string
): Promise<{ version: string; url: string } | null> {
  const isLatest = !version || version === "latest";
  const url = isLatest
    ? `${PYPI_JSON}/${encodeURIComponent(packageName)}/json`
    : `${PYPI_JSON}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`PyPI returned ${resp.status} for ${packageName}`);
  }
  const data = (await resp.json()) as PypiJson;
  const resolvedVersion = data.info.version;

  // `urls` holds the files for the requested (or latest) version.
  const candidates = (data.urls ?? []).filter((f) => !f.yanked);
  const wheel =
    candidates.find((f) => f.packagetype === "bdist_wheel") ??
    candidates.find((f) => f.filename.endsWith(".whl"));

  if (!wheel) return null;
  return { version: resolvedVersion, url: wheel.url };
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (central directory based)
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;

/**
 * Parse a ZIP buffer into a path -> contents map. Supports STORE (0) and
 * DEFLATE (8) compression. Throws on an unparseable archive.
 */
function parseZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // Locate the End Of Central Directory record (search backwards).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new Error("Invalid wheel: ZIP end-of-central-directory not found");
  }

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) break;

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    const fileName = buf
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    // Read the local file header to find the data start.
    const localNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);

    if (!fileName.endsWith("/")) {
      try {
        const content =
          compressionMethod === 0
            ? Buffer.from(compressed)
            : zlib.inflateRawSync(compressed);
        files.set(fileName, content);
      } catch {
        // Skip entries we cannot decompress rather than failing the whole archive.
      }
    }

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return files;
}

/**
 * Download and parse a package wheel, returning the cached result when fresh.
 * Returns null when no wheel distribution is available.
 */
async function loadArchive(
  packageName: string,
  version: string
): Promise<{ version: string; files: Map<string, Buffer> } | null> {
  const resolved = await resolveWheelUrl(packageName, version);
  if (!resolved) return null;

  const key = cacheKey(packageName, resolved.version);
  const cached = archiveCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { version: resolved.version, files: cached.files };
  }

  const resp = await fetch(resolved.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Failed to download wheel: ${resp.status}`);
  }

  const contentLength = Number(resp.headers.get("content-length") ?? "0");
  if (contentLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Wheel exceeds maximum supported size");
  }

  const arrayBuffer = await resp.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Wheel exceeds maximum supported size");
  }

  const files = parseZip(Buffer.from(arrayBuffer));
  archiveCache.set(key, { files, fetchedAt: Date.now() });
  logger.info("Parsed PyPI wheel", {
    packageName,
    version: resolved.version,
    fileCount: files.size,
  });

  return { version: resolved.version, files };
}

// ---------------------------------------------------------------------------
// Public API (mirrors the npm helpers in routes/package-search.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve a package's concrete latest version via the PyPI JSON API.
 */
export async function resolvePypiVersion(
  packageName: string,
  version?: string
): Promise<string> {
  if (version && version !== "latest") return version;
  const resp = await fetch(`${PYPI_JSON}/${encodeURIComponent(packageName)}/json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`PyPI returned ${resp.status} for ${packageName}`);
  }
  const data = (await resp.json()) as PypiJson;
  return data.info.version;
}

/**
 * List files (and synthesised directory entries) under `dirPath` for a wheel.
 * Returns an object containing the resolved version and the entries.
 */
export async function listPypiFiles(
  packageName: string,
  version: string,
  dirPath = ""
): Promise<{ version: string; files: PypiFileEntry[] }> {
  const archive = await loadArchive(packageName, version);
  if (!archive) {
    return { version: version || "latest", files: [] };
  }

  const normalizedDir = dirPath.replace(/^\/+|\/+$/g, "");
  const prefix = normalizedDir ? `${normalizedDir}/` : "";

  const entries = new Map<string, PypiFileEntry>();
  for (const [path, content] of archive.files) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (remainder.length === 0) continue;

    const slashIdx = remainder.indexOf("/");
    if (slashIdx === -1) {
      entries.set(remainder, {
        path: `${prefix}${remainder}`,
        type: "file",
        size: content.length,
      });
    } else {
      const dirName = remainder.slice(0, slashIdx);
      const dirKey = `${prefix}${dirName}`;
      if (!entries.has(dirKey)) {
        entries.set(dirKey, { path: dirKey, type: "directory" });
      }
    }
  }

  return {
    version: archive.version,
    files: Array.from(entries.values()).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/**
 * Read a single file's text contents from a wheel. Returns the resolved
 * version and the content (or null when the file is missing).
 */
export async function readPypiFile(
  packageName: string,
  version: string,
  filePath: string
): Promise<{ version: string; content: string | null }> {
  const archive = await loadArchive(packageName, version);
  if (!archive) {
    return { version: version || "latest", content: null };
  }
  const normalized = filePath.replace(/^\/+/, "");
  const buf = archive.files.get(normalized);
  return {
    version: archive.version,
    content: buf ? buf.toString("utf8") : null,
  };
}

/**
 * Return all Python/source-like files in a wheel as { path, content } for
 * grep/semantic scanning, capped to `limit` files.
 */
export async function readPypiSourceFiles(
  packageName: string,
  version: string,
  limit = 25
): Promise<{ version: string; files: Array<{ path: string; content: string }> }> {
  const archive = await loadArchive(packageName, version);
  if (!archive) {
    return { version: version || "latest", files: [] };
  }

  const sourceExt = /\.(py|pyi|pyx|txt|md|rst|cfg|toml|ini|json)$/i;
  const out: Array<{ path: string; content: string }> = [];
  for (const [path, content] of archive.files) {
    if (!sourceExt.test(path)) continue;
    out.push({ path, content: content.toString("utf8") });
    if (out.length >= limit) break;
  }

  return { version: archive.version, files: out };
}
