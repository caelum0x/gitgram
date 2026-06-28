'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  RotateCcw,
  Shield,
  AlertTriangle,
  CheckCircle,
  FileText,
  HardDrive,
  Calendar,
  Loader2,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// ---- Types ---------------------------------------------------------------

interface Session {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  projectPath: string;
  projectName: string;
  filesChanged: number;
  /** Real byte size, or null when the backend does not track it. */
  sizeBytes: number | null;
}

interface RestoreProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  /** null while running with no measurable progress (indeterminate). */
  percent: number | null;
  message: string;
}

// ---- Helpers -------------------------------------------------------------

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Success screen ------------------------------------------------------

function RestoreSuccess({ session }: { session: Session }) {
  return (
    <div className="flex flex-col items-center py-10 gap-5 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-900/40 border border-green-700">
        <CheckCircle className="w-8 h-8 text-green-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white">Restore complete</h2>
        <p className="text-gray-400 mt-1">
          Your project was restored to &ldquo;{session.name}&rdquo;.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/restore">Restore another</Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard/timeline">View all sessions</Link>
        </Button>
      </div>
    </div>
  );
}

// ---- Main page -----------------------------------------------------------

export default function SessionRestorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const successParam = searchParams.get('success') === 'true';

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [createBackup, setCreateBackup] = useState(true);
  const [progress, setProgress] = useState<RestoreProgress>({
    status: successParam ? 'done' : 'idle',
    percent: successParam ? 100 : 0,
    message: successParam ? 'Restore complete!' : '',
  });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/v1/sessions/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        return res.json() as Promise<Session>;
      })
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'Failed to load session');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleRestore = async () => {
    if (!session) return;
    // Single atomic restore call with no progress stream: show an honest
    // indeterminate running state, then 100% only on confirmed completion.
    setProgress({
      status: 'running',
      percent: null,
      message: createBackup ? 'Backing up and restoring…' : 'Restoring files…',
    });
    try {
      const res = await fetch('/api/v1/sessions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, createBackup }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setProgress({ status: 'done', percent: 100, message: 'Restore complete!' });
      router.replace(`/restore/${sessionId}?success=true`);
    } catch (err: unknown) {
      setProgress({
        status: 'error',
        percent: null,
        message: err instanceof Error ? err.message : 'Restore failed',
      });
    }
  };

  const isRunning = progress.status === 'running';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-start justify-center px-4 py-16">
        <div className="w-full max-w-xl">
          {/* Back link */}
          <Link
            href="/restore"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to restore wizard
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold">Restore checkpoint</h1>
            <p className="text-gray-400 mt-1">
              Confirm the details below and restore your project.
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading session…
            </div>
          )}

          {fetchError && (
            <div className="flex gap-3 rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300">{fetchError}</p>
            </div>
          )}

          {!loading && !fetchError && session && progress.status === 'done' && (
            <RestoreSuccess session={session} />
          )}

          {!loading && !fetchError && session && progress.status !== 'done' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    Checkpoint
                  </span>
                </div>
                <CardTitle>{session.name}</CardTitle>
                <CardDescription>{session.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Summary rows */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Project</span>
                    <span className="text-white font-medium">
                      {session.projectName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Path</span>
                    <span className="text-white font-mono text-xs truncate max-w-[60%]">
                      {session.projectPath}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Date</span>
                    <span className="text-white flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-500" />
                      {formatDate(session.createdAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Files affected</span>
                    <Badge variant="secondary">
                      <FileText className="w-3 h-3 mr-1" />
                      {session.filesChanged} files
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Size</span>
                    <span className="text-white flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-gray-500" />
                      {formatBytes(session.sizeBytes)}
                    </span>
                  </div>
                </div>

                {/* Warning */}
                <div className="flex gap-3 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-sm">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-200">
                    This will overwrite{' '}
                    <span className="font-semibold">{session.filesChanged} files</span>. Any
                    changes made after this checkpoint will be lost.
                  </p>
                </div>

                {/* Backup toggle */}
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Create backup first
                      </p>
                      <p className="text-xs text-gray-400">
                        Save current state before restoring
                      </p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={createBackup}
                    onClick={() => setCreateBackup((v) => !v)}
                    disabled={isRunning}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${
                      createBackup ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        createBackup ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Progress */}
                {progress.status !== 'idle' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className={
                          progress.status === 'error'
                            ? 'text-red-400'
                            : 'text-gray-300'
                        }
                      >
                        {progress.message}
                      </span>
                      {progress.percent !== null && (
                        <span className="text-gray-500">{progress.percent}%</span>
                      )}
                    </div>
                    {progress.percent !== null ? (
                      <Progress
                        value={progress.percent}
                        indicatorClassName={
                          progress.status === 'error' ? 'bg-red-600' : undefined
                        }
                      />
                    ) : (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                        <div className="h-full w-full animate-pulse rounded-full bg-blue-600/70" />
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                  <Button
                    variant="outline"
                    asChild
                    disabled={isRunning}
                  >
                    <Link href="/restore">Cancel</Link>
                  </Button>
                  <Button
                    onClick={handleRestore}
                    disabled={isRunning}
                    variant={
                      progress.status === 'error' ? 'destructive' : 'default'
                    }
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Restoring…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {progress.status === 'error' ? 'Retry restore' : 'Restore now'}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
