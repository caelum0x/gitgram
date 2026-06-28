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
 * Infer a coarse project language label from the project's directory *name*.
 *
 * The backend does not persist a real detected language, so this is best-effort
 * descriptive metadata only — it never affects restore behaviour and is
 * surfaced to the user explicitly as "(inferred)". To avoid the previous false
 * positives (e.g. any path containing the substring "go" -> Go), we only match
 * the final path segment against whole-word, anchored framework/tool markers
 * rather than scanning the entire path string. When no confident signal exists
 * we return `null`, and the route omits the field rather than guessing.
 */
function inferLanguage(rootPath: string | null): string | null {
  if (!rootPath) return null;
  // Use only the final directory segment; the full path often contains
  // unrelated words (usernames, "go" inside "google", etc.).
  const segment = rootPath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop()
    ?.toLowerCase();
  if (!segment) return null;

  // Each rule is an array of whole-word/anchored regexes. The path segment is
  // tokenised on common separators so "my-go-service" matches the `go` token
  // but "google-clone" does not.
  const tokens = segment.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (word: string): boolean => tokens.includes(word);

  if (has('node') || has('next') || has('nextjs') || has('react') || has('vue') || has('ts') || has('js')) {
    return 'JavaScript / TypeScript';
  }
  if (has('py') || has('python') || has('django') || has('fastapi') || has('flask')) {
    return 'Python';
  }
  if (has('go') || has('golang')) return 'Go';
  if (has('rust') || has('cargo')) return 'Rust';
  if (has('java') || has('kotlin') || has('gradle') || has('spring')) return 'JVM';

  return null;
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

  const language = inferLanguage(project.rootPath);

  return NextResponse.json({
    projectName: project.name,
    // Only include `language` when we have a confident inference, and mark it as
    // inferred so the UI never presents a guess as authoritative metadata.
    ...(language ? { language, languageInferred: true } : {}),
    sessionCount: project.checkpointCount,
    lastCheckpoint: project.lastCheckpointAt,
  });
}
