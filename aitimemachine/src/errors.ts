/**
 * Custom error classes for AITimeMachine
 * Provides consistent error handling with exit codes
 */

// Exit codes for CLI
export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENT: 2,
  PROJECT_NOT_FOUND: 3,
  CHECKPOINT_NOT_FOUND: 4,
  PERMISSION_DENIED: 5,
  DISK_FULL: 6,
  CONFIG_ERROR: 7,
  DAEMON_ERROR: 8,
  RESTORE_ERROR: 9,
  NETWORK_ERROR: 10,
} as const;

export type ExitCode = typeof ExitCodes[keyof typeof ExitCodes];

export class AITimeMachineError extends Error {
    public exitCode: ExitCode;
    public userMessage: string;
    
    constructor(message: string, exitCode: ExitCode = ExitCodes.GENERAL_ERROR, userMessage?: string) {
        super(message);
        this.name = 'AITimeMachineError';
        this.exitCode = exitCode;
        this.userMessage = userMessage || message;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            exitCode: this.exitCode,
        };
    }
}

export class SnapshotError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.GENERAL_ERROR, userMessage);
        this.name = 'SnapshotError';
    }
}

export class GitError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.GENERAL_ERROR, userMessage);
        this.name = 'GitError';
    }
}

export class FileSystemError extends AITimeMachineError {
    constructor(message: string, exitCode: ExitCode = ExitCodes.PERMISSION_DENIED, userMessage?: string) {
        super(message, exitCode, userMessage);
        this.name = 'FileSystemError';
    }
}

export class ConfigError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.CONFIG_ERROR, userMessage);
        this.name = 'ConfigError';
    }
}

export class ConversationError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.GENERAL_ERROR, userMessage);
        this.name = 'ConversationError';
    }
}

export class ProjectNotFoundError extends AITimeMachineError {
    constructor(projectPath?: string) {
        const msg = projectPath 
            ? `Project not found at ${projectPath}` 
            : "Project not initialized";
        super(msg, ExitCodes.PROJECT_NOT_FOUND, `${msg}. Run 'aitm init' first.`);
        this.name = 'ProjectNotFoundError';
    }
}

export class CheckpointNotFoundError extends AITimeMachineError {
    constructor(checkpointId: string) {
        super(
            `Checkpoint not found: ${checkpointId}`,
            ExitCodes.CHECKPOINT_NOT_FOUND,
            `Checkpoint '${checkpointId}' was not found. Use 'aitm list' to see available checkpoints.`
        );
        this.name = 'CheckpointNotFoundError';
    }
}

export class DaemonError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.DAEMON_ERROR, userMessage);
        this.name = 'DaemonError';
    }
}

export class RestoreError extends AITimeMachineError {
    constructor(message: string, userMessage?: string) {
        super(message, ExitCodes.RESTORE_ERROR, userMessage);
        this.name = 'RestoreError';
    }
}

export class DiskFullError extends AITimeMachineError {
    constructor(message?: string) {
        super(
            message || "Insufficient disk space",
            ExitCodes.DISK_FULL,
            "Insufficient disk space. Free up space and try again."
        );
        this.name = 'DiskFullError';
    }
}

/**
 * Format error for CLI output
 */
export function formatErrorForCLI(error: unknown): { message: string; exitCode: number } {
    if (error instanceof AITimeMachineError) {
        return {
            message: error.userMessage,
            exitCode: error.exitCode,
        };
    }
    
    if (error instanceof Error) {
        return {
            message: error.message,
            exitCode: ExitCodes.GENERAL_ERROR,
        };
    }
    
    return {
        message: String(error),
        exitCode: ExitCodes.GENERAL_ERROR,
    };
}

/**
 * Wrap async CLI command with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<void>>(
    fn: T
): T {
    return (async (...args: Parameters<T>) => {
        try {
            await fn(...args);
        } catch (error) {
            const { message, exitCode } = formatErrorForCLI(error);
            console.error(`❌ ${message}`);
            process.exit(exitCode);
        }
    }) as T;
}
