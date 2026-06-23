'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings,
  Building2,
  Link2,
  AlertTriangle,
  Trash2,
  UserCog,
  ArrowLeft,
  Check,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrganization, useOrgMembers } from '@/hooks/useDashboard';

export default function TeamSettingsPage() {
  const router = useRouter();
  const { organization, isLoading, mutate } = useOrganization();
  const { members } = useOrgMembers(organization?.id);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferring, setTransferring] = useState(false);

  const currentUserRole = organization?.currentUserRole || 'member';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';

  // Initialize form values when organization loads
  useState(() => {
    if (organization) {
      setName(organization.name);
      setSlug(organization.slug || '');
    }
  });

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || organization.name, slug: slug || organization.slug }),
      });
      if (res.ok) {
        setSaved(true);
        mutate();
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to update organization:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!organization?.id || deleteConfirmation !== organization.name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Failed to delete organization:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleTransfer = async () => {
    if (!organization?.id || !transferTo) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: transferTo }),
      });
      if (res.ok) {
        setTransferDialogOpen(false);
        setTransferTo('');
        mutate();
      }
    } catch (error) {
      console.error('Failed to transfer ownership:', error);
    } finally {
      setTransferring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Organization Settings</h1>
          <p className="text-gray-400 mt-1">
            You need to be part of an organization to access settings.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/team">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Team
          </Link>
        </Button>
      </div>
    );
  }

  const eligibleMembers = members.filter(
    (m) => m.id !== organization.currentUserId && (m.role === 'admin' || m.role === 'owner')
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/team">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-white">Organization Settings</h1>
          <p className="text-gray-400 mt-1">
            Manage your organization's settings and preferences
          </p>
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Organization Name</label>
            <Input
              value={name || organization.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              disabled={!isAdmin}
            />
            <p className="text-xs text-gray-500">
              This is the display name of your organization.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Organization Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">timemachine.gitgram.app/org/</span>
              <Input
                value={slug || organization.slug || ''}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-inc"
                disabled={!isAdmin}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-gray-500">
              Used in URLs and API references. Only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center justify-end gap-4 pt-4">
              {saved && (
                <span className="flex items-center gap-2 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  Changes saved
                </span>
              )}
              <Button onClick={handleSave} disabled={saving}>
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
          )}
        </CardContent>
      </Card>

      {/* URL & Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Organization URL
          </CardTitle>
          <CardDescription>
            Your organization's unique URL and identifiers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <label className="text-sm font-medium text-gray-400">Dashboard URL</label>
            <p className="text-white font-mono text-sm mt-1">
              https://timemachine.gitgram.app/org/{organization.slug || organization.id}
            </p>
          </div>
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <label className="text-sm font-medium text-gray-400">Organization ID</label>
            <p className="text-white font-mono text-sm mt-1">
              {organization.id}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-red-900/50">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer Ownership */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div>
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-gray-400" />
                  <p className="text-sm font-medium text-white">Transfer Ownership</p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Transfer this organization to another admin member
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-yellow-800 text-yellow-400 hover:bg-yellow-900/20"
                onClick={() => setTransferDialogOpen(true)}
                disabled={eligibleMembers.length === 0}
              >
                Transfer
              </Button>
            </div>

            {/* Delete Organization */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-red-800">
              <div>
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <p className="text-sm font-medium text-white">Delete Organization</p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Permanently delete this organization and all its data
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer Ownership Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <UserCog className="w-5 h-5" />
              Transfer Ownership
            </DialogTitle>
            <DialogDescription>
              Transfer ownership of <strong>{organization.name}</strong> to another member.
              You will become an admin after the transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-300 mb-2 block">
              Select New Owner
            </label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {eligibleMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligibleMembers.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                No eligible members. Add an admin first before transferring ownership.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-yellow-600 hover:bg-yellow-700"
              onClick={handleTransfer}
              disabled={transferring || !transferTo}
            >
              {transferring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                'Transfer Ownership'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All organization data,
              including projects, checkpoints, and member associations will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-400 mb-2">
              Type <span className="font-mono text-white">{organization.name}</span> to confirm:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={organization.name}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteConfirmation !== organization.name}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Organization'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
