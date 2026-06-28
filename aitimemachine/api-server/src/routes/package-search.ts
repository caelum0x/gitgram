import { Router, Response } from "express";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import {
  listPypiFiles,
  readPypiFile,
  readPypiSourceFiles,
} from "../services/pypiArchive.js";

const router = Router();

router.use(apiKeyAuth);

// ============================================================================
// Registry API helpers
// ============================================================================

const REGISTRY_URLS: Record<string, string> = {
  npm: "https://registry.npmjs.org",
  pypi: "https://pypi.org/pypi",
  crates: "https://crates.io/api/v1/crates",
};

const UNPKG_URL = "https://unpkg.com";

interface NpmPackageInfo {
  name: string;
  description?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, any>;
  repository?: { type?: string; url?: string };
  license?: string;
  homepage?: string;
  time?: Record<string, string>;
}

interface PypiPackageInfo {
  info: {
    name: string;
    version: string;
    summary?: string;
    description?: string;
    home_page?: string;
    license?: string;
    project_urls?: Record<string, string>;
  };
  releases: Record<string, any[]>;
}

/**
 * Fetch npm package metadata
 */
async function fetchNpmInfo(packageName: string): Promise<NpmPackageInfo> {
  const url = `${REGISTRY_URLS.npm}/${encodeURIComponent(packageName)}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`npm registry returned ${resp.status} for ${packageName}`);
  }
  return resp.json() as Promise<NpmPackageInfo>;
}

/**
 * Fetch PyPI package metadata
 */
async function fetchPypiInfo(packageName: string): Promise<PypiPackageInfo> {
  const url = `${REGISTRY_URLS.pypi}/${encodeURIComponent(packageName)}/json`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`PyPI returned ${resp.status} for ${packageName}`);
  }
  return resp.json() as Promise<PypiPackageInfo>;
}

interface CratesPackageInfo {
  crate: {
    name: string;
    description?: string | null;
    max_stable_version?: string | null;
    max_version?: string | null;
    newest_version?: string | null;
    repository?: string | null;
    homepage?: string | null;
    documentation?: string | null;
  };
  versions?: Array<{ num: string; license?: string | null; yanked?: boolean }>;
}

/**
 * Fetch crates.io (Rust) crate metadata.
 */
async function fetchCratesInfo(packageName: string): Promise<CratesPackageInfo> {
  const url = `${REGISTRY_URLS.crates}/${encodeURIComponent(packageName)}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      // crates.io requires a descriptive User-Agent or it returns 403.
      "User-Agent": "gitgram-aitm-package-search (https://gitgram.app)",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`crates.io returned ${resp.status} for ${packageName}`);
  }
  return resp.json() as Promise<CratesPackageInfo>;
}

/**
 * Fetch file listing from unpkg (npm packages)
 */
async function fetchNpmFiles(
  packageName: string,
  version: string,
  dirPath: string
): Promise<Array<{ path: string; type: string; size?: number }>> {
  const base = `${UNPKG_URL}/${packageName}@${version}/${dirPath}`;
  const url = `${base}?meta`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as any;

  if (data.type === "directory" && Array.isArray(data.files)) {
    return data.files.map((f: any) => ({
      path: f.path,
      type: f.type || "file",
      size: f.size,
    }));
  }
  return [];
}

/**
 * Fetch file content from unpkg (npm packages)
 */
async function fetchNpmFileContent(
  packageName: string,
  version: string,
  filePath: string
): Promise<string | null> {
  const url = `${UNPKG_URL}/${packageName}@${version}/${filePath}`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  return resp.text();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /v1/package-search/info
 * Get package info and available versions
 */
router.get(
  "/info",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { registry, package_name } = req.query;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }

    const reg = (registry as string).toLowerCase();
    const pkg = package_name as string;

    if (reg === "npm") {
      const info = await fetchNpmInfo(pkg);
      const versions = info.versions
        ? Object.keys(info.versions).reverse().slice(0, 30)
        : [];
      const latest = info["dist-tags"]?.latest || versions[0] || null;

      res.json({
        registry: reg,
        package_name: pkg,
        description: info.description || null,
        latest_version: latest,
        versions,
        repository: info.repository?.url || null,
        license: info.license || null,
        homepage: info.homepage || null,
      });
    } else if (reg === "pypi") {
      const info = await fetchPypiInfo(pkg);
      const versions = Object.keys(info.releases).reverse().slice(0, 30);

      res.json({
        registry: reg,
        package_name: pkg,
        description: info.info.summary || null,
        latest_version: info.info.version,
        versions,
        repository:
          info.info.project_urls?.Source ||
          info.info.project_urls?.Repository ||
          info.info.home_page ||
          null,
        license: info.info.license || null,
        homepage: info.info.home_page || null,
      });
    } else if (reg === "crates" || reg === "cargo") {
      const info = await fetchCratesInfo(pkg);
      const versions = (info.versions ?? [])
        .filter((v) => !v.yanked)
        .map((v) => v.num)
        .slice(0, 30);
      const latest =
        info.crate.max_stable_version ||
        info.crate.newest_version ||
        info.crate.max_version ||
        versions[0] ||
        null;
      const license = info.versions?.find((v) => v.num === latest)?.license ?? null;

      res.json({
        registry: "crates",
        package_name: info.crate.name,
        description: info.crate.description || null,
        latest_version: latest,
        versions,
        repository: info.crate.repository || null,
        license,
        homepage: info.crate.homepage || info.crate.documentation || null,
      });
    } else {
      res.json({
        registry: reg,
        package_name: pkg,
        versions: [],
        latest_version: null,
        description: null,
        repository: null,
        message: `Registry "${reg}" is not yet supported for info. Supported: npm, pypi, crates`,
      });
    }
  })
);

/**
 * GET /v1/package-search/files
 * List files in a package
 */
router.get(
  "/files",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      registry,
      package_name,
      version,
      path: dirPath = "",
    } = req.query;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }

    const reg = (registry as string).toLowerCase();
    const pkg = package_name as string;

    if (reg === "npm") {
      // Resolve version
      let resolvedVersion = version as string;
      if (!resolvedVersion || resolvedVersion === "latest") {
        const info = await fetchNpmInfo(pkg);
        resolvedVersion = info["dist-tags"]?.latest || "latest";
      }

      const files = await fetchNpmFiles(
        pkg,
        resolvedVersion,
        (dirPath as string) || ""
      );

      res.json({
        registry: reg,
        package_name: pkg,
        version: resolvedVersion,
        path: dirPath || "/",
        files,
      });
    } else if (reg === "pypi") {
      const { version: resolvedVersion, files } = await listPypiFiles(
        pkg,
        version as string,
        (dirPath as string) || ""
      );
      res.json({
        registry: reg,
        package_name: pkg,
        version: resolvedVersion,
        path: dirPath || "/",
        files,
      });
    } else {
      res.json({
        registry: reg,
        package_name: pkg,
        version: version || "latest",
        path: dirPath || "/",
        files: [],
        message: `File listing for "${reg}" is not yet supported. Supported: npm, pypi`,
      });
    }
  })
);

/**
 * POST /v1/package-search/read-lines
 * Read specific lines from a package file
 */
router.post(
  "/read-lines",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      registry,
      package_name,
      file_path,
      start_line,
      end_line,
      version,
    } = req.body;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }
    if (!file_path) {
      throw Errors.missingParameter("file_path");
    }
    if (start_line === undefined) {
      throw Errors.missingParameter("start_line");
    }

    const reg = registry.toLowerCase();
    const endLine = end_line || start_line + 50;

    if (reg === "npm") {
      // Resolve version
      let resolvedVersion = version;
      if (!resolvedVersion || resolvedVersion === "latest") {
        const info = await fetchNpmInfo(package_name);
        resolvedVersion = info["dist-tags"]?.latest || "latest";
      }

      const content = await fetchNpmFileContent(
        package_name,
        resolvedVersion,
        file_path
      );

      if (!content) {
        res.json({
          registry: reg,
          package_name,
          version: resolvedVersion,
          file_path,
          start_line,
          end_line: endLine,
          content: null,
          message: `File not found: ${file_path}`,
        });
        return;
      }

      const lines = content.split("\n");
      const start = Math.max(0, start_line - 1);
      const end = Math.min(lines.length, endLine);
      const selectedLines = lines.slice(start, end);

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        file_path,
        start_line: start + 1,
        end_line: end,
        total_lines: lines.length,
        content: selectedLines.join("\n"),
      });
    } else if (reg === "pypi") {
      const { version: resolvedVersion, content } = await readPypiFile(
        package_name,
        version,
        file_path
      );

      if (!content) {
        res.json({
          registry: reg,
          package_name,
          version: resolvedVersion,
          file_path,
          start_line,
          end_line: endLine,
          content: null,
          message: `File not found: ${file_path}`,
        });
        return;
      }

      const lines = content.split("\n");
      const start = Math.max(0, start_line - 1);
      const end = Math.min(lines.length, endLine);
      const selectedLines = lines.slice(start, end);

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        file_path,
        start_line: start + 1,
        end_line: end,
        total_lines: lines.length,
        content: selectedLines.join("\n"),
      });
    } else {
      res.json({
        registry: reg,
        package_name,
        version: version || "latest",
        file_path,
        start_line,
        end_line: endLine,
        content: null,
        message: `File reading for "${reg}" is not yet supported. Supported: npm, pypi`,
      });
    }
  })
);

/**
 * POST /v1/package-search/grep
 * Search package source code with regex
 */
router.post(
  "/grep",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      registry,
      package_name,
      pattern,
      version,
      max_results = 50,
    } = req.body;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }
    if (!pattern) {
      throw Errors.missingParameter("pattern");
    }

    const validRegistries = ["npm", "pypi", "crates", "go"];
    if (!validRegistries.includes(registry.toLowerCase())) {
      throw Errors.invalidParameter(
        "registry",
        `Must be one of: ${validRegistries.join(", ")}`
      );
    }

    const reg = registry.toLowerCase();

    if (reg === "npm") {
      // Resolve version
      let resolvedVersion = version;
      if (!resolvedVersion || resolvedVersion === "latest") {
        const info = await fetchNpmInfo(package_name);
        resolvedVersion = info["dist-tags"]?.latest || "latest";
      }

      // Fetch file listing (top-level)
      const files = await fetchNpmFiles(package_name, resolvedVersion, "");
      const sourceFiles = files.filter(
        (f) =>
          f.type === "file" &&
          /\.(js|ts|jsx|tsx|mjs|cjs|json|md)$/.test(f.path)
      );

      if (pattern.length > 200) {
        throw Errors.invalidParameter(
          "pattern",
          "Pattern too long (max 200 chars)"
        );
      }

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "gm");
      } catch {
        throw Errors.invalidParameter(
          "pattern",
          "Invalid regex pattern"
        );
      }

      const results: Array<{
        file: string;
        line: number;
        content: string;
        match: string;
      }> = [];

      // Search through source files (limit to avoid excessive API calls)
      const filesToSearch = sourceFiles.slice(0, 20);
      for (const file of filesToSearch) {
        if (results.length >= max_results) break;

        const content = await fetchNpmFileContent(
          package_name,
          resolvedVersion,
          file.path.replace(/^\//, "")
        );
        if (!content) continue;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= max_results) break;
          regex.lastIndex = 0;
          const match = regex.exec(lines[i]);
          if (match) {
            results.push({
              file: file.path,
              line: i + 1,
              content: lines[i].trim().slice(0, 200),
              match: match[0],
            });
          }
        }
      }

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        pattern,
        results,
        total: results.length,
        files_searched: filesToSearch.length,
      });
    } else if (reg === "pypi") {
      if (pattern.length > 200) {
        throw Errors.invalidParameter("pattern", "Pattern too long (max 200 chars)");
      }
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "gm");
      } catch {
        throw Errors.invalidParameter("pattern", "Invalid regex pattern");
      }

      const { version: resolvedVersion, files } = await readPypiSourceFiles(
        package_name,
        version,
        20
      );

      const results: Array<{
        file: string;
        line: number;
        content: string;
        match: string;
      }> = [];

      for (const file of files) {
        if (results.length >= max_results) break;
        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= max_results) break;
          regex.lastIndex = 0;
          const match = regex.exec(lines[i]);
          if (match) {
            results.push({
              file: file.path,
              line: i + 1,
              content: lines[i].trim().slice(0, 200),
              match: match[0],
            });
          }
        }
      }

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        pattern,
        results,
        total: results.length,
        files_searched: files.length,
      });
    } else {
      res.json({
        registry: reg,
        package_name,
        version: version || "latest",
        pattern,
        results: [],
        total: 0,
        message: `Grep for "${reg}" is not yet supported. Supported: npm, pypi`,
      });
    }
  })
);

/**
 * POST /v1/package-search/semantic
 * Search package with semantic queries (text-based for now)
 */
router.post(
  "/semantic",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      registry,
      package_name,
      query,
      version,
      max_results = 20,
    } = req.body;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }
    if (!query) {
      throw Errors.missingParameter("query");
    }

    const reg = registry.toLowerCase();

    if (reg === "npm") {
      let resolvedVersion = version;
      if (!resolvedVersion || resolvedVersion === "latest") {
        const info = await fetchNpmInfo(package_name);
        resolvedVersion = info["dist-tags"]?.latest || "latest";
      }

      // Fetch file listing
      const files = await fetchNpmFiles(package_name, resolvedVersion, "");
      const sourceFiles = files.filter(
        (f) =>
          f.type === "file" &&
          /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f.path)
      );

      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t: string) => t.length > 2);

      const results: Array<{
        file: string;
        symbol?: string;
        symbol_type?: string;
        line: number;
        content: string;
        score: number;
      }> = [];

      // Search through files for symbols matching query terms
      const filesToSearch = sourceFiles.slice(0, 15);
      for (const file of filesToSearch) {
        const content = await fetchNpmFileContent(
          package_name,
          resolvedVersion,
          file.path.replace(/^\//, "")
        );
        if (!content) continue;

        // Extract symbols and score them
        const symbolPatterns = [
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
          /(?:export\s+)?class\s+(\w+)/g,
          /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
          /(?:export\s+)?interface\s+(\w+)/g,
          /(?:export\s+)?type\s+(\w+)/g,
        ];

        const lines = content.split("\n");

        for (const pat of symbolPatterns) {
          pat.lastIndex = 0;
          let match;
          while ((match = pat.exec(content)) !== null) {
            const name = match[1];
            if (!name) continue;

            const nameLower = name.toLowerCase();
            let score = 0;

            for (const term of queryTerms) {
              if (nameLower === term) score += 10;
              else if (nameLower.includes(term)) score += 5;
              else if (term.includes(nameLower)) score += 3;
            }

            // Check surrounding context
            const beforeMatch = content.slice(0, match.index);
            const lineNum = beforeMatch.split("\n").length;
            const contextStart = Math.max(0, lineNum - 2);
            const contextEnd = Math.min(lines.length, lineNum + 3);
            const context = lines.slice(contextStart, contextEnd).join("\n");

            for (const term of queryTerms) {
              if (context.toLowerCase().includes(term)) {
                score += 1;
              }
            }

            if (score > 0) {
              let symbolType = "variable";
              const matchText = match[0].toLowerCase();
              if (matchText.includes("function")) symbolType = "function";
              else if (matchText.includes("class")) symbolType = "class";
              else if (matchText.includes("interface")) symbolType = "interface";
              else if (matchText.includes("type")) symbolType = "type";

              results.push({
                file: file.path,
                symbol: name,
                symbol_type: symbolType,
                line: lineNum,
                content: context.slice(0, 300),
                score,
              });
            }
          }
        }
      }

      // Sort by score and limit
      results.sort((a, b) => b.score - a.score);
      const limited = results.slice(0, max_results);

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        query,
        results: limited,
        total: limited.length,
        files_searched: filesToSearch.length,
      });
    } else if (reg === "pypi") {
      const { version: resolvedVersion, files } = await readPypiSourceFiles(
        package_name,
        version,
        15
      );

      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t: string) => t.length > 2);

      const results: Array<{
        file: string;
        symbol?: string;
        symbol_type?: string;
        line: number;
        content: string;
        score: number;
      }> = [];

      // Python symbol patterns: functions and classes.
      const symbolPatterns: Array<{ re: RegExp; type: string }> = [
        { re: /^\s*(?:async\s+)?def\s+(\w+)/gm, type: "function" },
        { re: /^\s*class\s+(\w+)/gm, type: "class" },
      ];

      for (const file of files) {
        const lines = file.content.split("\n");
        for (const { re, type } of symbolPatterns) {
          re.lastIndex = 0;
          let match;
          while ((match = re.exec(file.content)) !== null) {
            const name = match[1];
            if (!name) continue;
            const nameLower = name.toLowerCase();
            let score = 0;
            for (const term of queryTerms) {
              if (nameLower === term) score += 10;
              else if (nameLower.includes(term)) score += 5;
              else if (term.includes(nameLower)) score += 3;
            }

            const beforeMatch = file.content.slice(0, match.index);
            const lineNum = beforeMatch.split("\n").length;
            const contextStart = Math.max(0, lineNum - 2);
            const contextEnd = Math.min(lines.length, lineNum + 3);
            const context = lines.slice(contextStart, contextEnd).join("\n");
            for (const term of queryTerms) {
              if (context.toLowerCase().includes(term)) score += 1;
            }

            if (score > 0) {
              results.push({
                file: file.path,
                symbol: name,
                symbol_type: type,
                line: lineNum,
                content: context.slice(0, 300),
                score,
              });
            }
          }
        }
      }

      results.sort((a, b) => b.score - a.score);
      const limited = results.slice(0, max_results);

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        query,
        results: limited,
        total: limited.length,
        files_searched: files.length,
      });
    } else {
      res.json({
        registry: reg,
        package_name,
        version: version || "latest",
        query,
        results: [],
        total: 0,
        message: `Semantic search for "${reg}" is not yet supported. Supported: npm, pypi`,
      });
    }
  })
);

/**
 * POST /v1/package-search/hybrid
 * Combined regex + semantic search
 */
router.post(
  "/hybrid",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      registry,
      package_name,
      patterns = [],
      semantic_queries = [],
      version,
      max_results = 30,
    } = req.body;

    if (!registry) {
      throw Errors.missingParameter("registry");
    }
    if (!package_name) {
      throw Errors.missingParameter("package_name");
    }
    if (patterns.length === 0 && semantic_queries.length === 0) {
      throw Errors.invalidRequest(
        "At least one pattern or semantic_query is required"
      );
    }

    const reg = registry.toLowerCase();

    if (reg === "npm") {
      let resolvedVersion = version;
      if (!resolvedVersion || resolvedVersion === "latest") {
        const info = await fetchNpmInfo(package_name);
        resolvedVersion = info["dist-tags"]?.latest || "latest";
      }

      // Fetch files
      const files = await fetchNpmFiles(package_name, resolvedVersion, "");
      const sourceFiles = files
        .filter(
          (f) =>
            f.type === "file" &&
            /\.(js|ts|jsx|tsx|mjs|cjs|json)$/.test(f.path)
        )
        .slice(0, 15);

      const grepResults: Array<{
        file: string;
        line: number;
        content: string;
        pattern: string;
        match: string;
      }> = [];

      const semanticResults: Array<{
        file: string;
        symbol?: string;
        line: number;
        content: string;
        query: string;
        score: number;
      }> = [];

      for (const file of sourceFiles) {
        const content = await fetchNpmFileContent(
          package_name,
          resolvedVersion,
          file.path.replace(/^\//, "")
        );
        if (!content) continue;

        const lines = content.split("\n");

        // Grep
        for (const pat of patterns) {
          if (grepResults.length >= max_results) break;
          let regex: RegExp;
          try {
            regex = new RegExp(pat, "gm");
          } catch {
            continue;
          }

          for (let i = 0; i < lines.length; i++) {
            if (grepResults.length >= max_results) break;
            regex.lastIndex = 0;
            const match = regex.exec(lines[i]);
            if (match) {
              grepResults.push({
                file: file.path,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
                pattern: pat,
                match: match[0],
              });
            }
          }
        }

        // Semantic (keyword matching)
        for (const q of semantic_queries) {
          const terms = q
            .toLowerCase()
            .split(/\s+/)
            .filter((t: string) => t.length > 2);
          for (let i = 0; i < lines.length; i++) {
            if (semanticResults.length >= max_results) break;
            const lineLower = lines[i].toLowerCase();
            let score = 0;
            for (const term of terms) {
              if (lineLower.includes(term)) score += 1;
            }
            if (score > 0) {
              semanticResults.push({
                file: file.path,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
                query: q,
                score,
              });
            }
          }
        }
      }

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        patterns,
        semantic_queries,
        results: {
          grep_results: grepResults,
          semantic_results: semanticResults.sort((a, b) => b.score - a.score),
        },
        total: grepResults.length + semanticResults.length,
        files_searched: sourceFiles.length,
      });
    } else if (reg === "pypi") {
      const { version: resolvedVersion, files } = await readPypiSourceFiles(
        package_name,
        version,
        15
      );

      const grepResults: Array<{
        file: string;
        line: number;
        content: string;
        pattern: string;
        match: string;
      }> = [];

      const semanticResults: Array<{
        file: string;
        symbol?: string;
        line: number;
        content: string;
        query: string;
        score: number;
      }> = [];

      for (const file of files) {
        const lines = file.content.split("\n");

        for (const pat of patterns) {
          if (grepResults.length >= max_results) break;
          let regex: RegExp;
          try {
            regex = new RegExp(pat, "gm");
          } catch {
            continue;
          }
          for (let i = 0; i < lines.length; i++) {
            if (grepResults.length >= max_results) break;
            regex.lastIndex = 0;
            const match = regex.exec(lines[i]);
            if (match) {
              grepResults.push({
                file: file.path,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
                pattern: pat,
                match: match[0],
              });
            }
          }
        }

        for (const q of semantic_queries) {
          const terms = q
            .toLowerCase()
            .split(/\s+/)
            .filter((t: string) => t.length > 2);
          for (let i = 0; i < lines.length; i++) {
            if (semanticResults.length >= max_results) break;
            const lineLower = lines[i].toLowerCase();
            let score = 0;
            for (const term of terms) {
              if (lineLower.includes(term)) score += 1;
            }
            if (score > 0) {
              semanticResults.push({
                file: file.path,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
                query: q,
                score,
              });
            }
          }
        }
      }

      res.json({
        registry: reg,
        package_name,
        version: resolvedVersion,
        patterns,
        semantic_queries,
        results: {
          grep_results: grepResults,
          semantic_results: semanticResults.sort((a, b) => b.score - a.score),
        },
        total: grepResults.length + semanticResults.length,
        files_searched: files.length,
      });
    } else {
      res.json({
        registry: reg,
        package_name,
        version: version || "latest",
        patterns,
        semantic_queries,
        results: {
          grep_results: [],
          semantic_results: [],
        },
        total: 0,
        message: `Hybrid search for "${reg}" is not yet supported. Supported: npm, pypi`,
      });
    }
  })
);

export default router;
