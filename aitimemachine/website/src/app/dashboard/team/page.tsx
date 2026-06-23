'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Mail,
  Crown,
  Shield,
  User,
  Trash2,
  MoreHorizontal,
  Check,
  X,
  Clock,
  Settings,
  Loader2,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrganization, useOrgMembers, useOrgInvitations } from '@/hooks/useDashboard';
import { formatRelativeTime } from '@/lib/utils';

type Role = 'owner' | 'admin' | 'member';

const roleIcons: Record<Role, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const roleColors: Record<Role, string> = {
  owner: 'bg-yellow-600',
  admin: 'bg-blue-600',
  member: 'bg-gray-600',
};

const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function TeamPage() {
  const { organization, isLoading: orgLoading, mutate: mutateOrg } = useOrganization();
  const { members, isLoading: membersLoading, mutate: mutateMembers } = useOrgMembers(organization?.id);
  const { invitations, isLoading: invitationsLoading, mutate: mutateInvitations } = useOrgInvitations(organization?.id);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [inviting, setInviting] = useState(false);

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const [changingRole, setChangingRole] = useState<string | null>(null);

  const currentUserRole = organization?.currentUserRole as Role || 'member';
  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner';

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !organization?.id) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        setInviteDialogOpen(false);
        setInviteEmail('');
        setInviteRole('member');
        mutateInvitations();
      }
    } catch (error) {
      console.error('Failed to invite member:', error);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove || !organization?.id) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/members/${memberToRemove.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRemoveDialogOpen(false);
        setMemberToRemove(null);
        mutateMembers();
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    } finally {
      setRemoving(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: Role) => {
    if (!organization?.id) return;
    setChangingRole(memberId);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        mutateMembers();
      }
    } catch (error) {
      console.error('Failed to change role:', error);
    } finally {
      setChangingRole(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!organization?.id) return;
    try {
      const res = await fetch(`/api/organizations/${organization.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        mutateInvitations();
      }
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!organization?.id) return;
    try {
      await fetch(`/api/organizations/${organization.id}/invitations/${invitationId}/resend`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to resend invitation:', error);
    }
  };

  if (orgLoading) {
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
          <h1 className="text-3xl font-bold text-white">Team</h1>
          <p className="text-gray-400 mt-1">
            Manage your organization and team members
          </p>
        </div>

        <Card className="border-gray-800">
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Organization</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              You're not part of any organization yet. Create one to collaborate with your team,
              or upgrade to the Team plan to unlock organization features.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" asChild>
                <Link href="/dashboard/billing">View Plans</Link>
              </Button>
              <CreateOrgDialog onCreated={() => mutateOrg()} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Team</h1>
          <p className="text-gray-400 mt-1">
            Manage your organization and team members
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/dashboard/team/settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Organization Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-lg font-bold">
                  {organization.name.charAt(0).toUpperCase()}
                </div>
                {organization.name}
              </CardTitle>
              <CardDescription className="mt-2">
                {organization.slug && (
                  <span className="text-sm text-gray-500">@{organization.slug}</span>
                )}
              </CardDescription>
            </div>
            <Badge className={organization.plan === 'team' ? 'bg-blue-600' : 'bg-gray-600'}>
              {organization.plan === 'team' ? 'Team Plan' : 'Free Plan'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">{members.length}</p>
              <p className="text-sm text-gray-400">Members</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">{invitations.length}</p>
              <p className="text-sm text-gray-400">Pending Invites</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white">{organization.projectCount || 0}</p>
              <p className="text-sm text-gray-400">Projects</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Members
          </CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? 's' : ''} in this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="py-8 text-center text-gray-500">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No members yet. Invite someone to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const MemberRoleIcon = roleIcons[member.role as Role] || User;
                const canChangeRole = isAdmin && member.role !== 'owner' && member.id !== organization.currentUserId;
                const canRemove = (isOwner || (isAdmin && member.role === 'member')) && member.id !== organization.currentUserId;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{member.name}</span>
                          {member.id === organization.currentUserId && (
                            <Badge variant="secondary" className="text-xs">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canChangeRole && changingRole !== member.id ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleChangeRole(member.id, value as Role)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : changingRole === member.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <Badge className={roleColors[member.role as Role]}>
                          <MemberRoleIcon className="w-3 h-3 mr-1" />
                          {roleLabels[member.role as Role]}
                        </Badge>
                      )}
                      {canRemove && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-red-400"
                          onClick={() => {
                            setMemberToRemove({ id: member.id, name: member.name });
                            setRemoveDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="py-8 text-center text-gray-500">Loading invitations...</div>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{invitation.email}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Clock className="w-3 h-3" />
                          Invited {formatRelativeTime(invitation.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{roleLabels[invitation.role as Role]}</Badge>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleResendInvitation(invitation.id)}>
                              <Mail className="w-4 h-4 mr-2" />
                              Resend Invitation
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400"
                              onClick={() => handleCancelInvitation(invitation.id)}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancel Invitation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization. They'll receive an email with instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Role</label>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="admin">Admin - Can manage members and settings</SelectItem>}
                  <SelectItem value="member">Member - Can view and contribute</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Remove Member
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.name}</strong> from the organization?
              They will lose access to all organization resources.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={removing}>
              {removing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Member'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Separate component for creating an organization
function CreateOrgDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setOpen(false);
        setName('');
        onCreated();
      }
    } catch (error) {
      console.error('Failed to create organization:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Building2 className="w-4 h-4 mr-2" />
        Create Organization
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to collaborate with your team.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Organization Name</label>
            <Input
              placeholder="Acme Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Organization'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
