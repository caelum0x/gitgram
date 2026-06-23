import * as path from 'path';
import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  destructiveAnnotations,
  idempotentMutationAnnotations,
  mutatingAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

export const registerStorageTools = createToolRegistrar([
  defineTool({
    name: 'tm_s3_config',
    description: 'Configure S3 backup',
    schema: {
      bucket: z.string().min(1),
      prefix: z.string().optional(),
      region: z.string().optional(),
      profile: z.string().optional(),
    },
    annotations: idempotentMutationAnnotations({ openWorldHint: true }),
    run: async ({ bucket, prefix, region, profile }, runtime) => {
      const lib = await runtime.getLib();
      const s3 = new lib.S3Backup();
      const resolvedPrefix = prefix || 'aitimemachine';
      s3.configure(bucket, resolvedPrefix, region, profile);
      return textResponse(`S3 configured: s3://${bucket}/${resolvedPrefix}`);
    },
  }),
  defineTool({
    name: 'tm_s3_backup',
    description: 'Backup all data to S3',
    schema: {},
    annotations: idempotentMutationAnnotations({ openWorldHint: true }),
    run: async (_args, runtime) => {
      const lib = await runtime.getLib();
      const s3 = new lib.S3Backup();
      if (!s3.getConfig()) {
        throw new Error('S3 not configured. Use tm_s3_config first.');
      }
      return jsonResponse(await s3.backup());
    },
  }),
  defineTool({
    name: 'tm_s3_restore',
    description: 'Restore all data from S3',
    schema: {},
    annotations: destructiveAnnotations({ openWorldHint: true }),
    run: async (_args, runtime) => {
      const lib = await runtime.getLib();
      const s3 = new lib.S3Backup();
      if (!s3.getConfig()) {
        throw new Error('S3 not configured. Use tm_s3_config first.');
      }
      return jsonResponse(await s3.restore());
    },
  }),
  defineTool({
    name: 'tm_capsule_create',
    description: 'Create a Docker capsule for deterministic execution',
    schema: {
      projectPath: z.string().min(1),
      imageRef: z.string().min(1).describe('Docker image (e.g., node:20)'),
      workdir: z.string().optional(),
      env: z.record(z.string()).optional(),
    },
    annotations: mutatingAnnotations({ openWorldHint: true }),
    run: async ({ projectPath, imageRef, workdir, env }) => {
      const { execSync } = await import('child_process');

      try {
        execSync('docker --version', { stdio: 'pipe' });
      } catch {
        throw new Error('Docker not available');
      }

      const containerName = `aitm-${path.basename(projectPath).slice(0, 8)}-${Date.now()}`;
      const resolvedWorkdir = workdir || '/workspace';

      let createCommand = `docker create --name ${containerName} -v "${projectPath}:${resolvedWorkdir}" -w ${resolvedWorkdir}`;
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          createCommand += ` -e "${key}=${value}"`;
        }
      }
      createCommand += ` ${imageRef} tail -f /dev/null`;

      execSync(`docker rm -f ${containerName} 2>/dev/null || true`, { stdio: 'pipe' });
      execSync(createCommand, { stdio: 'pipe' });
      execSync(`docker start ${containerName}`, { stdio: 'pipe' });

      return jsonResponse({
        capsuleId: containerName,
        imageRef,
        workdir: resolvedWorkdir,
      });
    },
  }),
  defineTool({
    name: 'tm_capsule_exec',
    description: 'Execute a command inside a capsule container',
    schema: {
      capsuleId: z.string().min(1),
      command: z.string().min(1),
      cwd: z.string().optional(),
      timeoutMs: z.number().optional(),
    },
    annotations: mutatingAnnotations({ openWorldHint: true }),
    run: async ({ capsuleId, command, cwd, timeoutMs }) => {
      const { execSync } = await import('child_process');
      const escapedCommand = command.replace(/"/g, '\\"');
      const execCommand = cwd
        ? `docker exec -w "${cwd}" ${capsuleId} sh -c "${escapedCommand}"`
        : `docker exec ${capsuleId} sh -c "${escapedCommand}"`;

      try {
        const output = execSync(execCommand, {
          encoding: 'utf-8',
          timeout: timeoutMs || 60000,
          maxBuffer: 10 * 1024 * 1024,
        });

        return jsonResponse({ exitCode: 0, stdout: output, stderr: '' });
      } catch (error: any) {
        return jsonResponse({
          exitCode: error.status || 1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
        });
      }
    },
  }),
  defineTool({
    name: 'tm_capsule_stop',
    description: 'Stop and remove a capsule container',
    schema: {
      capsuleId: z.string().min(1),
    },
    annotations: destructiveAnnotations({ openWorldHint: true }),
    run: async ({ capsuleId }) => {
      const { execSync } = await import('child_process');
      try {
        execSync(`docker stop ${capsuleId}`, { stdio: 'pipe' });
        execSync(`docker rm ${capsuleId}`, { stdio: 'pipe' });
      } catch {}
      return textResponse(`Capsule ${capsuleId} stopped`);
    },
  }),
]);
