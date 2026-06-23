import Link from 'next/link';
import { MapPin, ArrowRight, Zap, Code2, Cpu } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface JobPosting {
  title: string
  team: string
  location: string
  type: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  responsibilities: string[]
  requirements: string[]
  applyEmail: string
}

const jobs: JobPosting[] = [
  {
    title: 'Senior Rust Engineer',
    team: 'Core Infrastructure',
    location: 'Remote',
    type: 'Full-time',
    icon: Zap,
    description:
      'Own the performance-critical checkpoint engine that snapshots and restores developer workspaces in under two seconds. You will design the binary diffing format, drive the storage layer, and ensure correctness at scale.',
    responsibilities: [
      'Design and implement the AITM checkpoint serialization format',
      'Optimize the incremental diff algorithm for large monorepos',
      'Build the atomic restore primitives that guarantee no partial states',
      'Write comprehensive tests, benchmarks, and property-based fuzz tests',
      'Collaborate with the AI team to integrate agent coordination hooks',
    ],
    requirements: [
      '5+ years of systems programming experience, 2+ years in Rust',
      'Deep understanding of filesystem APIs across macOS, Linux, and Windows',
      'Experience with binary serialization formats (Cap\'n Proto, flatbuffers, or similar)',
      'Strong grasp of concurrency, memory safety, and performance profiling',
      'Bonus: experience building developer tooling or VCS internals',
    ],
    applyEmail: 'jobs+rust@aitimemachine.dev',
  },
  {
    title: 'AI/ML Infrastructure Engineer',
    team: 'AI Platform',
    location: 'Remote',
    type: 'Full-time',
    icon: Cpu,
    description:
      'Build the systems that let AI agents collaborate safely on a shared codebase. You will design the agent coordination protocol, implement conflict detection, and create the primitives that AITM exposes to MCP-compatible AI tools.',
    responsibilities: [
      'Design and implement the agent ownership and conflict-detection protocol',
      'Build and maintain the MCP server that AI tools integrate against',
      'Create sandbox environments for running agent actions with rollback guarantees',
      'Instrument agent sessions to generate training data for conflict prediction',
      'Partner with external AI providers (Anthropic, Cursor, GitHub Copilot) on integration',
    ],
    requirements: [
      '4+ years of backend engineering experience',
      'Familiarity with LLM agent frameworks and the Model Context Protocol (MCP)',
      'Experience designing distributed systems with strong consistency requirements',
      'Comfort working across Python and TypeScript codebases',
      'Bonus: contributions to open-source AI tooling or agent orchestration projects',
    ],
    applyEmail: 'jobs+ai@aitimemachine.dev',
  },
  {
    title: 'Developer Experience Engineer',
    team: 'DevEx',
    location: 'Remote',
    type: 'Full-time',
    icon: Code2,
    description:
      'Make AITM the most delightful CLI tool developers have ever used. You will own the CLI UX, VS Code extension, documentation site, and the full first-run experience from install to first successful restore.',
    responsibilities: [
      'Own the AITM CLI — commands, flags, output formatting, and error messages',
      'Maintain and extend the VS Code extension (checkpoint status bar, timeline view)',
      'Write clear, example-driven documentation and interactive tutorials',
      'Build the onboarding flow that gets new users to their first restore in under 5 minutes',
      'Gather feedback from the open-source community and translate it into product improvements',
    ],
    requirements: [
      '3+ years of experience building developer tooling or CLI applications',
      'Strong TypeScript skills; experience with Node.js CLI frameworks (ink, commander, etc.)',
      'Empathy for developer ergonomics — you notice when a flag name is slightly wrong',
      'Experience writing technical documentation that developers actually enjoy reading',
      'Bonus: VS Code extension development or open-source maintainer experience',
    ],
    applyEmail: 'jobs+devex@aitimemachine.dev',
  },
];

const perks = [
  'Fully remote — work from anywhere',
  'Competitive salary + meaningful equity',
  'Top-of-the-line hardware setup stipend',
  'Async-first culture with deep-work blocks protected',
  'Monthly learning & conference budget',
  'Direct impact on a product used by thousands of developers daily',
];

export default function JobsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">We're Hiring</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold mb-8 leading-tight">
          Help us build the safety layer
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            for AI-native development
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl leading-relaxed mb-10">
          We're a small, focused team working on infrastructure that every developer using
          AI tools will eventually depend on. We move fast, write systems code, and care
          deeply about developer ergonomics.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-gray-400">
          <span className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2">
            <MapPin className="w-4 h-4 text-blue-400" />
            Fully Remote
          </span>
          <span className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2">
            <Zap className="w-4 h-4 text-blue-400" />
            3 Open Positions
          </span>
        </div>
      </section>

      {/* Job Listings */}
      <section className="py-8 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {jobs.map((job) => (
              <Card
                key={job.title}
                className="bg-gray-900 border-gray-800 hover:border-blue-500/40 transition-colors"
              >
                <CardContent className="p-8">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                    <div className="flex items-start gap-5">
                      <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <job.icon className="w-7 h-7 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold mb-1">{job.title}</h2>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Badge className="bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-800">
                            {job.team}
                          </Badge>
                          <Badge className="bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-800">
                            <MapPin className="w-3 h-3 mr-1" />
                            {job.location}
                          </Badge>
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/10">
                            {job.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button asChild>
                      <a href={`mailto:${job.applyEmail}`}>
                        Apply Now
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </a>
                    </Button>
                  </div>

                  {/* Description */}
                  <p className="text-gray-400 text-lg leading-relaxed mb-8">{job.description}</p>

                  {/* Responsibilities + Requirements */}
                  <div className="grid md:grid-cols-2 gap-10">
                    <div>
                      <h3 className="font-semibold text-white mb-4">What you'll do</h3>
                      <ul className="space-y-3">
                        {job.responsibilities.map((item, index) => (
                          <li key={index} className="flex gap-3 text-sm text-gray-400 leading-relaxed">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-4">What we're looking for</h3>
                      <ul className="space-y-3">
                        {job.requirements.map((item, index) => (
                          <li key={index} className="flex gap-3 text-sm text-gray-400 leading-relaxed">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why join us</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Small team, real ownership, and a problem that matters to every developer building with AI.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {perks.map((perk, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl p-5"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                </span>
                <p className="text-gray-300 text-sm leading-relaxed">{perk}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Don't see the right role?</h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            We're always interested in exceptional engineers. Send us a note — tell us what you
            build and what excites you about AI-native development.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild>
              <a href="mailto:careers@aitimemachine.dev">
                Get in Touch
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-gray-700 hover:border-gray-600">
              <Link href="/about">Learn About Us</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
