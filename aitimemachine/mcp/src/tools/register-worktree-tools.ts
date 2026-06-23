import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  destructiveAnnotations,
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

export const registerWorktreeTools = createToolRegistrar([
  defineTool({
    name: 'tm_worktree_restore',
    description:
      'Restore a checkpoint into an isolated git worktree instead of the working directory',
    schema: {
      checkpointId: z.string().min(1).describe('Checkpoint ID to restore'),
      projectPath: z
        .string()
        .optional()
        .describe('Project path (defaults to current)'),
    },
    annotations: mutatingAnnotations(),
    run: async ({ checkpointId, projectPath }, runtime) => {
      const resolvedPath = runtime.resolveProjectPath(projectPath);
      const engine = runtime.getEngine(resolvedPath);
      const match = engine
        .listTimePoints()
        .find(
          (timepoint: { id: string }) =>
            timepoint.id === checkpointId || timepoint.id.startsWith(checkpointId)
        );

      if (!match) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      const libPath = await runtime.resolveLibPath();
      const { WorktreeManager } = await import(
        path.join(libPath, 'server/worktree-manager.js')
      );
      const manager = new WorktreeManager(resolvedPath);
      const worktree = manager.createRestoreWorktree(match.id);

      const timepoint = engine.getTimePoint(match.id);
      if (!timepoint) {
        throw new Error(`Could not load checkpoint data: ${match.id}`);
      }

      const files: string[] = [];
      let filesWritten = 0;
      let filesSkipped = 0;

      for (const file of timepoint.files) {
        const content = engine.getFileAt(match.id, file.path);
        if (content === null) {
          filesSkipped++;
          continue;
        }

        const destination = path.join(worktree.path, file.path);
        const destinationDir = path.dirname(destination);
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true });
        }
        fs.writeFileSync(destination, content);
        files.push(file.path);
        filesWritten++;
      }

      return jsonResponse({
        worktreePath: worktree.path,
        branch: worktree.branch,
        checkpointId: match.id,
        description: match.description,
        filesWritten,
        filesSkipped,
        files: files.slice(0, 50),
        totalFiles: files.length,
      });
    },
  }),
  defineTool({
    name: 'tm_worktree_list',
    description: 'List active AITM worktrees for the current project',
    schema: {
      projectPath: z
        .string()
        .optional()
        .describe('Project path (defaults to current)'),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ projectPath }, runtime) => {
      const resolvedPath = runtime.resolveProjectPath(projectPath);
      const libPath = await runtime.resolveLibPath();
      const { WorktreeManager } = await import(
        path.join(libPath, 'server/worktree-manager.js')
      );
      const manager = new WorktreeManager(resolvedPath);
      const worktrees = manager.listWorktrees();

      return jsonResponse({
        count: worktrees.length,
        worktrees: worktrees.map(
          (worktree: {
            path: string;
            branch: string;
            checkpointId: string;
            createdAt: string;
          }) => ({
            path: worktree.path,
            branch: worktree.branch,
            checkpointId: worktree.checkpointId,
            createdAt: worktree.createdAt,
          })
        ),
      });
    },
  }),
  defineTool({
    name: 'tm_worktree_cleanup',
    description: 'Remove all AITM worktrees for the current project',
    schema: {
      projectPath: z
        .string()
        .optional()
        .describe('Project path (defaults to current)'),
    },
    annotations: destructiveAnnotations(),
    run: async ({ projectPath }, runtime) => {
      const resolvedPath = runtime.resolveProjectPath(projectPath);
      const libPath = await runtime.resolveLibPath();
      const { WorktreeManager } = await import(
        path.join(libPath, 'server/worktree-manager.js')
      );
      const manager = new WorktreeManager(resolvedPath);
      const removed = manager.cleanupAll();

      return jsonResponse({
        removed,
        message:
          removed === 0
            ? 'No AITM worktrees to clean up'
            : `Removed ${removed} worktree${removed !== 1 ? 's' : ''}`,
      });
    },
  }),
]);
