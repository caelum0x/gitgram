import type { Repo } from "../store/repo.js";

export interface ActionChainIssue {
  code:
    | "MISSING_LINKED_CHECKPOINT"
    | "SELF_LINK"
    | "PREFIX_MISMATCH"
    | "TEMPORAL_ORDER_INVALID"
    | "EVENT_LINK_MISMATCH"
    | "CYCLE_DETECTED";
  checkpointId: string;
  linkedCheckpointId?: string;
  message: string;
}

export interface ActionChainVerification {
  projectId: string;
  totalCheckpoints: number;
  linkedCheckpoints: number;
  validLinkedCheckpoints: number;
  issues: ActionChainIssue[];
  valid: boolean;
}

type CheckpointLike = {
  checkpointId: string;
  name: string;
  createdAt: string;
  linkedCheckpointId?: string | null;
};

export function verifyActionChains(
  repo: Repo,
  projectId: string,
  options: { limit?: number } = {}
): ActionChainVerification {
  const limit = options.limit ?? 2000;
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, limit);
  const cpById = new Map(checkpoints.map((cp) => [cp.checkpointId, cp]));
  const issues: ActionChainIssue[] = [];

  const checkpointCreatedEvents = repo.listEvents(projectId, "checkpoint.created", limit * 3);
  const afterEventsByCheckpointId = new Map<string, any>();
  for (const evt of checkpointCreatedEvents) {
    const payload = evt.payload || {};
    if (payload?.trigger !== "after_action") continue;
    if (typeof payload?.checkpointId === "string" && !afterEventsByCheckpointId.has(payload.checkpointId)) {
      afterEventsByCheckpointId.set(payload.checkpointId, payload);
    }
  }

  let linked = 0;
  let validLinks = 0;

  for (const cp of checkpoints) {
    const linkedId = cp.linkedCheckpointId || null;
    if (!linkedId) continue;
    linked++;

    let linkValid = true;

    if (linkedId === cp.checkpointId) {
      linkValid = false;
      issues.push({
        code: "SELF_LINK",
        checkpointId: cp.checkpointId,
        linkedCheckpointId: linkedId,
        message: "Checkpoint links to itself.",
      });
    }

    const linkedCp = cpById.get(linkedId) || repo.getCheckpoint(projectId, linkedId);
    if (!linkedCp) {
      linkValid = false;
      issues.push({
        code: "MISSING_LINKED_CHECKPOINT",
        checkpointId: cp.checkpointId,
        linkedCheckpointId: linkedId,
        message: "Linked checkpoint does not exist.",
      });
    } else {
      if (isAfterCheckpoint(cp) && !isBeforeCheckpoint(linkedCp)) {
        linkValid = false;
        issues.push({
          code: "PREFIX_MISMATCH",
          checkpointId: cp.checkpointId,
          linkedCheckpointId: linkedId,
          message: "After-checkpoint is not linked to a before-checkpoint.",
        });
      }

      if (new Date(cp.createdAt).getTime() < new Date(linkedCp.createdAt).getTime()) {
        linkValid = false;
        issues.push({
          code: "TEMPORAL_ORDER_INVALID",
          checkpointId: cp.checkpointId,
          linkedCheckpointId: linkedId,
          message: "After-checkpoint timestamp is earlier than linked checkpoint.",
        });
      }
    }

    const afterEvent = afterEventsByCheckpointId.get(cp.checkpointId);
    if (afterEvent && afterEvent.linkedCheckpointId !== linkedId) {
      linkValid = false;
      issues.push({
        code: "EVENT_LINK_MISMATCH",
        checkpointId: cp.checkpointId,
        linkedCheckpointId: linkedId,
        message: "Event payload linkedCheckpointId does not match checkpoint row.",
      });
    }

    if (linkValid) validLinks++;
  }

  for (const cycleIssue of detectCycles(cpById)) {
    issues.push(cycleIssue);
  }

  dedupeIssuesInPlace(issues);

  return {
    projectId,
    totalCheckpoints: checkpoints.length,
    linkedCheckpoints: linked,
    validLinkedCheckpoints: validLinks,
    issues,
    valid: issues.length === 0,
  };
}

function isBeforeCheckpoint(cp: CheckpointLike): boolean {
  return cp.name.trim().toLowerCase().startsWith("[before]");
}

function isAfterCheckpoint(cp: CheckpointLike): boolean {
  return cp.name.trim().toLowerCase().startsWith("[after]");
}

function detectCycles(cpById: Map<string, CheckpointLike>): ActionChainIssue[] {
  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited,1=visiting,2=done
  const issues: ActionChainIssue[] = [];

  function dfs(id: string): void {
    const curState = state.get(id) || 0;
    if (curState === 1) {
      issues.push({
        code: "CYCLE_DETECTED",
        checkpointId: id,
        message: "Cycle detected in linked checkpoint chain.",
      });
      return;
    }
    if (curState === 2) return;

    state.set(id, 1);
    const cp = cpById.get(id);
    const next = cp?.linkedCheckpointId || null;
    if (next && cpById.has(next)) {
      dfs(next);
    }
    state.set(id, 2);
  }

  for (const id of cpById.keys()) {
    if ((state.get(id) || 0) === 0) dfs(id);
  }

  return issues;
}

function dedupeIssuesInPlace(issues: ActionChainIssue[]): void {
  const seen = new Set<string>();
  let write = 0;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const key = `${issue.code}:${issue.checkpointId}:${issue.linkedCheckpointId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues[write++] = issue;
  }
  issues.length = write;
}
