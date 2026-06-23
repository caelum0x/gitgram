/**
 * Services - Export all service modules
 */

export { SessionManager, getSessionManager } from './SessionManager';
export type { Session, SessionMessage, SessionState } from './SessionManager';

export { ApprovalManager, getApprovalManager } from './ApprovalManager';
export type { ApprovalConfig, ApprovalRequest, ApprovalResult } from './ApprovalManager';

export { GhostService, getGhostService } from './GhostService';
export type { GhostSuggestion, GhostConfig } from './GhostService';

export { CommitMessageGenerator, getCommitMessageGenerator } from './CommitMessageGenerator';
export type { CommitMessageConfig, GeneratedCommitMessage, StagedChange } from './CommitMessageGenerator';

export { MentionsProvider, getMentionsProvider } from './MentionsProvider';
export type { Mention, MentionType, MentionSuggestion } from './MentionsProvider';
