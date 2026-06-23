import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    throw error;
  }
  return res.json();
};

export interface DashboardStats {
  checkpoints: number;
  checkpointsDelta: number;
  projects: number;
  projectsDelta: number;
  apiCalls: number;
  apiCallsDelta: number;
  storage: string;
  storageDelta: number;
  recentActivity: Array<{
    id: string;
    type: string;
    project: string;
    description: string;
    time: string;
  }>;
  backendConnected?: boolean;
}

export function useDashboardStats() {
  const { data, error, isLoading, mutate } = useSWR<DashboardStats>(
    '/api/dashboard/stats',
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    stats: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export interface Project {
  id: string;
  name: string;
  path: string;
  checkpoints: number;
  lastActivity: string;
  status: 'active' | 'syncing' | 'error';
  storage: string;
}

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    projects: data?.projects || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export interface UsageData {
  plan: string;
  apiRequests: {
    used: number;
    limit: number;
    percentage: number;
  };
  storage: {
    used: number;
    limit: number;
    percentage: number;
    unit: string;
  };
  checkpoints: {
    used: number;
    limit: number | null;
    percentage: number | null;
  };
  projects: {
    used: number;
    limit: number | null;
    percentage: number | null;
  };
  chartData: Array<{
    date: string;
    requests: number;
  }>;
  endpointBreakdown: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
  storageByProject: Array<{
    project: string;
    size: number;
    percentage: number;
  }>;
}

export function useUsage() {
  const { data, error, isLoading, mutate } = useSWR<UsageData>(
    '/api/usage',
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
    }
  );

  return {
    usage: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export interface TimelineEvent {
  id: string;
  type: string;
  project: string | null;
  projectId?: string | null;
  checkpointId?: string | null;
  description: string;
  timestamp: string;
  action?: string | null;
  scopeType?: 'project' | 'folder' | 'file' | string | null;
  scopePath?: string | null;
  triggerType?: 'ai_action' | 'manual' | 'auto' | 'restore' | 'before_action' | 'after_action' | 'sync' | string | null;
  linkedCheckpointId?: string | null;
  changes?: {
    added: number;
    deleted: number;
    modified: number;
  } | null;
  fileCount?: number | null;
  conversationPreview?: string | null;
}

export function useTimeline(options?: {
  project?: string;
  type?: string;
  action?: string;
  triggerType?: string;
  scopeType?: 'project' | 'folder' | 'file';
  scopePath?: string;
  linkedOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (options?.project) params.set('project', options.project);
  if (options?.type) params.set('type', options.type);
  if (options?.action) params.set('action', options.action);
  if (options?.triggerType) params.set('triggerType', options.triggerType);
  if (options?.scopeType) params.set('scopeType', options.scopeType);
  if (options?.scopePath) params.set('scopePath', options.scopePath);
  if (options?.linkedOnly) params.set('linkedOnly', 'true');
  if (options?.from) params.set('from', options.from);
  if (options?.to) params.set('to', options.to);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset != null) params.set('offset', options.offset.toString());

  const { data, error, isLoading, mutate } = useSWR<{
    events: TimelineEvent[];
    hasMore: boolean;
    total: number;
  }>(
    `/api/timeline?${params.toString()}`,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    events: data?.events || [],
    hasMore: data?.hasMore || false,
    total: data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'disabled' | 'error';
  secret: string;
  lastDelivery: string | null;
  successRate: number;
  createdAt: string;
}

export function useWebhooks() {
  const { data, error, isLoading, mutate } = useSWR<{ webhooks: Webhook[] }>(
    '/api/webhooks',
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    webhooks: data?.webhooks || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
  status: 'active' | 'revoked';
}

export function useApiKeys() {
  const { data, error, isLoading, mutate } = useSWR<{ keys: ApiKey[] }>(
    '/api/keys',
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    keys: data?.keys || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export interface Subscription {
  plan: 'free' | 'pro' | 'team';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export function useSubscription() {
  const { data, error, isLoading, mutate } = useSWR<Subscription>(
    '/api/billing/subscription',
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    subscription: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  ip: string;
  location: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

export function useSessions() {
  const { data, error, isLoading, mutate } = useSWR<{
    sessions: Session[];
    currentSessionId: string;
  }>(
    '/api/sessions',
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    sessions: data?.sessions || [],
    currentSessionId: data?.currentSessionId || null,
    isLoading,
    isError: error,
    mutate,
  };
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  ipAddress: string;
  details: string;
  timestamp: string;
}

export interface AuditLogsOptions {
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function useAuditLogs(options?: AuditLogsOptions) {
  const params = new URLSearchParams();
  if (options?.action) params.set('action', options.action);
  if (options?.resource) params.set('resource', options.resource);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const { data, error, isLoading, mutate } = useSWR<{
    logs: AuditLog[];
    hasMore: boolean;
    total: number;
  }>(
    `/api/audit?${params.toString()}`,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    logs: data?.logs || [],
    hasMore: data?.hasMore || false,
    total: data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

// Organization types and hooks

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  plan: 'free' | 'team';
  projectCount: number;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
  createdAt: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: string;
  expiresAt: string;
}

export function useOrganization(orgId?: string) {
  // If no orgId provided, fetch user's primary organization
  const url = orgId ? `/api/organizations/${orgId}` : '/api/organizations';

  const { data, error, isLoading, mutate } = useSWR<Organization | { organizations: Organization[] }>(
    url,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  // If fetching list, return the first organization (user's primary org)
  const organization = orgId
    ? (data as Organization | undefined)
    : (data as { organizations: Organization[] } | undefined)?.organizations?.[0];

  return {
    organization,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useOrgMembers(orgId?: string) {
  const { data, error, isLoading, mutate } = useSWR<{ members: OrgMember[] }>(
    orgId ? `/api/organizations/${orgId}/members` : null,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    members: data?.members || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export function useOrgInvitations(orgId?: string) {
  const { data, error, isLoading, mutate } = useSWR<{ invitations: OrgInvitation[] }>(
    orgId ? `/api/organizations/${orgId}/invitations` : null,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    invitations: data?.invitations || [],
    isLoading,
    isError: error,
    mutate,
  };
}
