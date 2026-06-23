'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  responseCode: number | null;
  timestamp: string;
  duration: number | null; // in milliseconds
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  errorMessage: string | null;
  retryCount: number;
}

interface WebhookInfo {
  id: string;
  url: string;
}

export default function WebhookDeliveriesPage() {
  const params = useParams();
  const webhookId = params.id as string;

  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    fetchDeliveries();
  }, [webhookId]);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/webhooks/${webhookId}/deliveries`);
      if (response.ok) {
        const data = await response.json();
        setDeliveries(data.deliveries || []);
        setWebhook(data.webhook || null);
      }
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (deliveryId: string) => {
    setRetrying(deliveryId);
    try {
      const response = await fetch(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      if (response.ok) {
        // Refresh deliveries list
        await fetchDeliveries();
      }
    } catch (error) {
      console.error('Failed to retry delivery:', error);
    } finally {
      setRetrying(null);
    }
  };

  const getStatusBadge = (status: WebhookDelivery['status']) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-600 text-white">
            <Check className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-600 text-white">
            <X className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-600 text-white">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatJson = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/webhooks">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">Delivery History</h1>
            {webhook && (
              <p className="text-gray-400 mt-1 font-mono text-sm">
                {webhook.url}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={fetchDeliveries} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading delivery history...'
              : deliveries.length === 0
                ? 'No deliveries yet'
                : `${deliveries.length} delivery attempt${deliveries.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading deliveries...
            </div>
          ) : deliveries.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Deliveries</h3>
              <p className="text-gray-400">
                No webhook deliveries have been made yet. Deliveries will appear here when events are triggered.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-gray-400 border-b border-gray-800">
                <div className="col-span-1"></div>
                <div className="col-span-3">Event</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Response Code</div>
                <div className="col-span-2">Duration</div>
                <div className="col-span-2">Timestamp</div>
              </div>

              {/* Table Rows */}
              {deliveries.map((delivery) => (
                <div key={delivery.id}>
                  <div
                    className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                      expandedId === delivery.id
                        ? 'bg-gray-800'
                        : 'hover:bg-gray-800/50'
                    }`}
                    onClick={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
                  >
                    <div className="col-span-1 flex items-center">
                      {expandedId === delivery.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="col-span-3 flex items-center">
                      <code className="text-sm text-white">{delivery.event}</code>
                    </div>
                    <div className="col-span-2 flex items-center">
                      {getStatusBadge(delivery.status)}
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className={`text-sm font-mono ${
                        delivery.responseCode && delivery.responseCode >= 200 && delivery.responseCode < 300
                          ? 'text-green-400'
                          : delivery.responseCode && delivery.responseCode >= 400
                            ? 'text-red-400'
                            : 'text-gray-400'
                      }`}>
                        {delivery.responseCode || '-'}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center text-sm text-gray-400">
                      {formatDuration(delivery.duration)}
                    </div>
                    <div className="col-span-2 flex items-center text-sm text-gray-400">
                      {formatRelativeTime(delivery.timestamp)}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === delivery.id && (
                    <div className="px-4 py-4 bg-gray-800/50 rounded-b-lg mb-2 space-y-4">
                      {/* Error Message */}
                      {delivery.errorMessage && (
                        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                          <p className="text-sm text-red-300 font-medium">Error</p>
                          <p className="text-sm text-red-200 mt-1">{delivery.errorMessage}</p>
                        </div>
                      )}

                      {/* Retry Count & Action */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">
                          Retry count: {delivery.retryCount}
                        </span>
                        {delivery.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(delivery.id);
                            }}
                            disabled={retrying === delivery.id}
                          >
                            {retrying === delivery.id ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3 h-3 mr-2" />
                                Retry Delivery
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Request Details */}
                      <div>
                        <h4 className="text-sm font-medium text-white mb-2">Request Headers</h4>
                        <pre className="bg-gray-900 p-3 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto max-h-32">
                          {JSON.stringify(delivery.requestHeaders, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-white mb-2">Request Body</h4>
                        <pre className="bg-gray-900 p-3 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto max-h-48">
                          {formatJson(delivery.requestBody)}
                        </pre>
                      </div>

                      {/* Response Details */}
                      {delivery.responseHeaders && (
                        <div>
                          <h4 className="text-sm font-medium text-white mb-2">Response Headers</h4>
                          <pre className="bg-gray-900 p-3 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto max-h-32">
                            {JSON.stringify(delivery.responseHeaders, null, 2)}
                          </pre>
                        </div>
                      )}

                      {delivery.responseBody && (
                        <div>
                          <h4 className="text-sm font-medium text-white mb-2">Response Body</h4>
                          <pre className="bg-gray-900 p-3 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto max-h-48">
                            {formatJson(delivery.responseBody)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Info */}
      <Card>
        <CardHeader>
          <CardTitle>About Webhook Deliveries</CardTitle>
          <CardDescription>
            How Gitgram TimeMachine handles webhook delivery attempts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-400">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">1</span>
            </div>
            <p>
              <strong className="text-white">Delivery attempts:</strong> Each webhook event triggers an immediate
              delivery attempt to your endpoint.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">2</span>
            </div>
            <p>
              <strong className="text-white">Automatic retries:</strong> Failed deliveries are automatically retried
              up to 3 times with exponential backoff (1 min, 5 min, 30 min).
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">3</span>
            </div>
            <p>
              <strong className="text-white">Success criteria:</strong> A delivery is considered successful when
              your endpoint returns a 2xx status code within 30 seconds.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
