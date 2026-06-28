import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  destructiveAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

/**
 * Compile a single glob pattern into a RegExp matched against POSIX-style,
 * repository-relative paths.
 *
 * Supported syntax:
 *   - `**`  matches any number of path segments (including `/`)
 *   - `*`   matches any run of characters within a single segment (not `/`)
 *   - `?`   matches a single non-`/` character
 *
 * A pattern with no `/` (e.g. `*.ts`) is treated as a basename match so it
 * applies at any depth (matches `src/a.ts` as well as `a.ts`). Patterns that
 * contain a `/` are anchored to the repository root.
 */
function globToRegExp(pattern: string): RegExp {
  const hasSlash = pattern.includes('/');
  // Escape regex specials except the glob meta chars we expand below.
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**` (optionally followed by `/`) spans across path segments.
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          regex += '(?:.*/)?';
        } else {
          regex += '.*';
        }
      } else {
        regex += '[^/]*';
      }
    } else if (ch === '?') {
      regex += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      regex += `\\${ch}`;
    } else {
      regex += ch;
    }
  }
  // Basename-style patterns (no slash) may match at any depth.
  const body = hasSlash ? regex : `(?:.*/)?${regex}`;
  return new RegExp(`^${body}$`);
}

/** A path matches a pattern set if any compiled glob matches the relative path. */
function matchesAny(relPath: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(relPath));
}

async function readRepoAsText(repoPath: string, format: string, include: string[] | undefined, exclude: string[] | undefined, maxSize: number, fs: typeof import('fs'), path: typeof import('path')): Promise<unknown> {
  const lines: string[] = [];
  const includeGlobs = (include ?? []).map(globToRegExp);
  const excludeGlobs = (exclude ?? []).map(globToRegExp);

  function toRel(full: string): string {
    return path.relative(repoPath, full).split(path.sep).join('/');
  }

  function walk(dir: string) {
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      // Always skip dotfiles and node_modules — these are noise for LLM context.
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      let stat: ReturnType<typeof fs.statSync>;
      try { stat = fs.statSync(full); } catch { continue; }
      const rel = toRel(full);
      if (stat.isDirectory()) {
        // Honor directory-level excludes (e.g. "dist", "build/**") to prune walks.
        if (excludeGlobs.length > 0 && matchesAny(rel, excludeGlobs)) continue;
        walk(full);
        continue;
      }
      if (stat.size > maxSize) continue;
      if (excludeGlobs.length > 0 && matchesAny(rel, excludeGlobs)) continue;
      // When include patterns are supplied, a file must match at least one.
      if (includeGlobs.length > 0 && !matchesAny(rel, includeGlobs)) continue;
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (format === 'xml') {
          lines.push(`<file path="${rel}">${content}</file>`);
        } else {
          lines.push(`## ${rel}\n${content}`);
        }
      } catch { continue; }
    }
  }
  walk(repoPath);
  const separator = format === 'xml' ? '\n' : '\n---\n';
  const out = format === 'xml'
    ? `<repository path="${repoPath}">\n${lines.join(separator)}\n</repository>`
    : lines.join(separator);
  return textResponse(out);
}

export const registerFileTools = createToolRegistrar([
  defineTool({
    name: 'tm_restore_files',
    description: 'Restore specific files from a session (glob patterns)',
    schema: {
      sessionId: z.string().min(1),
      patterns: z
        .array(z.string())
        .min(1)
        .describe('Glob patterns (e.g., ["src/*", "*.json"])'),
      exclude: z.array(z.string()).optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: destructiveAnnotations(),
    run: async ({ sessionId, patterns, exclude, dryRun }, runtime) => {
      const lib = await runtime.getLib();
      const smart = new lib.SmartRestore();
      const result = smart.partialRestore(
        sessionId,
        runtime.getCurrentProjectPath(),
        patterns,
        {
          exclude,
          dryRun,
        }
      );
      return jsonResponse(result);
    },
  }),
  defineTool({
    name: 'tm_get_file_at',
    description: 'Get file content at a specific checkpoint',
    schema: {
      checkpointId: z.string().min(1),
      filePath: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ checkpointId, filePath, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const content = engine.getFileContent(checkpointId, filePath);
      if (!content) {
        throw new Error('File not found at checkpoint');
      }
      return textResponse(content);
    },
  }),
  defineTool({
    name: 'tm_file_history',
    description: 'Get history of a file across checkpoints',
    schema: {
      filePath: z.string().min(1),
      projectPath: z.string().optional(),
      limit: z.number().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ filePath, projectPath, limit }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const history = engine
        .listTimePoints()
        .slice(0, limit || 20)
        .map((tp: any) => {
          const content = engine.getFileContent(tp.id, filePath);
          return {
            checkpointId: tp.id,
            timestamp: tp.timestamp,
            description: tp.description,
            exists: !!content,
            size: content?.length || 0,
          };
        })
        .filter((entry: any) => entry.exists);

      return jsonResponse(history);
    },
  }),
  defineTool({
    name: 'tm_prompt_debug_regression',
    description: 'Generate a prompt to debug regression between two checkpoints',
    schema: {
      fromCheckpointId: z.string().min(1),
      toCheckpointId: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ fromCheckpointId, toCheckpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const diff = engine.getDiff(fromCheckpointId, toCheckpointId);

      const prompt = `## Debug Regression Analysis

### Changes between checkpoints:
- Added files: ${diff.added.length}
- Modified files: ${diff.modified.length}
- Deleted files: ${diff.deleted.length}

### Modified files:
${diff.modified.slice(0, 10).map((file: string) => `- ${file}`).join('\n')}

### Task:
Analyze these changes and identify:
1. What likely caused the regression
2. The minimal fix to resolve it
3. Tests to prevent this in the future`;

      return textResponse(prompt);
    },
  }),
  defineTool({
    name: 'tm_prompt_write_postmortem',
    description: 'Generate a prompt to write incident postmortem',
    schema: {
      fromCheckpointId: z.string().min(1),
      toCheckpointId: z.string().min(1),
      incidentDescription: z.string().optional(),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: (
      { fromCheckpointId, toCheckpointId, incidentDescription, projectPath },
      runtime
    ) => {
      const engine = runtime.getEngine(projectPath);
      const diff = engine.getDiff(fromCheckpointId, toCheckpointId);
      const fromCheckpoint = engine.getTimePoint(fromCheckpointId);
      const toCheckpoint = engine.getTimePoint(toCheckpointId);

      const prompt = `## Incident Postmortem Generator

### Timeline
- Start: ${fromCheckpoint?.timestamp} - ${fromCheckpoint?.description}
- End: ${toCheckpoint?.timestamp} - ${toCheckpoint?.description}
${incidentDescription ? `\n### Incident: ${incidentDescription}` : ''}

### Changes during incident:
- Files added: ${diff.added.length}
- Files modified: ${diff.modified.length}
- Files deleted: ${diff.deleted.length}

### Task:
Generate a postmortem including:
1. Summary
2. Timeline of events
3. Root cause
4. Impact
5. Resolution
6. Action items`;

      return textResponse(prompt);
    },
  }),
  defineTool({
    name: 'tm_prompt_generate_repro_steps',
    description: 'Generate reproduction steps from checkpoint history',
    schema: {
      checkpointId: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ checkpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const checkpoint = engine.getTimePoint(checkpointId);

      if (!checkpoint) {
        throw new Error('Checkpoint not found');
      }

      const prompt = `## Reproduction Steps Generator

### Checkpoint: ${checkpoint.description}
### Created: ${checkpoint.timestamp}
### Files: ${checkpoint.stats.totalFiles}

### Task:
Generate deterministic reproduction steps that:
1. Start from a clean environment
2. Set up required dependencies
3. Execute necessary commands
4. Verify expected state

Format as a shell script or step-by-step instructions.`;

      return textResponse(prompt);
    },
  }),
  defineTool({
    name: 'tm_repo_to_text',
    description:
      'Convert a repository or directory to a single text representation for LLM context, returned as structured XML/markdown/plain text. ' +
      'When the bundled repo-to-text Python tool is available it is used; otherwise a built-in fallback walks the tree directly. ' +
      'The fallback honors includePatterns/excludePatterns as globs (** spans directories, * stays within a path segment, patterns without "/" match by basename at any depth) and the maxFileSize byte cap, and always skips dotfiles and node_modules. ' +
      'The fallback does not perform repo-to-text-specific features such as .gitignore parsing or token budgeting.',
    schema: {
      repoPath: z.string().min(1).describe('Absolute path to the repository or directory to convert'),
      outputFormat: z.enum(['xml', 'markdown', 'plain']).optional().describe('Output format. Default: xml'),
      includePatterns: z.array(z.string()).optional().describe('File glob patterns to include (e.g. ["**/*.ts", "**/*.py"])'),
      excludePatterns: z.array(z.string()).optional().describe('File glob patterns to exclude'),
      maxFileSize: z.number().optional().describe('Max file size in bytes to include (default: 100000)'),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ repoPath, outputFormat = 'xml', includePatterns, excludePatterns, maxFileSize = 100000 }, runtime) => {
      const { execSync } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');
      const { fileURLToPath } = await import('url');

      // Locate the repo-to-text tool relative to this package
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const repoToTextPy = path.resolve(__dirname, '../../../../tools/repo-to-text/main.py');
      const repoToTextExists = fs.existsSync(repoToTextPy);

      if (!repoToTextExists) {
        // Fallback: use built-in recursive file reader
        return await readRepoAsText(repoPath, outputFormat, includePatterns, excludePatterns, maxFileSize, fs, path);
      }

      const args = [repoPath, '--format', outputFormat];
      if (includePatterns?.length) args.push('--include', includePatterns.join(','));
      if (excludePatterns?.length) args.push('--exclude', excludePatterns.join(','));

      try {
        const output = execSync(
          `python3 ${repoToTextPy} ${args.map(a => JSON.stringify(a)).join(' ')}`,
          {
            maxBuffer: 50 * 1024 * 1024,
            timeout: 60000,
          }
        ).toString();
        return textResponse(output);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`repo-to-text failed: ${msg}`);
      }
    },
  }),
]);
