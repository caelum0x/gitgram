'use client';

import { useEffect, useState } from 'react';
import { Search, FileCode2, Database, Boxes, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ProjectOption {
  id: string;
  name: string;
}

interface SearchResultState {
  query: string;
  files: Array<{
    id: string;
    repositoryId?: string | null;
    filePath: string;
    language?: string | null;
    size?: number | null;
    updatedAt?: string | null;
    snippet?: string | null;
  }>;
  artifacts: Array<{
    id: string;
    type: string;
    format: string;
    storage: string;
    size?: number | null;
    createdAt?: string | null;
  }>;
  embeddings: Array<{
    id: string;
    repositoryId?: string | null;
    filePath?: string | null;
    symbol?: string | null;
    symbolType?: string | null;
    language?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    snippet?: string | null;
  }>;
}

interface KnowledgeStats {
  files: { count: number; totalSize: number };
  artifacts: { count: number; totalSize: number };
  totalSize: number;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export default function DashboardSearchPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [results, setResults] = useState<SearchResultState | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [projectsRes, statsRes] = await Promise.all([
          fetch('/api/projects', { cache: 'no-store' }),
          fetch('/api/knowledge-base/stats', { cache: 'no-store' }),
        ]);

        const projectsData = await projectsRes.json();
        const statsData = await statsRes.json();

        setProjects((projectsData.projects || []).map((project: any) => ({
          id: project.id,
          name: project.name,
        })));
        setStats(statsRes.ok ? statsData : null);
      } catch {
        setError('Failed to load semantic search data.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Enter a search query.');
      return;
    }

    setSearching(true);
    setError('');
    try {
      const params = new URLSearchParams({ query: query.trim(), limit: '20' });
      if (selectedProject) {
        params.set('projectId', selectedProject);
      }

      const response = await fetch(`/api/knowledge-base/search?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Semantic Search</h1>
        <p className="mt-1 text-gray-400">
          Search checkpoint code history, indexed knowledge-base files, and export artifacts from one place.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Indexed Files</CardDescription>
            <CardTitle>{loading ? '...' : stats?.files.count || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            {loading ? 'Loading…' : formatBytes(stats?.files.totalSize || 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stored Artifacts</CardDescription>
            <CardTitle>{loading ? '...' : stats?.artifacts.count || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            {loading ? 'Loading…' : formatBytes(stats?.artifacts.totalSize || 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Searchable Storage</CardDescription>
            <CardTitle>{loading ? '...' : formatBytes(stats?.totalSize || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            Files, artifacts, and checkpoint-derived code context
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Query</CardTitle>
          <CardDescription>Find files, artifacts, and indexed symbols across your captured history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr,220px,140px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for file paths, symbols, or code phrases"
                className="pl-10"
              />
            </div>
            <select
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Button onClick={handleSearch} disabled={searching || loading}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4" />
                Files
                <Badge variant="secondary">{results.files.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.files.length === 0 ? (
                <p className="text-sm text-gray-400">No matching knowledge-base files.</p>
              ) : (
                results.files.map((file) => (
                  <div key={file.id} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-xs text-white">{file.filePath}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                      {file.language && <Badge variant="outline">{file.language}</Badge>}
                      {typeof file.size === 'number' && <span>{formatBytes(file.size)}</span>}
                    </div>
                    {file.snippet && <p className="mt-2 text-xs text-gray-400">{file.snippet}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Artifacts
                <Badge variant="secondary">{results.artifacts.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.artifacts.length === 0 ? (
                <p className="text-sm text-gray-400">No matching artifacts.</p>
              ) : (
                results.artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Badge>{artifact.type}</Badge>
                      <Badge variant="outline">{artifact.format}</Badge>
                    </div>
                    <p className="mt-2 font-mono text-xs text-gray-400">{artifact.id}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {typeof artifact.size === 'number' ? formatBytes(artifact.size) : 'Unknown size'}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Indexed Symbols
                <Badge variant="secondary">{results.embeddings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.embeddings.length === 0 ? (
                <p className="text-sm text-gray-400">No matching indexed symbols.</p>
              ) : (
                results.embeddings.map((embedding) => (
                  <div key={embedding.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      {embedding.symbol && <Badge>{embedding.symbol}</Badge>}
                      {embedding.symbolType && <Badge variant="outline">{embedding.symbolType}</Badge>}
                    </div>
                    <p className="mt-2 font-mono text-xs text-white">{embedding.filePath}</p>
                    {embedding.snippet && <p className="mt-2 text-xs text-gray-400">{embedding.snippet}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
