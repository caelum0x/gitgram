'use client';

import { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  MapPin,
  Shield,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSessions, Session } from '@/hooks/useDashboard';
import { formatRelativeTime } from '@/lib/utils';

function getDeviceIcon(device: string) {
  const deviceLower = device.toLowerCase();
  if (deviceLower.includes('mobile') || deviceLower.includes('iphone') || deviceLower.includes('android')) {
    return Smartphone;
  }
  if (deviceLower.includes('tablet') || deviceLower.includes('ipad')) {
    return Tablet;
  }
  return Monitor;
}

export default function SessionsPage() {
  const { sessions, currentSessionId, isLoading, mutate } = useSessions();
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleRevokeSession = async () => {
    if (!sessionToRevoke) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/sessions/${sessionToRevoke.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        mutate();
        setRevokeDialogOpen(false);
        setSessionToRevoke(null);
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
    } finally {
      setRevoking(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevoking(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
      });
      if (res.ok) {
        mutate();
        setRevokeAllDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to revoke all sessions:', error);
    } finally {
      setRevoking(false);
    }
  };

  const otherSessions = sessions.filter(s => s.id !== currentSessionId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Sessions</h1>
          <p className="text-gray-400 mt-1">
            Manage devices and sessions signed in to your account
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => mutate()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {otherSessions.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setRevokeAllDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Revoke All Other Sessions
            </Button>
          )}
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
              <h3 className="font-medium text-white">Session Security</h3>
              <p className="text-sm text-gray-400 mt-1">
                If you notice any suspicious activity or don't recognize a session, revoke it immediately
                and change your password. Sessions are automatically revoked after 30 days of inactivity.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            {sessions.length === 0
              ? 'Loading sessions...'
              : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center">
              <Monitor className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Sessions Found</h3>
              <p className="text-gray-400">
                Unable to retrieve session information at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const isCurrent = session.id === currentSessionId || session.isCurrent;
                const DeviceIcon = getDeviceIcon(session.device);

                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isCurrent
                        ? 'bg-green-950/20 border-green-800'
                        : 'bg-gray-800/50 border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isCurrent ? 'bg-green-600/20' : 'bg-gray-700'
                      }`}>
                        <DeviceIcon className={`w-5 h-5 ${
                          isCurrent ? 'text-green-400' : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {session.device} - {session.browser}
                          </span>
                          {isCurrent && (
                            <Badge className="bg-green-600 text-white">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {session.ip}
                          </span>
                          {session.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {session.location}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last active {formatRelativeTime(session.lastActive)}
                          </span>
                          <span>
                            Created {formatRelativeTime(session.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`${
                        isCurrent
                          ? 'text-gray-500 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-400'
                      }`}
                      disabled={isCurrent}
                      onClick={() => {
                        setSessionToRevoke(session);
                        setRevokeDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Info */}
      <Card>
        <CardHeader>
          <CardTitle>About Sessions</CardTitle>
          <CardDescription>
            How Gitgram TimeMachine manages your sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-400">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">1</span>
            </div>
            <p>
              <strong className="text-white">Session creation:</strong> A new session is created each time
              you sign in from a new device or browser.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">2</span>
            </div>
            <p>
              <strong className="text-white">Session expiry:</strong> Sessions expire after 30 days of
              inactivity or when you explicitly sign out.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-gray-400">3</span>
            </div>
            <p>
              <strong className="text-white">Revoking sessions:</strong> Revoking a session will immediately
              sign out that device. The user will need to sign in again.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Revoke Single Session Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Revoke Session
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this session? This will immediately sign out
              the device ({sessionToRevoke?.device} - {sessionToRevoke?.browser}).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {sessionToRevoke && (
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300">{sessionToRevoke.ip}</span>
                </div>
                {sessionToRevoke.location && (
                  <div className="flex items-center gap-3 mt-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">{sessionToRevoke.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300">
                    Last active {formatRelativeTime(sessionToRevoke.lastActive)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeSession}
              disabled={revoking}
            >
              {revoking ? 'Revoking...' : 'Revoke Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke All Sessions Dialog */}
      <Dialog open={revokeAllDialogOpen} onOpenChange={setRevokeAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Revoke All Other Sessions
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke all other sessions? This will immediately sign out
              all devices except your current one. You have {otherSessions.length} other active
              session{otherSessions.length === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-medium">Warning</p>
                <p className="text-yellow-300/80 mt-1">
                  This action cannot be undone. All other devices will need to sign in again.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeAllDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAllSessions}
              disabled={revoking}
            >
              {revoking ? 'Revoking...' : `Revoke ${otherSessions.length} Session${otherSessions.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
