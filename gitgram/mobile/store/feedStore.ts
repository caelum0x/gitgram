import { create } from 'zustand';
import { postService } from '../services/postService';

interface Post {
  id: string;
  content: string;
  mediaUrls: string[];
  likesCount: number;
  commentsCount: number;
  retweetsCount: number;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
  isLiked?: boolean;
  isSaved?: boolean;
  isRetweeted?: boolean;
}

interface FeedState {
  posts: Post[];
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  fetchFeed: (refresh?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  unlikePost: (postId: string) => Promise<void>;
  savePost: (postId: string) => Promise<void>;
  unsavePost: (postId: string) => Promise<void>;
  retweetPost: (postId: string, comment?: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  addPost: (post: Post) => void;
  updatePost: (postId: string, updates: Partial<Post>) => void;
  clearFeed: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  page: 1,
  hasMore: true,
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchFeed: async (refresh = false) => {
    const { isLoading, isRefreshing } = get();
    if (isLoading || isRefreshing) return;

    const page = refresh ? 1 : get().page;

    set({ isLoading: !refresh, isRefreshing: refresh, error: null });

    try {
      const response = await postService.getPosts(page, 20);
      const newPosts = response.posts || response || [];

      set({
        posts: refresh ? newPosts : [...get().posts, ...newPosts],
        page: page + 1,
        hasMore: newPosts.length === 20,
        isLoading: false,
        isRefreshing: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to load feed',
        isLoading: false,
        isRefreshing: false,
      });
    }
  },

  loadMore: async () => {
    const { hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    await get().fetchFeed(false);
  },

  refresh: async () => {
    await get().fetchFeed(true);
  },

  likePost: async (postId: string) => {
    // Optimistic update
    set({
      posts: get().posts.map((post) =>
        post.id === postId
          ? { ...post, isLiked: true, likesCount: post.likesCount + 1 }
          : post
      ),
    });

    try {
      await postService.likePost(postId);
    } catch (error) {
      // Rollback on error
      set({
        posts: get().posts.map((post) =>
          post.id === postId
            ? { ...post, isLiked: false, likesCount: post.likesCount - 1 }
            : post
        ),
      });
    }
  },

  unlikePost: async (postId: string) => {
    // Optimistic update
    set({
      posts: get().posts.map((post) =>
        post.id === postId
          ? { ...post, isLiked: false, likesCount: Math.max(0, post.likesCount - 1) }
          : post
      ),
    });

    try {
      await postService.likePost(postId); // Toggle endpoint
    } catch (error) {
      // Rollback on error
      set({
        posts: get().posts.map((post) =>
          post.id === postId
            ? { ...post, isLiked: true, likesCount: post.likesCount + 1 }
            : post
        ),
      });
    }
  },

  savePost: async (postId: string) => {
    set({
      posts: get().posts.map((post) =>
        post.id === postId ? { ...post, isSaved: true } : post
      ),
    });

    try {
      await postService.savePost(postId);
    } catch (error) {
      set({
        posts: get().posts.map((post) =>
          post.id === postId ? { ...post, isSaved: false } : post
        ),
      });
    }
  },

  unsavePost: async (postId: string) => {
    set({
      posts: get().posts.map((post) =>
        post.id === postId ? { ...post, isSaved: false } : post
      ),
    });

    try {
      await postService.savePost(postId); // Toggle endpoint
    } catch (error) {
      set({
        posts: get().posts.map((post) =>
          post.id === postId ? { ...post, isSaved: true } : post
        ),
      });
    }
  },

  retweetPost: async (postId: string, comment?: string) => {
    try {
      const result = await postService.retweetPost(postId, comment);
      // Add retweet to beginning of feed
      if (result) {
        set({ posts: [result, ...get().posts] });
      }
      // Update original post
      set({
        posts: get().posts.map((post) =>
          post.id === postId
            ? { ...post, isRetweeted: true, retweetsCount: post.retweetsCount + 1 }
            : post
        ),
      });
    } catch (error) {
      console.error('Retweet error:', error);
      throw error;
    }
  },

  deletePost: async (postId: string) => {
    const originalPosts = get().posts;

    // Optimistic update
    set({
      posts: get().posts.filter((post) => post.id !== postId),
    });

    try {
      await postService.deletePost(postId);
    } catch (error) {
      // Rollback on error
      set({ posts: originalPosts });
      throw error;
    }
  },

  addPost: (post: Post) => {
    set({ posts: [post, ...get().posts] });
  },

  updatePost: (postId: string, updates: Partial<Post>) => {
    set({
      posts: get().posts.map((post) =>
        post.id === postId ? { ...post, ...updates } : post
      ),
    });
  },

  clearFeed: () => {
    set({
      posts: [],
      page: 1,
      hasMore: true,
      isLoading: false,
      isRefreshing: false,
      error: null,
    });
  },
}));
