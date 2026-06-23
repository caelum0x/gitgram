import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Clock,
  GitBranch,
  Terminal,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Footer } from '@/components/Footer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Checkpoint {
  id: string;
  name: string;
  description: string | null;
  triggerType: string | null;
  createdAt: string | null;
}

interface SharedSession {
  session: {
    id: string;
    projectId: string;
    tool: string;
    startedAt: string | null;
    endedAt: string | null;
    metadata: Record<string, unknown> | null;
  };
  checkpoints: Checkpoint[];
  visibility: 'public' | 'private' | 'team';
  sharedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  expiresAt: string | null;
  shareId: string;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchSharedSession(shareId: string): Promise<SharedSession | null> {
  const apiBase =
    process.env.AITM_API_URL ||
    process.env.NEXT_PUBLIC_AITM_API_URL ||
    'https://api.timemachine.gitgram.app';

  try {
    const res = await fetch(`${apiBase}/v1/shared/${shareId}`, {
      next: { revalidate: 60 },
    });

    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) return null;

    return (await res.json()) as SharedSession;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function triggerLabel(triggerType: string | null): string {
  switch (triggerType) {
    case 'manual':
      return 'Manual save';
    case 'auto':
      return 'Auto-save';
    case 'before_action':
      return 'Before action';
    case 'after_action':
      return 'After action';
    default:
      return 'Checkpoint';
  }
}

function toolLabel(tool: string): string {
  const labels: Record<string, string> = {
    'claude-cli': 'Claude Code',
    cursor: 'Cursor',
    vscode: 'VS Code',
    windsurf: 'Windsurf',
    'claude-code': 'Claude Code',
  };
  return labels[tool] ?? tool;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BrandHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white select-none">
              A
            </div>
            <span className="text-white font-semibold text-sm">
              AI TimeMachine
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

interface SessionMetaProps {
  data: SharedSession;
}

function SessionMeta({ data }: SessionMetaProps) {
  const { session, checkpoints, sharedBy } = data;
  const duration =
    session.startedAt && session.endedAt
      ? Math.round(
          (new Date(session.endedAt).getTime() -
            new Date(session.startedAt).getTime()) /
            60_000
        )
      : null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              {toolLabel(session.tool)} session
            </span>
          </div>
          <h2 className="text-xl font-semibold text-white">
            {(session.metadata as Record<string, unknown> | null)?.projectName as string ??
              `Session ${session.id.slice(0, 8)}`}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Shared by{' '}
            <span className="text-gray-200">
              {sharedBy.name ?? sharedBy.email}
            </span>
          </p>
        </div>
        <Badge className="bg-blue-900/40 text-blue-300 border border-blue-800">
          {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
            Started
          </p>
          <p className="text-gray-200">{formatDate(session.startedAt)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
            Ended
          </p>
          <p className="text-gray-200">{formatDate(session.endedAt)}</p>
        </div>
        {duration !== null && (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
              Duration
            </p>
            <p className="text-gray-200">
              {duration < 60
                ? `${duration}m`
                : `${Math.floor(duration / 60)}h ${duration % 60}m`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface CheckpointTimelineProps {
  checkpoints: Checkpoint[];
}

function CheckpointTimeline({ checkpoints }: CheckpointTimelineProps) {
  if (checkpoints.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 text-center">
        <GitBranch className="h-8 w-8 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">No checkpoints in this session</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
          <Clock className="h-4 w-4 text-purple-400" />
          Checkpoint timeline
        </h3>
      </div>

      <ol className="divide-y divide-gray-800">
        {checkpoints.map((cp, idx) => (
          <li key={cp.id} className="flex items-start gap-4 px-5 py-4 group">
            {/* Sequence indicator */}
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-400 font-mono">
                {checkpoints.length - idx}
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-100 truncate">
                  {cp.name}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-500"
                >
                  {triggerLabel(cp.triggerType)}
                </Badge>
              </div>
              {cp.description && (
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                  {cp.description}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-600">
                {formatDate(cp.createdAt)}
                {cp.createdAt && (
                  <span className="ml-2 text-gray-700">
                    {relativeTime(cp.createdAt)}
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OpenInAitmButton({ sessionId }: { sessionId: string }) {
  const deepLink = `aitm://session/${sessionId}`;
  return (
    <a href={deepLink}>
      <Button className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-2">
        <ExternalLink className="h-4 w-4" />
        Open in AITM
      </Button>
    </a>
  );
}

function SignUpCta() {
  return (
    <div className="rounded-xl border border-blue-900/60 bg-blue-950/30 p-6 text-center">
      <Shield className="h-8 w-8 text-blue-400 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-white mb-1">
        Save your own sessions
      </h3>
      <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
        AI TimeMachine automatically checkpoints your workspace as you code, so
        you can undo any AI mistake in seconds.
      </p>
      <Link href="/sign-up">
        <Button className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 mx-auto">
          Sign up for free
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchSharedSession(id);

  if (!data) {
    return { title: 'Shared session not found | AI TimeMachine' };
  }

  const tool = toolLabel(data.session.tool);
  const count = data.checkpoints.length;

  return {
    title: `${tool} session (${count} checkpoint${count !== 1 ? 's' : ''}) | AI TimeMachine`,
    description: `A shared AI TimeMachine session from ${data.sharedBy.name ?? data.sharedBy.email}. View ${count} checkpoint${count !== 1 ? 's' : ''} captured during a ${tool} session.`,
  };
}

export default async function SharedSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchSharedSession(id);

  if (!data) {
    notFound();
  }

  const isExpired =
    data.expiresAt !== null && new Date(data.expiresAt) < new Date();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <BrandHeader />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          {/* Expiry warning */}
          {isExpired && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              This share link expired on {formatDate(data.expiresAt)}.
            </div>
          )}

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-600">
            <Link href="/" className="hover:text-gray-400 transition-colors">
              AI TimeMachine
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-gray-500">Shared session</span>
          </nav>

          {/* Session metadata card */}
          <SessionMeta data={data} />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <OpenInAitmButton sessionId={data.session.id} />
            <Link href="/sign-in">
              <Button
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Sign in to restore
              </Button>
            </Link>
          </div>

          {/* Checkpoint timeline */}
          <CheckpointTimeline checkpoints={data.checkpoints} />

          {/* Sign-up CTA */}
          <SignUpCta />
        </div>
      </main>

      <Footer />
    </div>
  );
}
