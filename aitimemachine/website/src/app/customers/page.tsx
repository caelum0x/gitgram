import Link from 'next/link';
import { ArrowRight, Quote, TrendingUp, Clock, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';

interface Metric {
  value: string;
  label: string;
}

interface CaseStudy {
  company: string;
  logo: string;
  industry: string;
  accent: string;
  problem: string;
  solution: string;
  metrics: Metric[];
  quote: string;
  author: string;
  role: string;
}

const caseStudies: CaseStudy[] = [
  {
    company: 'Northwind Labs',
    logo: 'NW',
    industry: 'AI dev tooling',
    accent: 'from-blue-500 to-cyan-500',
    problem:
      'Their agents shipped 30+ PRs a day, but a single bad autonomous run could corrupt local state across untracked files and config — costing engineers hours of manual recovery.',
    solution:
      'AITM auto-checkpoints every agent action and captures untracked files, env state, and AI context. Engineers bisect failures and restore the last good state in one command.',
    metrics: [
      { value: '92%', label: 'faster recovery from bad runs' },
      { value: '6 hrs', label: 'saved per engineer / week' },
      { value: '0', label: 'lost work incidents since adoption' },
    ],
    quote:
      'AITM turned "the agent broke everything" from a half-day fire drill into a one-line restore. It captures the stuff git never did.',
    author: 'Priya Menon',
    role: 'Staff Engineer, Northwind Labs',
  },
  {
    company: 'Cobalt Studio',
    logo: 'CS',
    industry: 'Product agency',
    accent: 'from-purple-500 to-pink-500',
    problem:
      'A small team juggling many client repos relied on Cursor and Claude heavily. Context was lost between sessions, and reproducing "what the AI did yesterday" was nearly impossible.',
    solution:
      'With AITM sessions, every change is a searchable point in time. Designers and devs replay AI context, jump to any prior state, and hand off work without losing history.',
    metrics: [
      { value: '3.4x', label: 'faster client iteration cycles' },
      { value: '100%', label: 'of sessions fully reproducible' },
      { value: '40%', label: 'fewer "what happened?" standups' },
    ],
    quote:
      'Every AI session is now a timeline we can scrub through. Onboarding to a messy client repo went from days to minutes.',
    author: 'Diego Fuentes',
    role: 'Founder, Cobalt Studio',
  },
  {
    company: 'Helix Health',
    logo: 'HX',
    industry: 'Regulated SaaS',
    accent: 'from-emerald-500 to-teal-500',
    problem:
      'In a compliance-heavy environment, untracked environment drift and AI-assisted edits created audit gaps. They needed atomic, reversible state changes they could trust.',
    solution:
      'AITM gives them atomic restore with automatic safety backups and a complete record of state changes — satisfying auditors while letting engineers move fast with AI.',
    metrics: [
      { value: '100%', label: 'of state changes auditable' },
      { value: '15 min', label: 'mean time to restore' },
      { value: '2x', label: 'AI adoption with confidence' },
    ],
    quote:
      'Atomic restore with a safety backup is exactly what our compliance team needed to say yes to AI-assisted development.',
    author: 'Sarah Whitfield',
    role: 'VP Engineering, Helix Health',
  },
];

const testimonials = [
  {
    quote:
      'I stopped fearing autonomous agents. If a run goes wrong, aitm restore puts me back in seconds.',
    author: 'Marcus Lee',
    role: 'Indie hacker',
  },
  {
    quote:
      'The bisect-across-checkpoints feature found a regression in under a minute that would have taken me all afternoon.',
    author: 'Anika Rao',
    role: 'Backend Lead, Fintech startup',
  },
  {
    quote:
      'It complements git instead of fighting it. Untracked files and env state finally have a time machine.',
    author: 'Tom Becker',
    role: 'Platform Engineer',
  },
];

const logos = ['Northwind', 'Cobalt', 'Helix', 'Aperture', 'Vectorly', 'Loomis'];

const metricIcons = [TrendingUp, Clock, ShieldCheck];

export default function CustomersPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-300">Customer stories</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              Teams that ship with AI,
            </span>
            <br />
            <span className="text-white">without losing their work.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto">
            From solo builders to regulated SaaS, teams use AITM to make AI-assisted
            development safe, reversible, and fully reproducible.
          </p>
        </div>
      </section>

      {/* Logo strip */}
      <section className="py-10 border-y border-gray-800 bg-gray-900/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs uppercase tracking-widest text-gray-500 mb-6">
            Trusted by fast-moving teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {logos.map((name) => (
              <span key={name} className="text-lg font-semibold text-gray-600">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Case studies */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {caseStudies.map((cs) => (
            <article
              key={cs.company}
              className="bg-gray-900/60 border border-gray-800 rounded-3xl overflow-hidden hover:border-gray-700 transition-colors"
            >
              <div className="grid lg:grid-cols-3 gap-0">
                {/* Left: identity + metrics */}
                <div className="p-8 border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900/40">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cs.accent} flex items-center justify-center font-bold`}
                    >
                      {cs.logo}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{cs.company}</h3>
                      <p className="text-xs text-gray-500">{cs.industry}</p>
                    </div>
                  </div>
                  <div className="space-y-4 mt-6">
                    {cs.metrics.map((m, i) => {
                      const Icon = metricIcons[i % metricIcons.length];
                      return (
                        <div key={m.label} className="flex items-center gap-3">
                          <Icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <div>
                            <div className="text-xl font-bold text-white">{m.value}</div>
                            <div className="text-xs text-gray-500">{m.label}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: problem / solution / quote */}
                <div className="lg:col-span-2 p-8">
                  <div className="grid sm:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-red-400 mb-2">Problem</h4>
                      <p className="text-sm text-gray-400 leading-relaxed">{cs.problem}</p>
                    </div>
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-2">Solution</h4>
                      <p className="text-sm text-gray-300 leading-relaxed">{cs.solution}</p>
                    </div>
                  </div>
                  <blockquote className="relative bg-gray-800/40 border border-gray-800 rounded-2xl p-5">
                    <Quote className="absolute top-4 right-4 w-6 h-6 text-gray-700" />
                    <p className="text-gray-200 italic mb-3">&ldquo;{cs.quote}&rdquo;</p>
                    <footer className="text-sm">
                      <span className="font-medium text-white">{cs.author}</span>
                      <span className="text-gray-500"> · {cs.role}</span>
                    </footer>
                  </blockquote>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-24 bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What developers say</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              The reactions we hear most after someone&apos;s first restore.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.author}
                className="bg-gray-800/30 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors"
              >
                <Quote className="w-6 h-6 text-blue-400 mb-4" />
                <p className="text-gray-300 mb-5 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="text-sm">
                  <div className="font-medium text-white">{t.author}</div>
                  <div className="text-gray-500">{t.role}</div>
                </div>
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
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Join them</h2>
              <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                See why teams trust AITM to make AI-assisted development reversible.
                Watch the demo, then start free.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="text-base">
                  <Link href="/demo">
                    Watch the demo
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="/sign-up">Start Free</Link>
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
