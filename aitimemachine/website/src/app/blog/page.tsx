'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Calendar, Clock, Search, Tag, ArrowRight, User } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Article {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: string;
  tags: string[];
  category: string;
  featured: boolean;
  gradient: string;
}

const articles: Article[] = [
  {
    slug: 'how-ai-agents-changed-our-git-workflow',
    title: 'How AI Agents Changed Our Git Workflow Forever',
    excerpt:
      'When we started letting Claude and GPT make commits autonomously, everything we thought we knew about version control broke down. Here is what we learned rebuilding it from scratch.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 15, 2026',
    readTime: '8 min read',
    tags: ['Engineering', 'AI', 'Git'],
    category: 'Engineering',
    featured: true,
    gradient: 'from-blue-900/60 via-purple-900/40 to-pink-900/20',
  },
  {
    slug: '35-prs-a-day-claude-gpt-simultaneously',
    title: '35 PRs a Day: Running Claude and GPT Simultaneously in Production',
    excerpt:
      'We run two competing AI agents on the same codebase simultaneously. This is the architecture, the chaos, and why deterministic restore makes it actually work.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 10, 2026',
    readTime: '12 min read',
    tags: ['AI', 'Product', 'Engineering'],
    category: 'AI',
    featured: false,
    gradient: 'from-violet-900/60 via-blue-900/40 to-cyan-900/20',
  },
  {
    slug: 'deterministic-restore-why-rollback-matters',
    title: 'Deterministic Restore: Why Rollback Matters More Than Commit',
    excerpt:
      'The entire industry has optimized for committing fast. We think that is backwards. In an agentic world, the ability to restore deterministically is the most important primitive.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'June 5, 2026',
    readTime: '10 min read',
    tags: ['Engineering', 'Tutorials'],
    category: 'Engineering',
    featured: false,
    gradient: 'from-emerald-900/60 via-teal-900/40 to-blue-900/20',
  },
  {
    slug: 'aitm-2-architecture-agent-safe-version-control',
    title: 'AITM 2.0: The Architecture Behind Agent-Safe Version Control',
    excerpt:
      "A deep dive into how we rebuilt AITM's core storage engine to handle the throughput of autonomous agents while keeping every checkpoint atomic and inspectable.",
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 28, 2026',
    readTime: '15 min read',
    tags: ['Engineering', 'Product'],
    category: 'Engineering',
    featured: false,
    gradient: 'from-orange-900/60 via-red-900/40 to-pink-900/20',
  },
  {
    slug: 'from-github-to-gitgram-social-layer-for-developers',
    title: 'From GitHub to Gitgram: The Next Social Layer for Developers',
    excerpt:
      'GitHub turned repositories into products. Gitgram turns them into profiles. Here is the vision for a social network where your commit history is your portfolio.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 20, 2026',
    readTime: '7 min read',
    tags: ['Product', 'AI'],
    category: 'Product',
    featured: false,
    gradient: 'from-pink-900/60 via-purple-900/40 to-indigo-900/20',
  },
  {
    slug: 'pal-mcp-python-sandbox-for-ai-agents',
    title: 'PAL MCP: Giving Your AI Agent a Python Sandbox',
    excerpt:
      'PAL (Python Agent Layer) is our MCP server that gives AI agents a safe, deterministic Python execution environment. Here is how to wire it up with Claude Code in under 5 minutes.',
    author: 'Arhan Subasi',
    authorRole: 'Founder & CEO',
    date: 'May 12, 2026',
    readTime: '6 min read',
    tags: ['Tutorials', 'AI', 'Engineering'],
    category: 'Tutorials',
    featured: false,
    gradient: 'from-cyan-900/60 via-blue-900/40 to-violet-900/20',
  },
];

const categories = ['All', 'Engineering', 'Product', 'AI', 'Tutorials'];

const categoryColors: Record<string, string> = {
  Engineering: 'bg-blue-500/20 text-blue-300 border-blue-700/50',
  Product: 'bg-purple-500/20 text-purple-300 border-purple-700/50',
  AI: 'bg-pink-500/20 text-pink-300 border-pink-700/50',
  Tutorials: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/50',
};

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition-all duration-200 hover:shadow-xl hover:shadow-black/20"
    >
      {/* Cover gradient */}
      <div className={`h-40 bg-gradient-to-br ${article.gradient} flex items-end p-4`}>
        <div className="flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className={`text-xs px-2 py-0.5 rounded-full border ${categoryColors[tag] ?? 'bg-gray-700/50 text-gray-300 border-gray-600'}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-6">
        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-blue-400 transition-colors leading-snug">
          {article.title}
        </h3>
        <p className="text-sm text-gray-400 line-clamp-3 flex-1 leading-relaxed">
          {article.excerpt}
        </p>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">
              {article.author[0]}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-300">{article.author}</p>
              <p className="text-xs text-gray-500">{article.date}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {article.readTime}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const featuredArticle = articles.find((a) => a.featured);
  const otherArticles = articles.filter((a) => !a.featured);

  const filteredArticles = otherArticles.filter((article) => {
    const matchesCategory =
      activeCategory === 'All' || article.category === activeCategory;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      query === '' ||
      article.title.toLowerCase().includes(query) ||
      article.excerpt.toLowerCase().includes(query) ||
      article.tags.some((t) => t.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Header */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
          Engineering Blog
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
          Ideas &amp; Engineering
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl">
          Thoughts on AI-native development, deterministic version control, and building the
          infrastructure for autonomous software agents.
        </p>
      </section>

      {/* Search + Filter */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700/50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Article */}
      {featuredArticle && activeCategory === 'All' && searchQuery === '' && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Link
            href={`/blog/${featuredArticle.slug}`}
            className="group relative overflow-hidden rounded-3xl border border-gray-800 hover:border-gray-700 transition-all duration-300 block"
          >
            {/* Background gradient */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${featuredArticle.gradient} opacity-80`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />

            <div className="relative p-8 md:p-12">
              <div className="flex items-center gap-3 mb-5">
                <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur border border-white/20 rounded-full px-3 py-1 text-sm font-medium">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  Featured
                </span>
                {featuredArticle.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm text-gray-300 bg-white/10 backdrop-blur border border-white/10 rounded-full px-3 py-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h2 className="text-2xl md:text-4xl font-bold mb-4 max-w-3xl leading-tight group-hover:text-blue-300 transition-colors">
                {featuredArticle.title}
              </h2>

              <p className="text-gray-300 text-lg mb-8 max-w-2xl leading-relaxed">
                {featuredArticle.excerpt}
              </p>

              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                    {featuredArticle.author[0]}
                  </div>
                  <div>
                    <p className="font-medium">{featuredArticle.author}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <span>{featuredArticle.date}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {featuredArticle.readTime}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                  Read Article
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Articles Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {filteredArticles.length > 0 ? (
          <>
            <h2 className="text-lg font-semibold text-gray-400 mb-6">
              {activeCategory === 'All' ? 'All Articles' : activeCategory}{' '}
              <span className="text-gray-600">({filteredArticles.length})</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {filteredArticles.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No articles match your search.</p>
            <button
              onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      {/* Newsletter */}
      <section className="border-t border-gray-800 bg-gray-900/30 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold mb-3">Stay in the Loop</h2>
            <p className="text-gray-400 mb-8">
              Engineering articles and product updates, direct to your inbox. No fluff, no spam.
            </p>
            <div className="flex gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors text-sm"
              />
              <Button className="shrink-0">Subscribe</Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
