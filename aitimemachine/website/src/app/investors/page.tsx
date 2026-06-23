import Link from 'next/link';
import {
  ArrowRight,
  Users,
  Database,
  Shield,
  TrendingUp,
  Mail,
  ExternalLink,
  Quote,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface FundingRound {
  round: string
  amount: string
  date: string
  description: string
  accentColor: string
  dotColor: string
}

interface KeyMetric {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
  sublabel: string
  accentColor: string
  bgColor: string
}

interface InvestorLogo {
  name: string
  tier: 'lead' | 'strategic'
}

interface PressQuote {
  publication: string
  quote: string
  author: string
  date: string
  url: string
}

const fundingRounds: FundingRound[] = [
  {
    round: 'Pre-Seed',
    amount: '$1.2M',
    date: 'Q4 2025',
    description: 'Initial funding to build the checkpoint engine and validate the core thesis with early developer users.',
    accentColor: 'text-blue-400',
    dotColor: 'bg-blue-500',
  },
  {
    round: 'Seed',
    amount: '$4.8M',
    date: 'Q2 2026',
    description: 'Scaling the team, launching the cloud sync product, and expanding integrations with Claude, Cursor, and Windsurf.',
    accentColor: 'text-purple-400',
    dotColor: 'bg-purple-500',
  },
];

const keyMetrics: KeyMetric[] = [
  {
    icon: Users,
    value: '12,400+',
    label: 'Active Developers',
    sublabel: 'Monthly active users across CLI and dashboard',
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Database,
    value: '3.2M',
    label: 'Sessions Saved',
    sublabel: 'Checkpoints created since launch',
    accentColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Shield,
    value: '847 TB',
    label: 'Data Protected',
    sublabel: 'Workspace state secured in cloud sync',
    accentColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: TrendingUp,
    value: '38%',
    label: 'MoM Growth',
    sublabel: 'New user growth over the past 90 days',
    accentColor: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
];

const investorLogos: InvestorLogo[] = [
  { name: 'Accel', tier: 'lead' },
  { name: 'Pioneer Fund', tier: 'lead' },
  { name: 'Gradient Ventures', tier: 'strategic' },
  { name: 'Dev Collective', tier: 'strategic' },
  { name: 'Horizon VC', tier: 'strategic' },
  { name: 'OSS Capital', tier: 'strategic' },
];

const pressQuotes: PressQuote[] = [
  {
    publication: 'The Verge',
    quote: 'AITimeMachine is quietly becoming essential infrastructure for teams that take AI-assisted development seriously.',
    author: 'Sarah Chen, Staff Writer',
    date: 'May 2026',
    url: 'https://theverge.com',
  },
  {
    publication: 'Hacker News',
    quote: 'Finally a tool that treats AI agents like the non-deterministic systems they are. AITM\'s restore is genuinely sub-second on a 2GB workspace.',
    author: 'Thread top comment (1,240 points)',
    date: 'April 2026',
    url: 'https://news.ycombinator.com',
  },
  {
    publication: 'Developer Weekly',
    quote: 'If you\'re running Claude Code or Cursor in an agentic workflow, not using AITM is a liability, not a choice.',
    author: 'Marcus Toll, Editor',
    date: 'March 2026',
    url: 'https://developerweekly.com',
  },
  {
    publication: 'TechCrunch',
    quote: 'The startup solving a problem every AI developer has — but most haven\'t yet found the words to describe.',
    author: 'Priya Anand, Reporter',
    date: 'February 2026',
    url: 'https://techcrunch.com',
  },
];

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">Investors & Press</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold mb-8 leading-tight">
          Backed by developers,
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            for developers
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">
          AITimeMachine is backed by investors who understand that the AI development tooling
          layer is one of the most important infrastructure categories of the next decade.
          Every dollar we've raised has gone toward making developers safer and faster.
        </p>
      </section>

      {/* Funding Timeline */}
      <section className="py-16 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">Funding History</Badge>
            <h2 className="text-3xl font-bold mb-4">Our funding journey</h2>
            <p className="text-gray-400 text-lg max-w-xl">
              From a weekend prototype to category-defining infrastructure — all in under a year.
            </p>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500 via-purple-500 to-transparent hidden sm:block" />
            <div className="space-y-10">
              {fundingRounds.map((round, index) => (
                <div key={round.round} className="sm:pl-16 relative">
                  {/* Timeline dot */}
                  <div className={`absolute left-4 top-5 w-4 h-4 rounded-full ${round.dotColor} border-4 border-gray-950 hidden sm:block`} />
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-8">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="text-xl font-bold">{round.round}</h3>
                              <Badge
                                className={`${index === 0 ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}
                              >
                                {round.date}
                              </Badge>
                            </div>
                            <p className={`text-3xl font-bold ${round.accentColor}`}>{round.amount}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-400 text-base leading-relaxed">{round.description}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
              {/* Future indicator */}
              <div className="sm:pl-16 relative">
                <div className="absolute left-4 top-5 w-4 h-4 rounded-full bg-gray-700 border-4 border-gray-950 hidden sm:block" />
                <div className="bg-gray-900/50 border border-gray-800 border-dashed rounded-2xl p-8">
                  <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-1">Next round</p>
                  <p className="text-gray-400 text-base">
                    We're building sustainably and focused on growth metrics. Interested in participating
                    in our next round?{' '}
                    <a
                      href="mailto:investors@aitimemachine.dev"
                      className="text-blue-400 hover:text-blue-300 transition-colors underline"
                    >
                      Reach out.
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">Key Metrics</Badge>
            <h2 className="text-3xl font-bold mb-4">Traction speaks for itself</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Numbers from June 2026. Growing every week.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {keyMetrics.map((metric) => (
              <div
                key={metric.label}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-7 hover:border-gray-700 transition-colors"
              >
                <div className={`w-12 h-12 ${metric.bgColor} rounded-xl flex items-center justify-center mb-5`}>
                  <metric.icon className={`w-6 h-6 ${metric.accentColor}`} />
                </div>
                <p className={`text-3xl font-bold ${metric.accentColor} mb-1`}>{metric.value}</p>
                <p className="font-semibold text-white mb-1">{metric.label}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{metric.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Investor Logos */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">Our Investors</Badge>
            <h2 className="text-3xl font-bold mb-4">Supported by the best</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              We're backed by funds that have a track record of building developer-first companies.
            </p>
          </div>
          <div className="mb-8">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-medium text-center mb-6">Lead Investors</p>
            <div className="flex flex-wrap justify-center gap-5 mb-10">
              {investorLogos
                .filter((inv) => inv.tier === 'lead')
                .map((investor) => (
                  <div
                    key={investor.name}
                    className="w-44 h-20 bg-gray-900 border border-gray-700 rounded-2xl flex items-center justify-center"
                  >
                    <span className="text-gray-300 font-semibold text-lg">{investor.name}</span>
                  </div>
                ))}
            </div>
            <p className="text-sm text-gray-500 uppercase tracking-wider font-medium text-center mb-6">Strategic Investors</p>
            <div className="flex flex-wrap justify-center gap-4">
              {investorLogos
                .filter((inv) => inv.tier === 'strategic')
                .map((investor) => (
                  <div
                    key={investor.name}
                    className="w-36 h-16 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center"
                  >
                    <span className="text-gray-400 font-medium text-sm">{investor.name}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* Press Mentions */}
      <section className="bg-gray-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">Press</Badge>
            <h2 className="text-3xl font-bold mb-4">What people are saying</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Coverage from developers, journalists, and the communities that shape how
              engineers work with AI tools.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {pressQuotes.map((item) => (
              <Card
                key={item.publication}
                className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors"
              >
                <CardContent className="p-8">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="font-bold text-white text-lg">{item.publication}</p>
                      <p className="text-gray-500 text-sm">{item.date}</p>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                      aria-label={`Read on ${item.publication}`}
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </a>
                  </div>
                  <div className="relative pl-5 border-l-2 border-blue-500/40 mb-5">
                    <Quote className="w-4 h-4 text-blue-500/40 absolute -left-2.5 -top-1" />
                    <p className="text-gray-300 text-base leading-relaxed italic">{item.quote}</p>
                  </div>
                  <p className="text-gray-500 text-sm">{item.author}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Press Contact */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-gray-800">
            <CardContent className="py-16 text-center">
              <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Mail className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Press inquiries</h2>
              <p className="text-gray-400 text-lg mb-3 max-w-xl mx-auto leading-relaxed">
                Writing about AI development tooling, the future of human-AI workflows, or
                the developer infrastructure layer? We'd love to talk.
              </p>
              <p className="text-gray-500 text-base mb-10">
                We typically respond to press inquiries within one business day.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild>
                  <a href="mailto:press@aitimemachine.dev">
                    <Mail className="w-4 h-4 mr-2" />
                    press@aitimemachine.dev
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-gray-700 hover:border-gray-600">
                  <Link href="/about">
                    Read Our Story
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
              <p className="text-gray-600 text-sm mt-8">
                For investor inquiries:{' '}
                <a
                  href="mailto:investors@aitimemachine.dev"
                  className="text-gray-500 hover:text-gray-400 transition-colors underline"
                >
                  investors@aitimemachine.dev
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
