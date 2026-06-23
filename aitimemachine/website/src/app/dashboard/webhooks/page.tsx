'use client';

import { useState, useEffect } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Copy,
  Activity,
  Clock,
  History,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/lib/utils';

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string;
  lastStatus?: 'success' | 'failed';
  failureCount?: number;
}

const AVAILABLE_EVENTS = [
  { id: 'checkpoint.created', label: 'Checkpoint Created', description: 'When a new checkpoint is created' },
  { id: 'checkpoint.restored', label: 'Checkpoint Restored', description: 'When a checkpoint is restored' },
  { id: 'project.synced', label: 'Project Synced', description: 'When a project sync completes' },
  { id: 'project.created', label: 'Project Created', description: 'When a new project is initialized' },
  { id: 'storage.threshold', label: 'Storage Threshold', description: 'When storage usage exceeds 80%' },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ url: '', events: [] as string[] });
  const [creating, setCreating] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<WebhookConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<WebhookConfig | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks');
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!newWebhook.url || newWebhook.events.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newWebhook.url, events: newWebhook.events }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to create webhook');
      }

      const data = await res.json();
      const webhook: WebhookConfig | undefined = data.webhook;
      const secret: string | undefined = data.secret;
      if (!webhook || !secret) {
        throw new Error('Webhook creation response missing fields');
      }

      setWebhooks([...webhooks, webhook]);
      setCreatedWebhook({ ...webhook, secret });
    } catch (error) {
      console.error('Failed to create webhook:', error);
    } finally {
      setCreating(false);
    }
  };

  const toggleWebhook = async (id: string) => {
    const current = webhooks.find((w) => w.id === id);
    if (!current) return;

    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !current.enabled }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to update webhook');
      }
      const data = await res.json();
      const updated: WebhookConfig | undefined = data.webhook || data;
      if (!updated) throw new Error('Invalid update response');

      setWebhooks(webhooks.map((w) => (w.id === id ? { ...w, ...updated } : w)));
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
    }
  };

  const deleteWebhook = async () => {
    if (!webhookToDelete) return;
    try {
      const res = await fetch(`/api/webhooks/${webhookToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to delete webhook');
      }
      setWebhooks(webhooks.filter(w => w.id !== webhookToDelete.id));
      setDeleteDialogOpen(false);
      setWebhookToDelete(null);
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  };

  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleEvent = (eventId: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId]
    }));
  };

  const resetCreateDialog = () => {
    setNewWebhook({ url: '', events: [] });
    setCreatedWebhook(null);
    setCopied(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Webhooks</h1>
          <p className="text-gray-400 mt-1">
            Configure webhooks to receive real-time notifications
          </p>
        </div>
        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) resetCreateDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            {!createdWebhook ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create Webhook</DialogTitle>
                  <DialogDescription>
                    Add a new webhook endpoint to receive event notifications
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Endpoint URL</label>
                    <Input
                      placeholder="https://your-server.com/webhook"
                      value={newWebhook.url}
                      onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Events</label>
                    <div className="space-y-2">
                      {AVAILABLE_EVENTS.map((event) => (
                        <label
                          key={event.id}
                          className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={newWebhook.events.includes(event.id)}
                            onChange={() => toggleEvent(event.id)}
                            className="mt-1 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-white">{event.label}</p>
                            <p className="text-xs text-gray-400">{event.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={createWebhook}
                    disabled={creating || !newWebhook.url || newWebhook.events.length === 0}
                  >
                    {creating ? 'Creating...' : 'Create Webhook'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    Webhook Created
                  </DialogTitle>
                  <DialogDescription>
                    Save your webhook secret - you won't be able to see it again!
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-200">
                      <p className="font-medium">Important</p>
                      <p className="text-yellow-300/80 mt-1">
                        Use this secret to verify webhook signatures. Store it securely.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
	                    <label className="text-sm font-medium text-gray-400">Webhook Secret</label>
	                    <div className="flex gap-2">
	                      <Input value={createdWebhook.secret || ''} readOnly className="font-mono text-sm" />
	                      <Button
	                        variant="outline"
	                        size="icon"
	                        onClick={() => createdWebhook.secret && copySecret(createdWebhook.secret)}
	                        disabled={!createdWebhook.secret}
	                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setCreateDialogOpen(false)}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Webhooks List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Webhooks</CardTitle>
          <CardDescription>
            {webhooks.length === 0
              ? 'You haven\'t created any webhooks yet'
              : `${webhooks.length} webhook${webhooks.length === 1 ? '' : 's'} configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading webhooks...</div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center">
              <Webhook className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Webhooks</h3>
              <p className="text-gray-400 mb-4">
                Create a webhook to receive real-time notifications about your checkpoints and projects.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Webhook
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-white">{webhook.url}</code>
                        {webhook.enabled ? (
                          <Badge className="bg-green-600">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                        {webhook.lastStatus === 'failed' && (
                          <Badge className="bg-red-600">
                            {webhook.failureCount} failures
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {AVAILABLE_EVENTS.find(e => e.id === event)?.label || event}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Created {formatRelativeTime(webhook.createdAt)}
                        </span>
                        {webhook.lastTriggered && (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Last triggered {formatRelativeTime(webhook.lastTriggered)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <Link href={`/dashboard/webhooks/${webhook.id}/deliveries`}>
                          <History className="w-4 h-4 mr-1" />
                          Deliveries
                        </Link>
                      </Button>
	                      <Button
	                        variant="ghost"
	                        size="sm"
	                        onClick={() => toggleWebhook(webhook.id)}
	                      >
	                        {webhook.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-400"
                        onClick={() => {
                          setWebhookToDelete(webhook);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
	                  <div className="mt-3 text-xs text-gray-500">
	                    Webhook secrets are only shown once at creation. To rotate a secret, delete and recreate the webhook.
	                  </div>
	                </div>
	              ))}
	            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Signature Verification */}
      <Card>
        <CardHeader>
          <CardTitle>Verifying Webhook Signatures</CardTitle>
          <CardDescription>
            Use the webhook secret to verify that requests are from Gitgram TimeMachine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Each webhook request includes an <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">X-AITM-Signature</code> header.
            Verify this signature to ensure the request is authentic.
          </p>
          <div>
            <h4 className="text-sm font-medium text-white mb-2">Node.js Example</h4>
            <pre className="bg-gray-900 p-4 rounded-lg text-sm font-mono text-gray-300 overflow-x-auto">
{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from('sha256=' + expected)
  );
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this webhook? You will stop receiving
              notifications at this endpoint.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteWebhook}>
              Delete Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
