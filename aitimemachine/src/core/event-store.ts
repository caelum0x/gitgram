import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface Event {
  id: string;
  timestamp: Date;
  sessionId: string;
  type: EventType;
  data: any;
}

export type EventType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'checkpoint_created'
  | 'code_change'
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'tool_error'
  | 'terminal_command'
  | 'error_occurred';

export class EventStore {
  private events: Event[] = [];
  private dbPath: string;

  constructor(projectPath: string) {
    const tmDir = path.join(projectPath, '.aitimemachine');
    if (!fs.existsSync(tmDir)) {
      fs.mkdirSync(tmDir, { recursive: true });
    }
    this.dbPath = path.join(tmDir, 'events.jsonl');
  }

  append(event: Omit<Event, 'id' | 'timestamp'>): Event {
    const fullEvent: Event = {
      ...event,
      id: `event_${Date.now()}_${randomBytes(4).toString('hex')}`,
      timestamp: new Date()
    };

    // Append to JSONL file
    const line = JSON.stringify({
      ...fullEvent,
      timestamp: fullEvent.timestamp.toISOString()
    }) + '\n';
    
    fs.appendFileSync(this.dbPath, line);
    this.events.push(fullEvent);
    
    return fullEvent;
  }

  getEventsUntil(checkpointId: string): Event[] {
    const checkpoint = this.events.find(
      e => e.type === 'checkpoint_created' && e.data.checkpointId === checkpointId
    );
    
    if (!checkpoint) return [];
    
    const idx = this.events.indexOf(checkpoint);
    return this.events.slice(0, idx + 1);
  }

  getEventsSince(checkpointId: string): Event[] {
    const checkpoint = this.events.find(
      e => e.type === 'checkpoint_created' && e.data.checkpointId === checkpointId
    );
    
    if (!checkpoint) return this.events;
    
    const idx = this.events.indexOf(checkpoint);
    return this.events.slice(idx + 1);
  }

  getEventsBySession(sessionId: string): Event[] {
    return this.events.filter(e => e.sessionId === sessionId);
  }

  getBySession(sessionId: string): Event[] {
    return this.getEventsBySession(sessionId);
  }

  load(): void {
    if (!fs.existsSync(this.dbPath)) return;
    
    const content = fs.readFileSync(this.dbPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    this.events = lines.map(line => {
      const parsed = JSON.parse(line);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp)
      };
    });
  }

  getAll(): Event[] {
    return this.events;
  }
}
