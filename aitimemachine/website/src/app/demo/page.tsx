'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Terminal,
  Undo2,
  Shield,
  Clock,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LineKind = 'command' | 'output' | 'success' | 'error' | 'warning' | 'comment' | 'info';

interface DemoLine {
  kind: LineKind;
  text: string;
}

interface DemoStep {
  label: string;
  description: string;
  lines: DemoLine[];
  /** Which feature callout to highlight while this step plays. */
  feature: 'capture' | 'checkpoint' | 'detect' | 'restore' | null;
}

const STEPS: DemoStep[] = [
  {
    label: 'Initialize',
    description: 'AITM starts watching your project for changes.',
    feature: 'capture',
    lines: [
      { kind: 'comment', text: '# Drop AITM into any project' },
      { kind: 'command', text: 'aitm init' },
      { kind: 'output', text: 'Scanning workspace...' },
      { kind: 'success', text: 'Watching 1,284 files (incl. untracked + env state)' },
      { kind: 'info', text: 'Session started: sess_4f2a · auto-checkpoint every change' },
    ],
  },
  {
    label: 'Agent edits',
    description: 'An AI agent rewrites the auth flow across several files.',
    feature: 'capture',
    lines: [
      { kind: 'comment', text: '# Claude agent makes a multi-file change' },
      { kind: 'command', text: 'claude "refactor auth to use JWT refresh tokens"' },
      { kind: 'output', text: 'edited  src/auth/session.ts' },
      { kind: 'output', text: 'edited  src/auth/middleware.ts' },
      { kind: 'output', text: 'created src/auth/jwt.ts' },
      { kind: 'success', text: 'Captured: 3 files, terminal history, AI context' },
    ],
  },
  {
    label: 'Checkpoint',
    description: 'AITM snapshots the full state — not just git-tracked files.',
    feature: 'checkpoint',
    lines: [
      { kind: 'comment', text: '# A checkpoint is created automatically' },
      { kind: 'command', text: 'aitm checkpoint "jwt refresh tokens"' },
      { kind: 'output', text: 'Snapshotting working tree + .env + node state...' },
      { kind: 'success', text: 'Checkpoint cp_91d created (atomic, restorable)' },
      { kind: 'info', text: 'Tip: every agent action becomes a point in time' },
    ],
  },
  {
    label: 'It broke',
    description: 'The next agent pass introduces a regression. Tests fail.',
    feature: 'detect',
    lines: [
      { kind: 'comment', text: '# Agent keeps going... and breaks the build' },
      { kind: 'command', text: 'npm test' },
      { kind: 'error', text: 'FAIL  src/auth/session.test.ts' },
      { kind: 'error', text: '  ✕ refreshes expired tokens (TypeError: undefined)' },
      { kind: 'warning', text: '17 passing · 4 failing — something the agent did broke auth' },
    ],
  },
  {
    label: 'Find the cause',
    description: 'Search your timeline for the exact moment things still worked.',
    feature: 'detect',
    lines: [
      { kind: 'comment', text: '# When did tests last pass?' },
      { kind: 'command', text: 'aitm bisect "npm test"' },
      { kind: 'output', text: 'Replaying checkpoints...' },
      { kind: 'success', text: 'cp_91d "jwt refresh tokens"  →  tests PASS' },
      { kind: 'error', text: 'cp_a3e "inline token cache"   →  tests FAIL' },
      { kind: 'info', text: 'Regression introduced in cp_a3e' },
    ],
  },
  {
    label: 'Restore',
    description: 'Travel back to the last good state in one command.',
    feature: 'restore',
    lines: [
      { kind: 'comment', text: '# Go back to the last working checkpoint' },
      { kind: 'command', text: 'aitm restore cp_91d' },
      { kind: 'output', text: 'Backing up current state to cp_now (safety)...' },
      { kind: 'output', text: 'Restoring 3 files + env + AI context...' },
      { kind: 'success', text: 'Restored to cp_91d. Crisis averted.' },
      { kind: 'command', text: 'npm test' },
      { kind: 'success', text: '21 passing · 0 failing ✓' },
    ],
  },
];

const FEATURES = [
  {
    id: 'capture' as const,
    icon: Terminal,
    title: 'Captures everything',
    description: 'Untracked files, terminal history, env state, and AI context — not just commits.',
  },
  {
    id: 'checkpoint' as const,
    icon: Clock,
    title: 'Automatic checkpoints',
    description: 'Every agent action becomes a restorable point in time, with zero effort.',
  },
  {
    id: 'detect' as const,
    icon: AlertTriangle,
    title: 'Pinpoint regressions',
    description: 'Bisect across your timeline to find exactly when and why things broke.',
  },
  {
    id: 'restore' as const,
    icon: Undo2,
    title: 'One-command restore',
    description: 'Atomic restore with an automatic safety backup. Travel back, fix forward.',
  },
];

const LINE_DELAY_MS = 700;
const STEP_PAUSE_MS = 1100;

const KIND_STYLES: Record<LineKind, string> = {
  command: 'text-green-400',
  output: 'text-gray-300',
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  comment: 'text-gray-500',
  info: 'text-blue-400',
};

function prefixFor(kind: LineKind): string {
  if (kind === 'command') return '$ ';
  if (kind === 'success') return '✓ ';
  if (kind === 'error') return '✕ ';
  if (kind === 'warning') return '! ';
  return '  ';
}

export default function DemoPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentStep = STEPS[stepIndex];
  const activeFeature = currentStep.feature;

  // Advance the animation while playing.
  useEffect(() => {
    if (!isPlaying) return;

    const totalLines = currentStep.lines.length;

    if (visibleLines < totalLines) {
      const timer = setTimeout(() => {
        setVisibleLines((n) => n + 1);
      }, LINE_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Step complete — pause, then move to the next step (loop at the end).
    const timer = setTimeout(() => {
      setStepIndex((idx) => (idx + 1) % STEPS.length);
      setVisibleLines(0);
    }, STEP_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, visibleLines, currentStep.lines.length, stepIndex]);

  // Keep the terminal scrolled to the newest line.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLines, stepIndex]);

  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);

  const handleRestart = useCallback(() => {
    setStepIndex(0);
    setVisibleLines(0);
    setIsPlaying(true);
  }, []);

  const goToStep = useCallback((idx: number) => {
    const clamped = (idx + STEPS.length) % STEPS.length;
    setStepIndex(clamped);
    // Show all lines of a manually-selected step so users can read it.
    setVisibleLines(STEPS[clamped].lines.length);
    setIsPlaying(false);
  }, []);

  const handleNext = useCallback(() => goToStep(stepIndex + 1), [goToStep, stepIndex]);
  const handlePrev = useCallback(() => goToStep(stepIndex - 1), [goToStep, stepIndex]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-300">Interactive product demo</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              See AITM in action
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Watch a real AI-assisted session go sideways — and recover in one command.
            Press play, or step through it yourself.
          </p>
        </div>
      </section>

      {/* Interactive terminal demo */}
      <section className="pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            {/* Terminal */}
            <div className="lg:col-span-2">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
                {/* Title bar */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500/80" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <span className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                    <Terminal className="w-3.5 h-3.5" />
                    aitm — {currentStep.label}
                  </div>
                  <div className="w-12" />
                </div>

                {/* Terminal body */}
                <div
                  ref={scrollRef}
                  className="h-[360px] overflow-y-auto p-5 font-mono text-sm leading-relaxed bg-gray-950/60"
                >
                  {currentStep.lines.slice(0, visibleLines).map((line, i) => (
                    <div key={`${stepIndex}-${i}`} className={cn('whitespace-pre-wrap', KIND_STYLES[line.kind])}>
                      <span className="select-none opacity-70">{prefixFor(line.kind)}</span>
                      {line.text}
                    </div>
                  ))}
                  {isPlaying && visibleLines < currentStep.lines.length && (
                    <span className="inline-block w-2 h-4 bg-green-400 animate-pulse align-middle" />
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-800/40 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrev}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                      aria-label="Previous step"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handlePlayPause}
                      className="p-2 rounded-lg text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={handleNext}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                      aria-label="Next step"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleRestart}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                      aria-label="Restart"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    Step {stepIndex + 1} / {STEPS.length}
                  </div>
                </div>
              </div>

              {/* Step progress / step-through pills */}
              <div className="mt-4 flex flex-wrap gap-2">
                {STEPS.map((step, i) => (
                  <button
                    key={step.label}
                    onClick={() => goToStep(i)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      i === stepIndex
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                    )}
                  >
                    {i + 1}. {step.label}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-sm text-gray-400">{currentStep.description}</p>
            </div>

            {/* Feature callouts highlighting as the demo plays */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">
                What&apos;s happening
              </h3>
              {FEATURES.map((feature) => {
                const isActive = feature.id === activeFeature;
                return (
                  <div
                    key={feature.id}
                    className={cn(
                      'p-4 rounded-2xl border transition-all duration-300',
                      isActive
                        ? 'bg-blue-500/10 border-blue-500/60 shadow-lg shadow-blue-500/10 scale-[1.02]'
                        : 'bg-gray-800/30 border-gray-800 opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                          isActive ? 'bg-blue-500/30' : 'bg-gray-700/50'
                        )}
                      >
                        <feature.icon
                          className={cn('w-4 h-4', isActive ? 'text-blue-300' : 'text-gray-400')}
                        />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1">{feature.title}</h4>
                        <p className="text-xs text-gray-400 leading-relaxed">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Without vs With AITM */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The same broken session, two outcomes</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              When an agent breaks your project, the difference is whether you can travel back.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Without */}
            <div className="bg-gray-900/60 border border-red-500/20 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800 bg-red-500/5">
                <X className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold text-red-300">Without AITM</h3>
              </div>
              <ul className="p-6 space-y-4">
                {[
                  'Agent edits files you never saw; no record of untracked changes.',
                  'Tests start failing — but which of 30 edits caused it?',
                  'git stash only covers tracked files; env + AI context are gone.',
                  'You manually undo edits, re-run, guess, and lose an afternoon.',
                  'Worst case: you reset hard and lose work that was actually good.',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-gray-400">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            {/* With */}
            <div className="bg-gray-900/60 border border-emerald-500/30 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800 bg-emerald-500/5">
                <Check className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-emerald-300">With AITM</h3>
              </div>
              <ul className="p-6 space-y-4">
                {[
                  'Every agent action is captured automatically as a checkpoint.',
                  'aitm bisect "npm test" pinpoints the exact regression.',
                  'Untracked files, env state, and AI context are all restorable.',
                  'aitm restore brings you back in one command — with a safety backup.',
                  'Crisis averted in seconds. You keep the good work, drop the bad.',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="py-12 bg-gray-900/50 border-y border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: Shield, label: 'Atomic & safe', sub: 'Every restore backs up first' },
              { icon: Clock, label: 'Zero-config', sub: 'Auto-checkpoints out of the box' },
              { icon: Undo2, label: 'One command', sub: 'aitm restore <id>' },
              { icon: Terminal, label: 'Works with git', sub: 'Captures what git can’t' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3">
                  <item.icon className="w-5 h-5 text-blue-400" />
                </div>
                <div className="font-semibold text-sm">{item.label}</div>
                <div className="text-xs text-gray-500 mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try it yourself CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-gray-800 rounded-3xl p-8 sm:p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Try it yourself</h2>
              <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                The demo took two minutes. Setting up AITM in your own project takes less.
                Follow the quick-start and create your first checkpoint today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Button size="lg" asChild className="text-base">
                  <Link href="/docs/quick-start">
                    Try the Quick Start
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="/customers">See customer stories</Link>
                </Button>
              </div>
              <code className="inline-block bg-gray-950/60 border border-gray-800 px-4 py-2 rounded-lg text-sm text-gray-300 font-mono">
                npm install -g aitimemachine && aitm init
              </code>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
