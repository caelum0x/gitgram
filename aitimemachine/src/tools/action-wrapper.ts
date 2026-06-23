import { TimeMachineEngine } from '../core/engine.js';
import { ConversationLogger } from '../core/conversation-logger.js';

/**
 * Auto-wrapper for AI actions
 * Automatically creates before/after checkpoints around AI operations
 */
export class ActionWrapper {
  private activeActions = new Map<string, string>(); // actionId -> checkpointId

  constructor(
    private engine: TimeMachineEngine,
    private logger: ConversationLogger
  ) {}

  /**
   * Start an action - creates "before" checkpoint
   */
  startAction(action: string): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Create before checkpoint
    const checkpoint = this.engine.capture(`🔵 START: ${action}`, {
      type: 'ai_action',
      action,
      status: 'before',
    });

    // Log to conversation
    this.logger.logCheckpoint(checkpoint.id, checkpoint.description);

    // Track active action
    this.activeActions.set(actionId, checkpoint.id);

    return actionId;
  }

  /**
   * End an action - creates "after" checkpoint
   */
  endAction(actionId: string, success: boolean = true): string | null {
    const beforeCheckpointId = this.activeActions.get(actionId);
    if (!beforeCheckpointId) {
      return null;
    }

    const beforeCheckpoint = this.engine.getTimePoint(beforeCheckpointId);
    if (!beforeCheckpoint) {
      return null;
    }

    const action = (beforeCheckpoint as any).metadata?.action as string || 'action';
    const status = success ? '✅ DONE' : '❌ FAILED';

    // Create after checkpoint
    const checkpoint = this.engine.capture(`${status}: ${action}`, {
      type: 'ai_action',
      action,
      status: success ? 'after_success' : 'after_failed',
    });

    // Log to conversation
    this.logger.logCheckpoint(checkpoint.id, checkpoint.description);

    // Remove from active actions
    this.activeActions.delete(actionId);

    return checkpoint.id;
  }

  /**
   * Wrap a function with automatic before/after checkpoints
   */
  async wrapAction<T>(
    action: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; beforeId: string; afterId: string }> {
    const actionId = this.startAction(action);

    try {
      const result = await fn();
      const afterId = this.endAction(actionId, true);
      const beforeId = this.activeActions.get(actionId) || '';

      return { result, beforeId, afterId: afterId || '' };
    } catch (error) {
      this.endAction(actionId, false);
      throw error;
    }
  }

  /**
   * Get active actions
   */
  getActiveActions(): Array<{ actionId: string; checkpointId: string }> {
    return Array.from(this.activeActions.entries()).map(([actionId, checkpointId]) => ({
      actionId,
      checkpointId,
    }));
  }

  /**
   * Cancel an action
   */
  cancelAction(actionId: string): void {
    this.activeActions.delete(actionId);
  }
}
