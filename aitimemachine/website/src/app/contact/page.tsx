'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  Github,
  MessageSquare,
  BookOpen,
  Building2,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface SupportOption {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: string;
  href: string;
  external?: boolean;
  accent: string;
  iconBg: string;
}

const supportOptions: SupportOption[] = [
  {
    icon: Mail,
    title: 'Email Support',
    description: 'Send us a message and we\'ll get back to you within 24 hours.',
    action: 'support@aitimemachine.dev',
    href: 'mailto:support@aitimemachine.dev',
    accent: 'hover:border-blue-500/40',
    iconBg: 'bg-blue-500/10',
  },
  {
    icon: Github,
    title: 'GitHub Issues',
    description: 'Found a bug or have a feature request? Open an issue on GitHub.',
    action: 'Open an Issue',
    href: 'https://github.com/aitimemachine/aitm/issues',
    external: true,
    accent: 'hover:border-gray-600',
    iconBg: 'bg-gray-700/50',
  },
  {
    icon: MessageSquare,
    title: 'Discord Community',
    description: 'Join our community for real-time help, tips, and discussion.',
    action: 'Join Discord',
    href: 'https://discord.gg/aitimemachine',
    external: true,
    accent: 'hover:border-indigo-500/40',
    iconBg: 'bg-indigo-500/10',
  },
  {
    icon: BookOpen,
    title: 'Documentation',
    description: 'Browse our comprehensive docs for guides and API references.',
    action: 'Browse Docs',
    href: '/docs',
    accent: 'hover:border-purple-500/40',
    iconBg: 'bg-purple-500/10',
  },
];

const SUBJECT_OPTIONS = [
  { value: 'general', label: 'General Inquiry' },
  { value: 'support', label: 'Technical Support' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'press', label: 'Press' },
] as const;

const EMPTY_FORM: ContactFormData = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

export default function ContactPage() {
  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  function updateField(field: keyof ContactFormData, value: string): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitState('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data !== null &&
          typeof data === 'object' &&
          'error' in data &&
          typeof (data as Record<string, unknown>).error === 'string'
            ? (data as { error: string }).error
            : 'Something went wrong. Please try again.';
        throw new Error(message);
      }

      setSubmitState('success');
      setForm(EMPTY_FORM);
    } catch (error: unknown) {
      setSubmitState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">
          Contact &amp; Support
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-bold mb-6 leading-tight">
          Get in touch
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl leading-relaxed">
          Have a question, found a bug, or want to explore what AITM can do for your team?
          We&apos;re here to help.
        </p>

        {/* Response time notice */}
        <div className="flex items-center gap-2 mt-8 text-sm text-gray-500">
          <Clock className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span>
            We typically respond within <span className="text-green-400 font-medium">24 hours</span>
          </span>
        </div>
      </section>

      {/* Main content: form + support options */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid lg:grid-cols-5 gap-12">

          {/* Contact Form — takes 3/5 of the grid */}
          <div className="lg:col-span-3">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <h2 className="text-xl font-semibold mb-6">Send us a message</h2>

              {submitState === 'success' ? (
                <div className="flex flex-col items-center text-center py-12">
                  <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-5">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Message sent!</h3>
                  <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-6">
                    Thanks for reaching out. We&apos;ll get back to you within 24 hours.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSubmitState('idle')}
                    className="border-gray-700 hover:border-gray-600"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Name + Email row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="contact-name" className="block text-sm font-medium text-gray-300">
                        Name <span className="text-red-400">*</span>
                      </label>
                      <Input
                        id="contact-name"
                        type="text"
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        required
                        className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="contact-email" className="block text-sm font-medium text-gray-300">
                        Email <span className="text-red-400">*</span>
                      </label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        required
                        className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-1.5">
                    <label htmlFor="contact-subject" className="block text-sm font-medium text-gray-300">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <Select
                      value={form.subject}
                      onValueChange={(value) => updateField('subject', value)}
                      required
                    >
                      <SelectTrigger
                        id="contact-subject"
                        className="bg-gray-800 border-gray-700 text-white focus:border-blue-500 focus:ring-blue-500/20"
                      >
                        <SelectValue placeholder="Select a topic..." />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        {SUBJECT_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            className="text-gray-200 focus:bg-gray-700 focus:text-white"
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Message */}
                  <div className="space-y-1.5">
                    <label htmlFor="contact-message" className="block text-sm font-medium text-gray-300">
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="contact-message"
                      placeholder="Tell us how we can help..."
                      value={form.message}
                      onChange={(e) => updateField('message', e.target.value)}
                      required
                      rows={6}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white placeholder:text-gray-500 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>

                  {/* Error feedback */}
                  {submitState === 'error' && (
                    <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{errorMessage}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={submitState === 'loading' || !form.name || !form.email || !form.subject || !form.message}
                    className="w-full sm:w-auto"
                    size="lg"
                  >
                    {submitState === 'loading' ? (
                      <>
                        <span className="mr-2 inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* Support options sidebar — takes 2/5 */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-semibold mb-2">Other ways to reach us</h2>
            {supportOptions.map((option) => (
              <Card
                key={option.title}
                className={`bg-gray-900 border-gray-800 transition-colors ${option.accent}`}
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${option.iconBg}`}>
                      <option.icon className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm mb-1">{option.title}</h3>
                      <p className="text-gray-400 text-xs leading-relaxed mb-3">
                        {option.description}
                      </p>
                      {option.external ? (
                        <a
                          href={option.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                        >
                          {option.action} &rarr;
                        </a>
                      ) : option.href.startsWith('mailto:') ? (
                        <a
                          href={option.href}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium break-all"
                        >
                          {option.action}
                        </a>
                      ) : (
                        <Link
                          href={option.href}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                        >
                          {option.action} &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise section */}
      <section className="bg-gray-900/50 border-y border-gray-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
                Enterprise
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                For teams and organisations
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                Running AITM at scale? We offer dedicated onboarding, SLA-backed support,
                custom integrations, and self-hosted deployment options.
              </p>
              <ul className="space-y-2 mb-8">
                {[
                  'Dedicated Slack or Teams channel',
                  'SSO / SAML integration',
                  'Self-hosted deployment support',
                  'Custom SLA and uptime guarantees',
                  'Priority feature requests',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-300 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <a href="mailto:enterprise@aitimemachine.dev">
                    <Mail className="w-4 h-4 mr-2" />
                    enterprise@aitimemachine.dev
                  </a>
                </Button>
              </div>
            </div>

            {/* Talk to Sales card */}
            <Card className="bg-gradient-to-br from-orange-900/20 to-gray-900 border-orange-500/20">
              <CardContent className="pt-8 pb-8">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-5">
                  <Calendar className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Talk to Sales</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  Book a 30-minute call to discuss your team&apos;s requirements, pricing,
                  and how AITM fits into your existing workflow.
                </p>
                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full bg-orange-600 hover:bg-orange-500 text-white"
                    asChild
                  >
                    <a
                      href="https://calendly.com/aitimemachine/enterprise"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule a Call
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-gray-700 hover:border-orange-500/50"
                    asChild
                  >
                    <a href="mailto:enterprise@aitimemachine.dev">
                      <Mail className="w-4 h-4 mr-2" />
                      Email Enterprise Team
                    </a>
                  </Button>
                </div>
                <p className="text-gray-600 text-xs mt-4 text-center">
                  Typically responds within 4 hours on business days
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Bottom FAQ teaser */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Looking for quick answers?</h2>
          <p className="text-gray-400 mb-6">
            Browse our documentation — most common questions are already answered there.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline" asChild className="border-gray-700 hover:border-gray-600">
              <Link href="/docs">
                <BookOpen className="w-4 h-4 mr-2" />
                Browse Documentation
              </Link>
            </Button>
            <Button variant="outline" asChild className="border-gray-700 hover:border-gray-600">
              <a
                href="https://github.com/aitimemachine/aitm/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4 mr-2" />
                GitHub Issues
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
