/**
 * crates.io archive access.
 *
 * crates.io publishes each release as a gzip-compressed tar (`.crate`) at the
 * static CDN. To list/read/grep file contents we download the `.crate`, gunzip
 * it, and parse the tar in memory using Node's built-in `zlib` — no third-party
 * dependency required. Mirrors the shape of pypiArchive so the package-search
 * routes can treat npm / pypi / crates uniformly.
 *
 * Downloaded+parsed archives are cached briefly to avoid re-downloading on
 * back-to-back list/read/grep calls for the same package version.
 */

import zlib from "node:zlib";
import { logger } from "../lib/monitoring.js";

const CRATES_API = "https://crates.io/api/v1/crates";
const CRATES_CDN = "https://static.crates.io/crates";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024; // 60 MB safety cap
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Source extensions worth grepping/embedding for a Rust crate.
const SOURCE_EXTENSIONS = /\.(rs|toml|md|txt|cfg|json|yaml|yml)$/i;

export interface CratesSourceFile {
  path: string;
  content: string;
}

interface ParsedArchive {
  files: Map<string, Buffer>;
  fetchedAt: number;
}

const archiveCache = new Map<string, ParsedArchive>();

function cacheKey(pkg: string, version: string): string {
  return `${pkg.toLowerCase()}@${version}`;
}

interface CratesVersionInfo {
  num: string;
  yanked: boolean;
}

interface CratesApiResponse {
  crate?: { max_stable_version?: string; max_version?: string; newest_version?: string };
  versions?: CratesVersionInfo[];
}

/**
 * Resolve the concrete version for a crate. Honors an explicit version,
 * otherwise picks the latest stable (falling back to the newest version).
 */
export async function resolveCratesVersion(
  packageName: string,
  version?: string
): Promise<string> {
  if (version && version !== "latest") {
    return version;
  }

  const resp = await fetch(`${CRATES_API}/${encodeURIComponent(packageName)}`, {
    headers: { Accept: "application/json", "User-Agent": "aitm-package-search" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`crates.io returned ${resp.status} for ${packageName}`);
  }
  const data = (await resp.json()) as CratesApiResponse;
  const resolved =
    data.crate?.max_stable_version ||
    data.crate?.max_version ||
    data.crate?.newest_version;
  if (!resolved) {
    throw new Error(`Could not resolve a version for crate ${packageName}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Minimal tar reader (USTAR / POSIX)
// ---------------------------------------------------------------------------

/**
 * Parse a (decompressed) tar buffer into a path -> contents map. Handles the
 * standard 512-byte header blocks, octal size fields, and GNU long-name
 * (typeflag 'L') extensions. Ignores directory and non-regular entries.
 */
function parseTar(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  let pendingLongName: string | null = null;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);

    // Two consecutive zero blocks mark end of archive.
    if (header.every((b) => b === 0)) break;

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeField, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);

    offset += 512;
    const dataStart = offset;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) break;

    if (typeFlag === "L") {
      // GNU long name: the entry data is the name of the next entry.
      pendingLongName = buf
        .subarray(dataStart, dataEnd)
        .toString("utf8")
        .replace(/\0.*$/, "");
    } else if (typeFlag === "0" || typeFlag === "\0" || typeFlag === "") {
      const name = pendingLongName ?? rawName;
      pendingLongName = null;
      if (name && !name.endsWith("/")) {
        files.set(name, buf.subarray(dataStart, dataEnd));
      }
    } else {
      pendingLongName = null;
    }

    // Advance past data, padded to 512-byte boundary.
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return files;
}

async function downloadAndParse(
  packageName: string,
  version: string
): Promise<ParsedArchive> {
  const key = cacheKey(packageName, version);
  const cached = archiveCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const url = `${CRATES_CDN}/${encodeURIComponent(packageName)}/${encodeURIComponent(
    packageName
  )}-${encodeURIComponent(version)}.crate`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "aitm-package-search" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`crates.io CDN returned ${resp.status} for ${url}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  if (arrayBuf.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`Crate archive too large (${arrayBuf.byteLength} bytes)`);
  }

  const gz = Buffer.from(arrayBuf);
  const tar = zlib.gunzipSync(gz);
  const files = parseTar(tar);

  const parsed: ParsedArchive = { files, fetchedAt: Date.now() };
  archiveCache.set(key, parsed);
  return parsed;
}

/**
 * Read the source files of a crate (decoded as UTF-8), limited to a sane count.
 * The leading "<name>-<version>/" directory prefix is stripped from paths.
 */
export async function readCratesSourceFiles(
  packageName: string,
  version: string | undefined,
  limit = 20
): Promise<{ version: string; files: CratesSourceFile[] }> {
  const resolvedVersion = await resolveCratesVersion(packageName, version);
  const archive = await downloadAndParse(packageName, resolvedVersion);

  const prefix = `${packageName}-${resolvedVersion}/`;
  const files: CratesSourceFile[] = [];

  for (const [rawPath, bytes] of archive.files) {
    if (files.length >= limit) break;
    if (!SOURCE_EXTENSIONS.test(rawPath)) continue;
    const path = rawPath.startsWith(prefix)
      ? rawPath.slice(prefix.length)
      : rawPath;
    try {
      files.push({ path, content: bytes.toString("utf8") });
    } catch (err) {
      logger.warn("cratesArchive: failed to decode file", {
        path: rawPath,
        details: String(err),
      });
    }
  }

  return { version: resolvedVersion, files };
}
