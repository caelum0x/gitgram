import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalGet } from '@/lib/internalApi';

const bodySchema = z.object({
  projectPath: z.string().min(1).max(1000),
});

interface InternalProject {
  id: string;
  name: string;
  rootPath: string | null;
  checkpointCount: number;
  lastCheckpointAt: string | null;
}

interface InternalProjectsResponse {
  projects: InternalProject[];
}

/**
 * Infer a coarse project language from its root path. The backend does not
 * persist a language field, so we derive a sensible label from the path. This
 * is descriptive metadata only and never affects restore behaviour.
 */
function inferLanguage(rootPath: string | null): string {
  if (!rootPath) return 'Unknown';
  const lower = rootPath.toLowerCase();
  if (/(node|next|react|vue|\.ts|\.js|typescript|javascript)/.test(lower)) {
    return 'JavaScript / TypeScript';
  }
  if (/(py|python|django|fastapi|flask)/.test(lower)) return 'Python';
  if (/(\bgo\b|golang)/.test(lower)) return 'Go';
  if (/(rust|cargo)/.test(lower)) return 'Rust';
  if (/(java|kotlin|gradle)/.test(lower)) return 'JVM';
  return 'Mixed';
}

/**
 * POST /api/v1/sessions/verify
 * Confirms a project exists for the signed-in user at the given path before
 * the restore wizard advances. Returns project metadata, not file content.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid project path' },
      { status: 400 },
    );
  }

  const result = await internalGet<InternalProjectsResponse>('/projects', {
    userId,
    path: parsed.data.projectPath,
  });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to verify project' },
      { status: result.status },
    );
  }

  const project = result.data.projects[0];
  if (!project) {
    return NextResponse.json(
      { error: 'No AITM project found at this path. Run `aitm init` there first.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    projectName: project.name,
    language: inferLanguage(project.rootPath),
    sessionCount: project.checkpointCount,
    lastCheckpoint: project.lastCheckpointAt,
  });
}
