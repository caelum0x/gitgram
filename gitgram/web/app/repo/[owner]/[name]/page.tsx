'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { repoService, Repository } from '@/services/repoService';

import RepoHero from '@/components/repo/RepoHero';
import RepoTabNav, { RepoTab } from '@/components/repo/RepoTabNav';
import RepoFeedTab from '@/components/repo/RepoFeedTab';
import RepoMediaTab from '@/components/repo/RepoMediaTab';
import RepoSnippetsTab from '@/components/repo/RepoSnippetsTab';
import RepoActivityTab from '@/components/repo/RepoActivityTab';
import RepoAboutTab from '@/components/repo/RepoAboutTab';
import RepoInteractionPanel from '@/components/repo/RepoInteractionPanel';
import RepoStatsDashboard from '@/components/repo/RepoStatsDashboard';
import RepoProfileSkeleton from '@/components/repo/RepoProfileSkeleton';
import RepoAitmSettings from '@/components/repo/RepoAitmSettings';
import RepoCheckpointSection from '@/components/repo/RepoCheckpointSection';

export default function RepositoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const owner = (params.owner ?? params.username) as string;
  const name = (params.name ?? params.repo) as string;
  const requestedTab = searchParams.get('tab');

  const [repository, setRepository] = useState<Repository | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [snippetsCount, setSnippetsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RepoTab>('feed');

  useEffect(() => {
    if (requestedTab === 'settings') {
      setActiveTab('settings');
    }
  }, [requestedTab]);

  useEffect(() => {
    void loadRepository();
  }, [owner, name]);

  const loadRepository = async () => {
    setLoading(true);
    try {
      const [repoRes, postsRes, activityRes, snippetsRes] = await Promise.all([
        repoService.getRepository(owner, name),
        repoService.getPosts(owner, name, { page: 1, limit: 10 }),
        repoService.getActivity(owner, name, { page: 1, limit: 50 }),
        repoService.getSnippets(owner, name, { page: 1, limit: 1 }).catch(() => ({ data: { total: 0 } })),
      ]);

      const repoPayload = repoRes.data?.repository || repoRes.data;
      const isFollowing = repoRes.data?.isFollowing ?? repoPayload?.isFollowing ?? false;

      setRepository({ ...repoPayload, isFollowing });
      setPosts(postsRes.data?.posts || []);
      setActivities(activityRes.data?.activities || []);
      setSnippetsCount(snippetsRes.data?.total || 0);
    } catch (error) {
      console.error('Failed to load repository', error);
    } finally {
      setLoading(false);
    }
  };

  /** Posts that contain media (images, gifs, video). */
  const mediaPosts = useMemo(() => {
    return posts.filter((p) => p?.mediaUrl || p?.gifUrl || p?.mediaType === 'video');
  }, [posts]);

  /** Tab counts for the badge display. */
  const tabCounts = useMemo(
    () => ({
      feed: posts.length,
      media: mediaPosts.length,
      snippets: snippetsCount,
      activity: activities.length,
    }),
    [posts, mediaPosts, activities, snippetsCount]
  );

  const handleFollow = async () => {
    if (!repository) return;
    try {
      if (repository.isFollowing) {
        await repoService.unfollow(owner, name);
      } else {
        await repoService.follow(owner, name);
      }
      setRepository({
        ...repository,
        isFollowing: !repository.isFollowing,
        social: {
          ...repository.social,
          followers: Math.max(
            0,
            Number(repository.social?.followers || 0) + (repository.isFollowing ? -1 : 1)
          ),
        },
      });
    } catch (error) {
      console.error('Failed to follow/unfollow', error);
    }
  };

  // --- Loading state ---
  if (loading) return <RepoProfileSkeleton />;

  // --- Not found state ---
  if (!repository) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">404</div>
          <h2 className="mb-2 text-xl font-bold text-foreground">Repository not found</h2>
          <p className="text-sm text-foreground-secondary">
            The repository <span className="font-mono">{owner}/{name}</span> could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  // --- Tab content ---
  const renderTabContent = () => {
    switch (activeTab) {
      case 'feed':
        return <RepoFeedTab owner={owner} name={name} initialPosts={posts} />;
      case 'media':
        return <RepoMediaTab mediaPosts={mediaPosts} />;
      case 'snippets':
        return <RepoSnippetsTab owner={owner} name={name} />;
      case 'activity':
        return <RepoActivityTab owner={owner} name={name} initialActivities={activities} posts={posts} />;
      case 'about':
        return <RepoAboutTab repository={repository} owner={owner} name={name} />;
      case 'settings':
        return <RepoAitmSettings owner={owner} name={name} />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Hero section */}
      <div className="mb-6">
        <RepoHero repository={repository} onFollow={handleFollow} />
      </div>

      {/* Stats dashboard */}
      <div className="mb-6">
        <RepoStatsDashboard repository={repository} posts={posts} />
      </div>

      {/* Checkpoint-linked posts section (AITM change stories) */}
      <div className="mb-6">
        <RepoCheckpointSection owner={owner} name={name} posts={posts} />
      </div>

      {/* Tab navigation */}
      <div className="mb-6">
        <RepoTabNav activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />
      </div>

      {/* Main content area with sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tab content */}
        <div className="lg:col-span-2">{renderTabContent()}</div>

        {/* Interaction sidebar */}
        <div className="order-first lg:order-last">
          <RepoInteractionPanel
            repository={repository}
            owner={owner}
            name={name}
            onFollow={handleFollow}
          />
        </div>
      </div>
    </div>
  );
}
