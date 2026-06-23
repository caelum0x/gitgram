import { spawn } from 'child_process';
import { ConversationLogger } from '../core/conversation-logger.js';
import { EventStore } from '../core/event-store.js';

/**
 * Execute command and log to conversation history
 */
export async function executeAndLog(
  command: string,
  cwd: string,
  logger: ConversationLogger,
  eventStore: EventStore
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    let output = '';
    
    const proc = spawn(command, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    proc.on('close', (exitCode) => {
      // Log terminal command
      eventStore.append({
        sessionId: logger.getSessionId(),
        type: 'terminal_command',
        data: {
          command,
          output: output.slice(0, 10000), // First 10KB
          exitCode: exitCode || 0,
          cwd,
          timestamp: new Date(),
        }
      });

      resolve({ output, exitCode: exitCode || 0 });
    });
  });
}
