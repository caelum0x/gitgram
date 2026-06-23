'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderOpen,
  Clock,
  CheckCircle,
  ChevronRight,
  Search,
  AlertTriangle,
  Shield,
  RotateCcw,
  FileText,
  HardDrive,
  Calendar,
  Loader2,
} from 'lucide-react';
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

interface ProjectVerification {
  projectName: string;
  language: string;
  sessionCount: number;
  lastCheckpoint: string | null;
}

interface Session {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  filesChanged: number;
  sizeBytes: number;
}

interface RestoreProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  percent: number;
  message: string;
}

type WizardStep = 1 | 2 | 3;

// ---- Helpers -------------------------------------------------------------

const RECENT_PROJECTS_KEY = 'aitm_recent_projects';

function loadRecentProjects(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentProject(path: string): void {
  const existing = loadRecentProjects();
  const updated = [path, ...existing.filter((p) => p !== path)].slice(0, 5);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
}

function formatBytes(bytes: number): string {
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

// ---- Step indicator ------------------------------------------------------

interface StepIndicatorProps {
  current: WizardStep;
}

const STEPS = [
  { label: 'Select Project', icon: FolderOpen },
  { label: 'Choose Checkpoint', icon: Clock },
  { label: 'Confirm Restore', icon: CheckCircle },
];

function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((step, idx) => {
        const stepNum = (idx + 1) as WizardStep;
        const Icon = step.icon;
        const done = current > stepNum;
        const active = current === stepNum;
        return (
          <div key={step.label} className="flex items-center">
            <div
              className={`flex flex-col items-center gap-1 ${active ? 'opacity-100' : done ? 'opacity-80' : 'opacity-40'}`}
            >
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors ${
                  done
                    ? 'bg-blue-600 border-blue-600'
                    : active
                      ? 'border-blue-500 bg-gray-900'
                      : 'border-gray-700 bg-gray-900'
                }`}
              >
                {done ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Icon
                    className={`w-4 h-4 ${active ? 'text-blue-400' : 'text-gray-500'}`}
                  />
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${active ? 'text-white' : 'text-gray-500'}`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-16 h-px mx-2 mb-5 transition-colors ${done ? 'bg-blue-600' : 'bg-gray-700'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Step 1: Select Project ----------------------------------------------

interface Step1Props {
  onVerified: (path: string, info: ProjectVerification) => void;
}

function Step1SelectProject({ onVerified }: Step1Props) {
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<ProjectVerification | null>(null);

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
  }, []);

  const verifyProject = useCallback(
    async (path: string) => {
      if (!path.trim()) {
        setError('Please enter a project path.');
        return;
      }
      setVerifying(true);
      setError(null);
      setVerified(null);
      try {
        const res = await fetch('/api/v1/sessions/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath: path.trim() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        const data: ProjectVerification = await res.json();
        setVerified(data);
        saveRecentProject(path.trim());
        setRecentProjects(loadRecentProjects());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setVerifying(false);
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300">
          Project path
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verifyProject(projectPath)}
            placeholder="/path/to/your/project"
            className="flex-1 h-10 rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button
            variant="outline"
            onClick={() => {
              const val = prompt('Paste your project path:');
              if (val) setProjectPath(val.trim());
            }}
          >
            <FolderOpen className="w-4 h-4 mr-1" /> Browse
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
      </div>

      {recentProjects.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Recent projects
          </p>
          <div className="space-y-1">
            {recentProjects.map((p) => (
              <button
                key={p}
                onClick={() => setProjectPath(p)}
                className="w-full text-left px-3 py-2 rounded-lg border border-gray-800 bg-gray-900 hover:border-gray-600 text-sm text-gray-300 truncate transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {verified && (
        <Card className="border-green-800 bg-green-950/30">
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-medium">
              <CheckCircle className="w-4 h-4" />
              Project verified
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Name</p>
                <p className="text-white font-medium">{verified.projectName}</p>
              </div>
              <div>
                <p className="text-gray-500">Language</p>
                <p className="text-white font-medium">{verified.language}</p>
              </div>
              <div>
                <p className="text-gray-500">Checkpoints</p>
                <p className="text-white font-medium">{verified.sessionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button
          onClick={() => verifyProject(projectPath)}
          disabled={verifying || !projectPath.trim()}
          variant="outline"
        >
          {verifying ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          {verifying ? 'Verifying…' : 'Verify project'}
        </Button>
        <Button
          disabled={!verified}
          onClick={() => verified && onVerified(projectPath.trim(), verified)}
        >
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ---- Step 2: Choose Checkpoint -------------------------------------------

interface Step2Props {
  projectPath: string;
  onSelected: (session: Session) => void;
  onBack: () => void;
}

function Step2ChooseCheckpoint({ projectPath, onSelected, onBack }: Step2Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/sessions?projectPath=${encodeURIComponent(projectPath)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        return res.json() as Promise<{ sessions: Session[] }>;
      })
      .then(({ sessions: data }) => {
        if (!cancelled) setSessions(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load checkpoints');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const filtered = sessions.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search checkpoints…"
          className="w-full h-10 rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading checkpoints…
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" /> {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No checkpoints found.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {filtered.map((session) => {
            const isSelected = selected?.id === session.id;
            return (
              <button
                key={session.id}
                onClick={() => setSelected(isSelected ? null : session)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{session.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                      {session.description}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(session.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {session.filesChanged} files
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" />
                    {formatBytes(session.sizeBytes)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-between gap-3 pt-1">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={!selected}
          onClick={() => selected && onSelected(selected)}
        >
          Select this checkpoint <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ---- Step 3: Confirm Restore ---------------------------------------------

interface Step3Props {
  projectPath: string;
  session: Session;
  onBack: () => void;
  onDone: (sessionId: string) => void;
}

function Step3ConfirmRestore({ projectPath, session, onBack, onDone }: Step3Props) {
  const [createBackup, setCreateBackup] = useState(true);
  const [progress, setProgress] = useState<RestoreProgress>({
    status: 'idle',
    percent: 0,
    message: '',
  });

  const handleRestore = async () => {
    setProgress({ status: 'running', percent: 10, message: 'Preparing restore…' });
    try {
      if (createBackup) {
        setProgress({ status: 'running', percent: 30, message: 'Creating backup…' });
      }
      setProgress({ status: 'running', percent: 60, message: 'Restoring files…' });
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
      onDone(session.id);
    } catch (err: unknown) {
      setProgress({
        status: 'error',
        percent: 0,
        message: err instanceof Error ? err.message : 'Restore failed',
      });
    }
  };

  const isRunning = progress.status === 'running';

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Restore summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Project</span>
            <span className="text-white font-mono text-xs truncate max-w-[60%]">
              {projectPath}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Checkpoint</span>
            <span className="text-white">{session.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Date</span>
            <span className="text-white">{formatDate(session.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Files affected</span>
            <Badge variant="secondary">{session.filesChanged} files</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Restore size</span>
            <span className="text-white">{formatBytes(session.sizeBytes)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Warning */}
      <div className="flex gap-3 rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 text-sm">
        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-200">
          This will overwrite{' '}
          <span className="font-semibold">{session.filesChanged} files</span> in
          your project. Any unsaved changes since this checkpoint will be lost.
        </p>
      </div>

      {/* Backup toggle */}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-white">Create backup first</p>
            <p className="text-xs text-gray-400">
              Save your current state before restoring
            </p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={createBackup}
          onClick={() => setCreateBackup((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
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
                progress.status === 'error' ? 'text-red-400' : 'text-gray-300'
              }
            >
              {progress.message}
            </span>
            <span className="text-gray-500">{progress.percent}%</span>
          </div>
          <Progress
            value={progress.percent}
            indicatorClassName={
              progress.status === 'error' ? 'bg-red-600' : undefined
            }
          />
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={isRunning}>
          Back
        </Button>
        <Button
          onClick={handleRestore}
          disabled={isRunning || progress.status === 'done'}
          variant={progress.status === 'error' ? 'destructive' : 'default'}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restoring…
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4 mr-2" /> Restore now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---- Main wizard page ----------------------------------------------------

export default function RestorePage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [projectPath, setProjectPath] = useState('');
  const [projectInfo, setProjectInfo] = useState<ProjectVerification | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const handleProjectVerified = (path: string, info: ProjectVerification) => {
    setProjectPath(path);
    setProjectInfo(info);
    setStep(2);
  };

  const handleSessionSelected = (session: Session) => {
    setSelectedSession(session);
    setStep(3);
  };

  const handleRestoreDone = (sessionId: string) => {
    router.push(`/restore/${sessionId}?success=true`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-start justify-center px-4 py-16">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold">Restore wizard</h1>
            <p className="text-gray-400 mt-2">
              Travel back to any checkpoint in your project history
            </p>
          </div>

          <StepIndicator current={step} />

          <Card>
            <CardHeader>
              <CardTitle>
                {step === 1 && 'Select project'}
                {step === 2 && 'Choose checkpoint'}
                {step === 3 && 'Confirm restore'}
              </CardTitle>
              <CardDescription>
                {step === 1 &&
                  'Enter the path of the project you want to restore.'}
                {step === 2 &&
                  `Showing checkpoints for ${projectInfo?.projectName ?? projectPath}`}
                {step === 3 &&
                  'Review the restore details before proceeding.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === 1 && (
                <Step1SelectProject onVerified={handleProjectVerified} />
              )}
              {step === 2 && (
                <Step2ChooseCheckpoint
                  projectPath={projectPath}
                  onSelected={handleSessionSelected}
                  onBack={() => setStep(1)}
                />
              )}
              {step === 3 && selectedSession && (
                <Step3ConfirmRestore
                  projectPath={projectPath}
                  session={selectedSession}
                  onBack={() => setStep(2)}
                  onDone={handleRestoreDone}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
