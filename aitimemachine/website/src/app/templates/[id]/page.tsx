'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Loader2,
  CheckCircle2,
  Folder,
  FileCode,
  ListChecks,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  findTemplate,
  type Template,
  type TemplateFileNode,
  type TemplateDifficulty,
} from '@/lib/templates';

// ---- Types ------------------------------------------------------------------

interface FromTemplateResponse {
  projectId: string;
  sessionId: string;
  nextPath: string;
  scaffoldCommand: string;
}

// ---- Helpers ----------------------------------------------------------------

const DIFFICULTY_COLOR: Record<TemplateDifficulty, string> = {
  Beginner: 'bg-green-500/20 text-green-400 border-green-800',
  Intermediate: 'bg-yellow-500/20 text-yellow-400 border-yellow-800',
  Advanced: 'bg-red-500/20 text-red-400 border-red-800',
};

// ---- File tree --------------------------------------------------------------

function FileTree({ nodes, depth = 0 }: { nodes: TemplateFileNode[]; depth?: number }) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={`${node.name}-${depth}`}>
          <div
            className="flex items-center gap-2 text-sm text-gray-300"
            style={{ paddingLeft: `${depth * 16}px` }}
          >
            {node.type === 'folder' ? (
              <Folder className="w-4 h-4 text-purple-400 shrink-0" />
            ) : (
              <FileCode className="w-4 h-4 text-gray-500 shrink-0" />
            )}
            <span className={node.type === 'folder' ? 'font-medium text-white' : ''}>
              {node.name}
            </span>
          </div>
          {node.children && node.children.length > 0 && (
            <FileTree nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ---- Use-template action ----------------------------------------------------

function useTemplateAction(template: Template) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FromTemplateResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/sessions/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const data = (await res.json()) as FromTemplateResponse;
      // We do not redirect to an empty timeline. The web app has no filesystem
      // access, so the actual scaffolding + first checkpoint happen via the CLI.
      // Surface a guided handoff with the exact command instead.
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, result, run };
}

// ---- CLI handoff ------------------------------------------------------------

function ScaffoldHandoff({
  template,
  result,
}: {
  template: Template;
  result: FromTemplateResponse;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.scaffoldCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mb-10 rounded-2xl border border-green-800/60 bg-green-950/20 p-6">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <h2 className="text-lg font-semibold text-green-300">
          Project created — finish in your terminal
        </h2>
      </div>
      <p className="text-sm text-gray-300 mb-4 max-w-2xl">
        We created an empty AITM project for{' '}
        <span className="font-medium text-white">{template.name}</span>. Because
        scaffolding writes files to your machine, run the command below in the
        directory where you want the project. It generates the template files and
        records your first checkpoint into this project.
      </p>

      <div className="flex items-stretch gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3 font-mono text-sm text-gray-200 overflow-x-auto">
          <Terminal className="w-4 h-4 text-gray-500 shrink-0" />
          <code className="whitespace-nowrap">{result.scaffoldCommand}</code>
        </div>
        <Button variant="outline" onClick={copy} className="shrink-0">
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2 text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </>
          )}
        </Button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={result.nextPath}>Open project timeline</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/docs/cli-reference">CLI reference</Link>
        </Button>
      </div>
    </section>
  );
}

// ---- Page -------------------------------------------------------------------

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const template = findTemplate(id);

  if (!template) {
    notFound();
  }

  return <TemplateDetail template={template} />;
}

function TemplateDetail({ template }: { template: Template }) {
  const { loading, error, setError, result, run } = useTemplateAction(template);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <Link
          href="/templates"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to templates
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-10">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{template.name}</h1>
              {template.official && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-800 border">
                  Official
                </Badge>
              )}
              {template.community && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-800 border">
                  Community
                </Badge>
              )}
            </div>
            <p className="text-lg text-gray-400 max-w-2xl">{template.description}</p>

            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {template.estimatedTime} setup
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${DIFFICULTY_COLOR[template.difficulty]}`}
              >
                {template.difficulty}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-4">
              {template.stack.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-700/60 border border-gray-700 text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="shrink-0">
            <Button
              size="lg"
              onClick={run}
              disabled={loading || result !== null}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating session…
                </>
              ) : result ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
                  Project created
                </>
              ) : (
                <>
                  Use Template
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

        {result && <ScaffoldHandoff template={template} result={result} />}

        {error && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            <span className="font-medium">Error:</span> {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Overview */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="text-gray-400 leading-relaxed">{template.longDescription}</p>
        </section>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* What's included */}
          <section className="bg-gray-800/30 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Folder className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold">What&apos;s included</h2>
            </div>
            <div className="font-mono text-sm bg-gray-950/50 border border-gray-800 rounded-lg p-4">
              <FileTree nodes={template.fileTree} />
            </div>
          </section>

          {/* Prerequisites */}
          <section className="bg-gray-800/30 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-semibold">Prerequisites</h2>
            </div>
            <ul className="space-y-3">
              {template.prerequisites.map((req) => (
                <li key={req} className="flex items-start gap-2.5 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  {req}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Steps overview */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <ListChecks className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Steps overview</h2>
          </div>
          <ol className="space-y-3">
            {template.steps.map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-4 bg-gray-800/30 border border-gray-800 rounded-xl px-4 py-3"
              >
                <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-purple-600/20 border border-purple-700 text-purple-300 text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-300 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Bottom CTA */}
        <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-800/30 p-8 text-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-purple-500/10 rounded-full blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-bold mb-2">Ready to build?</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Spin up a fully checkpointed session from this template in seconds.
            </p>
            <Button size="lg" onClick={run} disabled={loading || result !== null}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating session…
                </>
              ) : result ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
                  Project created — see command above
                </>
              ) : (
                <>
                  Use Template
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
