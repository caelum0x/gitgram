import { ConversationLogger } from '../core/conversation-logger.js';
import { EventStore } from '../core/event-store.js';
import { TimeMachineEngine } from '../core/index.js';

export interface ReplayStep {
  timestamp: Date;
  type: 'message' | 'code_change' | 'terminal' | 'checkpoint';
  data: any;
}

/**
 * Replay a session step-by-step
 */
export class SessionReplayer {
  constructor(
    private logger: ConversationLogger,
    private eventStore: EventStore,
    private engine: TimeMachineEngine
  ) {}

  /**
   * Get all steps for a session
   */
  getSteps(sessionId: string): ReplayStep[] {
    const events = this.eventStore.getBySession(sessionId);
    
    return events.map((event: any) => ({
      timestamp: new Date(event.timestamp),
      type: this.mapEventType(event.type),
      data: event.data,
    })).sort((a: ReplayStep, b: ReplayStep) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Replay session up to a specific step
   */
  async replayToStep(sessionId: string, stepIndex: number): Promise<void> {
    const steps = this.getSteps(sessionId);
    
    if (stepIndex >= steps.length) {
      throw new Error(`Step ${stepIndex} out of range (max: ${steps.length - 1})`);
    }

    // Find checkpoint at or before this step
    const checkpointSteps = steps
      .slice(0, stepIndex + 1)
      .filter(s => s.type === 'checkpoint')
      .reverse();

    if (checkpointSteps.length === 0) {
      throw new Error('No checkpoint found before this step');
    }

    const checkpoint = checkpointSteps[0];
    const checkpointId = checkpoint.data.checkpointId;

    // Restore to checkpoint
    await this.engine.restore(checkpointId);

    console.log(`Replayed to step ${stepIndex} (checkpoint: ${checkpointId})`);
  }

  /**
   * Get diff between two steps
   */
  getDiff(sessionId: string, fromStep: number, toStep: number): any {
    const steps = this.getSteps(sessionId);
    
    const codeChanges = steps
      .slice(fromStep, toStep + 1)
      .filter(s => s.type === 'code_change');

    return {
      steps: toStep - fromStep,
      codeChanges: codeChanges.length,
      changes: codeChanges.map(s => s.data),
    };
  }

  private mapEventType(type: string): ReplayStep['type'] {
    if (type.includes('message')) return 'message';
    if (type.includes('code') || type.includes('file')) return 'code_change';
    if (type.includes('terminal')) return 'terminal';
    if (type.includes('checkpoint')) return 'checkpoint';
    return 'message';
  }
}
