import { Octokit } from '@octokit/rest';
import logger from '../utils/logger';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;

const DEFAULT_MAX_FILES = 60;
const MAX_FILES_CAP = 200;
const DEFAULT_MAX_FILE_BYTES = 20_000;
const MAX_FILE_BYTES_CAP = 100_000;

const DEFAULT_IGNORED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  'node_modules',
  'coverage',
  'dist',
  'build',
  'tmp',
  'temp',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  'Pods',
  'target',
]);

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.aac',
  '.ai',
  '.avif',
  '.bin',
  '.bmp',
  '.class',
  '.db',
  '.dll',
  '.dylib',
  '.eot',
  '.exe',
  '.flac',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.obj',
  '.otf',
  '.pdf',
  '.png',
  '.pyc',
  '.rar',
  '.so',
  '.sqlite',
  '.svgz',
  '.tar',
  '.tiff',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

interface RepositoryTreeFile {
  path: string;
  sha?: string;
  size?: number;
}

interface GitignoreRule {
  negate: boolean;
  regex: RegExp;
}

interface RepoTextSection {
  path: string;
  content: string;
}

export interface RepoTextExportOptions {
  maxFiles?: number;
  maxFileBytes?: number;
}

export interface RepoTextExportResult {
  content: string;
  filename: string;
  stats: {
    totalFiles: number;
    includedFiles: number;
    skippedIgnored: number;
    skippedBinary: number;
    skippedLarge: number;
    skippedAfterLimit: number;
    treeTruncated: boolean;
  };
}

export class RepoTextExportService {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({ auth: GITHUB_TOKEN });
  }

  async exportRepositoryToText(
    owner: string,
    repo: string,
    options: RepoTextExportOptions = {}
  ): Promise<RepoTextExportResult> {
    const maxFiles = clampInteger(options.maxFiles, DEFAULT_MAX_FILES, 1, MAX_FILES_CAP);
    const maxFileBytes = clampInteger(
      options.maxFileBytes,
      DEFAULT_MAX_FILE_BYTES,
      1_000,
      MAX_FILE_BYTES_CAP
    );

    try {
      const { data: repository } = await this.octokit.repos.get({ owner, repo });
      const { data: tree } = await this.octokit.git.getTree({
        owner,
        repo,
        tree_sha: repository.default_branch,
        recursive: 'true',
      });

      const files = tree.tree
        .filter((entry): entry is typeof entry & { path: string; type: 'blob' } => {
          return entry.type === 'blob' && typeof entry.path === 'string';
        })
        .map(
          (entry): RepositoryTreeFile => ({
            path: entry.path,
            sha: entry.sha,
            size: typeof entry.size === 'number' ? entry.size : undefined,
          })
        )
        .sort(compareExportPaths);

      const gitignoreRules = await this.loadGitignoreRules(owner, repo, files);
      const stats = {
        totalFiles: files.length,
        includedFiles: 0,
        skippedIgnored: 0,
        skippedBinary: 0,
        skippedLarge: 0,
        skippedAfterLimit: 0,
        treeTruncated: tree.truncated === true,
      };

      const treePaths: string[] = [];
      const selectedFiles: RepositoryTreeFile[] = [];

      for (const file of files) {
        if (this.shouldIgnorePath(file.path, gitignoreRules)) {
          stats.skippedIgnored += 1;
          continue;
        }

        treePaths.push(file.path);

        if (isBinaryPath(file.path)) {
          stats.skippedBinary += 1;
          continue;
        }

        if (typeof file.size === 'number' && file.size > maxFileBytes) {
          stats.skippedLarge += 1;
          continue;
        }

        if (selectedFiles.length >= maxFiles) {
          stats.skippedAfterLimit += 1;
          continue;
        }

        selectedFiles.push(file);
      }

      const sections: RepoTextSection[] = [];
      for (const file of selectedFiles) {
        const content = await this.fetchTextFile(owner, repo, file);
        if (content === null) {
          stats.skippedBinary += 1;
          continue;
        }

        if (Buffer.byteLength(content, 'utf8') > maxFileBytes) {
          stats.skippedLarge += 1;
          continue;
        }

        sections.push({ path: file.path, content });
      }

      stats.includedFiles = sections.length;

      const document = buildRepoToTextDocument({
        owner,
        repo,
        htmlUrl: repository.html_url,
        branch: repository.default_branch,
        maxFiles,
        maxFileBytes,
        stats,
        treePaths,
        sections,
      });

      return {
        content: document,
        filename: `${owner}-${repo}-repo-to-text.txt`,
        stats,
      };
    } catch (error) {
      logger.error(`Failed to export repository text for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  private async loadGitignoreRules(
    owner: string,
    repo: string,
    files: RepositoryTreeFile[]
  ): Promise<GitignoreRule[]> {
    const gitignoreEntry = files.find((file) => file.path === '.gitignore' && file.sha);
    if (!gitignoreEntry?.sha) {
      return [];
    }

    try {
      const content = await this.fetchTextFile(owner, repo, gitignoreEntry);
      if (!content) {
        return [];
      }

      return content
        .split('\n')
        .map((line) => compileGitignoreRule(line))
        .filter((rule): rule is GitignoreRule => rule !== null);
    } catch (error) {
      logger.warn(`Failed to load .gitignore for ${owner}/${repo}`, error);
      return [];
    }
  }

  private async fetchTextFile(
    owner: string,
    repo: string,
    file: RepositoryTreeFile
  ): Promise<string | null> {
    if (!file.sha) {
      return null;
    }

    const { data } = await this.octokit.git.getBlob({
      owner,
      repo,
      file_sha: file.sha,
    });

    const raw = typeof data.content === 'string' ? data.content.replace(/\n/g, '') : '';
    const buffer =
      data.encoding === 'base64' ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8');

    if (looksBinaryBuffer(buffer)) {
      return null;
    }

    return buffer.toString('utf8').replace(/\r\n/g, '\n').trimEnd();
  }

  private shouldIgnorePath(path: string, gitignoreRules: GitignoreRule[]): boolean {
    const segments = path.split('/');
    if (segments.some((segment) => DEFAULT_IGNORED_SEGMENTS.has(segment))) {
      return true;
    }

    let ignored = false;
    for (const rule of gitignoreRules) {
      if (rule.regex.test(path)) {
        ignored = !rule.negate;
      }
    }

    return ignored;
  }
}

function buildRepoToTextDocument(input: {
  owner: string;
  repo: string;
  htmlUrl: string;
  branch: string;
  maxFiles: number;
  maxFileBytes: number;
  stats: RepoTextExportResult['stats'];
  treePaths: string[];
  sections: RepoTextSection[];
}): string {
  const tree = renderDirectoryTree(input.treePaths);

  const lines = [
    '<repo-to-text>',
    `Repository: ${input.owner}/${input.repo}`,
    `Source: ${input.htmlUrl}`,
    `Branch: ${input.branch}`,
    `Generated-At: ${new Date().toISOString()}`,
    `Included-Files: ${input.stats.includedFiles}/${input.stats.totalFiles}`,
    `Skipped-Ignored: ${input.stats.skippedIgnored}`,
    `Skipped-Binary: ${input.stats.skippedBinary}`,
    `Skipped-Large: ${input.stats.skippedLarge}`,
    `Skipped-After-Limit: ${input.stats.skippedAfterLimit}`,
    `Export-Limits: maxFiles=${input.maxFiles}, maxFileBytes=${input.maxFileBytes}`,
    input.stats.treeTruncated
      ? 'Note: GitHub returned a truncated recursive tree for this repository.'
      : null,
    '',
    'Directory Structure:',
    '<directory_structure>',
    ...tree,
    '</directory_structure>',
    '',
    ...input.sections.flatMap((section) => [
      `<content full_path="${section.path}">`,
      section.content,
      '</content>',
      '',
    ]),
    '</repo-to-text>',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}

function renderDirectoryTree(paths: string[]): string[] {
  const root: TreeNode = { children: new Map(), isFile: false };

  for (const path of paths) {
    const segments = path.split('/').filter(Boolean);
    let current = root;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isFile = index === segments.length - 1;
      const existing = current.children.get(segment) || {
        children: new Map<string, TreeNode>(),
        isFile,
      };

      if (isFile) {
        existing.isFile = true;
      }

      current.children.set(segment, existing);
      current = existing;
    }
  }

  return ['.', ...renderTreeChildren(root, '')];
}

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function renderTreeChildren(node: TreeNode, prefix: string): string[] {
  const entries = [...node.children.entries()].sort(([nameA, nodeA], [nameB, nodeB]) => {
    const nodeAIsDirectory = !nodeA.isFile;
    const nodeBIsDirectory = !nodeB.isFile;
    if (nodeAIsDirectory !== nodeBIsDirectory) {
      return nodeAIsDirectory ? -1 : 1;
    }
    return nameA.localeCompare(nameB);
  });

  const lines: string[] = [];

  entries.forEach(([name, child], index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
    lines.push(`${prefix}${connector}${name}`);

    if (!child.isFile) {
      lines.push(...renderTreeChildren(child, childPrefix));
    }
  });

  return lines;
}

function compileGitignoreRule(line: string): GitignoreRule | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const negate = trimmed.startsWith('!');
  const body = negate ? trimmed.slice(1).trim() : trimmed;
  const cleaned = body.replace(/\/+$/, '');
  if (!cleaned) {
    return null;
  }

  const anchored = cleaned.startsWith('/');
  const pattern = anchored ? cleaned.slice(1) : cleaned;
  const basenameOnly = !pattern.includes('/');
  const wildcardPattern = escapeRegex(pattern)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]');

  const source = basenameOnly
    ? `(^|/)${wildcardPattern}($|/)`
    : anchored
      ? `^${wildcardPattern}($|/)`
      : `(^|/)${wildcardPattern}($|/)`;

  return {
    negate,
    regex: new RegExp(source),
  };
}

function looksBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) {
    return false;
  }

  let suspiciousBytes = 0;
  for (const byte of sample) {
    const isWhitespace = byte === 9 || byte === 10 || byte === 13;
    if (!isWhitespace && byte < 32) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / sample.length > 0.1;
}

function compareExportPaths(a: RepositoryTreeFile, b: RepositoryTreeFile): number {
  const aDepth = a.path.split('/').length;
  const bDepth = b.path.split('/').length;
  if (aDepth !== bDepth) {
    return aDepth - bDepth;
  }
  return a.path.localeCompare(b.path);
}

function isBinaryPath(path: string): boolean {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1) {
    return false;
  }
  return BINARY_EXTENSIONS.has(path.slice(lastDot).toLowerCase());
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export const repoTextExportService = new RepoTextExportService();
