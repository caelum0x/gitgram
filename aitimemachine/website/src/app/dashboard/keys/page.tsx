'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  Clock,
  Activity,
  Globe,
  X,
  Loader2,
} from 'lucide-react';
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

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsed?: string;
  usageCount?: number;
  status?: 'active' | 'revoked';
  allowedIps?: string[];
}

interface NewKeyResponse {
  id: string;
  key: string;
  prefix: string;
  name: string;
  createdAt: string;
}

// Validate IPv4, IPv6, and CIDR notation
function isValidIpOrCidr(value: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv4 CIDR pattern
  const ipv4CidrPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:3[0-2]|[12]?[0-9])$/;
  // IPv6 pattern (simplified - accepts standard formats)
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$/;
  // IPv6 CIDR pattern
  const ipv6CidrPattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$|^(?:[0-9a-fA-F:]+)\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;

  return ipv4Pattern.test(value) || ipv4CidrPattern.test(value) || ipv6Pattern.test(value) || ipv6CidrPattern.test(value);
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  // IP Allowlist management state
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [ipManagingKey, setIpManagingKey] = useState<ApiKey | null>(null);
  const [tempAllowedIps, setTempAllowedIps] = useState<string[]>([]);
  const [newIpInput, setNewIpInput] = useState('');
  const [ipError, setIpError] = useState('');
  const [savingIps, setSavingIps] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.error('Failed to fetch keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data);
        fetchKeys();
      }
    } catch (error) {
      console.error('Failed to create key:', error);
    } finally {
      setCreating(false);
    }
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revokeKey = async () => {
    if (!keyToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/keys/${keyToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKeys(keys.filter((k) => k.id !== keyToDelete.id));
        setDeleteDialogOpen(false);
        setKeyToDelete(null);
      }
    } catch (error) {
      console.error('Failed to revoke key:', error);
    } finally {
      setDeleting(false);
    }
  };

  const resetCreateDialog = () => {
    setNewKeyName('');
    setNewKey(null);
    setCopied(false);
  };

  // IP Allowlist management functions
  const openIpDialog = (key: ApiKey) => {
    setIpManagingKey(key);
    setTempAllowedIps(key.allowedIps || []);
    setNewIpInput('');
    setIpError('');
    setIpDialogOpen(true);
  };

  const addIp = () => {
    const trimmedIp = newIpInput.trim();
    if (!trimmedIp) {
      setIpError('Please enter an IP address');
      return;
    }
    if (!isValidIpOrCidr(trimmedIp)) {
      setIpError('Invalid IP address or CIDR notation');
      return;
    }
    if (tempAllowedIps.includes(trimmedIp)) {
      setIpError('This IP is already in the list');
      return;
    }
    setTempAllowedIps([...tempAllowedIps, trimmedIp]);
    setNewIpInput('');
    setIpError('');
  };

  const removeIp = (ip: string) => {
    setTempAllowedIps(tempAllowedIps.filter((i) => i !== ip));
  };

  const saveIps = async () => {
    if (!ipManagingKey) return;
    setSavingIps(true);
    try {
      const res = await fetch(`/api/keys/${ipManagingKey.id}/ips`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedIps: tempAllowedIps }),
      });
      if (res.ok) {
        // Update the key in local state
        setKeys(keys.map((k) =>
          k.id === ipManagingKey.id ? { ...k, allowedIps: tempAllowedIps } : k
        ));
        setIpDialogOpen(false);
        setIpManagingKey(null);
      } else {
        setIpError('Failed to save IP allowlist');
      }
    } catch (error) {
      console.error('Failed to save IPs:', error);
      setIpError('Failed to save IP allowlist');
    } finally {
      setSavingIps(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">API Keys</h1>
          <p className="text-gray-400 mt-1">
            Manage your API keys for accessing the Gitgram TimeMachine API
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
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {!newKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>
                    Give your API key a descriptive name to identify its purpose.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    placeholder="e.g., Production Server, CLI Tool, MCP Server"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createKey()}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createKey} disabled={creating || !newKeyName.trim()}>
                    {creating ? 'Creating...' : 'Create Key'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    API Key Created
                  </DialogTitle>
                  <DialogDescription>
                    Copy your API key now. You won't be able to see it again!
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-200">
                      <p className="font-medium">Important</p>
                      <p className="text-yellow-300/80 mt-1">
                        This is the only time you'll see this key. Store it securely.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-400">Your API Key</label>
                    <div className="flex gap-2">
                      <Input
                        value={newKey.key}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyKey(newKey.key)}
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
                  <Button onClick={() => setCreateDialogOpen(false)}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-800 bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">API Key Security</h3>
              <p className="text-sm text-gray-400 mt-1">
                API keys provide full access to your Gitgram TimeMachine account. Keep them secure and never
                share them publicly or commit them to version control. Use environment variables instead.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            {keys.length === 0
              ? 'You haven\'t created any API keys yet'
              : `${keys.length} API key${keys.length === 1 ? '' : 's'} active`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading keys...</div>
          ) : keys.length === 0 ? (
            <div className="py-12 text-center">
              <Key className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No API Keys</h3>
              <p className="text-gray-400 mb-4">
                Create your first API key to start using the Gitgram TimeMachine API.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Key
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                      <Key className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{key.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                        {/* IP Allowlist Badge */}
                        {!key.allowedIps || key.allowedIps.length === 0 ? (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            All IPs allowed
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            {key.allowedIps.length} IP{key.allowedIps.length !== 1 ? 's' : ''} allowed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                        <code className="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">
                          {key.keyPrefix}...
                        </code>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Created {formatRelativeTime(key.createdAt)}
                        </span>
                        {key.lastUsed && (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Last used {formatRelativeTime(key.lastUsed)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-400 hover:text-white"
                      onClick={() => openIpDialog(key)}
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      Manage IPs
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-400"
                      onClick={() => {
                        setKeyToDelete(key);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Your API Key</CardTitle>
          <CardDescription>
            Include your API key in requests to authenticate with the Gitgram TimeMachine API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-white mb-2">HTTP Header</h4>
            <pre className="bg-gray-900 p-4 rounded-lg text-sm font-mono text-gray-300 overflow-x-auto">
              Authorization: Bearer aitm_your_api_key_here
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-2">CLI Configuration</h4>
            <pre className="bg-gray-900 p-4 rounded-lg text-sm font-mono text-gray-300 overflow-x-auto">
              aitm login
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-2">Environment Variable</h4>
            <pre className="bg-gray-900 p-4 rounded-lg text-sm font-mono text-gray-300 overflow-x-auto">
              export AITM_API_KEY=aitm_your_api_key_here
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* IP Allowlist Management Dialog */}
      <Dialog open={ipDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIpDialogOpen(false);
          setIpManagingKey(null);
          setTempAllowedIps([]);
          setNewIpInput('');
          setIpError('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              IP Allowlist
            </DialogTitle>
            <DialogDescription>
              Restrict this API key to specific IP addresses. Leave empty to allow all IPs.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Add new IP input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Add IP Address</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 192.168.1.1 or 10.0.0.0/24"
                  value={newIpInput}
                  onChange={(e) => {
                    setNewIpInput(e.target.value);
                    setIpError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && addIp()}
                  className="flex-1"
                />
                <Button onClick={addIp} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {ipError && (
                <p className="text-sm text-red-400">{ipError}</p>
              )}
              <p className="text-xs text-gray-500">
                Supports IPv4, IPv6, and CIDR notation (e.g., 192.168.1.0/24)
              </p>
            </div>

            {/* Current allowed IPs list */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Allowed IPs ({tempAllowedIps.length})
              </label>
              {tempAllowedIps.length === 0 ? (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center">
                  <Globe className="w-8 h-8 mx-auto text-gray-500 mb-2" />
                  <p className="text-sm text-gray-400">No IP restrictions</p>
                  <p className="text-xs text-gray-500 mt-1">
                    This key can be used from any IP address
                  </p>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {tempAllowedIps.map((ip) => (
                    <div
                      key={ip}
                      className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-gray-700"
                    >
                      <code className="text-sm font-mono text-gray-300">{ip}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-red-400"
                        onClick={() => removeIp(ip)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Warning when removing all IPs */}
            {ipManagingKey?.allowedIps && ipManagingKey.allowedIps.length > 0 && tempAllowedIps.length === 0 && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200">
                  Removing all IP restrictions will allow this key to be used from any IP address.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIpDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveIps} disabled={savingIps}>
              {savingIps ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Revoke API Key
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the API key "{keyToDelete?.name}"?
              This action cannot be undone, and any applications using this key will
              immediately lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={revokeKey}
              disabled={deleting}
            >
              {deleting ? 'Revoking...' : 'Revoke Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
