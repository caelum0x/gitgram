'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { githubService } from '@/services/githubService';
import { repoService } from '@/services/repoService';
import aitmService, {
  AitmProject,
  AitmCheckpoint,
  AitmDiffResult,
  AitmFileDiff,
  loadAitmApiKey,
  saveAitmApiKey,
} from '@/services/aitmService';
import { getErrorMessage } from '@/utils/error';
import { buildRepoPath } from '@/utils/repositoryRouting';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Select Repository',
  2: 'Connect AITM',
  3: 'Select Checkpoints',
  4: 'Preview Diff',
  5: 'Add Narrative',
  6: 'Preview Story',
  7: 'Published',
};

// ---------------------------------------------------------------------------
// Helper: diff bar
// ---------------------------------------------------------------------------

function DiffBar({ added, removed, modified }: { added: number; removed: number; modified: number }) {
  const total = added + removed + modified || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-background">
      <div className="bg-green-500 transition-all" style={{ width: `${(added / total) * 100}%` }} />
      <div className="bg-red-500 transition-all" style={{ width: `${(removed / total) * 100}%` }} />
      <div className="bg-yellow-500 transition-all" style={{ width: `${(modified / total) * 100}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: file change icon
// ---------------------------------------------------------------------------

function FileChangeIcon({ type }: { type: string }) {
  if (type === 'added') {
    return (
      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    );
  }
  if (type === 'removed') {
    return (
      <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CreateChangeStoryPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // -- wizard state --
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: repo selection
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const [repoSearch, setRepoSearch] = useState('');

  // Step 2: AITM connection
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  const [validatingKey, setValidatingKey] = useState(false);
  const [projects, setProjects] = useState<AitmProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<AitmProject | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Step 3: checkpoint selection
  const [checkpoints, setCheckpoints] = useState<AitmCheckpoint[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [fromCheckpoint, setFromCheckpoint] = useState<AitmCheckpoint | null>(null);
  const [toCheckpoint, setToCheckpoint] = useState<AitmCheckpoint | null>(null);

  // Step 4: diff preview
  const [diffResult, setDiffResult] = useState<AitmDiffResult | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Step 5: narrative
  const [storyTitle, setStoryTitle] = useState('');
  const [narrativeText, setNarrativeText] = useState('');

  // Step 7: publishing
  const [publishing, setPublishing] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Step 1: Load repos
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadRepos() {
      setLoadingRepos(true);
      try {
        const data = await githubService.getProjects();
        const repoList: RepoOption[] = (data.projects || data || []).map((p: any) => ({
          owner: p.owner?.login || p.owner || '',
          name: p.name || '',
          fullName: p.full_name || p.fullName || `${p.owner?.login || p.owner}/${p.name}`,
        }));
        setRepos(repoList);
      } catch {
        showToast('Failed to load repositories. Connect GitHub first.', 'error');
      } finally {
        setLoadingRepos(false);
      }
    }
    loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved API key
  useEffect(() => {
    const saved = loadAitmApiKey();
    if (saved) setApiKey(saved);
  }, []);

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  // -----------------------------------------------------------------------
  // Step 2: validate key & load projects
  // -----------------------------------------------------------------------
  const handleValidateKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setValidatingKey(true);
    setApiKeyValid(null);
    try {
      const valid = await aitmService.validateApiKey(apiKey.trim());
      setApiKeyValid(valid);
      if (valid) {
        saveAitmApiKey(apiKey.trim());
        showToast('AITM API key validated', 'success');
        // load projects
        setLoadingProjects(true);
        const projs = await aitmService.getProjects(apiKey.trim());
        setProjects(projs);
      } else {
        showToast('Invalid AITM API key', 'error');
      }
    } catch {
      setApiKeyValid(false);
      showToast('Could not validate AITM API key', 'error');
    } finally {
      setValidatingKey(false);
      setLoadingProjects(false);
    }
  }, [apiKey, showToast]);

  // -----------------------------------------------------------------------
  // Step 3: load checkpoints
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (step !== 3 || !selectedProject || !apiKey) return;
    let cancelled = false;
    async function load() {
      setLoadingCheckpoints(true);
      try {
        const cps = await aitmService.getCheckpoints(apiKey, selectedProject!.id);
        if (!cancelled) setCheckpoints(cps);
      } catch {
        showToast('Failed to load checkpoints', 'error');
      } finally {
        if (!cancelled) setLoadingCheckpoints(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedProject, apiKey]);

  // -----------------------------------------------------------------------
  // Step 4: load diff
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (step !== 4 || !fromCheckpoint || !toCheckpoint || !selectedProject || !apiKey) return;
    let cancelled = false;
    async function load() {
      setLoadingDiff(true);
      try {
        const diff = await aitmService.getDiff(apiKey, selectedProject!.id, fromCheckpoint!.id, toCheckpoint!.id);
        if (!cancelled) setDiffResult(diff);
      } catch {
        showToast('Failed to load diff', 'error');
      } finally {
        if (!cancelled) setLoadingDiff(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, fromCheckpoint, toCheckpoint, selectedProject, apiKey]);

  // -----------------------------------------------------------------------
  // Step 7: publish
  // -----------------------------------------------------------------------
  const handlePublish = useCallback(async () => {
    if (!selectedRepo || !toCheckpoint) return;
    setPublishing(true);
    try {
      const payload = {
        title: storyTitle || `Change Story for ${selectedRepo.fullName}`,
        summary: narrativeText,
        checkpointId: toCheckpoint.id,
        fromCheckpointId: fromCheckpoint?.id,
        aitmProjectId: selectedProject?.id,
        diffSummary: diffResult
          ? { added: diffResult.summary.added, removed: diffResult.summary.removed, modified: diffResult.summary.modified }
          : undefined,
        changedFiles: diffResult ? diffResult.files.map((f) => f.filePath) : [],
      };

      const { data } = await repoService.createChangeStory(selectedRepo.owner, selectedRepo.name, payload);
      setPublishedPostId(data.post?.id || null);
      setStep(7);
      showToast('Change story published!', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setPublishing(false);
    }
  }, [selectedRepo, toCheckpoint, fromCheckpoint, selectedProject, diffResult, storyTitle, narrativeText, showToast]);

  // -----------------------------------------------------------------------
  // Navigation guards
  // -----------------------------------------------------------------------
  const canAdvance: Record<WizardStep, boolean> = {
    1: !!selectedRepo,
    2: apiKeyValid === true && !!selectedProject,
    3: !!fromCheckpoint && !!toCheckpoint,
    4: !!diffResult,
    5: true, // narrative is optional
    6: true, // preview always allows publishing
    7: false,
  };

  const goNext = () => {
    if (step === 6) {
      handlePublish();
      return;
    }
    if (step < 7 && canAdvance[step]) setStep((s) => (s + 1) as WizardStep);
  };

  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Create Change Story</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Share your repository&apos;s evolution by linking AITM checkpoints and adding context.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-1">
          {([1, 2, 3, 4, 5, 6, 7] as WizardStep[]).map((s) => (
            <div key={s} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  s === step
                    ? 'bg-primary text-white'
                    : s < step
                      ? 'bg-green-500 text-white'
                      : 'bg-background text-foreground-secondary border border-border'
                }`}
              >
                {s < step ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              <span className="hidden text-[10px] text-foreground-secondary sm:block">
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-border bg-card p-6">
        {/* ====================== STEP 1: Select Repository ====================== */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Select Repository</h2>
            <input
              type="text"
              placeholder="Search your repositories..."
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {loadingRepos ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">Loading repositories...</div>
            ) : filteredRepos.length === 0 ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">
                No repositories found. Make sure your GitHub account is connected.
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.fullName}
                    onClick={() => setSelectedRepo(repo)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                      selectedRepo?.fullName === repo.fullName
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/40'
                    }`}
                  >
                    <svg className="h-5 w-5 flex-shrink-0 text-foreground-secondary" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zm-8 11a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{repo.fullName}</p>
                    </div>
                    {selectedRepo?.fullName === repo.fullName && (
                      <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================== STEP 2: Connect AITM ====================== */}
        {step === 2 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Connect AITM Project</h2>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-foreground-secondary">AITM API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Enter your AITM API key..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setApiKeyValid(null);
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleValidateKey}
                  disabled={!apiKey.trim() || validatingKey}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
                >
                  {validatingKey ? 'Checking...' : 'Validate'}
                </button>
              </div>
              {apiKeyValid === true && (
                <p className="mt-1 text-xs text-green-500">API key is valid</p>
              )}
              {apiKeyValid === false && (
                <p className="mt-1 text-xs text-red-500">Invalid API key. Please check and try again.</p>
              )}
            </div>

            {projects.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-medium text-foreground-secondary">Select AITM Project</label>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => setSelectedProject(proj)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selectedProject?.id === proj.id
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background text-foreground hover:border-primary/40'
                      }`}
                    >
                      <svg className="h-5 w-5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{proj.name}</p>
                        {proj.description && (
                          <p className="truncate text-xs text-foreground-secondary">{proj.description}</p>
                        )}
                      </div>
                      {proj.checkpointCount !== undefined && (
                        <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-mono text-blue-500">
                          {proj.checkpointCount} checkpoints
                        </span>
                      )}
                      {selectedProject?.id === proj.id && (
                        <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingProjects && (
              <div className="py-6 text-center text-sm text-foreground-secondary">Loading AITM projects...</div>
            )}
          </div>
        )}

        {/* ====================== STEP 3: Select Checkpoints ====================== */}
        {step === 3 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Select Checkpoint Range</h2>
            <p className="mb-4 text-sm text-foreground-secondary">
              Choose a &quot;from&quot; and &quot;to&quot; checkpoint to define the range of changes for your story.
            </p>

            {loadingCheckpoints ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">Loading checkpoints...</div>
            ) : checkpoints.length === 0 ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">
                No checkpoints found for this project.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* From checkpoint */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground-secondary">From (before)</label>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                    {checkpoints.map((cp) => (
                      <button
                        key={cp.id}
                        onClick={() => setFromCheckpoint(cp)}
                        disabled={toCheckpoint?.id === cp.id}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                          fromCheckpoint?.id === cp.id
                            ? 'bg-primary/10 text-foreground font-medium'
                            : toCheckpoint?.id === cp.id
                              ? 'opacity-30 cursor-not-allowed'
                              : 'text-foreground hover:bg-hover'
                        }`}
                      >
                        <span className="rounded bg-gray-500/10 px-1.5 py-0.5 font-mono">{cp.id.slice(0, 8)}</span>
                        <span className="flex-1 truncate">{cp.label || cp.message || 'Checkpoint'}</span>
                        <span className="text-foreground-secondary">
                          {new Date(cp.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* To checkpoint */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground-secondary">To (after)</label>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                    {checkpoints.map((cp) => (
                      <button
                        key={cp.id}
                        onClick={() => setToCheckpoint(cp)}
                        disabled={fromCheckpoint?.id === cp.id}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                          toCheckpoint?.id === cp.id
                            ? 'bg-primary/10 text-foreground font-medium'
                            : fromCheckpoint?.id === cp.id
                              ? 'opacity-30 cursor-not-allowed'
                              : 'text-foreground hover:bg-hover'
                        }`}
                      >
                        <span className="rounded bg-gray-500/10 px-1.5 py-0.5 font-mono">{cp.id.slice(0, 8)}</span>
                        <span className="flex-1 truncate">{cp.label || cp.message || 'Checkpoint'}</span>
                        <span className="text-foreground-secondary">
                          {new Date(cp.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {fromCheckpoint && toCheckpoint && (
              <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-foreground">
                <span className="font-medium">Range:</span>{' '}
                <span className="font-mono text-blue-500">{fromCheckpoint.id.slice(0, 8)}</span>
                {' -> '}
                <span className="font-mono text-blue-500">{toCheckpoint.id.slice(0, 8)}</span>
              </div>
            )}
          </div>
        )}

        {/* ====================== STEP 4: Preview Diff ====================== */}
        {step === 4 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Diff Summary</h2>

            {loadingDiff ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">Calculating diff...</div>
            ) : !diffResult ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">
                No diff data available.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-green-500">+{diffResult.summary.added}</p>
                    <p className="text-xs text-foreground-secondary">Files Added</p>
                  </div>
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-red-500">-{diffResult.summary.removed}</p>
                    <p className="text-xs text-foreground-secondary">Files Removed</p>
                  </div>
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-500">~{diffResult.summary.modified}</p>
                    <p className="text-xs text-foreground-secondary">Files Modified</p>
                  </div>
                </div>

                {/* Colored diff bar */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground-secondary">Change Distribution</label>
                  <DiffBar
                    added={diffResult.summary.added}
                    removed={diffResult.summary.removed}
                    modified={diffResult.summary.modified}
                  />
                </div>

                {/* Lines summary */}
                <div className="flex gap-4 text-xs text-foreground-secondary">
                  <span className="text-green-500">+{diffResult.summary.totalLinesAdded} lines added</span>
                  <span className="text-red-500">-{diffResult.summary.totalLinesRemoved} lines removed</span>
                  <span>{diffResult.summary.totalFilesChanged} files changed</span>
                </div>

                {/* File list */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground-secondary">Changed Files</label>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                    {diffResult.files.map((file, idx) => (
                      <FileRow key={file.filePath + idx} file={file} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================== STEP 5: Narrative ====================== */}
        {step === 5 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Add Your Narrative</h2>
            <p className="mb-4 text-sm text-foreground-secondary">
              Explain what changed and why. This text appears alongside the diff summary in your change story post.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-foreground-secondary">Title</label>
              <input
                type="text"
                placeholder={`Change Story for ${selectedRepo?.fullName || 'repo'}`}
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                maxLength={160}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-secondary">Narrative</label>
              <textarea
                placeholder="What changed and why? Share the context behind these changes..."
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                rows={6}
                maxLength={5000}
                className="w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-right text-xs text-foreground-secondary">{narrativeText.length}/5000</p>
            </div>
          </div>
        )}

        {/* ====================== STEP 6: Preview ====================== */}
        {step === 6 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Preview Change Story</h2>
            <div className="rounded-xl border border-border bg-background p-5">
              {/* Title */}
              <h3 className="mb-2 text-base font-bold text-foreground">
                {storyTitle || `Change Story for ${selectedRepo?.fullName}`}
              </h3>

              {/* Repo badge */}
              <div className="mb-3 flex items-center gap-2 text-xs text-foreground-secondary">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zm-8 11a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                <span className="font-mono">{selectedRepo?.fullName}</span>
                <span className="text-foreground-secondary/60">|</span>
                <span className="font-mono text-blue-500">
                  {fromCheckpoint?.id.slice(0, 8)} -&gt; {toCheckpoint?.id.slice(0, 8)}
                </span>
              </div>

              {/* Narrative */}
              {narrativeText && (
                <p className="mb-4 text-sm text-foreground whitespace-pre-wrap">{narrativeText}</p>
              )}

              {/* Diff summary */}
              {diffResult && (
                <div className="space-y-3">
                  <DiffBar
                    added={diffResult.summary.added}
                    removed={diffResult.summary.removed}
                    modified={diffResult.summary.modified}
                  />
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded border border-green-500/20 bg-green-500/5 px-2 py-1.5">
                      <span className="font-bold text-green-500">+{diffResult.summary.added}</span>{' '}
                      <span className="text-foreground-secondary">added</span>
                    </div>
                    <div className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5">
                      <span className="font-bold text-red-500">-{diffResult.summary.removed}</span>{' '}
                      <span className="text-foreground-secondary">removed</span>
                    </div>
                    <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-2 py-1.5">
                      <span className="font-bold text-yellow-500">~{diffResult.summary.modified}</span>{' '}
                      <span className="text-foreground-secondary">modified</span>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded border border-border bg-card p-2">
                    {diffResult.files.slice(0, 20).map((file, idx) => (
                      <div key={file.filePath + idx} className="flex items-center gap-2 py-1 text-xs">
                        <FileChangeIcon type={file.changeType} />
                        <span className="truncate font-mono text-foreground">{file.filePath}</span>
                      </div>
                    ))}
                    {diffResult.files.length > 20 && (
                      <p className="pt-1 text-xs text-foreground-secondary">
                        ...and {diffResult.files.length - 20} more files
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================== STEP 7: Published ====================== */}
        {step === 7 && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-bold text-foreground">Change Story Published!</h2>
            <p className="mb-6 text-sm text-foreground-secondary">
              Your change story for <span className="font-medium text-foreground">{selectedRepo?.fullName}</span> is now live.
            </p>
            <div className="flex items-center justify-center gap-3">
              {publishedPostId && (
                <button
                  onClick={() => router.push(`/post/${publishedPostId}`)}
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  View Post
                </button>
              )}
              <button
                onClick={() => {
                  if (selectedRepo) {
                    router.push(buildRepoPath(selectedRepo.owner, selectedRepo.name));
                  }
                }}
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-hover"
              >
                Go to Repository
              </button>
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedRepo(null);
                  setFromCheckpoint(null);
                  setToCheckpoint(null);
                  setDiffResult(null);
                  setStoryTitle('');
                  setNarrativeText('');
                  setPublishedPostId(null);
                }}
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-hover"
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {step < 7 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-hover disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <button
            onClick={goNext}
            disabled={!canAdvance[step] || publishing}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {step === 6 ? (publishing ? 'Publishing...' : 'Publish') : 'Next'}
            {step < 6 && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: file row with expandable patch preview
// ---------------------------------------------------------------------------

function FileRow({ file }: { file: AitmFileDiff }) {
  const [expanded, setExpanded] = useState(false);
  const patchLines = file.patch ? file.patch.split('\n').slice(0, 20) : [];

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-hover"
      >
        <FileChangeIcon type={file.changeType} />
        <span className="flex-1 truncate font-mono text-foreground">{file.filePath}</span>
        <span className="flex items-center gap-2 text-foreground-secondary">
          <span className="text-green-500">+{file.linesAdded}</span>
          <span className="text-red-500">-{file.linesRemoved}</span>
        </span>
        {patchLines.length > 0 && (
          <svg
            className={`h-4 w-4 text-foreground-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {expanded && patchLines.length > 0 && (
        <div className="overflow-x-auto border-t border-border/50 bg-[#0d1117] px-4 py-2">
          <pre className="text-xs leading-5 text-gray-300">
            {patchLines.map((line, idx) => {
              let lineClass = '';
              if (line.startsWith('+')) lineClass = 'text-green-400 bg-green-500/10';
              else if (line.startsWith('-')) lineClass = 'text-red-400 bg-red-500/10';
              else if (line.startsWith('@@')) lineClass = 'text-blue-400';
              return (
                <div key={idx} className={`${lineClass} px-1`}>
                  {line}
                </div>
              );
            })}
            {(file.patch?.split('\n').length || 0) > 20 && (
              <div className="pt-1 text-foreground-secondary">... truncated</div>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
