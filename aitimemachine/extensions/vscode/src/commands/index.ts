/**
 * Command System - Export all commands and initialize registry
 */

export * from './types';
export { CommandRegistry, commandRegistry } from './CommandRegistry';

// Import all commands
import { checkpointCommand } from './checkpointCommand';
import { sessionCommand } from './sessionCommand';
import { tasksCommand } from './tasksCommand';
import { helpCommand } from './helpCommand';
import { modeCommand } from './modeCommand';
import { clearCommand } from './clearCommand';
import { newCommand } from './newCommand';
import { configCommand } from './configCommand';
import { newtaskCommand } from './newtaskCommand';
import { reportbugCommand } from './reportbugCommand';
import { newruleCommand } from './newruleCommand';

// Export individual commands
export { checkpointCommand } from './checkpointCommand';
export { sessionCommand } from './sessionCommand';
export { tasksCommand } from './tasksCommand';
export { helpCommand } from './helpCommand';
export { modeCommand } from './modeCommand';
export { clearCommand } from './clearCommand';
export { newCommand } from './newCommand';
export { configCommand } from './configCommand';
export { newtaskCommand } from './newtaskCommand';
export { reportbugCommand } from './reportbugCommand';
export { newruleCommand } from './newruleCommand';

// All commands array
export const allCommands = [
  checkpointCommand,
  sessionCommand,
  tasksCommand,
  helpCommand,
  modeCommand,
  clearCommand,
  newCommand,
  configCommand,
  newtaskCommand,
  reportbugCommand,
  newruleCommand,
];

// Register all commands with the registry
import { commandRegistry } from './CommandRegistry';

export function registerAllCommands(): void {
  for (const command of allCommands) {
    commandRegistry.register(command);
  }
}

// Auto-register on import
registerAllCommands();
