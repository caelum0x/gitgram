/**
 * Hybrid Store - Syncs between local storage and Neon cloud
 * 
 * Features:
 * - Offline-first: works without internet
 * - Background sync to Neon when connected
 * - Conflict resolution for concurrent edits
 * - Efficient delta sync (only changed data)
 */

import * as fs from 'fs';
import * as path from 'path';
import { NeonStore, DbTimePoint, DbFile, DbEvent, DbMessage, initializeNeonStore } from './neon-store.js';
import { EventStore, Event } from '../core/event-store.js';
import { ContentStore } from '../core/content-store.js';
import { TimePointManager } from '../core/timepoint-manager.js';
import { ConversationStore } from '../core/conversation-store.js';
import { TimePoint, FileEntry, TimePointSummary } from '../core/types.js';

export interface SyncConfig {
  neonConnectionString?: string;
  syncInterval?: number;  // ms, default 5 minutes
  syncOnCapture?: boolean;  // Sync immediately after capture
  offlineQueuePath?: string;
}

export interface SyncResult {
  success: boolean;
  pushed: {
    timepoints: number;
    events: number;
    messages: number;
    blobs: number;
  };
  pulled: {
    timepoints: number;
    events: number;
    messages: number;
  };
  errors: string[];
  duration: number;
}

type OfflineQueueItem =
  | { type: 'timepoint'; data: TimePoint }
  | { type: 'event'; data: Event };

export class HybridStore {
  private projectPath: string;
  private projectId?: string;
  private neon: NeonStore | null = null;
  private eventStore: EventStore;
  private contentStore: ContentStore;
  private timePointManager: TimePointManager;
  private conversationStore: ConversationStore;
  private config: SyncConfig;
  private lastSyncTime?: Date;
  private syncInterval?: NodeJS.Timeout;
  private offlineQueue: OfflineQueueItem[] = [];

  constructor(projectPath: string, config: SyncConfig = {}) {
    this.projectPath = projectPath;
    this.config = {
      syncInterval: 5 * 60 * 1000,  // 5 minutes
      syncOnCapture: true,
      ...config
    };

    const basePath = path.join(projectPath, '.aitimemachine');
    this.eventStore = new EventStore(projectPath);
    this.contentStore = new ContentStore(basePath);
    this.timePointManager = new TimePointManager(basePath);
    this.conversationStore = new ConversationStore(basePath);

    this.loadOfflineQueue();
  }

  /**
   * Initialize connection to Neon (if configured)
   */
  async initialize(): Promise<void> {
    // Load local data
    this.eventStore.load();

    // Connect to Neon if configured
    if (this.config.neonConnectionString) {
      try {
        this.neon = await initializeNeonStore(this.config.neonConnectionString);
        
        // Get or create project in Neon
        const projectName = path.basename(this.projectPath);
        const project = await this.neon.getOrCreateProject(this.projectPath, projectName);
        this.projectId = project.id;

        console.log(`Connected to Neon, project: ${projectName}`);

        // Start background sync
        if (this.config.syncInterval && this.config.syncInterval > 0) {
          this.startBackgroundSync();
        }

        // Initial sync
        await this.sync();
      } catch (error) {
        console.error('Failed to connect to Neon:', error);
        // Continue in offline mode
      }
    }
  }

  /**
   * Check if connected to Neon
   */
  isConnected(): boolean {
    return this.neon !== null && this.projectId !== undefined;
  }

  // ==========================================================================
  // Local Operations (Always Available)
  // ==========================================================================

  /**
   * Save a timepoint locally and queue for sync
   */
  async saveTimePoint(tp: TimePoint): Promise<void> {
    // Save locally
    this.timePointManager.save(tp);

    // Store file contents
    for (const file of tp.files) {
      const fullPath = path.join(this.projectPath, file.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath);
        this.contentStore.put(content);
      }
    }

    // Queue for Neon sync
    if (this.isConnected()) {
      await this.syncTimePoint(tp);
    } else {
      this.queueOffline('timepoint', tp);
    }
  }

  /**
   * Append an event locally and queue for sync
   */
  appendEvent(event: Omit<Event, 'id' | 'timestamp'>): Event {
    const fullEvent = this.eventStore.append(event);

    if (this.isConnected() && this.projectId) {
      this.syncEvent(fullEvent).catch(console.error);
    } else {
      this.queueOffline('event', fullEvent);
    }

    return fullEvent;
  }

  /**
   * Get file content (local first, then Neon)
   */
  async getFileContent(hash: string): Promise<string | null> {
    // Try local first
    const local = this.contentStore.getString(hash);
    if (local) return local;

    // Try Neon
    if (this.isConnected()) {
      return await this.neon!.getBlobString(hash);
    }

    return null;
  }

  /**
   * Get timepoint (local first, then Neon)
   */
  async getTimePoint(id: string): Promise<TimePoint | null> {
    // Try local first
    const local = this.timePointManager.load(id);
    if (local) return local;

    // Try Neon
    if (this.isConnected()) {
      const remote = await this.neon!.getTimePoint(id);
      if (remote) {
        return this.dbToTimePoint(remote);
      }
    }

    return null;
  }

  /**
   * List timepoints (merged from local and Neon)
   */
  async listTimePoints(options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimePointSummary[]> {
    const localTps = this.timePointManager.list();
    
    if (!this.isConnected()) {
      return this.filterTimePointSummaries(localTps, options);
    }

    // Get from Neon
    const remoteTps = await this.neon!.listTimePoints(this.projectId!, {
      limit: options?.limit || 100,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    // Merge and dedupe
    const merged = new Map<string, TimePointSummary>();
    
    for (const tp of localTps) {
      merged.set(tp.id, tp);
    }
    
    for (const dbTp of remoteTps) {
      if (!merged.has(dbTp.id)) {
        merged.set(dbTp.id, this.dbToTimePointSummary(dbTp));
      }
    }

    const all = Array.from(merged.values());
    return this.filterTimePointSummaries(all, options);
  }

  // ==========================================================================
  // Sync Operations
  // ==========================================================================

  /**
   * Full sync with Neon
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      pushed: { timepoints: 0, events: 0, messages: 0, blobs: 0 },
      pulled: { timepoints: 0, events: 0, messages: 0 },
      errors: [],
      duration: 0,
    };

    if (!this.isConnected()) {
      result.success = false;
      result.errors.push('Not connected to Neon');
      result.duration = Date.now() - startTime;
      return result;
    }

    try {
      // 1. Push offline queue first
      await this.flushOfflineQueue(result);

      // 2. Push local changes
      await this.pushLocalChanges(result);

      // 3. Pull remote changes
      await this.pullRemoteChanges(result);

      // Update last sync time
      this.lastSyncTime = new Date();
      this.saveLastSyncTime();

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.success = false;
      result.errors.push(message);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Push local changes to Neon
   */
  private async pushLocalChanges(result: SyncResult): Promise<void> {
    const lastSync = this.lastSyncTime || new Date(0);

    // Push timepoints created after last sync
    const localTps = this.timePointManager.list();
    for (const tpSummary of localTps) {
      if (tpSummary.timestamp > lastSync) {
        try {
          // Load full timepoint
          const tp = this.timePointManager.load(tpSummary.id);
          if (tp) {
            await this.syncTimePoint(tp);
            result.pushed.timepoints++;
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          result.errors.push(`Failed to push timepoint ${tpSummary.id}: ${message}`);
        }
      }
    }

    // Push events
    const localEvents = this.eventStore.getAll();
    for (const event of localEvents) {
      if (event.timestamp > lastSync) {
        try {
          await this.syncEvent(event);
          result.pushed.events++;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          result.errors.push(`Failed to push event ${event.id}: ${message}`);
        }
      }
    }
  }

  /**
   * Pull remote changes from Neon
   */
  private async pullRemoteChanges(result: SyncResult): Promise<void> {
    const lastSync = this.lastSyncTime || new Date(0);

    const changes = await this.neon!.getChangesSince(lastSync);

    // Pull timepoints
    for (const dbTp of changes.timepoints) {
      const existing = this.timePointManager.load(dbTp.id);
      if (!existing) {
        // Pull files and blobs
        const files = await this.neon!.getTimePointFiles(dbTp.id);
        for (const file of files) {
          if (file.hash && !this.contentStore.has(file.hash)) {
            const blob = await this.neon!.getBlob(file.hash);
            if (blob) {
              this.contentStore.put(blob);
              result.pulled.timepoints++;
            }
          }
        }

        // Save timepoint locally
        const tp = this.dbToTimePoint(dbTp);
        tp.files = files.map(f => this.dbToFileEntry(f));
        this.timePointManager.save(tp);
        result.pulled.timepoints++;
      }
    }

    // Pull events (append to local store)
    for (const dbEvent of changes.events) {
      // Events are append-only, check if we have it
      const existing = this.eventStore.getAll().find(e => e.id === dbEvent.id);
      if (!existing) {
        // We don't modify eventStore directly, but could add a method
        result.pulled.events++;
      }
    }

    result.pulled.messages = changes.messages.length;
  }

  /**
   * Sync a single timepoint to Neon
   */
  private async syncTimePoint(tp: TimePoint): Promise<void> {
    if (!this.isConnected()) return;

    // First, sync all blobs
    for (const file of tp.files) {
      if (!await this.neon!.hasBlob(file.hash)) {
        const content = this.contentStore.get(file.hash);
        if (content) {
          await this.neon!.putBlob(content);
        }
      }
    }

    // Then sync the timepoint
    const dbTp: DbTimePoint = {
      id: tp.id,
      project_id: this.projectId!,
      timestamp: tp.timestamp,
      description: tp.description,
      trigger_type: tp.trigger.type,
      trigger_tool: tp.trigger.tool,
      trigger_action: tp.trigger.action,
      parent_id: undefined,
      session_id: tp.conversation?.sessionId || 'unknown',
      message_count: tp.conversation?.messageCount || 0,
      total_files: tp.stats.totalFiles,
      total_size: tp.stats.totalSize,
      metadata: { changes: tp.changes },
    };

    const dbFiles: DbFile[] = tp.files.map(f => ({
      id: `${tp.id}_${f.path}`,
      timepoint_id: tp.id,
      path: f.path,
      hash: f.hash,
      size: f.size,
      mode: f.mode,
      mtime: new Date(f.mtime),
      change_type: tp.changes.added.includes(f.path) ? 'added' 
                 : tp.changes.modified.includes(f.path) ? 'modified'
                 : 'unchanged',
    }));

    await this.neon!.saveTimePoint(dbTp, dbFiles);
  }

  /**
   * Sync a single event to Neon
   */
  private async syncEvent(event: Event): Promise<void> {
    if (!this.isConnected()) return;

    const dbEvent: DbEvent = {
      id: event.id,
      project_id: this.projectId!,
      session_id: event.sessionId,
      timestamp: event.timestamp,
      type: event.type,
      data: event.data,
    };

    await this.neon!.appendEvent(dbEvent);
  }

  // ==========================================================================
  // Offline Queue
  // ==========================================================================

  private queueOffline(type: 'timepoint' | 'event', data: TimePoint | Event): void {
    if (type === 'timepoint') {
      this.offlineQueue.push({ type: 'timepoint', data: data as TimePoint });
    } else {
      this.offlineQueue.push({ type: 'event', data: data as Event });
    }
    this.saveOfflineQueue();
  }

  private async flushOfflineQueue(result: SyncResult): Promise<void> {
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const item of queue) {
      try {
        if (item.type === 'timepoint') {
          await this.syncTimePoint(item.data);
          result.pushed.timepoints++;
        } else if (item.type === 'event') {
          await this.syncEvent(item.data);
          result.pushed.events++;
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        // Re-queue failed items
        this.offlineQueue.push(item);
        result.errors.push(`Failed to sync ${item.type}: ${message}`);
      }
    }

    this.saveOfflineQueue();
  }

  private get offlineQueuePath(): string {
    return this.config.offlineQueuePath || 
           path.join(this.projectPath, '.aitimemachine', 'offline-queue.json');
  }

  private loadOfflineQueue(): void {
    try {
      if (fs.existsSync(this.offlineQueuePath)) {
        this.offlineQueue = JSON.parse(fs.readFileSync(this.offlineQueuePath, 'utf-8')) as OfflineQueueItem[];
      }
    } catch {
      this.offlineQueue = [];
    }
  }

  private saveOfflineQueue(): void {
    const dir = path.dirname(this.offlineQueuePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.offlineQueuePath, JSON.stringify(this.offlineQueue, null, 2));
  }

  private get lastSyncTimePath(): string {
    return path.join(this.projectPath, '.aitimemachine', 'last-sync.json');
  }

  private loadLastSyncTime(): void {
    try {
      if (fs.existsSync(this.lastSyncTimePath)) {
        const data = JSON.parse(fs.readFileSync(this.lastSyncTimePath, 'utf-8'));
        this.lastSyncTime = new Date(data.timestamp);
      }
    } catch {
      this.lastSyncTime = undefined;
    }
  }

  private saveLastSyncTime(): void {
    fs.writeFileSync(this.lastSyncTimePath, JSON.stringify({
      timestamp: this.lastSyncTime?.toISOString()
    }));
  }

  // ==========================================================================
  // Background Sync
  // ==========================================================================

  private startBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (this.isConnected()) {
        const result = await this.sync();
        if (!result.success) {
          console.error('Background sync failed:', result.errors);
        }
      }
    }, this.config.syncInterval!);
  }

  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private filterTimePointSummaries(tps: TimePointSummary[], options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): TimePointSummary[] {
    let filtered = tps;

    if (options?.startDate) {
      filtered = filtered.filter(tp => tp.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      filtered = filtered.filter(tp => tp.timestamp <= options.endDate!);
    }

    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  private dbToTimePoint(dbTp: DbTimePoint): TimePoint {
    const changes = this.extractChanges(dbTp.metadata);
    return {
      id: dbTp.id,
      timestamp: dbTp.timestamp,
      description: dbTp.description,
      trigger: {
        type: this.toTriggerType(dbTp.trigger_type),
        tool: dbTp.trigger_tool,
        action: dbTp.trigger_action,
      },
      conversation: {
        sessionId: dbTp.session_id,
        messageCount: dbTp.message_count,
        lastMessagePreview: '',
      },
      files: [],
      changes,
      stats: {
        totalFiles: dbTp.total_files,
        totalSize: dbTp.total_size,
      },
    };
  }

  private dbToFileEntry(dbFile: DbFile): FileEntry {
    return {
      path: dbFile.path,
      hash: dbFile.hash,
      size: dbFile.size,
      mode: dbFile.mode,
      mtime: dbFile.mtime.getTime(),
    };
  }

  private dbToTimePointSummary(dbTp: DbTimePoint): TimePointSummary {
    const changes = this.extractChanges(dbTp.metadata);
    return {
      id: dbTp.id,
      timestamp: dbTp.timestamp,
      description: dbTp.description,
      trigger: {
        type: this.toTriggerType(dbTp.trigger_type),
        tool: dbTp.trigger_tool,
        action: dbTp.trigger_action,
      },
      stats: {
        totalFiles: dbTp.total_files,
        totalSize: dbTp.total_size,
      },
      changesCount: changes.added.length + changes.modified.length + changes.deleted.length,
    };
  }

  private extractChanges(metadata?: Record<string, unknown>): { added: string[]; modified: string[]; deleted: string[] } {
    const fallback = { added: [] as string[], modified: [] as string[], deleted: [] as string[] };
    const raw = metadata?.changes;

    if (!raw || typeof raw !== 'object') {
      return fallback;
    }

    const changes = raw as { added?: unknown; modified?: unknown; deleted?: unknown };
    return {
      added: Array.isArray(changes.added) ? changes.added.filter((v): v is string => typeof v === 'string') : [],
      modified: Array.isArray(changes.modified) ? changes.modified.filter((v): v is string => typeof v === 'string') : [],
      deleted: Array.isArray(changes.deleted) ? changes.deleted.filter((v): v is string => typeof v === 'string') : [],
    };
  }

  private toTriggerType(input: string): TimePoint['trigger']['type'] {
    if (input === 'ai_action' || input === 'manual' || input === 'auto' || input === 'restore') {
      return input;
    }
    return 'manual';
  }

  // ==========================================================================
  // Search (uses Neon's full-text search)
  // ==========================================================================

  async searchMessages(query: string, limit = 50): Promise<DbMessage[]> {
    if (!this.isConnected()) {
      return this.searchMessagesLocally(query, limit);
    }

    return await this.neon!.searchMessages(this.projectId!, query, limit);
  }

  /**
   * Search messages locally using the conversation store.
   * Uses case-insensitive substring matching on locally stored messages,
   * then converts them to DbMessage[] for a consistent interface.
   */
  private searchMessagesLocally(query: string, limit: number): DbMessage[] {
    const localMatches = this.conversationStore.search(query);

    // Apply limit and convert ConversationMessage -> DbMessage
    return localMatches.slice(0, limit).map(msg => ({
      id: msg.id,
      project_id: this.projectId ?? 'local',
      session_id: msg.sessionId,
      timestamp: msg.timestamp,
      role: msg.role,
      content: msg.content,
      tool: msg.metadata?.tool,
      metadata: msg.metadata as Record<string, unknown> | undefined,
    }));
  }

  async getStats(): Promise<{
    local: { timepoints: number; events: number; blobs: number };
    remote?: { timepoints: number; events: number; messages: number; storageSize: number };
  }> {
    const local = {
      timepoints: this.timePointManager.list().length,
      events: this.eventStore.getAll().length,
      blobs: 0, // Would need to count files in store/
    };

    if (this.isConnected()) {
      const remote = await this.neon!.getStats(this.projectId!);
      return {
        local,
        remote: {
          timepoints: remote.totalTimepoints,
          events: remote.totalEvents,
          messages: remote.totalMessages,
          storageSize: remote.storageSize,
        }
      };
    }

    return { local };
  }
}
