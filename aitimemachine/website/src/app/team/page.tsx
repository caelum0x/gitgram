import Link from 'next/link';
import {
  Github,
  Twitter,
  Linkedin,
  ArrowRight,
  Globe,
  Zap,
  MessageSquare,
  Eye,
  Rocket,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface TeamMember {
  handle: string
  name: string
  title: string
  bio: string
  avatar: string
  gradientFrom: string
  gradientTo: string
  funFact: string
  githubUrl: string
  twitterUrl: string
  linkedinUrl: string
}

interface WorkPrinciple {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accentColor: string
  bgColor: string
}

interface OpenPosition {
  title: string
  team: string
  type: string
}

const teamMembers: TeamMember[] = [
  {
    handle: 'caelum0x',
    name: 'Caelum',
    title: 'Co-Founder & CTO',
    bio: 'Built AITM because Claude kept overwriting his work mid-session. Former infrastructure engineer with a decade of experience designing deterministic systems at scale.',
    avatar: 'C0',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-purple-600',
    funFact: 'Has personally lost 47+ hours to AI-induced chaos before building the fix.',
    githubUrl: 'https://github.com/caelum0x',
    twitterUrl: 'https://twitter.com/caelum0x',
    linkedinUrl: 'https://linkedin.com/in/caelum0x',
  },
  {
    handle: 'mxvoid',
    name: 'Marcus Void',
    title: 'Co-Founder & CEO',
    bio: 'Previously led developer platforms at two YC-backed companies. Believes the next 10x productivity leap is AI paired with the right safety infrastructure.',
    avatar: 'MV',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-pink-600',
    funFact: 'Types at 142 WPM but still uses aitm restore weekly.',
    githubUrl: 'https://github.com/mxvoid',
    twitterUrl: 'https://twitter.com/mxvoid',
    linkedinUrl: 'https://linkedin.com/in/marcusvoid',
  },
  {
    handle: 'natalielm',
    name: 'Natalie Lin',
    title: 'Co-Founder & Head of AI',
    bio: 'PhD in distributed systems from CMU. Designed the checkpoint diffing algorithm that makes AITM restores sub-second regardless of workspace size.',
    avatar: 'NL',
    gradientFrom: 'from-cyan-500',
    gradientTo: 'to-blue-600',
    funFact: 'Wrote the original diff engine in a single 14-hour sitting.',
    githubUrl: 'https://github.com/natalielm',
    twitterUrl: 'https://twitter.com/natalielm',
    linkedinUrl: 'https://linkedin.com/in/natalielm',
  },
  {
    handle: 'devraj_s',
    name: 'Devraj Singh',
    title: 'Senior Rust Engineer',
    bio: 'Systems programming veteran who previously worked on the storage layer at a major cloud provider. Owns the AITM checkpoint engine and binary serialization format.',
    avatar: 'DS',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-red-600',
    funFact: 'Refuses to use any tool he hasn\'t read the source code for.',
    githubUrl: 'https://github.com/devraj_s',
    twitterUrl: 'https://twitter.com/devraj_s',
    linkedinUrl: 'https://linkedin.com/in/devrajsingh',
  },
  {
    handle: 'priya_dx',
    name: 'Priya Khatri',
    title: 'Developer Experience Engineer',
    bio: 'Obsessed with CLI ergonomics and first-run experiences. Owns everything from the install script to the VS Code extension status bar.',
    avatar: 'PK',
    gradientFrom: 'from-green-500',
    gradientTo: 'to-teal-600',
    funFact: 'Benchmarks every CLI command to ensure p99 output is under 80ms.',
    githubUrl: 'https://github.com/priya_dx',
    twitterUrl: 'https://twitter.com/priya_dx',
    linkedinUrl: 'https://linkedin.com/in/priyakhatri',
  },
  {
    handle: 'tomasz_w',
    name: 'Tomasz Wierzbicki',
    title: 'AI Platform Engineer',
    bio: 'Built agent coordination systems before multi-agent was a buzzword. Designed the MCP server that powers AITM\'s integrations with Claude, Cursor, and Windsurf.',
    avatar: 'TW',
    gradientFrom: 'from-yellow-500',
    gradientTo: 'to-orange-600',
    funFact: 'Maintains three open-source MCP tools used by over 8,000 developers.',
    githubUrl: 'https://github.com/tomasz_w',
    twitterUrl: 'https://twitter.com/tomasz_w',
    linkedinUrl: 'https://linkedin.com/in/tomaszwierzbicki',
  },
];

const workPrinciples: WorkPrinciple[] = [
  {
    icon: Globe,
    title: 'Remote-first',
    description: 'Our team spans 4 time zones. We hire the best engineer for the role, wherever they are. Every process is designed to work async by default.',
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: MessageSquare,
    title: 'Async communication',
    description: 'Deep work is sacred. We default to written communication over meetings, keep Slack threads well-documented, and protect uninterrupted focus time.',
    accentColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Eye,
    title: 'Build in public',
    description: 'Our core engine is open-source, our roadmap is public, and our changelog is honest. We share what we\'re learning with the developer community.',
    accentColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Rocket,
    title: 'Ship fast',
    description: 'We merge small PRs daily, deploy to production multiple times a week, and treat every release as a learning opportunity rather than a risk event.',
    accentColor: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
];

const openPositions: OpenPosition[] = [
  {
    title: 'Senior Rust Engineer',
    team: 'Core Infrastructure',
    type: 'Full-time / Remote',
  },
  {
    title: 'AI/ML Infrastructure Engineer',
    team: 'AI Platform',
    type: 'Full-time / Remote',
  },
  {
    title: 'Developer Experience Engineer',
    team: 'DevEx',
    type: 'Full-time / Remote',
  },
];

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <Badge className="mb-6 bg-purple-500/10 text-purple-400 border-purple-500/20">Our Team</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold mb-8 leading-tight">
          The team building the future
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            of AI development
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">
          We're a small, focused group of engineers who got tired of watching AI agents break
          their codebases. So we built the safety layer that every AI-native developer needs.
          Six people, one clear mission: make AI development deterministically recoverable.
        </p>
      </section>

      {/* Core Team */}
      <section className="py-16 pb-24" id="core-team">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">Core Team</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The people behind AITM</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Every one of us has personally lost hours to AI-induced chaos. That's not a
              coincidence — that's the founding story.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {teamMembers.map((member) => (
              <Card
                key={member.handle}
                className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors"
              >
                <CardContent className="pt-8 pb-6">
                  {/* Avatar */}
                  <div className="flex items-start gap-5 mb-5">
                    <div
                      className={`w-16 h-16 rounded-full bg-gradient-to-br ${member.gradientFrom} ${member.gradientTo} flex items-center justify-center text-lg font-bold flex-shrink-0`}
                    >
                      {member.avatar}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{member.name}</h3>
                      <p className="text-xs text-gray-500 font-mono">@{member.handle}</p>
                      <p className="text-blue-400 text-sm mt-0.5">{member.title}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{member.bio}</p>

                  {/* Fun fact */}
                  <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-3 mb-5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Fun fact</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{member.funFact}</p>
                  </div>

                  {/* Social links */}
                  <div className="flex gap-2">
                    <a
                      href={member.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on GitHub`}
                    >
                      <Github className="w-4 h-4 text-gray-400" />
                    </a>
                    <a
                      href={member.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on Twitter`}
                    >
                      <Twitter className="w-4 h-4 text-gray-400" />
                    </a>
                    <a
                      href={member.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                      aria-label={`${member.name} on LinkedIn`}
                    >
                      <Linkedin className="w-4 h-4 text-gray-400" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How We Work */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">How We Work</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Principles we actually live by</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Not aspirational values on a wall — the actual operating principles that shape
              how we build and communicate every day.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {workPrinciples.map((principle) => (
              <div
                key={principle.title}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-7 hover:border-gray-700 transition-colors"
              >
                <div className={`w-12 h-12 ${principle.bgColor} rounded-xl flex items-center justify-center mb-5`}>
                  <principle.icon className={`w-6 h-6 ${principle.accentColor}`} />
                </div>
                <h3 className="font-semibold text-lg mb-3">{principle.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{principle.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions Preview */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">Open Positions</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                We're growing.
                <br />
                Come build with us.
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                We have three open roles across infrastructure, AI platform, and developer
                experience. Every position is fully remote and comes with real ownership
                over systems that thousands of developers rely on daily.
              </p>
              <Button size="lg" asChild>
                <Link href="/jobs">
                  View All Open Positions
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
            <div className="space-y-4">
              {openPositions.map((position) => (
                <Link
                  key={position.title}
                  href="/jobs"
                  className="block bg-gray-900 border border-gray-800 hover:border-blue-500/40 rounded-2xl p-6 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors mb-1">
                        {position.title}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-800 text-xs">
                          {position.team}
                        </Badge>
                        <Badge className="bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-800 text-xs">
                          {position.type}
                        </Badge>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* We're Hiring Banner */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-gray-800 rounded-3xl px-8 py-16 text-center">
            <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">
              <Zap className="w-3 h-3 mr-1" />
              We're hiring
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Small team. Real ownership.
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                Infrastructure that matters.
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-4 leading-relaxed">
              We don't have a ping-pong table or free kombucha on tap. We have a hard,
              meaningful problem, a codebase you'll be proud of, and direct impact on
              how the next generation of developers ships software.
            </p>
            <p className="text-gray-500 text-base max-w-xl mx-auto mb-10 leading-relaxed">
              Fully remote, async-first, with competitive salary and meaningful equity.
              We make decisions fast and trust each engineer to own their domain completely.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/jobs">
                  See Open Roles
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-gray-700 hover:border-gray-600">
                <a href="mailto:careers@aitimemachine.dev">
                  Reach Out Directly
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
