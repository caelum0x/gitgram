import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import logger from '../utils/logger';

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.md', '.json',
]);

const MAX_FILES = 100;
const MAX_FILE_CHARS = 50000;

interface GitHubTreeItem {
  path: string;
  type: string;
  url: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
  download_url?: string;
}

function getExtension(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filePath.slice(dotIndex).toLowerCase();
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Convert a repository to a single XML text blob
 * POST /api/v1/tools/repo-to-text
 */
export const repoToTextHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { repoUrl } = req.body;

  if (!repoUrl || typeof repoUrl !== 'string') {
    throw Errors.badRequest('repoUrl is required');
  }

  // Validate GitHub URL
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw Errors.badRequest('repoUrl must be a valid URL');
  }

  if (parsed.hostname !== 'github.com') {
    throw Errors.badRequest('repoUrl must be a GitHub URL (github.com)');
  }

  const repoInfo = parseGitHubUrl(repoUrl);
  if (!repoInfo) {
    throw Errors.badRequest('Could not parse owner/repo from repoUrl');
  }

  const { owner, repo } = repoInfo;
  const headers = buildAuthHeaders();

  // Fetch the git tree
  let treeData: GitHubTreeResponse;
  try {
    const treeResponse = await axios.get<GitHubTreeResponse>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers }
    );
    treeData = treeResponse.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404) {
        throw Errors.notFound(`Repository ${owner}/${repo}`);
      }
      if (status === 403 || status === 429) {
        throw Errors.badRequest('GitHub API rate limit exceeded or access forbidden');
      }
    }
    logger.error('Failed to fetch GitHub tree', err);
    throw Errors.badRequest('Failed to fetch repository tree from GitHub');
  }

  // Filter to allowed file extensions, blob only
  const filteredFiles = treeData.tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        item.path &&
        ALLOWED_EXTENSIONS.has(getExtension(item.path))
    )
    .slice(0, MAX_FILES);

  // Fetch file contents in parallel
  const fileResults = await Promise.all(
    filteredFiles.map(async (item) => {
      try {
        const contentResponse = await axios.get<GitHubContentResponse>(
          `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`,
          { headers }
        );

        const data = contentResponse.data;
        let content = '';

        if (data.encoding === 'base64' && data.content) {
          const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
          content = decoded.slice(0, MAX_FILE_CHARS);
        } else if (data.download_url) {
          const rawResponse = await axios.get<string>(data.download_url, {
            responseType: 'text',
          });
          content = (rawResponse.data as string).slice(0, MAX_FILE_CHARS);
        }

        return { path: item.path, content };
      } catch (err: unknown) {
        logger.error(`Failed to fetch file content for ${item.path}`, err);
        return { path: item.path, content: '' };
      }
    })
  );

  // Build XML output
  const xmlParts: string[] = [`<repository url="${repoUrl}">`];
  for (const { path, content } of fileResults) {
    // Escape XML special characters in content
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    xmlParts.push(`  <file path="${path}">${escaped}</file>`);
  }
  xmlParts.push('</repository>');

  const result = xmlParts.join('\n');
  const estimatedTokens = Math.round(result.length / 4);

  res.json({
    success: true,
    xml: result,
    fileCount: fileResults.length,
    estimatedTokens,
  });
});

export default {
  repoToTextHandler,
};
