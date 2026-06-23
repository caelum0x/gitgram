import type { Repo, CheckpointRow } from "../store/repo.js";

/**
 * Find the last checkpoint that matches a "green" pattern
 * (tests passed, build succeeded, etc.)
 */
export function findLastGreenCheckpoint(
  repo: Repo,
  projectId: string,
  patterns: string[] = ["Tests green", "Build green", "Tests passed", "All tests pass"]
): CheckpointRow | null {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 100);

  for (const checkpoint of checkpoints) {
    const nameLower = checkpoint.name.toLowerCase();
    const matchesPattern = patterns.some(pattern =>
      nameLower.includes(pattern.toLowerCase())
    );

    if (matchesPattern) {
      return checkpoint;
    }
  }

  return null;
}

/**
 * Generate context text for AI to understand what was restored
 */
export function generateRestoreContext(checkpoint: CheckpointRow): string {
  return `# Restored Context

You have been restored to a previous checkpoint:

**Checkpoint**: ${checkpoint.checkpointId}
**Name**: ${checkpoint.name}
**Created**: ${checkpoint.createdAt}
**Scope**: ${checkpoint.scope}

## What This Means

The project files have been restored to their exact state at the time this checkpoint was created.

${checkpoint.scope.includes('chat')
  ? '- Conversation history has been restored to that moment\n'
  : ''}
${checkpoint.scope.includes('terminal')
  ? '- Terminal command history is available from that point\n'
  : ''}
${checkpoint.capsuleImageDigest
  ? `- Deterministic environment available: ${checkpoint.capsuleImageRef} (${checkpoint.capsuleImageDigest?.slice(0, 12)}...)\n`
  : ''}

## What to Do Next

1. Review the current state of files
2. Understand what changed between then and now
3. Continue development from this point

You can create a new checkpoint at any time to save your progress.
`;
}

/**
 * Generate context with conversation history
 */
export function generateRestoreContextWithConversation(
  checkpoint: any,
  conversation: {
    messages: Array<{ role: string; content: string; timestamp: Date }>;
    toolCalls: Array<{ tool: string; args: any; timestamp: Date }>;
    checkpoints: string[];
  }
): string {
  const recentMessages = conversation.messages.slice(-5);
  const goal = extractGoal(recentMessages);
  const toolsUsed = [...new Set(conversation.toolCalls.map(tc => tc.tool))];

  let output = `✅ RESTORED TO CHECKPOINT\n\n`;
  output += `📍 ${checkpoint.description || checkpoint.name}\n`;
  output += `🕐 ${checkpoint.timestamp?.toISOString() || checkpoint.createdAt}\n\n`;

  output += `📝 CONVERSATION CONTEXT:\n\n`;
  
  if (goal) {
    output += `Goal: ${goal}\n\n`;
  }

  if (recentMessages.length > 0) {
    output += `Recent conversation:\n`;
    recentMessages.forEach(msg => {
      const icon = msg.role === 'user' ? '👤' : '🤖';
      const preview = msg.content.slice(0, 100);
      output += `${icon} ${preview}${msg.content.length > 100 ? '...' : ''}\n`;
    });
    output += '\n';
  }

  if (toolsUsed.length > 0) {
    output += `Tools used: ${toolsUsed.join(', ')}\n\n`;
  }

  output += `💡 NEXT STEPS:\n`;
  output += `You can now:\n`;
  output += `- Continue working from this point\n`;
  output += `- Try a different approach\n`;
  output += `- Review what was done\n`;

  return output;
}

function extractGoal(messages: Array<{ role: string; content: string }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.content.length > 10) {
      return msg.content;
    }
  }
  return null;
}

/**
 * Binary search through checkpoints to find when a test started failing
 */
export async function bisectCheckpoints(
  repo: Repo,
  projectId: string,
  testCommand: string,
  execCommand: (checkpointId: string, command: string) => Promise<{ exitCode: number }>
): Promise<{ brokenCheckpoint: CheckpointRow | null; lastGoodCheckpoint: CheckpointRow | null }> {
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 1000).reverse(); // oldest first

  if (checkpoints.length === 0) {
    return { brokenCheckpoint: null, lastGoodCheckpoint: null };
  }

  let left = 0;
  let right = checkpoints.length - 1;
  let lastGoodIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const checkpoint = checkpoints[mid];

    // Test this checkpoint
    const result = await execCommand(checkpoint.checkpointId, testCommand);

    if (result.exitCode === 0) {
      // Test passed, search in newer checkpoints
      lastGoodIndex = mid;
      left = mid + 1;
    } else {
      // Test failed, search in older checkpoints
      right = mid - 1;
    }
  }

  const lastGoodCheckpoint = lastGoodIndex >= 0 ? checkpoints[lastGoodIndex] : null;
  const brokenCheckpoint = lastGoodIndex >= 0 && lastGoodIndex + 1 < checkpoints.length
    ? checkpoints[lastGoodIndex + 1]
    : null;

  return { brokenCheckpoint, lastGoodCheckpoint };
}
