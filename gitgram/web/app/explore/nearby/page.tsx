'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { locationService } from '@/services/locationService';

interface NearbyPost {
  id: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  likesCount: number;
  commentsCount: number;
  distance?: number;
  location?: {
    name: string;
  };
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  createdAt: string;
}

interface NearbyUser {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  distance?: number;
  followersCount: number;
}

type Tab = 'posts' | 'users' | 'projects';

export default function NearbyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<NearbyPost[]>([]);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(10); // km

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (location) {
      loadNearbyContent();
    }
  }, [location, activeTab, radius]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError(null);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Unable to access your location. Please enable location services.');
        setLoading(false);
      }
    );
  };

  const loadNearbyContent = async () => {
    if (!location) return;

    setLoading(true);
    try {
      if (activeTab === 'posts') {
        const response = await locationService.getNearbyPosts(
          location.latitude,
          location.longitude,
          radius,
          20
        );
        setPosts(response.posts || []);
      } else if (activeTab === 'users') {
        const response = await locationService.getNearbyUsers(
          location.latitude,
          location.longitude,
          radius,
          20
        );
        setUsers(response.users || []);
      } else if (activeTab === 'projects') {
        const response = await locationService.getNearbyProjects(
          location.latitude,
          location.longitude,
          radius,
          20
        );
        setProjects(response.projects || []);
      }
    } catch (err) {
      console.error('Failed to load nearby content:', err);
      setError('Failed to load nearby content');
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (distance?: number) => {
    if (!distance) return '';
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m away`;
    }
    return `${distance.toFixed(1)}km away`;
  };

  if (error && !location) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Location Required</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={requestLocation}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Enable Location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Nearby</h1>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value={1}>Within 1 km</option>
          <option value={5}>Within 5 km</option>
          <option value={10}>Within 10 km</option>
          <option value={25}>Within 25 km</option>
          <option value={50}>Within 50 km</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(['posts', 'users', 'projects'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Finding nearby {activeTab}...</p>
        </div>
      ) : (
        <>
          {/* Posts Tab */}
          {activeTab === 'posts' && (
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="text-center py-12 text-gray-600 dark:text-gray-400">
                  No posts found nearby. Try increasing the radius.
                </div>
              ) : (
                posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="block bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                        {post.user.avatar ? (
                          <img src={post.user.avatar} alt={post.user.username} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          post.user.username[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">@{post.user.username}</span>
                          {post.distance && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDistance(post.distance)}
                            </span>
                          )}
                        </div>
                        {post.location?.name && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {post.location.name}
                          </div>
                        )}
                        <p className="mt-2 text-gray-700 dark:text-gray-300 line-clamp-3">{post.content}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>{post.likesCount} likes</span>
                          <span>{post.commentsCount} comments</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {users.length === 0 ? (
                <div className="col-span-2 text-center py-12 text-gray-600 dark:text-gray-400">
                  No users found nearby. Try increasing the radius.
                </div>
              ) : (
                users.map((user) => (
                  <Link
                    key={user.id}
                    href={`/${user.username}`}
                    className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          user.username[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{user.displayName || user.username}</div>
                        <div className="text-sm text-gray-500">@{user.username}</div>
                        {user.distance && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {formatDistance(user.distance)}
                          </div>
                        )}
                      </div>
                    </div>
                    {user.bio && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{user.bio}</p>
                    )}
                    <div className="mt-2 text-sm text-gray-500">
                      {user.followersCount} followers
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.length === 0 ? (
                <div className="col-span-2 text-center py-12 text-gray-600 dark:text-gray-400">
                  No projects found nearby. Try increasing the radius.
                </div>
              ) : (
                projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/project/${project.id}`}
                    className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition"
                  >
                    <h3 className="font-bold text-lg">{project.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {project.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {project.language && (
                        <span className="text-gray-500">{project.language}</span>
                      )}
                      {project.distance && (
                        <span className="text-blue-600 dark:text-blue-400">
                          {formatDistance(project.distance)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
