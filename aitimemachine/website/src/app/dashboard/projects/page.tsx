'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderGit2,
  Plus,
  Search,
  Clock,
  Database,
  FileText,
  Trash2,
  GitBranch,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import { useProjects, Project } from '@/hooks/useDashboard';

function ProjectsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-32 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full" />

      {/* Projects List */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div>
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-64 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-9" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">Failed to load projects</h2>
      <p className="text-gray-400 mb-4">There was an error loading your projects.</p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}

export default function ProjectsPage() {
  const { projects, isLoading, isError, mutate } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteProject = async () => {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        mutate();
      }
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return <ProjectsSkeleton />;
  }

  if (isError) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Active</Badge>;
      case 'syncing':
        return (
          <Badge className="bg-blue-600">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Syncing
          </Badge>
        );
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const totalStorage = projects.reduce((acc, p) => {
    const storageNum = parseFloat(p.storage) || 0;
    return acc + storageNum;
  }, 0);
  const totalCheckpoints = projects.reduce((acc, p) => acc + p.checkpoints, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 mt-1">
            Manage your tracked projects and checkpoints
          </p>
        </div>
        <Button disabled>
          <Plus className="w-4 h-4 mr-2" />
          Add Project
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Projects
            </CardTitle>
            <FolderGit2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              {projects.filter((p) => p.status === 'active').length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Checkpoints
            </CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCheckpoints}</div>
            <p className="text-xs text-gray-500 mt-1">Across all projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Storage
            </CardTitle>
            <Database className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStorage.toFixed(2)} GB</div>
            <p className="text-xs text-gray-500 mt-1">Used by checkpoints</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search projects..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Projects List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Projects</CardTitle>
          <CardDescription>
            Projects are registered when you run <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">aitm init</code> in a directory
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center">
              <FolderGit2 className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                {searchQuery ? 'No matching projects' : 'No Projects Yet'}
              </h3>
              <p className="text-gray-400 mb-4 max-w-md mx-auto">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Initialize Gitgram TimeMachine in your project directory to start tracking checkpoints.'}
              </p>
              {!searchQuery && (
                <div className="bg-gray-800 rounded-lg p-4 inline-block text-left">
                  <p className="text-sm text-gray-400 mb-2">Run in your project:</p>
                  <code className="text-sm font-mono text-green-400">
                    cd your-project && aitm init
                  </code>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center">
                      <FolderGit2 className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{project.name}</span>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          main
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {project.checkpoints} checkpoints
                        </span>
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {project.storage}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(project.lastActivity)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 font-mono">{project.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/timeline?project=${project.id}`}>
                        <Clock className="w-4 h-4 mr-2" />
                        Timeline
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-400"
                      onClick={() => {
                        setProjectToDelete(project);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CLI Instructions */}
      <Card className="border-blue-800 bg-blue-950/20">
        <CardHeader>
          <CardTitle>Quick Start Guide</CardTitle>
          <CardDescription>
            Get started with Gitgram TimeMachine in your projects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                1
              </div>
              <h4 className="font-medium text-white">Install CLI</h4>
              <code className="block text-xs bg-gray-800 px-3 py-2 rounded font-mono">
                npm install -g aitimemachine
              </code>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                2
              </div>
              <h4 className="font-medium text-white">Initialize Project</h4>
              <code className="block text-xs bg-gray-800 px-3 py-2 rounded font-mono">
                cd your-project && aitm init
              </code>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <h4 className="font-medium text-white">Create Checkpoints</h4>
              <code className="block text-xs bg-gray-800 px-3 py-2 rounded font-mono">
                aitm checkpoint "feature complete"
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400">Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{projectToDelete?.name}" from Gitgram TimeMachine?
              This will delete all cloud-synced checkpoints for this project. Local checkpoints
              will remain on your machine.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteProject} disabled={deleting}>
              {deleting ? 'Removing...' : 'Remove Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
