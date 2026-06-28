import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalPost } from '@/lib/internalApi';
import { findTemplate } from '@/lib/templates';

const bodySchema = z.object({
  templateId: z.string().min(1).max(100),
});

interface CreatedProject {
  project: { id: string; name: string; rootPath: string | null; createdAt: string };
}

/**
 * POST /api/v1/sessions/from-template
 * Validates the requested template against the catalogue, then creates a
 * real, user-owned project scaffolded from it. Returns the new project id as
 * `sessionId` (the website models an AITM "session" as a project timeline).
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
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    );
  }

  const template = findTemplate(parsed.data.templateId);
  if (!template) {
    return NextResponse.json(
      { error: `Unknown template: ${parsed.data.templateId}` },
      { status: 404 },
    );
  }

  const result = await internalPost<CreatedProject>('/projects', {
    userId,
    name: template.name,
    metadata: { templateId: template.id, source: 'website_templates' },
  });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to create session from template' },
      { status: result.status },
    );
  }

  return NextResponse.json({ sessionId: result.data.project.id }, { status: 201 });
}
