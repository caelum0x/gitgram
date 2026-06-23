import Link from 'next/link';
import {
  Check,
  ArrowRight,
  Terminal,
  Clock,
  Shield,
  Zap,
  GitBranch,
  Undo2,
  Database,
  Code2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Clock,
    title: 'Point-in-Time Recovery',
    description: 'Restore your entire project to any previous state, not just git-tracked files.',
  },
  {
    icon: Terminal,
    title: 'Terminal History',
    description: 'Captures every command you ran, making it easy to understand what led to a state.',
  },
  {
    icon: Shield,
    title: 'AI Context Preservation',
    description: 'Saves AI chat context so you can resume conversations with full history.',
  },
  {
    icon: GitBranch,
    title: 'Works With Git',
    description: 'Complements git by tracking untracked files, configs, and environment state.',
  },
  {
    icon: Database,
    title: 'Cloud Sync',
    description: 'Sync checkpoints across machines. Never lose your work again.',
  },
  {
    icon: Code2,
    title: 'MCP Protocol',
    description: 'Native integration with Claude, Cursor, and any MCP-compatible AI tool.',
  },
];

const comparisons = [
  { feature: 'Captures untracked files', git: false, aitm: true },
  { feature: 'Terminal command history', git: false, aitm: true },
  { feature: 'AI conversation context', git: false, aitm: true },
  { feature: 'Environment state', git: false, aitm: true },
  { feature: 'Atomic restore with backup', git: false, aitm: true },
  { feature: 'MCP protocol for AI tools', git: false, aitm: true },
  { feature: 'Commit messages', git: true, aitm: true },
  { feature: 'Branch management', git: true, aitm: false },
];

const integrations = [
  { name: 'Claude Code', logo: 'C' },
  { name: 'Cursor', logo: 'Cu' },
  { name: 'Claude Desktop', logo: 'CD' },
  { name: 'Windsurf', logo: 'W' },
  { name: 'Any MCP Client', logo: '+' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-300">Now with Claude Code integration</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              Git versions code.
            </span>
            <br />
            <span className="text-white">We version reality.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Time Machine for AI-assisted development. When AI breaks something,
            travel back in time and fix it. Capture everything git doesn't.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" asChild className="text-base">
              <Link href="/sign-up">
                Start Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base">
              <Link href="/docs">View Documentation</Link>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-4">
            <code className="bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg text-sm text-gray-300 font-mono">
              npm install -g aitimemachine
            </code>
            <button className="text-gray-400 hover:text-white transition-colors">
              <span className="sr-only">Copy</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 sm:py-24 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The Problem with AI Coding</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              AI assistants are powerful but they have no memory. When things go wrong,
              you're left piecing together what happened.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🤯</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI Temporal Confusion</h3>
              <p className="text-gray-400 text-sm">
                AIs don't understand "when" things happened or your development rhythm.
                They can't distinguish between yesterday's working code and today's broken mess.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">💭</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Lost Context</h3>
              <p className="text-gray-400 text-sm">
                Every new session starts from scratch. The AI forgets your decisions,
                your reasoning, and what approaches you've already tried.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">No Causal Understanding</h3>
              <p className="text-gray-400 text-sm">
                AIs can't connect state changes to their causes. They don't know which
                command broke your build or which edit introduced the bug.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">One Command to Fix It</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              When AI breaks something, don't panic. Just go back in time.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-3xl mx-auto font-mono text-sm">
            <div className="space-y-6">
              <div>
                <div className="text-gray-500 mb-1"># AI broke something? One command:</div>
                <div className="text-green-400">$ aitm undo</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1"># Go back to before a specific change:</div>
                <div className="text-green-400">$ aitm before "added docker" --restore</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1"># Find when tests started failing:</div>
                <div className="text-green-400">$ aitm bisect "npm test"</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1"># Search your entire development history:</div>
                <div className="text-green-400">$ aitm search "authentication flow"</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 sm:py-24 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything Git Can't Do</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Gitgram TimeMachine captures the complete picture of your development state.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="bg-gray-800/30 border border-gray-800 p-6 rounded-2xl hover:border-gray-700 transition-colors">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why Not Just Git?</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Git is great for code versioning. Gitgram TimeMachine captures everything else.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 border-b border-gray-800">
                <div className="text-sm font-medium text-gray-400">Capability</div>
                <div className="text-sm font-medium text-center">Git</div>
                <div className="text-sm font-medium text-center text-blue-400">Gitgram TimeMachine</div>
              </div>
              <div className="divide-y divide-gray-800">
                {comparisons.map((row) => (
                  <div key={row.feature} className="grid grid-cols-3 gap-4 p-4 items-center">
                    <div className="text-sm text-gray-300">{row.feature}</div>
                    <div className="flex justify-center">
                      {row.git ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center text-gray-600">—</span>
                      )}
                    </div>
                    <div className="flex justify-center">
                      {row.aitm ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center text-gray-600">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 sm:py-24 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Works With Your AI Tools</h2>
          <p className="text-gray-400 mb-12 max-w-2xl mx-auto">
            Integrates via MCP protocol with all major AI coding assistants.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            {integrations.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 px-6 py-3 rounded-xl"
              >
                <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center text-sm font-bold">
                  {integration.logo}
                </div>
                <span className="text-gray-300">{integration.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-gray-800 rounded-3xl p-8 sm:p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Time Travel?</h2>
              <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                Free to start. No credit card required. Start protecting your
                development state in under 2 minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="text-base">
                  <Link href="/sign-up">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="/docs">Read the Docs</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
