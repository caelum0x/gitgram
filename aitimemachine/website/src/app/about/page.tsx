import Link from 'next/link';
import {
  Github,
  Twitter,
  Linkedin,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Clock,
  Shield,
  Zap,
  Heart,
  Code2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface TeamMember {
  handle: string
  name: string
  role: string
  bio: string
  avatar: string
  linkedinUrl: string
  twitterUrl: string
}

interface SolutionFeature {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

const team: TeamMember[] = [
  {
    handle: 'caelum0x',
    name: 'Caelum',
    role: 'Co-Founder & CTO',
    bio: 'Built AITM because Claude kept overwriting my work. Former infrastructure engineer obsessed with determinism and developer ergonomics.',
    avatar: 'C0',
    linkedinUrl: 'https://linkedin.com/in/caelum0x',
    twitterUrl: 'https://twitter.com/caelum0x',
  },
  {
    handle: 'mxvoid',
    name: 'Marcus Void',
    role: 'Co-Founder & CEO',
    bio: 'Previously led developer platforms at two YC companies. Believes the next 10x productivity leap is AI + the right guardrails.',
    avatar: 'MV',
    linkedinUrl: 'https://linkedin.com/in/marcusvoid',
    twitterUrl: 'https://twitter.com/mxvoid',
  },
  {
    handle: 'natalielm',
    name: 'Natalie Lin',
    role: 'Co-Founder & Head of AI',
    bio: 'PhD in distributed systems. Designed the checkpoint diffing algorithm that makes AITM restores sub-second at any scale.',
    avatar: 'NL',
    linkedinUrl: 'https://linkedin.com/in/natalielm',
    twitterUrl: 'https://twitter.com/natalielm',
  },
];

const solutionFeatures: SolutionFeature[] = [
  {
    icon: Clock,
    title: 'Timeline Restore',
    description: 'Roll your entire workspace — code, configs, terminal history, AI context — back to any checkpoint in seconds.',
  },
  {
    icon: Shield,
    title: 'Agent Checkpoints',
    description: 'Automatic snapshot before every agent action. If it breaks something, one command undoes it completely.',
  },
  {
    icon: GitBranch,
    title: 'Parallel Agent Coordination',
    description: 'AITM tracks which agent owns which files, preventing silent overwrites when multiple agents run simultaneously.',
  },
  {
    icon: Zap,
    title: 'Deterministic Recovery',
    description: 'Restores are byte-for-byte identical to the saved state. No partial recoveries, no surprises.',
  },
];

const problemSteps = [
  'You ask Claude to add authentication to your app.',
  'Claude makes 12 file changes and 4 new files.',
  'Simultaneously, Cursor refactors your database schema.',
  'The two agents silently conflict. Your app no longer starts.',
  'Git shows you the diff, but not which AI wrote which change or why.',
  'You spend 3 hours untangling a mess that took 3 minutes to create.',
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">About AITimeMachine</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold mb-8 leading-tight">
          We're building the infrastructure
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            for AI-native development
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">
          Software development is undergoing its most radical transformation in decades.
          AI agents write code, open PRs, and ship features — sometimes 35 in a single day.
          We're building the safety layer that makes that possible without chaos.
        </p>
      </section>

      {/* Mission */}
      <section className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-y border-gray-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-2xl sm:text-3xl font-semibold text-gray-100 max-w-3xl mx-auto leading-relaxed">
            "In a world where AI writes 35 PRs/day, you need{' '}
            <span className="text-blue-400">deterministic restore</span>."
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <Badge className="mb-4 bg-red-500/10 text-red-400 border-red-500/20">The Problem</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                AI agents are powerful.
                <br />
                They're also dangerous at scale.
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                A single AI session can touch dozens of files across your entire codebase in seconds.
                When two agents run in parallel — or when one agent makes a bad call — the results
                can be catastrophic and nearly impossible to untangle with standard tooling.
              </p>
              <p className="text-gray-400 text-lg leading-relaxed">
                Git captures what changed. It doesn't capture who changed it, what AI context led
                to that change, or how to cleanly undo a subset of interleaved agent edits.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <h3 className="font-semibold text-lg">A day in the life (without AITM)</h3>
              </div>
              <ol className="space-y-4">
                {problemSteps.map((step, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-500 flex items-center justify-center font-mono">
                      {index + 1}
                    </span>
                    <p className={`text-sm leading-relaxed ${index === problemSteps.length - 1 ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Our Solution */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">Our Solution</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              A time machine for your entire dev environment
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              AITM creates atomic snapshots of your complete workspace state before every agent action —
              then makes restore a single deterministic command.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {solutionFeatures.map((feature) => (
              <Card key={feature.title} className="bg-gray-900 border-gray-800 hover:border-blue-500/40 transition-colors">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24" id="team">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">The Team</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Built by developers, for developers
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              We've all lost hours to AI-induced chaos. We decided to fix it.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {team.map((member) => (
              <Card key={member.handle} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
                <CardContent className="pt-8 pb-6 text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold mx-auto mb-5">
                    {member.avatar}
                  </div>
                  <h3 className="text-lg font-semibold">{member.name}</h3>
                  <p className="text-xs text-gray-500 font-mono mb-1">@{member.handle}</p>
                  <p className="text-blue-400 text-sm mb-4">{member.role}</p>
                  <p className="text-gray-400 text-sm leading-relaxed mb-6">{member.bio}</p>
                  <div className="flex justify-center gap-3">
                    <a
                      href={member.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-blue-500/20 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on LinkedIn`}
                    >
                      <Linkedin className="w-4 h-4 text-gray-400 hover:text-blue-400" />
                    </a>
                    <a
                      href={member.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-blue-500/20 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on Twitter`}
                    >
                      <Twitter className="w-4 h-4 text-gray-400 hover:text-blue-400" />
                    </a>
                    <a
                      href={`https://github.com/${member.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-blue-500/20 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on GitHub`}
                    >
                      <Github className="w-4 h-4 text-gray-400 hover:text-blue-400" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why We're Building This */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">Why We're Building This</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-8">The story behind AITM</h2>
            <div className="space-y-5 text-gray-400 text-lg leading-relaxed">
              <p>
                In late 2025, caelum0x was building a side project with Claude Code. One afternoon,
                he let the agent run autonomously while he made coffee. When he came back, Claude had
                refactored three core modules, deleted a config file that wasn't tracked by git,
                and partially rewritten a function it was never supposed to touch.
              </p>
              <p>
                The app was broken. Git showed the diffs. But there was no way to roll back just
                the AI's changes without also losing two hours of his own work that happened in
                the same session. He spent the rest of the evening manually reconstructing state
                from memory.
              </p>
              <p>
                "There has to be a better way" turned into a weekend prototype, which turned into
                AITimeMachine. We started with a simple insight: <span className="text-white font-medium">AI tools need a safety layer that
                git was never designed to provide.</span>
              </p>
              <p>
                Today, AITM is the infrastructure layer between your AI agents and your codebase.
                Every agent action is checkpointed. Every restore is deterministic. You can work
                fast and safely — because going back is always one command away.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source First */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">Open Source First</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                The core is open.
                <br />
                Always will be.
              </h2>
              <div className="space-y-4 text-gray-400 text-lg leading-relaxed">
                <p>
                  The AITM CLI and core checkpoint engine are MIT-licensed and always will be.
                  Developer tools should be auditable, forkable, and improvable by the community.
                </p>
                <p>
                  We charge for cloud infrastructure: sync, team collaboration, and the hosted
                  dashboard. The engine that protects your code will never be locked behind a paywall.
                </p>
              </div>
              <div className="flex gap-4 mt-8">
                <Button variant="outline" asChild className="border-gray-700 hover:border-gray-600">
                  <a href="https://github.com/gitgram-ai/aitimemachine" target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    View on GitHub
                  </a>
                </Button>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 font-mono text-sm">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-500 text-xs ml-2">terminal</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="text-gray-500"># Install the CLI</div>
                <div className="text-green-400">$ npm install -g @aitm/cli</div>
                <div className="mt-4 text-gray-500"># Initialize in your project</div>
                <div className="text-green-400">$ aitm init</div>
                <div className="text-gray-400">✓ Checkpoint engine ready</div>
                <div className="text-gray-400">✓ Agent coordination active</div>
                <div className="mt-4 text-gray-500"># Restore to any checkpoint</div>
                <div className="text-green-400">$ aitm restore --checkpoint before-agent-run</div>
                <div className="text-gray-400">✓ Restoring 847 files...</div>
                <div className="text-blue-400">✓ Done in 1.2s</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Join Us CTA */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-gray-800">
            <CardContent className="py-16 text-center">
              <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Heart className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Join us in building the future</h2>
              <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
                We're a small team with a clear mission. If you want to work on infrastructure
                that every AI-native developer will rely on, we'd love to talk.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild>
                  <Link href="/jobs">
                    View Open Positions
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-gray-700 hover:border-gray-600">
                  <a href="mailto:careers@aitimemachine.dev">
                    Reach Out Directly
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
