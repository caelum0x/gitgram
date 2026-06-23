'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Filter,
  Clock,
  Key,
  FolderGit2,
  Webhook,
  Settings,
  CreditCard,
  Shield,
  LogIn,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuditLogs } from '@/hooks/useDashboard';
import { formatRelativeTime } from '@/lib/utils';

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'api_key.created', label: 'API Key Created' },
  { value: 'api_key.revoked', label: 'API Key Revoked' },
  { value: 'checkpoint.created', label: 'Checkpoint Created' },
  { value: 'checkpoint.restored', label: 'Checkpoint Restored' },
  { value: 'project.created', label: 'Project Created' },
  { value: 'project.deleted', label: 'Project Deleted' },
  { value: 'webhook.created', label: 'Webhook Created' },
  { value: 'webhook.deleted', label: 'Webhook Deleted' },
  { value: 'settings.updated', label: 'Settings Updated' },
  { value: 'billing.subscription_updated', label: 'Subscription Updated' },
  { value: 'login.success', label: 'Login Success' },
  { value: 'login.failed', label: 'Login Failed' },
];

const ITEMS_PER_PAGE = 10;

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const { logs, total, isLoading, hasMore } = useAuditLogs({
    action: actionFilter !== 'all' ? actionFilter : undefined,
    resource: searchQuery || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: ITEMS_PER_PAGE,
    offset: currentPage * ITEMS_PER_PAGE,
  });

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const getActionIcon = (action: string) => {
    if (action.startsWith('api_key')) return <Key className="w-4 h-4" />;
    if (action.startsWith('checkpoint')) return <Clock className="w-4 h-4" />;
    if (action.startsWith('project')) return <FolderGit2 className="w-4 h-4" />;
    if (action.startsWith('webhook')) return <Webhook className="w-4 h-4" />;
    if (action.startsWith('settings')) return <Settings className="w-4 h-4" />;
    if (action.startsWith('billing')) return <CreditCard className="w-4 h-4" />;
    if (action.startsWith('login')) return <LogIn className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('created')) return 'bg-green-600';
    if (action.includes('deleted') || action.includes('revoked')) return 'bg-red-600';
    if (action.includes('restored')) return 'bg-yellow-600';
    if (action.includes('updated')) return 'bg-blue-600';
    if (action.includes('success')) return 'bg-green-600';
    if (action.includes('failed')) return 'bg-red-600';
    return 'bg-gray-600';
  };

  const formatActionLabel = (action: string) => {
    return action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleClearFilters = () => {
    setActionFilter('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(0);
  };

  const hasFilters = actionFilter !== 'all' || searchQuery || startDate || endDate;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 mt-1">
            Track all account activity and security events
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-800 bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Security Monitoring</h3>
              <p className="text-sm text-gray-400 mt-1">
                All actions on your account are logged and retained for 90 days. Use this log to
                monitor access patterns and investigate suspicious activity.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <CardTitle className="text-lg">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Search by Resource */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search by resource..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(0);
                }}
              />
            </div>

            {/* Action Type Filter */}
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(0);
              }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white min-w-[180px]"
            >
              {ACTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="date"
                  placeholder="Start date"
                  className="pl-10 w-[160px]"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(0);
                  }}
                />
              </div>
              <span className="text-gray-500">to</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="date"
                  placeholder="End date"
                  className="pl-10 w-[160px]"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(0);
                  }}
                />
              </div>
            </div>

            {/* Clear Filters */}
            {hasFilters && (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading...'
              : `Showing ${logs.length} of ${total} events`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-gray-500">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Events Found</h3>
              <p className="text-gray-400">
                {hasFilters
                  ? 'No events match your current filters. Try adjusting your search criteria.'
                  : 'Your audit log will populate as you perform actions in your account.'}
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Time
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Action
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Resource
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        IP Address
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-3 h-3 text-gray-500" />
                            <span className="text-gray-300">
                              {formatRelativeTime(log.timestamp)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                              {getActionIcon(log.action)}
                            </div>
                            <Badge className={getActionBadgeColor(log.action)}>
                              {formatActionLabel(log.action)}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-white text-sm">{log.resource}</span>
                        </td>
                        <td className="py-4 px-4">
                          <code className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
                            {log.ipAddress}
                          </code>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-gray-400 text-sm">{log.details}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-800">
                  <div className="text-sm text-gray-400">
                    Page {currentPage + 1} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i;
                        } else if (currentPage < 3) {
                          pageNum = i;
                        } else if (currentPage > totalPages - 4) {
                          pageNum = totalPages - 5 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum + 1}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
