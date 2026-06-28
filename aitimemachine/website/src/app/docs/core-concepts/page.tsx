'use client';

import { BookOpen, Camera, Layers, FolderGit2, RotateCcw, GitBranch } from 'lucide-react';
import {
  DocsPageShell,
  DocsBreadcrumb,
  DocHeader,
  CodeBlock,
  DocFooterNav,
} from '../_components';

interface Concept {
  id: string;
  title: string;
  icon: typeof Camera;
  summary: string;
  body: string[];
}

const concepts: Concept[] = [
  {
    id: 'checkpoint',
    title: 'Checkpoint',
    icon: Camera,
    summary: 'An immutable, content-addressed snapshot of your entire project state at a moment in time.',
    body: [
      'A checkpoint captures every tracked and untracked file, your terminal command history, the active AI conversation context, and environment metadata (Node version, dependency lockfiles).',
      'Checkpoints are content-addressed: identical file contents are stored once and deduplicated across checkpoints, so a snapshot of a large project costs only the bytes that actually changed.',
    ],
  },
  {
    id: 'session',
    title: 'Session',
    icon: Layers,
    summary: 'The ordered timeline of checkpoints for a single project — the unit you replay and diff against.',
    body: [
      'Every project accumulates a session: a chronological chain of checkpoints. The replay view walks this chain, showing the diff introduced at each step.',
      'A session needs at least two checkpoints to produce a diff. A brand-new project has zero checkpoints until you create your first one with the CLI.',
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    icon: FolderGit2,
    summary: 'The local project directory AITM tracks, identified by its root path.',
    body: [
      'Running "aitm init" marks a directory as a workspace and creates a ".aitimemachine/" folder for local checkpoint storage.',
      'When you authenticate, the workspace syncs to the cloud so its session appears in the web dashboard and can be restored from any machine.',
    ],
  },
  {
    id: 'deterministic-restore',
    title: 'Deterministic restore',
    icon: RotateCcw,
    summary: 'Restoring a checkpoint reproduces the exact recorded file state — byte for byte.',
    body: [
      'Because checkpoints are content-addressed, restore is deterministic: applying a checkpoint always yields the same file tree it captured, with no merge ambiguity.',
      'AITM automatically creates a safety checkpoint before every restore, so the restore itself is reversible.',
    ],
  },
];

export default function CoreConceptsPage() {
  return (
    <DocsPageShell activeId="core-concepts">
      <DocsBreadcrumb title="Core Concepts" />

      <DocHeader
        badge="Core Concepts"
        badgeIcon={<BookOpen className="w-3.5 h-3.5" />}
        title="How AITimeMachine works"
        description="Four ideas explain the whole system: checkpoints, sessions, workspaces, and deterministic restore."
      />

      <div className="space-y-8">
        {concepts.map((concept) => {
          const Icon = concept.icon;
          return (
            <section key={concept.id} id={concept.id} className="space-y-3 scroll-mt-24">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <h2 className="text-2xl font-semibold">{concept.title}</h2>
              </div>
              <p className="text-gray-300 font-medium">{concept.summary}</p>
              {concept.body.map((p) => (
                <p key={p.slice(0, 24)} className="text-gray-400 leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          );
        })}
      </div>

      <section className="space-y-4 scroll-mt-24" id="model">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <GitBranch className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl font-semibold">How it relates to Git</h2>
        </div>
        <p className="text-gray-400 leading-relaxed">
          AITimeMachine is complementary to Git, not a replacement. Git tracks intentional, curated commits of source
          files. AITM captures the full working state continuously — including the AI context and terminal history Git
          never sees — so you can rewind an experiment that was never committed. When a checkpoint is worth keeping, you
          can promote it to a real Git commit.
        </p>
        <CodeBlock
          code={`# Snapshot continuously while you and your agent work\naitm checkpoint "Trying a new caching layer"\n\n# Promote the snapshot you like into a real git commit\naitm commit cp_a1b2c3d4 -m "Add caching layer"`}
          label="Terminal"
        />
      </section>

      <DocFooterNav
        prev={{ title: 'Quick Start', href: '/docs/quick-start' }}
        next={{ title: 'Next: CLI Reference', href: '/docs/cli-reference' }}
      />
    </DocsPageShell>
  );
}
