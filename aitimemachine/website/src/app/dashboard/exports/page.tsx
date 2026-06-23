'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, FileArchive, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProjectConsentRow {
  projectId: string;
  projectName: string;
  projectPath: string;
  decision: {
    allowed: boolean;
    source: string;
    reason: string;
  };
}

interface PipelineJob {
  id: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  config: {
    format: string;
    redactSecrets: boolean;
    projectIds?: string[];
  };
  stats?: {
    eventsCollected?: number;
    conversationsFound?: number;
    codeChangesFound?: number;
    bytesGenerated?: number;
  };
  result?: {
    recordCount?: number;
    sizeBytes?: number;
  };
  error?: string;
}

interface Artifact {
  id: string;
  type: string;
  format: string;
  storage: string;
  size: number;
  createdAt?: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export default function DashboardExportsPage() {
  const [projects, setProjects] = useState<ProjectConsentRow[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<'openai' | 'anthropic' | 'generic' | 'raw'>('generic');
  const [redactSecrets, setRedactSecrets] = useState(true);
  const [includeChats, setIncludeChats] = useState(true);
  const [includeCodeChanges, setIncludeCodeChanges] = useState(true);
  const [includeTerminalCommands, setIncludeTerminalCommands] = useState(true);
  const [includeCheckpoints, setIncludeCheckpoints] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [consentRes, jobsRes, artifactsRes] = await Promise.all([
        fetch('/api/consent/training-export', { cache: 'no-store' }),
        fetch('/api/pipeline', { cache: 'no-store' }),
        fetch('/api/knowledge-base/artifacts?type=pipeline&limit=10', { cache: 'no-store' }),
      ]);

      const consentData = await consentRes.json();
      const jobsData = await jobsRes.json();
      const artifactsData = await artifactsRes.json();

      const nextProjects = consentData.projects || [];
      setProjects(nextProjects);
      setSelectedProjectIds((current) => {
        const allowedIds = nextProjects
          .filter((project: ProjectConsentRow) => project.decision.allowed)
          .map((project: ProjectConsentRow) => project.projectId);
        if (current.length > 0) {
          return current.filter((projectId) => allowedIds.includes(projectId));
        }
        return allowedIds;
      });
      setJobs(jobsData.jobs || []);
      setArtifacts((artifactsData.artifacts || []).slice(0, 10));
    } catch {
      setError('Failed to load export tooling.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const allowedProjects = useMemo(
    () => projects.filter((project) => project.decision.allowed),
    [projects]
  );

  const toggleConsent = async (projectId: string, granted: boolean) => {
    setError('');
    try {
      const response = await fetch('/api/consent/training-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, granted }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update consent');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update consent');
    }
  };

  const createExport = async () => {
    if (selectedProjectIds.length === 0) {
      setError('Select at least one consented project.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
          format,
          redactSecrets,
          includeChats,
          includeCodeChanges,
          includeTerminalCommands,
          includeCheckpoints,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create export job');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create export job');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Training Exports</h1>
        <p className="mt-1 text-gray-400">
          Manage project opt-in, generate redacted training exports, and download completed pipeline outputs.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projects With Consent</CardDescription>
            <CardTitle>{loading ? '...' : allowedProjects.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            Ready for pipeline exports
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pipeline Jobs</CardDescription>
            <CardTitle>{loading ? '...' : jobs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            Historical and in-flight export runs
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stored Export Artifacts</CardDescription>
            <CardTitle>{loading ? '...' : artifacts.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            Persisted outputs with audit traceability
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Project Consent
          </CardTitle>
          <CardDescription>Training export is opt-in per project. Toggle consent before exporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.map((project) => (
            <div key={project.projectId} className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-white">{project.projectName}</p>
                <p className="mt-1 text-xs text-gray-500">{project.projectPath}</p>
                <p className="mt-2 text-xs text-gray-400">
                  Source: <span className="font-mono">{project.decision.source}</span> · Reason: <span className="font-mono">{project.decision.reason}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={project.decision.allowed ? 'secondary' : 'destructive'}>
                  {project.decision.allowed ? 'Allowed' : 'Blocked'}
                </Badge>
                <Button
                  variant={project.decision.allowed ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => toggleConsent(project.projectId, !project.decision.allowed)}
                >
                  {project.decision.allowed ? 'Revoke' : 'Allow'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Export</CardTitle>
          <CardDescription>Launch a redacted pipeline job over consented projects.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-white">Projects</p>
              <div className="space-y-2">
                {projects.map((project) => (
                  <label key={project.projectId} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.projectId)}
                      disabled={!project.decision.allowed}
                      onChange={() => toggleProjectSelection(project.projectId)}
                    />
                    <span>{project.projectName}</span>
                    {!project.decision.allowed && (
                      <span className="text-xs text-red-400">(consent required)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-white">Options</p>
              <label className="block text-sm text-gray-300">
                Format
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="generic">Generic JSONL</option>
                  <option value="openai">OpenAI chat format</option>
                  <option value="anthropic">Anthropic format</option>
                  <option value="raw">Raw events</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={redactSecrets} onChange={() => setRedactSecrets((value) => !value)} /> Redact secrets</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={includeChats} onChange={() => setIncludeChats((value) => !value)} /> Chats</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={includeCodeChanges} onChange={() => setIncludeCodeChanges((value) => !value)} /> Code changes</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={includeTerminalCommands} onChange={() => setIncludeTerminalCommands((value) => !value)} /> Terminal</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={includeCheckpoints} onChange={() => setIncludeCheckpoints((value) => !value)} /> Checkpoints</label>
              </div>
            </div>
          </div>

          <Button onClick={createExport} disabled={submitting || loading}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileArchive className="mr-2 h-4 w-4" />}
            Create Training Export
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Jobs</CardTitle>
            <CardDescription>Track export progress and download completed outputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-400">No export jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-white">{job.id}</p>
                      <p className="mt-1 text-sm text-gray-300">
                        {job.config.format} · {job.config.redactSecrets ? 'redacted' : 'unredacted'}
                      </p>
                    </div>
                    <Badge variant={job.status === 'completed' ? 'secondary' : job.status === 'failed' ? 'destructive' : 'outline'}>
                      {job.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Progress: {job.progress}%</p>
                  {job.stats && (
                    <p className="mt-1 text-xs text-gray-400">
                      {job.stats.eventsCollected || 0} events · {job.stats.conversationsFound || 0} conversations · {formatBytes(job.stats.bytesGenerated || 0)}
                    </p>
                  )}
                  {job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}
                  {job.status === 'completed' && (
                    <a
                      href={`/api/pipeline/${job.id}/download`}
                      className="mt-3 inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                    >
                      <Download className="h-4 w-4" />
                      Download export
                    </a>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Persisted Artifacts</CardTitle>
            <CardDescription>Recent export artifacts stored for search and auditability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {artifacts.length === 0 ? (
              <p className="text-sm text-gray-400">No stored artifacts yet.</p>
            ) : (
              artifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Badge>{artifact.type}</Badge>
                    <Badge variant="outline">{artifact.format}</Badge>
                    <Badge variant="outline">{artifact.storage}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-white">{artifact.id}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatBytes(artifact.size || 0)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
