// Barrel exports for the proximity component set.
// These are the canonical, modern-stack versions copied from proximity/components
// and wired into the app screens (home, snippets, discover).

export { default as CodeBlock } from './CodeBlock';
export type { CodeBlockProps } from './CodeBlock';

export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorBoundary, default as ErrorBoundaryDefault } from './ErrorBoundary';

export { default as FollowSuggestions } from './FollowSuggestions';

export { default as PostCard } from './PostCard';

export {
  default as QuickActionSheet,
  DEFAULT_QUICK_ACTIONS,
} from './QuickActionSheet';
export type { QuickAction, QuickActionSheetProps } from './QuickActionSheet';

export {
  default as Skeleton,
  PostSkeleton,
  ProfileSkeleton,
  ListItemSkeleton,
} from './Skeleton';
export type { SkeletonProps } from './Skeleton';

export { default as StoriesRow } from './StoriesRow';
export type { StoryUser } from './StoriesRow';

export {
  ToastProvider,
  useToast,
  default as Toast,
} from './Toast';
export type { ToastType } from './Toast';

export { default as TrendingRepoCard } from './TrendingRepoCard';
