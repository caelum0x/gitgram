'use client';

import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
// Clerk TOTP/BackupCode types (runtime API not fully typed in this SDK version)
type TOTPResource = any;
type BackupCodeResource = any;
import {
  User,
  Mail,
  Shield,
  Bell,
  Smartphone,
  Globe,
  Trash2,
  LogOut,
  AlertTriangle,
  Check,
  Loader2,
  Github,
  Chrome,
  ShieldCheck,
  ShieldOff,
  Key,
  QrCode,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SubscriptionStatus from '@/components/SubscriptionStatus';

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpResource, setTotpResource] = useState<TOTPResource | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesLoading, setBackupCodesLoading] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);

  // Check 2FA status on mount
  useEffect(() => {
    if (user) {
      const hasTOTP = user.twoFactorEnabled;
      setTwoFactorEnabled(hasTOTP);
    }
  }, [user]);

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { id: 'checkpoint_created', label: 'Checkpoint Created', description: 'Notify when a new checkpoint is created', enabled: true },
    { id: 'sync_complete', label: 'Sync Complete', description: 'Notify when cloud sync completes', enabled: true },
    { id: 'sync_error', label: 'Sync Errors', description: 'Notify when sync fails', enabled: true },
    { id: 'storage_warning', label: 'Storage Warnings', description: 'Notify when storage exceeds 80%', enabled: true },
    { id: 'weekly_summary', label: 'Weekly Summary', description: 'Receive weekly usage summary email', enabled: false },
    { id: 'product_updates', label: 'Product Updates', description: 'News about new features and updates', enabled: false },
  ]);

  const [preferences, setPreferences] = useState({
    autoSync: true,
    compressCheckpoints: true,
    retainDays: 90,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load persisted notifications + preferences on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then((data: {
        autoSync?: boolean;
        compress?: boolean;
        retainDays?: number;
        timezone?: string;
        weeklySummary?: boolean;
        notifications?: Record<string, boolean>;
      }) => {
        if (cancelled) return;
        setPreferences((prev) => ({
          autoSync: data.autoSync ?? prev.autoSync,
          compressCheckpoints: data.compress ?? prev.compressCheckpoints,
          retainDays: data.retainDays ?? prev.retainDays,
          timezone: data.timezone || prev.timezone,
        }));
        const stored = data.notifications;
        if (stored && typeof stored === 'object') {
          setNotifications((prev) =>
            prev.map((n) =>
              typeof stored[n.id] === 'boolean' ? { ...n, enabled: stored[n.id] } : n,
            ),
          );
        }
      })
      .catch(() => {
        // Backend unavailable: keep defaults; surfaced only on save.
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const notificationMap = notifications.reduce<Record<string, boolean>>(
        (acc, n) => {
          acc[n.id] = n.enabled;
          return acc;
        },
        {},
      );
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoSync: preferences.autoSync,
          compress: preferences.compressCheckpoints,
          retainDays: preferences.retainDays,
          timezone: preferences.timezone,
          weeklySummary: notificationMap['weekly_summary'] ?? false,
          emailNotifications: notificationMap['sync_error'] ?? false,
          notifications: notificationMap,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleNotification = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, enabled: !n.enabled } : n
    ));
  };

  const connectedAccounts = user?.externalAccounts || [];

  // Start TOTP setup
  const handleStartTotpSetup = async () => {
    if (!user) return;
    setTotpLoading(true);
    setTotpError('');
    try {
      const totp = await user.createTOTP();
      setTotpResource(totp);
      setShowTotpSetup(true);
    } catch (err: any) {
      setTotpError(err.errors?.[0]?.message || 'Failed to start 2FA setup');
    } finally {
      setTotpLoading(false);
    }
  };

  // Verify TOTP and complete setup
  const handleVerifyTotp = async () => {
    if (!user || !totpResource) return;
    setTotpLoading(true);
    setTotpError('');
    try {
      await totpResource.verifyTOTP({ code: verificationCode });
      // Generate backup codes after successful TOTP setup
      const backupCodeResource = await user.createBackupCode();
      setBackupCodes(backupCodeResource.codes);
      setTwoFactorEnabled(true);
      setShowTotpSetup(false);
      setShowBackupCodes(true);
      setVerificationCode('');
      setTotpResource(null);
    } catch (err: any) {
      setTotpError(err.errors?.[0]?.message || 'Invalid verification code');
    } finally {
      setTotpLoading(false);
    }
  };

  // Cancel TOTP setup
  const handleCancelTotpSetup = () => {
    setShowTotpSetup(false);
    setTotpResource(null);
    setVerificationCode('');
    setTotpError('');
  };

  // Disable 2FA
  const handleDisable2FA = async () => {
    if (!user) return;
    setDisabling2FA(true);
    try {
      await user.disableTOTP();
      setTwoFactorEnabled(false);
      setBackupCodes([]);
    } catch (err: any) {
      setTotpError(err.errors?.[0]?.message || 'Failed to disable 2FA');
    } finally {
      setDisabling2FA(false);
    }
  };

  // Regenerate backup codes
  const handleRegenerateBackupCodes = async () => {
    if (!user) return;
    setBackupCodesLoading(true);
    try {
      const backupCodeResource = await user.createBackupCode();
      setBackupCodes(backupCodeResource.codes);
      setShowBackupCodes(true);
    } catch (err: any) {
      setTotpError(err.errors?.[0]?.message || 'Failed to regenerate backup codes');
    } finally {
      setBackupCodesLoading(false);
    }
  };

  // Copy backup codes to clipboard
  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Manage your personal information and connected accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    {user?.fullName || user?.firstName || 'User'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
                <Button variant="outline" className="ml-auto" onClick={() => openUserProfile()}>
                  Edit Profile
                </Button>
              </div>

              <Separator />

              {/* Connected Accounts */}
              <div>
                <h4 className="text-sm font-medium text-white mb-4">Connected Accounts</h4>
                <div className="space-y-3">
                  {connectedAccounts.length > 0 ? (
                    connectedAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {account.provider === 'google' && <Chrome className="w-5 h-5 text-red-400" />}
                          {account.provider === 'github' && <Github className="w-5 h-5 text-white" />}
                          <div>
                            <p className="text-sm font-medium text-white capitalize">
                              {account.provider}
                            </p>
                            <p className="text-xs text-gray-400">
                              {account.emailAddress || account.username}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-green-600">Connected</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">
                      No external accounts connected. Connect Google or GitHub for easier sign-in.
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => openUserProfile()}>
                  Manage Connected Accounts
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <SubscriptionStatus />

          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                View and download your past invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <p>No billing history available</p>
                <p className="text-sm mt-1">Invoices will appear here after your first payment</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose what notifications you receive via email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notifications.map((notification) => (
                <label
                  key={notification.id}
                  className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{notification.label}</p>
                    <p className="text-xs text-gray-400">{notification.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notification.enabled}
                    onChange={() => toggleNotification(notification.id)}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sync Preferences</CardTitle>
              <CardDescription>
                Configure how Gitgram TimeMachine syncs your checkpoints
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">Auto-sync to cloud</p>
                  <p className="text-xs text-gray-400">Automatically sync checkpoints when created</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.autoSync}
                  onChange={() => setPreferences({ ...preferences, autoSync: !preferences.autoSync })}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">Compress checkpoints</p>
                  <p className="text-xs text-gray-400">Compress checkpoint data to save storage</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.compressCheckpoints}
                  onChange={() => setPreferences({ ...preferences, compressCheckpoints: !preferences.compressCheckpoints })}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
              </label>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Retention period</p>
                    <p className="text-xs text-gray-400">How long to keep cloud checkpoints</p>
                  </div>
                  <select
                    value={preferences.retainDays}
                    onChange={(e) => setPreferences({ ...preferences, retainDays: Number(e.target.value) })}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-sm"
                  >
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                    <option value={0}>Forever</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Regional Settings</CardTitle>
              <CardDescription>
                Configure timezone and locale preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">Timezone:</span>
                <Badge variant="secondary">{preferences.timezone}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* 2FA Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Two-Factor Authentication (2FA)
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account with TOTP-based 2FA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 2FA Status */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  {twoFactorEnabled ? (
                    <ShieldCheck className="w-6 h-6 text-green-400" />
                  ) : (
                    <ShieldOff className="w-6 h-6 text-yellow-400" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">2FA Status</p>
                      {twoFactorEnabled ? (
                        <Badge className="bg-green-600 text-white">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-400">Disabled</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {twoFactorEnabled
                        ? 'Your account is protected with two-factor authentication'
                        : 'Enable 2FA to add an extra layer of security'}
                    </p>
                  </div>
                </div>
                {!twoFactorEnabled && !showTotpSetup && (
                  <Button
                    onClick={handleStartTotpSetup}
                    disabled={totpLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {totpLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4 mr-2" />
                        Enable 2FA
                      </>
                    )}
                  </Button>
                )}
                {twoFactorEnabled && (
                  <Button
                    variant="outline"
                    onClick={handleDisable2FA}
                    disabled={disabling2FA}
                    className="border-red-800 text-red-400 hover:bg-red-900/20"
                  >
                    {disabling2FA ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Disabling...
                      </>
                    ) : (
                      'Disable 2FA'
                    )}
                  </Button>
                )}
              </div>

              {/* TOTP Setup Flow */}
              {showTotpSetup && totpResource && (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-blue-600/50 space-y-4">
                  <div className="flex items-start gap-3">
                    <QrCode className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-white">Set up authenticator app</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Scan the QR code below with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
                      </p>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-4 py-4">
                    {totpResource.uri && (
                      <div className="bg-white p-4 rounded-lg">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpResource.uri)}`}
                          alt="2FA QR Code"
                          className="w-48 h-48"
                        />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">Or enter this code manually:</p>
                      <code className="text-sm bg-gray-700 px-3 py-1 rounded font-mono text-blue-300">
                        {totpResource.secret}
                      </code>
                    </div>
                  </div>

                  {/* Verification Code Input */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">Enter verification code from your app</label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="font-mono text-center text-lg tracking-widest max-w-[200px]"
                        maxLength={6}
                      />
                      <Button
                        onClick={handleVerifyTotp}
                        disabled={verificationCode.length !== 6 || totpLoading}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {totpLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Verify
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleCancelTotpSetup}>
                        Cancel
                      </Button>
                    </div>
                    {totpError && (
                      <p className="text-sm text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        {totpError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Backup Codes Section */}
              {twoFactorEnabled && (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Backup Codes</p>
                        <p className="text-xs text-gray-400">
                          Use these codes if you lose access to your authenticator
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {backupCodes.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBackupCodes(!showBackupCodes)}
                        >
                          {showBackupCodes ? (
                            <>
                              <EyeOff className="w-4 h-4 mr-2" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Show
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerateBackupCodes}
                        disabled={backupCodesLoading}
                      >
                        {backupCodesLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {backupCodes.length > 0 ? 'Regenerate' : 'Generate'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Backup Codes Display */}
                  {showBackupCodes && backupCodes.length > 0 && (
                    <div className="mt-3 space-y-3">
                      <div className="bg-gray-900 p-4 rounded-lg border border-gray-600">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-yellow-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Store these codes securely. They will only be shown once.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCodes(!showCodes)}
                            className="text-gray-400 hover:text-white"
                          >
                            {showCodes ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {backupCodes.map((code, index) => (
                            <code
                              key={index}
                              className="bg-gray-800 px-3 py-2 rounded text-sm font-mono text-center"
                            >
                              {showCodes ? code : '********'}
                            </code>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyBackupCodes}
                        className="w-full"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All Codes
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {totpError && !showTotpSetup && (
                <p className="text-sm text-red-400 flex items-center gap-1 p-2">
                  <AlertTriangle className="w-4 h-4" />
                  {totpError}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Other Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage other security options for your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Active sessions</p>
                    <p className="text-xs text-gray-400">Manage devices where you're signed in</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
                  View Sessions
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Password</p>
                    <p className="text-xs text-gray-400">Change your account password</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-900/50">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that affect your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-sm font-medium text-white">Delete all cloud data</p>
                  <p className="text-xs text-gray-400">Remove all synced checkpoints from cloud storage</p>
                </div>
                <Button variant="outline" size="sm" className="border-red-800 text-red-400 hover:bg-red-900/20">
                  Delete Data
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-sm font-medium text-white">Sign out everywhere</p>
                  <p className="text-xs text-gray-400">Sign out of all devices and sessions</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-800 text-red-400 hover:bg-red-900/20"
                  onClick={() => signOut()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out All
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-red-800">
                <div>
                  <p className="text-sm font-medium text-white">Delete account</p>
                  <p className="text-xs text-gray-400">Permanently delete your account and all data</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-4">
        {saved && (
          <span className="flex items-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" />
            Settings saved
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {saveError}
          </span>
        )}
        <Button onClick={handleSave} disabled={saving || settingsLoading}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data, including
              checkpoints, projects, and API keys will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-400 mb-2">
              Type <span className="font-mono text-white">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmation !== 'DELETE'}
            >
              Delete My Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
