'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Star,
  GitFork,
  Clock,
  ArrowRight,
  Loader2,
  Users,
  Zap,
  Globe,
  Server,
  Container,
  Brain,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---- Types ------------------------------------------------------------------

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

type CategoryId = 'all' | 'frontend' | 'backend' | 'devops' | 'ai' | 'fullstack';

interface Template {
  id: string;
  name: string;
  description: string;
  category: Exclude<CategoryId, 'all'>;
  stack: string[];
  estimatedTime: string;
  difficulty: Difficulty;
  stars: number;
  forks: number;
  official: boolean;
}

// ---- Data -------------------------------------------------------------------

const CATEGORIES: { id: CategoryId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'all', label: 'All Templates', icon: Layers },
  { id: 'frontend', label: 'Frontend', icon: Globe },
  { id: 'backend', label: 'Backend', icon: Server },
  { id: 'devops', label: 'DevOps', icon: Container },
  { id: 'ai', label: 'AI Projects', icon: Brain },
  { id: 'fullstack', label: 'Full-Stack', icon: Zap },
];

const TEMPLATES: Template[] = [
  // Frontend
  {
    id: 'react-setup',
    name: 'React Setup',
    description: 'Vite + React + TypeScript starter with Tailwind CSS, ESLint, and Prettier pre-configured.',
    category: 'frontend',
    stack: ['React', 'TypeScript', 'Vite', 'Tailwind'],
    estimatedTime: '5 min',
    difficulty: 'Beginner',
    stars: 2_840,
    forks: 391,
    official: true,
  },
  {
    id: 'nextjs-app',
    name: 'Next.js App',
    description: 'Production-ready Next.js 14 app router with auth, database, and deployment config.',
    category: 'frontend',
    stack: ['Next.js', 'TypeScript', 'Prisma', 'NextAuth'],
    estimatedTime: '10 min',
    difficulty: 'Intermediate',
    stars: 5_120,
    forks: 743,
    official: true,
  },
  {
    id: 'vue-spa',
    name: 'Vue SPA',
    description: 'Vue 3 single-page application with Pinia state management and Vue Router.',
    category: 'frontend',
    stack: ['Vue 3', 'TypeScript', 'Pinia', 'Vue Router'],
    estimatedTime: '8 min',
    difficulty: 'Intermediate',
    stars: 1_670,
    forks: 218,
    official: false,
  },
  // Backend
  {
    id: 'express-api',
    name: 'Express API',
    description: 'REST API with Express, Zod validation, JWT auth, PostgreSQL, and OpenAPI docs.',
    category: 'backend',
    stack: ['Node.js', 'Express', 'PostgreSQL', 'Zod'],
    estimatedTime: '12 min',
    difficulty: 'Intermediate',
    stars: 3_290,
    forks: 487,
    official: true,
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    description: 'Async Python API with FastAPI, Pydantic v2, SQLAlchemy, and auto-generated docs.',
    category: 'backend',
    stack: ['Python', 'FastAPI', 'SQLAlchemy', 'Alembic'],
    estimatedTime: '10 min',
    difficulty: 'Intermediate',
    stars: 4_150,
    forks: 612,
    official: true,
  },
  {
    id: 'go-service',
    name: 'Go Service',
    description: 'Idiomatic Go microservice with Chi router, sqlc, structured logging, and graceful shutdown.',
    category: 'backend',
    stack: ['Go', 'Chi', 'sqlc', 'PostgreSQL'],
    estimatedTime: '15 min',
    difficulty: 'Advanced',
    stars: 2_010,
    forks: 289,
    official: false,
  },
  // DevOps
  {
    id: 'docker-deploy',
    name: 'Docker Deploy',
    description: 'Multi-stage Dockerfile, docker-compose for local dev, and GitHub Actions CD pipeline.',
    category: 'devops',
    stack: ['Docker', 'GitHub Actions', 'Nginx', 'Compose'],
    estimatedTime: '20 min',
    difficulty: 'Intermediate',
    stars: 1_880,
    forks: 334,
    official: true,
  },
  {
    id: 'k8s-setup',
    name: 'K8s Setup',
    description: 'Kubernetes manifests with Helm chart, HPA, ingress, and cert-manager TLS.',
    category: 'devops',
    stack: ['Kubernetes', 'Helm', 'Ingress', 'cert-manager'],
    estimatedTime: '30 min',
    difficulty: 'Advanced',
    stars: 1_340,
    forks: 201,
    official: false,
  },
  {
    id: 'cicd',
    name: 'CI/CD Pipeline',
    description: 'Complete CI/CD with GitHub Actions: lint, test, build, deploy, and Slack notifications.',
    category: 'devops',
    stack: ['GitHub Actions', 'Docker', 'AWS ECR', 'Slack'],
    estimatedTime: '25 min',
    difficulty: 'Intermediate',
    stars: 2_560,
    forks: 418,
    official: true,
  },
  // AI Projects
  {
    id: 'llm-app',
    name: 'LLM App',
    description: 'Full-stack LLM application with streaming, chat history, and tool-use via the Claude API.',
    category: 'ai',
    stack: ['Next.js', 'Claude API', 'Vercel AI SDK', 'Redis'],
    estimatedTime: '15 min',
    difficulty: 'Intermediate',
    stars: 6_740,
    forks: 1_120,
    official: true,
  },
  {
    id: 'fine-tuning',
    name: 'Fine-tuning',
    description: 'Dataset preparation, LoRA fine-tuning with Unsloth, evaluation pipeline, and model export.',
    category: 'ai',
    stack: ['Python', 'PyTorch', 'Unsloth', 'Weights & Biases'],
    estimatedTime: '45 min',
    difficulty: 'Advanced',
    stars: 3_890,
    forks: 567,
    official: false,
  },
  {
    id: 'rag-system',
    name: 'RAG System',
    description: 'Retrieval-Augmented Generation with pgvector, chunking strategies, and a chat UI.',
    category: 'ai',
    stack: ['Python', 'FastAPI', 'pgvector', 'LangChain'],
    estimatedTime: '30 min',
    difficulty: 'Advanced',
    stars: 5_210,
    forks: 876,
    official: true,
  },
  // Full-Stack
  {
    id: 'mern',
    name: 'MERN Stack',
    description: 'MongoDB, Express, React, Node.js — JWT auth, file uploads, and Mongoose models.',
    category: 'fullstack',
    stack: ['MongoDB', 'Express', 'React', 'Node.js'],
    estimatedTime: '20 min',
    difficulty: 'Intermediate',
    stars: 4_430,
    forks: 892,
    official: false,
  },
  {
    id: 't3-stack',
    name: 'T3 Stack',
    description: 'The full T3 stack: Next.js, tRPC, Tailwind, Prisma, and NextAuth — batteries included.',
    category: 'fullstack',
    stack: ['Next.js', 'tRPC', 'Prisma', 'NextAuth'],
    estimatedTime: '12 min',
    difficulty: 'Intermediate',
    stars: 7_890,
    forks: 1_340,
    official: true,
  },
  {
    id: 'django-react',
    name: 'Django + React',
    description: 'Django REST Framework backend + React SPA with JWT auth, Celery tasks, and Redis cache.',
    category: 'fullstack',
    stack: ['Django', 'DRF', 'React', 'Celery'],
    estimatedTime: '25 min',
    difficulty: 'Intermediate',
    stars: 3_120,
    forks: 534,
    official: false,
  },
];

const COMMUNITY_TEMPLATES: Template[] = [
  {
    id: 'supabase-saas',
    name: 'Supabase SaaS Starter',
    description: 'Multi-tenant SaaS boilerplate with Supabase auth, Row Level Security, and Stripe billing.',
    category: 'fullstack',
    stack: ['Next.js', 'Supabase', 'Stripe', 'Tailwind'],
    estimatedTime: '20 min',
    difficulty: 'Intermediate',
    stars: 9_210,
    forks: 1_870,
    official: false,
  },
  {
    id: 'rust-actix',
    name: 'Rust Actix API',
    description: 'High-performance REST API with Actix-web, SeaORM, and comprehensive error handling.',
    category: 'backend',
    stack: ['Rust', 'Actix-web', 'SeaORM', 'PostgreSQL'],
    estimatedTime: '20 min',
    difficulty: 'Advanced',
    stars: 2_340,
    forks: 312,
    official: false,
  },
  {
    id: 'electron-app',
    name: 'Electron Desktop App',
    description: 'Cross-platform desktop app with Electron, React, auto-updater, and native menu.',
    category: 'frontend',
    stack: ['Electron', 'React', 'TypeScript', 'Vite'],
    estimatedTime: '15 min',
    difficulty: 'Intermediate',
    stars: 3_780,
    forks: 621,
    official: false,
  },
];

// ---- Helpers ----------------------------------------------------------------

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Beginner: 'bg-green-500/20 text-green-400 border-green-800',
  Intermediate: 'bg-yellow-500/20 text-yellow-400 border-yellow-800',
  Advanced: 'bg-red-500/20 text-red-400 border-red-800',
};

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ---- Sub-components ---------------------------------------------------------

interface TemplateCardProps {
  template: Template;
  onUse: (id: string) => void;
  loading: boolean;
}

function TemplateCard({ template, onUse, loading }: TemplateCardProps) {
  return (
    <div className="group flex flex-col bg-gray-800/30 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all hover:bg-gray-800/50">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-white truncate">{template.name}</h3>
            {template.official && (
              <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-800 border">
                Official
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-400 line-clamp-2">{template.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {template.stack.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-gray-700/60 border border-gray-700 text-gray-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {template.estimatedTime}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5" />
              {formatCount(template.stars)}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="w-3.5 h-3.5" />
              {formatCount(template.forks)}
            </span>
          </div>
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${DIFFICULTY_COLOR[template.difficulty]}`}
          >
            {template.difficulty}
          </span>
        </div>

        <div className="flex gap-2">
          <Link href={`/templates/${template.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs">
              View details
            </Button>
          </Link>
          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onUse(template.id)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                Use Template
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Main page --------------------------------------------------------------

export default function TemplatesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return TEMPLATES.filter((t) => {
      const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.stack.some((s) => s.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const handleUseTemplate = async (templateId: string) => {
    setLoadingId(templateId);
    setError(null);
    try {
      const res = await fetch('/api/v1/sessions/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const { sessionId } = (await res.json()) as { sessionId: string };
      // Land on the new project's replay timeline (there is no bare
      // /sessions/[id] route — replay is the project's session view).
      router.push(`/sessions/${sessionId}/replay`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-1.5 text-sm mb-6">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-gray-300">{TEMPLATES.length} templates available</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400">
              Start with a template,
            </span>
            <br />
            <span className="text-white">finish in record time.</span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Pre-configured workflows for common development tasks. Every template ships with full
            AITM checkpoint support — so you can travel back to any step.
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates by name, stack, or language…"
              className="w-full h-12 rounded-xl border border-gray-700 bg-gray-800 pl-11 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 w-full">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveCategory(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                activeCategory === id
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            <span className="font-medium">Error:</span> {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Template grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-base">No templates match your search.</p>
            <button
              onClick={() => { setSearch(''); setActiveCategory('all'); }}
              className="mt-3 text-sm text-purple-400 hover:text-purple-300 underline underline-offset-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={handleUseTemplate}
                loading={loadingId === template.id}
              />
            ))}
          </div>
        )}

        {/* Community templates */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-gray-800" />
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Users className="w-4 h-4" />
              Community Templates
            </div>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          <p className="text-sm text-gray-500 mb-6 text-center">
            Contributed by the AITM community. Quality-reviewed but not officially maintained.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMMUNITY_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={handleUseTemplate}
                loading={loadingId === template.id}
              />
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 mb-3">
              Have a template to share with the community?
            </p>
            <Button variant="outline" asChild>
              <Link href="https://github.com/gitgram-ai/aitimemachine/discussions" target="_blank" rel="noopener noreferrer">
                Submit a template
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
