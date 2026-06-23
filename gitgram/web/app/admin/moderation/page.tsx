'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';

// Types
interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  priority: number;
  escalated: boolean;
  autoFlagged: boolean;
  createdAt: string;
  resolvedAt: string | null;
  reporter?: {
    id: string;
    username: string;
    avatar: string | null;
    displayName: string | null;
  };
  targetContent?: any;
  targetContentDeleted?: boolean;
}

interface ModerationStats {
  overview: {
    total: number;
    pending: number;
    reviewing: number;
    resolved: number;
    dismissed: number;
    openRate: number;
  };
  trends: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    avgPerDay: number;
  };
  breakdown: {
    byType: { type: string; count: number }[];
    byReason: { reason: string; count: number }[];
  };
  performance: {
    avgResolutionTimeHours: number;
    moderatorActivity: {
      moderator: { id: string; username: string };
      actionCount: number;
    }[];
  };
}

interface ModerationLog {
  id: string;
  moderatorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  automated: boolean;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

// Fetch wrapper that includes credentials for httpOnly cookies
function authFetch(url: string, options: RequestInit = {}) {
  return fetch(url, { ...options, credentials: 'include', headers: { ...getAuthHeaders(), ...options.headers } });
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  label,
  value,
  color = 'gray',
  subtext,
}: {
  label: string;
  value: number | string;
  color?: string;
  subtext?: string;
}) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-white dark:bg-gray-800',
    red: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
    green: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
    orange: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',
    purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800',
  };

  const textColorClasses: Record<string, string> = {
    gray: 'text-gray-900 dark:text-gray-100',
    red: 'text-red-700 dark:text-red-300',
    yellow: 'text-yellow-700 dark:text-yellow-300',
    green: 'text-green-700 dark:text-green-300',
    blue: 'text-blue-700 dark:text-blue-300',
    orange: 'text-orange-700 dark:text-orange-300',
    purple: 'text-purple-700 dark:text-purple-300',
  };

  return (
    <div className={`p-4 rounded-lg shadow border ${colorClasses[color] || colorClasses.gray}`}>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold ${textColorClasses[color] || textColorClasses.gray}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );
}

// ============================================================================
// REPORT CARD COMPONENT
// ============================================================================

function ReportCard({
  report,
  onAction,
  onViewDetails,
}: {
  report: Report;
  onAction: (reportId: string, action: string, resolution?: string, duration?: number) => void;
  onViewDetails: (reportId: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [resolution, setResolution] = useState('');
  const [duration, setDuration] = useState(48);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    await onAction(report.id, action, resolution, action === 'suspend_user' ? duration : undefined);
    setActionLoading(false);
    setShowActions(false);
    setResolution('');
  };

  const reasonColors: Record<string, string> = {
    HARASSMENT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    INAPPROPRIATE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MISINFORMATION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    SPAM: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    OTHER: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };

  const targetTypeIcons: Record<string, string> = {
    POST: 'Post',
    COMMENT: 'Comment',
    REEL: 'Reel',
    STORY: 'Story',
    USER: 'User',
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow border ${
      report.escalated ? 'border-red-400 dark:border-red-600' : 'border-gray-200 dark:border-gray-700'
    } p-5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {report.escalated && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full">
              ESCALATED
            </span>
          )}
          {report.autoFlagged && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-purple-500 text-white rounded-full">
              AUTO-FLAGGED
            </span>
          )}
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${reasonColors[report.reason] || reasonColors.OTHER}`}>
            {report.reason}
          </span>
          <span className="text-sm text-gray-500">
            {targetTypeIcons[report.targetType] || report.targetType}
          </span>
          <span className="text-xs text-gray-400">
            Priority: {report.priority}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Content Preview */}
      <div className="mb-3">
        {report.targetContent ? (
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm">
            {report.targetType === 'POST' && (
              <div>
                <div className="text-gray-500 text-xs mb-1">
                  @{report.targetContent.user?.username || 'unknown'}
                </div>
                <p className="text-gray-800 dark:text-gray-200 line-clamp-3">
                  {report.targetContent.content}
                </p>
              </div>
            )}
            {report.targetType === 'COMMENT' && (
              <div>
                <div className="text-gray-500 text-xs mb-1">
                  @{report.targetContent.user?.username || 'unknown'} on post
                </div>
                <p className="text-gray-800 dark:text-gray-200 line-clamp-2">
                  {report.targetContent.content}
                </p>
              </div>
            )}
            {report.targetType === 'REEL' && (
              <div>
                <div className="text-gray-500 text-xs mb-1">
                  @{report.targetContent.user?.username || 'unknown'}
                </div>
                <p className="text-gray-800 dark:text-gray-200">
                  {report.targetContent.title} - {report.targetContent.description || 'No description'}
                </p>
              </div>
            )}
            {report.targetType === 'USER' && (
              <div>
                <p className="text-gray-800 dark:text-gray-200">
                  @{report.targetContent.username} ({report.targetContent.displayName || 'No display name'})
                </p>
                {report.targetContent.bio && (
                  <p className="text-gray-500 text-xs mt-1 line-clamp-2">{report.targetContent.bio}</p>
                )}
              </div>
            )}
            {report.targetType === 'STORY' && (
              <div>
                <div className="text-gray-500 text-xs mb-1">
                  @{report.targetContent.user?.username || 'unknown'}
                </div>
                <p className="text-gray-800 dark:text-gray-200">
                  {report.targetContent.caption || 'No caption'}
                </p>
              </div>
            )}
          </div>
        ) : report.targetContentDeleted ? (
          <p className="text-gray-400 italic text-sm">Content has been deleted</p>
        ) : (
          <p className="text-gray-400 italic text-sm">Loading content...</p>
        )}
      </div>

      {/* Description */}
      {report.description && (
        <div className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Report details:</span> {report.description}
        </div>
      )}

      {/* Reporter Info */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>
          Reported by: @{report.reporter?.username || 'unknown'}
        </span>
        <button
          onClick={() => onViewDetails(report.id)}
          className="text-blue-500 hover:text-blue-600 font-medium"
        >
          View Full Details
        </button>
      </div>

      {/* Actions */}
      {report.status === 'PENDING' || report.status === 'REVIEWING' ? (
        <div>
          {!showActions ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleAction('approve')}
                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition"
                disabled={actionLoading}
              >
                Approve
              </button>
              <button
                onClick={() => handleAction('dismiss')}
                className="px-3 py-1.5 text-sm bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-400 transition"
                disabled={actionLoading}
              >
                Dismiss
              </button>
              <button
                onClick={() => setShowActions(true)}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
                disabled={actionLoading}
              >
                Take Action...
              </button>
            </div>
          ) : (
            <div className="space-y-3 bg-gray-50 dark:bg-gray-900 rounded p-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Resolution Notes (optional)
                </label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Add notes about this action..."
                  rows={2}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleAction('warn_user')}
                  className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
                  disabled={actionLoading}
                >
                  Warn User
                </button>
                <button
                  onClick={() => handleAction('remove_content')}
                  className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 transition"
                  disabled={actionLoading}
                >
                  Remove Content
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAction('suspend_user')}
                    className="px-3 py-1.5 text-sm bg-red-400 text-white rounded hover:bg-red-500 transition"
                    disabled={actionLoading}
                  >
                    Suspend User
                  </button>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                    min="1"
                    max="8760"
                    title="Duration in hours"
                  />
                  <span className="text-xs text-gray-500">hrs</span>
                </div>
                <button
                  onClick={() => handleAction('ban_user')}
                  className="px-3 py-1.5 text-sm bg-red-700 text-white rounded hover:bg-red-800 transition"
                  disabled={actionLoading}
                >
                  Ban User
                </button>
                <button
                  onClick={() => setShowActions(false)}
                  className="px-3 py-1.5 text-sm bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-400 transition"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            report.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {report.status}
          </span>
          {report.resolvedAt && (
            <span className="ml-2">
              Resolved {new Date(report.resolvedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REPORT DETAIL MODAL
// ============================================================================

function ReportDetailModal({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await authFetch(`${API_BASE}/v1/admin/moderation/queue/${reportId}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          setDetail(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch report details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [reportId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-2xl w-full mx-4">
          <p className="text-center text-gray-500">Loading report details...</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-2xl w-full mx-4">
          <p className="text-center text-red-500">Failed to load report details</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded mx-auto block">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Report Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            x
          </button>
        </div>

        {/* Report Info */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-gray-500">Status:</span>{' '}
            <span className="font-medium">{detail.status}</span>
          </div>
          <div>
            <span className="text-gray-500">Reason:</span>{' '}
            <span className="font-medium">{detail.reason}</span>
          </div>
          <div>
            <span className="text-gray-500">Target Type:</span>{' '}
            <span className="font-medium">{detail.targetType}</span>
          </div>
          <div>
            <span className="text-gray-500">Priority:</span>{' '}
            <span className="font-medium">{detail.priority}</span>
          </div>
          <div>
            <span className="text-gray-500">Created:</span>{' '}
            <span className="font-medium">{new Date(detail.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">Escalated:</span>{' '}
            <span className="font-medium">{detail.escalated ? 'Yes' : 'No'}</span>
          </div>
        </div>

        {detail.description && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded">
            <div className="text-xs text-gray-500 mb-1">Reporter Description</div>
            <p className="text-sm">{detail.description}</p>
          </div>
        )}

        {/* Reporter Info */}
        {detail.reporter && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">Reporter</div>
            <div className="flex items-center gap-2">
              {detail.reporter.avatar && (
                <img src={detail.reporter.avatar} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-sm font-medium">
                @{detail.reporter.username} ({detail.reporter.displayName || 'No name'})
              </span>
            </div>
          </div>
        )}

        {/* Target Content */}
        {detail.targetContent && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">Reported Content</div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm">
              <pre className="whitespace-pre-wrap font-sans">
                {JSON.stringify(detail.targetContent, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Previous Reports */}
        {detail.previousReports && detail.previousReports.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Previous Reports on Same Target ({detail.previousReports.length})
            </div>
            <div className="space-y-1">
              {detail.previousReports.map((prev: any) => (
                <div key={prev.id} className="text-xs bg-gray-50 dark:bg-gray-900 rounded p-2 flex justify-between">
                  <span>{prev.reason} - {prev.status}</span>
                  <span className="text-gray-400">{new Date(prev.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Report History */}
        {detail.userReportHistory && (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">User Report History</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                Total Reports: {detail.userReportHistory.totalReports}
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                Total Bans: {detail.userReportHistory.totalBans}
              </div>
            </div>
          </div>
        )}

        {/* Resolution Info */}
        {detail.resolvedAt && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 rounded">
            <div className="text-xs text-green-600 mb-1">Resolution</div>
            <p className="text-sm">{detail.resolution || 'No resolution notes'}</p>
            {detail.resolver && (
              <p className="text-xs text-gray-500 mt-1">
                Resolved by @{detail.resolver.username} on {new Date(detail.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MODERATION PAGE
// ============================================================================

export default function ModerationPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'queue' | 'stats' | 'log'>('queue');
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch moderation queue
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);
      if (targetTypeFilter) params.set('targetType', targetTypeFilter);
      if (reasonFilter) params.set('reason', reasonFilter);

      const res = await authFetch(`${API_BASE}/v1/admin/moderation/queue?${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, targetTypeFilter, reasonFilter]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/v1/admin/moderation/stats`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // Fetch moderation log
  const fetchLogs = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/v1/moderation/queue?limit=50`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchStats();
  }, [fetchQueue, fetchStats]);

  useEffect(() => {
    if (activeTab === 'log') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  // Handle moderation action
  const handleAction = async (reportId: string, action: string, resolution?: string, duration?: number) => {
    try {
      const body: any = { action };
      if (resolution) body.resolution = resolution;
      if (duration) body.duration = duration;

      const res = await authFetch(`${API_BASE}/v1/admin/moderation/queue/${reportId}/resolve`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // Refresh data
        fetchQueue();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(`Action failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Failed to resolve report:', error);
      showToast('Failed to resolve report', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Moderation Dashboard</h1>
        <div className="flex items-center gap-2">
          {stats && (
            <span className="px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-full text-sm font-medium">
              {stats.overview.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatCard label="Total Reports" value={stats.overview.total} color="gray" />
          <StatCard label="Pending" value={stats.overview.pending} color="red" />
          <StatCard label="Reviewing" value={stats.overview.reviewing} color="yellow" />
          <StatCard label="Resolved" value={stats.overview.resolved} color="green" />
          <StatCard label="Dismissed" value={stats.overview.dismissed} color="gray" />
          <StatCard label="Today" value={stats.trends.today} color="blue" />
          <StatCard
            label="Avg Resolution"
            value={`${stats.performance.avgResolutionTimeHours}h`}
            color="purple"
            subtext="resolution time"
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b dark:border-gray-700">
        {(['queue', 'stats', 'log'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'queue' && `Review Queue (${totalCount})`}
            {tab === 'stats' && 'Statistics'}
            {tab === 'log' && 'Activity Log'}
          </button>
        ))}
      </div>

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div>
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="REVIEWING">Reviewing</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
            <select
              value={targetTypeFilter}
              onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">All Types</option>
              <option value="POST">Post</option>
              <option value="COMMENT">Comment</option>
              <option value="REEL">Reel</option>
              <option value="STORY">Story</option>
              <option value="USER">User</option>
            </select>
            <select
              value={reasonFilter}
              onChange={(e) => { setReasonFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">All Reasons</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="INAPPROPRIATE">Inappropriate</option>
              <option value="MISINFORMATION">Misinformation</option>
              <option value="SPAM">Spam</option>
              <option value="OTHER">Other</option>
            </select>
            <button
              onClick={() => { setStatusFilter(''); setTargetTypeFilter(''); setReasonFilter(''); setPage(1); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear Filters
            </button>
          </div>

          {/* Reports List */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-medium">No reports in queue</p>
              <p className="text-sm mt-1">All caught up! No reports match your current filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onAction={handleAction}
                  onViewDetails={setSelectedReportId}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded disabled:opacity-50 dark:border-gray-700"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border rounded disabled:opacity-50 dark:border-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-6">
          {/* Trends */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Report Trends</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Today" value={stats.trends.today} color="blue" />
              <StatCard label="This Week" value={stats.trends.thisWeek} color="blue" />
              <StatCard label="This Month" value={stats.trends.thisMonth} color="blue" />
              <StatCard
                label="Avg Per Day"
                value={stats.trends.avgPerDay}
                color="blue"
                subtext="30-day average"
              />
            </div>
          </div>

          {/* Breakdown by Reason */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Reports by Reason</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {stats.breakdown.byReason.map((item) => (
                <StatCard key={item.reason} label={item.reason} value={item.count} color="orange" />
              ))}
            </div>
          </div>

          {/* Breakdown by Type */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Reports by Content Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {stats.breakdown.byType.map((item) => (
                <StatCard key={item.type} label={item.type} value={item.count} color="green" />
              ))}
            </div>
          </div>

          {/* Moderator Activity */}
          {stats.performance.moderatorActivity.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Moderator Activity (This Week)</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-500">Moderator</th>
                      <th className="px-4 py-2 text-right text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.performance.moderatorActivity.map((mod, i) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        <td className="px-4 py-2 font-medium">@{mod.moderator.username}</td>
                        <td className="px-4 py-2 text-right">{mod.actionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Log Tab */}
      {activeTab === 'log' && (
        <div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-500">Time</th>
                  <th className="px-4 py-2 text-left text-gray-500">Action</th>
                  <th className="px-4 py-2 text-left text-gray-500">Target</th>
                  <th className="px-4 py-2 text-left text-gray-500">Reason</th>
                  <th className="px-4 py-2 text-left text-gray-500">Type</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No moderation activity logged yet
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          log.action.includes('REMOVE') || log.action.includes('BAN')
                            ? 'bg-red-100 text-red-800'
                            : log.action.includes('WARN')
                            ? 'bg-yellow-100 text-yellow-800'
                            : log.action.includes('APPROVE')
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                        {log.automated && (
                          <span className="ml-1 px-1 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                            AUTO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                        {log.targetId?.substring(0, 12)}...
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs truncate max-w-xs">
                        {log.reason || '-'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {log.targetType}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReportId && (
        <ReportDetailModal
          reportId={selectedReportId}
          onClose={() => setSelectedReportId(null)}
        />
      )}
    </div>
  );
}
