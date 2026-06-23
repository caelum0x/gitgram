import * as fs from 'fs';
import * as path from 'path';

export interface AiderMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface AiderSession {
  projectPath: string;
  projectName: string;
  messages: AiderMessage[];
}

/**
 * Reads Aider conversation history from .aider.chat.history.md
 */
export class AiderCollector {
  /**
   * Check if project has Aider history
   */
  hasHistory(projectPath: string): boolean {
    return fs.existsSync(path.join(projectPath, '.aider.chat.history.md'));
  }

  /**
   * Get Aider session for a project
   */
  getSession(projectPath: string): AiderSession | null {
    const historyPath = path.join(projectPath, '.aider.chat.history.md');
    if (!fs.existsSync(historyPath)) return null;

    const content = fs.readFileSync(historyPath, 'utf-8');
    const messages = this.parseHistory(content);

    if (messages.length === 0) return null;

    return {
      projectPath: path.resolve(projectPath),
      projectName: path.basename(projectPath),
      messages,
    };
  }

  /**
   * Parse Aider markdown history format
   */
  private parseHistory(content: string): AiderMessage[] {
    const messages: AiderMessage[] = [];
    const lines = content.split('\n');
    
    let currentRole: 'user' | 'assistant' | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      // User messages start with #### or >
      if (line.startsWith('#### ') || line.startsWith('> ')) {
        // Save previous message
        if (currentRole && currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim(),
          });
        }
        currentRole = 'user';
        currentContent = [line.replace(/^(####\s*|>\s*)/, '')];
      }
      // Assistant responses are regular text after user messages
      else if (currentRole === 'user' && line.trim() && !line.startsWith('#')) {
        // Save user message, start assistant
        if (currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim(),
          });
        }
        currentRole = 'assistant';
        currentContent = [line];
      }
      // Continue current message
      else if (currentRole) {
        currentContent.push(line);
      }
    }

    // Save last message
    if (currentRole && currentContent.length > 0) {
      messages.push({
        role: currentRole,
        content: currentContent.join('\n').trim(),
      });
    }

    return messages;
  }

  /**
   * Search Aider history
   */
  search(projectPath: string, query: string): AiderMessage[] {
    const session = this.getSession(projectPath);
    if (!session) return [];

    const queryLower = query.toLowerCase();
    return session.messages.filter(m => 
      m.content.toLowerCase().includes(queryLower)
    );
  }
}
