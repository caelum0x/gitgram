import { create } from 'zustand';
import { postService } from '../services/postService';

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number;
}

interface PostDraft {
  id?: string;
  content: string;
  mediaItems: MediaItem[];
  hashtags: string[];
  mentions: string[];
  location?: {
    name: string;
    lat: number;
    lng: number;
  };
  scheduledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PostState {
  // Current post being created/edited
  draft: PostDraft;
  isEditing: boolean;
  editingPostId: string | null;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;

  // Draft management
  savedDrafts: PostDraft[];

  // Actions
  setContent: (content: string) => void;
  addMedia: (media: MediaItem) => void;
  removeMedia: (index: number) => void;
  reorderMedia: (fromIndex: number, toIndex: number) => void;
  setLocation: (location: PostDraft['location'] | undefined) => void;
  setScheduledAt: (date: Date | undefined) => void;

  // Hashtag/mention extraction
  extractHashtags: () => void;
  extractMentions: () => void;

  // Publishing
  publishPost: () => Promise<any>;
  schedulePost: () => Promise<any>;

  // Draft management
  saveDraft: () => void;
  loadDraft: (draftId: string) => void;
  deleteDraft: (draftId: string) => void;
  clearDraft: () => void;

  // Edit mode
  startEditing: (postId: string, post: { content: string; mediaUrls: string[] }) => void;
  cancelEditing: () => void;
  saveEdit: () => Promise<void>;

  // Reset
  reset: () => void;
}

const initialDraft: PostDraft = {
  content: '',
  mediaItems: [],
  hashtags: [],
  mentions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const usePostStore = create<PostState>((set, get) => ({
  draft: { ...initialDraft },
  isEditing: false,
  editingPostId: null,
  isUploading: false,
  uploadProgress: 0,
  uploadError: null,
  savedDrafts: [],

  setContent: (content: string) => {
    set({
      draft: {
        ...get().draft,
        content,
        updatedAt: new Date(),
      },
    });
    // Auto-extract hashtags and mentions
    get().extractHashtags();
    get().extractMentions();
  },

  addMedia: (media: MediaItem) => {
    const { draft } = get();
    if (draft.mediaItems.length >= 10) {
      throw new Error('Maximum 10 media items allowed');
    }
    set({
      draft: {
        ...draft,
        mediaItems: [...draft.mediaItems, media],
        updatedAt: new Date(),
      },
    });
  },

  removeMedia: (index: number) => {
    const { draft } = get();
    set({
      draft: {
        ...draft,
        mediaItems: draft.mediaItems.filter((_, i) => i !== index),
        updatedAt: new Date(),
      },
    });
  },

  reorderMedia: (fromIndex: number, toIndex: number) => {
    const { draft } = get();
    const mediaItems = [...draft.mediaItems];
    const [moved] = mediaItems.splice(fromIndex, 1);
    mediaItems.splice(toIndex, 0, moved);
    set({
      draft: {
        ...draft,
        mediaItems,
        updatedAt: new Date(),
      },
    });
  },

  setLocation: (location) => {
    set({
      draft: {
        ...get().draft,
        location,
        updatedAt: new Date(),
      },
    });
  },

  setScheduledAt: (scheduledAt) => {
    set({
      draft: {
        ...get().draft,
        scheduledAt,
        updatedAt: new Date(),
      },
    });
  },

  extractHashtags: () => {
    const { draft } = get();
    const hashtagRegex = /#(\w+)/g;
    const matches = draft.content.match(hashtagRegex) || [];
    const hashtags = matches.map((tag) => tag.slice(1).toLowerCase());
    set({
      draft: {
        ...draft,
        hashtags: [...new Set(hashtags)],
      },
    });
  },

  extractMentions: () => {
    const { draft } = get();
    const mentionRegex = /@(\w+)/g;
    const matches = draft.content.match(mentionRegex) || [];
    const mentions = matches.map((mention) => mention.slice(1).toLowerCase());
    set({
      draft: {
        ...draft,
        mentions: [...new Set(mentions)],
      },
    });
  },

  publishPost: async () => {
    const { draft, isUploading } = get();

    if (isUploading) return;
    if (!draft.content.trim() && draft.mediaItems.length === 0) {
      throw new Error('Post cannot be empty');
    }

    set({ isUploading: true, uploadProgress: 0, uploadError: null });

    try {
      const formData = new FormData();
      formData.append('content', draft.content);
      formData.append('hashtags', JSON.stringify(draft.hashtags));

      if (draft.location) {
        formData.append('location', JSON.stringify(draft.location));
      }

      // Add media files
      draft.mediaItems.forEach((media, index) => {
        const filename = media.uri.split('/').pop() || `media_${index}`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `${media.type}/${match[1]}` : media.type;

        formData.append('media', {
          uri: media.uri,
          name: filename,
          type,
        } as any);

        set({ uploadProgress: ((index + 1) / draft.mediaItems.length) * 50 });
      });

      set({ uploadProgress: 60 });

      const result = await postService.createPost(formData);

      set({ uploadProgress: 100 });

      // Clear draft after successful publish
      get().clearDraft();

      return result;
    } catch (error: any) {
      set({ uploadError: error.message || 'Failed to publish post' });
      throw error;
    } finally {
      set({ isUploading: false });
    }
  },

  schedulePost: async () => {
    const { draft } = get();

    if (!draft.scheduledAt) {
      throw new Error('Scheduled time is required');
    }

    // Import scheduled posts service
    const { scheduledPostsService } = await import('../services/scheduledPostsService');

    const postData = {
      content: draft.content,
      mediaUrls: draft.mediaItems.map((m) => m.uri),
      hashtags: draft.hashtags,
      location: draft.location,
      scheduledAt: draft.scheduledAt.toISOString(),
    };

    const result = await scheduledPostsService.createScheduledPost(postData);
    get().clearDraft();
    return result;
  },

  saveDraft: () => {
    const { draft, savedDrafts } = get();
    const draftWithId: PostDraft = {
      ...draft,
      id: draft.id || `draft_${Date.now()}`,
      updatedAt: new Date(),
    };

    const existingIndex = savedDrafts.findIndex((d) => d.id === draftWithId.id);

    if (existingIndex >= 0) {
      const updated = [...savedDrafts];
      updated[existingIndex] = draftWithId;
      set({ savedDrafts: updated });
    } else {
      set({ savedDrafts: [draftWithId, ...savedDrafts] });
    }

    set({ draft: draftWithId });
  },

  loadDraft: (draftId: string) => {
    const { savedDrafts } = get();
    const draft = savedDrafts.find((d) => d.id === draftId);
    if (draft) {
      set({ draft, isEditing: false, editingPostId: null });
    }
  },

  deleteDraft: (draftId: string) => {
    set({
      savedDrafts: get().savedDrafts.filter((d) => d.id !== draftId),
    });
  },

  clearDraft: () => {
    set({
      draft: { ...initialDraft, createdAt: new Date(), updatedAt: new Date() },
      isEditing: false,
      editingPostId: null,
      uploadProgress: 0,
      uploadError: null,
    });
  },

  startEditing: (postId: string, post: { content: string; mediaUrls: string[] }) => {
    set({
      isEditing: true,
      editingPostId: postId,
      draft: {
        ...initialDraft,
        content: post.content,
        mediaItems: post.mediaUrls.map((uri) => ({
          uri,
          type: 'image' as const,
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    get().extractHashtags();
    get().extractMentions();
  },

  cancelEditing: () => {
    set({
      isEditing: false,
      editingPostId: null,
      draft: { ...initialDraft, createdAt: new Date(), updatedAt: new Date() },
    });
  },

  saveEdit: async () => {
    const { draft, editingPostId, isUploading } = get();

    if (!editingPostId || isUploading) return;

    set({ isUploading: true, uploadError: null });

    try {
      await postService.updatePost(editingPostId, {
        content: draft.content,
        hashtags: draft.hashtags,
      });

      get().cancelEditing();
    } catch (error: any) {
      set({ uploadError: error.message || 'Failed to update post' });
      throw error;
    } finally {
      set({ isUploading: false });
    }
  },

  reset: () => {
    set({
      draft: { ...initialDraft, createdAt: new Date(), updatedAt: new Date() },
      isEditing: false,
      editingPostId: null,
      isUploading: false,
      uploadProgress: 0,
      uploadError: null,
    });
  },
}));
