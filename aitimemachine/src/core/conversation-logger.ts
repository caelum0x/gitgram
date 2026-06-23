import { randomUUID } from 'crypto';
import { EventStore, Event } from './event-store.js';
import { ContentStorage } from './content-storage.js';
import * as diff from 'diff';

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  toolCalls: Array<{
    tool: string;
    args: any;
    timestamp: Date;
  }>;
  checkpoints: string[];
  codeChanges: Array<{
    type: 'file_created' | 'file_modified' | 'file_deleted';
    filePath: string;
    oldSize: number;
    newSize: number;
    timestamp: Date;
  }>;
}

export class ConversationLogger {
  private eventStore: EventStore;
  private contentStorage: ContentStorage;
  private sessionId: string;

  constructor(projectPath: string) {
    this.eventStore = new EventStore(projectPath);
    this.contentStorage = new ContentStorage(projectPath);
    this.eventStore.load();
    this.sessionId = randomUUID();
  }

  logUserMessage(content: string): void {
    const contentRef = content.length > 500 ? this.contentStorage.storeMessage(content) : undefined;
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'user_message',
      data: { 
        content: content.slice(0, 500),
        contentRef,
        fullSize: content.length
      }
    });
  }

  logAssistantMessage(content: string, thinking?: string): void {
    const contentRef = content.length > 500 ? this.contentStorage.storeMessage(content) : undefined;
    const thinkingRef = thinking && thinking.length > 500 ? this.contentStorage.storeMessage(thinking) : undefined;
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'assistant_message',
      data: { 
        content: content.slice(0, 500),
        contentRef,
        thinking: thinking?.slice(0, 500),
        thinkingRef,
        fullSize: content.length
      }
    });
  }

  logToolCall(tool: string, args: any): string {
    const event = this.eventStore.append({
      sessionId: this.sessionId,
      type: 'tool_call',
      data: { tool, args }
    });
    return event.id;
  }

  logToolResult(callId: string, result: any): void {
    // Store large results separately
    const resultStr = JSON.stringify(result, null, 2);
    const resultRef = resultStr.length > 1000 ? this.contentStorage.storeOutput(resultStr) : undefined;
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'tool_result',
      data: { 
        callId, 
        result: resultStr.slice(0, 1000),
        resultRef,
        fullSize: resultStr.length
      }
    });
  }

  logToolError(callId: string, error: Error): void {
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'tool_error' as any,
      data: {
        callId,
        error: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }

  logCheckpoint(checkpointId: string, description: string): void {
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'checkpoint_created',
      data: { checkpointId, description }
    });
  }

  logCodeChange(filePath: string, oldContent: string | null, newContent: string | null, diffText?: string): void {
    const changeType = !oldContent ? 'file_created' : !newContent ? 'file_deleted' : 'file_modified';
    
    // Store full content
    const oldContentRef = oldContent ? this.contentStorage.storeCode(oldContent) : undefined;
    const newContentRef = newContent ? this.contentStorage.storeCode(newContent) : undefined;
    
    // Generate and store diff
    let diffRef: string | undefined;
    if (oldContent && newContent) {
      const generatedDiff = diff.createPatch(filePath, oldContent, newContent);
      diffRef = this.contentStorage.storeDiff(generatedDiff);
    }
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: changeType as any,
      data: {
        filePath,
        oldContentRef,
        newContentRef,
        diffRef,
        oldSize: oldContent?.length || 0,
        newSize: newContent?.length || 0,
        // Store snippets for quick preview
        oldSnippet: oldContent?.slice(0, 500),
        newSnippet: newContent?.slice(0, 500),
      }
    });
  }

  getContextForCheckpoint(checkpointId: string): ConversationContext {
    const events = this.eventStore.getEventsUntil(checkpointId);
    
    return {
      messages: events
        .filter(e => e.type === 'user_message' || e.type === 'assistant_message')
        .map(e => ({
          role: e.type === 'user_message' ? 'user' as const : 'assistant' as const,
          content: e.data.content,
          timestamp: e.timestamp
        })),
      
      toolCalls: events
        .filter(e => e.type === 'tool_call')
        .map(e => ({
          tool: e.data.tool,
          args: e.data.args,
          timestamp: e.timestamp
        })),
      
      checkpoints: events
        .filter(e => e.type === 'checkpoint_created')
        .map(e => e.data.checkpointId),
      
      codeChanges: events
        .filter(e => e.type === 'file_created' || e.type === 'file_modified' || e.type === 'file_deleted')
        .map(e => ({
          type: e.type as 'file_created' | 'file_modified' | 'file_deleted',
          filePath: e.data.filePath,
          oldSize: e.data.oldSize,
          newSize: e.data.newSize,
          timestamp: e.timestamp
        }))
    };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getAllEvents(): Event[] {
    return this.eventStore.getAll();
  }

  /**
   * Get full content for an event
   */
  getFullContent(event: Event): string | null {
    const contentRef = event.data.contentRef || event.data.oldContentRef || event.data.newContentRef || event.data.resultRef;
    if (!contentRef) return null;
    return this.contentStorage.getContent(contentRef);
  }

  /**
   * Get diff for a code change event
   */
  getDiff(event: Event): string | null {
    if (!event.data.diffRef) return null;
    return this.contentStorage.getContent(event.data.diffRef);
  }
}
