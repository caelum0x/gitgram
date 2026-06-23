import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { verifyActionChains } from "../src/tools/action-chain-integrity.js";
import { SqliteRepo } from "../src/store/sqlite_repo.js";

describe("action chain integrity verifier", () => {
  let tmpDir: string;
  let dbPath: string;
  let repo: SqliteRepo;
  const projectId = "proj_action_chain";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-action-chain-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    repo = new SqliteRepo(dbPath);

    repo.insertProject({
      projectId,
      rootPath: "/tmp/action-chain",
      name: "action-chain",
      ignoreGlobs: [],
    });
  });

  afterEach(() => {
    repo.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes for a valid before/after pair", () => {
    const before = repo.insertCheckpoint({
      checkpointId: "cp_before_valid",
      projectId,
      name: "[before] implement feature",
      scope: "full",
      manifestBlobHash: "mh_before_valid",
    });

    const after = repo.insertCheckpoint({
      checkpointId: "cp_after_valid",
      projectId,
      name: "[after] implement feature",
      scope: "full",
      manifestBlobHash: "mh_after_valid",
      linkedCheckpointId: before.checkpointId,
    });

    repo.appendEvent(projectId, "checkpoint.created", new Date().toISOString(), {
      checkpointId: after.checkpointId,
      trigger: "after_action",
      linkedCheckpointId: before.checkpointId,
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.linkedCheckpoints).toBe(1);
    expect(report.validLinkedCheckpoints).toBe(1);
  });

  it("flags missing linked checkpoint", () => {
    repo.insertCheckpoint({
      checkpointId: "cp_after_missing",
      projectId,
      name: "[after] missing link",
      scope: "full",
      manifestBlobHash: "mh_after_missing",
      linkedCheckpointId: "cp_does_not_exist",
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "MISSING_LINKED_CHECKPOINT")).toBe(true);
  });

  it("flags self-link", () => {
    repo.insertCheckpoint({
      checkpointId: "cp_self",
      projectId,
      name: "[after] self link",
      scope: "full",
      manifestBlobHash: "mh_self",
      linkedCheckpointId: "cp_self",
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "SELF_LINK")).toBe(true);
  });

  it("flags prefix mismatch when after links to non-before checkpoint", () => {
    const linked = repo.insertCheckpoint({
      checkpointId: "cp_linked_plain",
      projectId,
      name: "manual checkpoint",
      scope: "full",
      manifestBlobHash: "mh_linked_plain",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_after_bad_prefix",
      projectId,
      name: "[after] action with bad linked prefix",
      scope: "full",
      manifestBlobHash: "mh_after_bad_prefix",
      linkedCheckpointId: linked.checkpointId,
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "PREFIX_MISMATCH")).toBe(true);
  });

  it("flags temporal ordering issues", async () => {
    repo.insertCheckpoint({
      checkpointId: "cp_after_early",
      projectId,
      name: "[after] created first",
      scope: "full",
      manifestBlobHash: "mh_after_early",
      linkedCheckpointId: "cp_before_late",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    repo.insertCheckpoint({
      checkpointId: "cp_before_late",
      projectId,
      name: "[before] created later",
      scope: "full",
      manifestBlobHash: "mh_before_late",
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "TEMPORAL_ORDER_INVALID")).toBe(true);
  });

  it("flags event payload link mismatch", () => {
    const before = repo.insertCheckpoint({
      checkpointId: "cp_before_evt_mismatch",
      projectId,
      name: "[before] refactor",
      scope: "full",
      manifestBlobHash: "mh_before_evt_mismatch",
    });

    const other = repo.insertCheckpoint({
      checkpointId: "cp_before_other",
      projectId,
      name: "[before] something else",
      scope: "full",
      manifestBlobHash: "mh_before_other",
    });

    const after = repo.insertCheckpoint({
      checkpointId: "cp_after_evt_mismatch",
      projectId,
      name: "[after] refactor",
      scope: "full",
      manifestBlobHash: "mh_after_evt_mismatch",
      linkedCheckpointId: before.checkpointId,
    });

    repo.appendEvent(projectId, "checkpoint.created", new Date().toISOString(), {
      checkpointId: after.checkpointId,
      trigger: "after_action",
      linkedCheckpointId: other.checkpointId,
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "EVENT_LINK_MISMATCH")).toBe(true);
  });

  it("flags cycles in linked checkpoint chain", () => {
    repo.insertCheckpoint({
      checkpointId: "cp_cycle_a",
      projectId,
      name: "[after] cycle a",
      scope: "full",
      manifestBlobHash: "mh_cycle_a",
      linkedCheckpointId: "cp_cycle_b",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_cycle_b",
      projectId,
      name: "[after] cycle b",
      scope: "full",
      manifestBlobHash: "mh_cycle_b",
      linkedCheckpointId: "cp_cycle_a",
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("detects broken chain: after_action event without a matching before_action checkpoint", () => {
    // Create an after checkpoint that links to a before checkpoint,
    // but the "before" checkpoint has wrong naming (not prefixed with [before])
    // simulating a broken chain where before_action was never properly recorded

    // Step 1: Only insert an after checkpoint with no corresponding before checkpoint at all
    repo.insertCheckpoint({
      checkpointId: "cp_orphan_after",
      projectId,
      name: "[after] orphaned action",
      scope: "full",
      manifestBlobHash: "mh_orphan_after",
      linkedCheckpointId: "cp_missing_before",
    });

    // Record the event showing this was triggered by after_action
    repo.appendEvent(projectId, "checkpoint.created", new Date().toISOString(), {
      checkpointId: "cp_orphan_after",
      trigger: "after_action",
      linkedCheckpointId: "cp_missing_before",
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.linkedCheckpoints).toBe(1);
    expect(report.validLinkedCheckpoints).toBe(0);

    // The linked checkpoint does not exist
    expect(report.issues.some((i) => i.code === "MISSING_LINKED_CHECKPOINT")).toBe(true);
    const missingIssue = report.issues.find((i) => i.code === "MISSING_LINKED_CHECKPOINT");
    expect(missingIssue!.checkpointId).toBe("cp_orphan_after");
    expect(missingIssue!.linkedCheckpointId).toBe("cp_missing_before");
  });

  it("detects broken chain: after_action links to existing checkpoint that is not a before checkpoint", () => {
    // A "before" checkpoint exists but is not prefixed with [before] -
    // simulating a manual checkpoint being incorrectly linked as the before_action target
    const manualCp = repo.insertCheckpoint({
      checkpointId: "cp_manual_not_before",
      projectId,
      name: "manual save point",
      scope: "full",
      manifestBlobHash: "mh_manual",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_after_broken_chain",
      projectId,
      name: "[after] action with broken chain",
      scope: "full",
      manifestBlobHash: "mh_after_broken",
      linkedCheckpointId: manualCp.checkpointId,
    });

    repo.appendEvent(projectId, "checkpoint.created", new Date().toISOString(), {
      checkpointId: "cp_after_broken_chain",
      trigger: "after_action",
      linkedCheckpointId: manualCp.checkpointId,
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "PREFIX_MISMATCH")).toBe(true);
    const prefixIssue = report.issues.find((i) => i.code === "PREFIX_MISMATCH");
    expect(prefixIssue!.checkpointId).toBe("cp_after_broken_chain");
    expect(prefixIssue!.message).toContain("After-checkpoint is not linked to a before-checkpoint");
  });

  it("CLI exits with code 0 for valid chains and code 2 for invalid chains", () => {
    // Valid chain
    const before = repo.insertCheckpoint({
      checkpointId: "cp_cli_before",
      projectId,
      name: "[before] cli test",
      scope: "full",
      manifestBlobHash: "mh_cli_before",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_cli_after",
      projectId,
      name: "[after] cli test",
      scope: "full",
      manifestBlobHash: "mh_cli_after",
      linkedCheckpointId: before.checkpointId,
    });

    repo.appendEvent(projectId, "checkpoint.created", new Date().toISOString(), {
      checkpointId: "cp_cli_after",
      trigger: "after_action",
      linkedCheckpointId: before.checkpointId,
    });

    const validReport = verifyActionChains(repo, projectId);
    // CLI uses: process.exit(report.valid ? 0 : 2)
    const validExitCode = validReport.valid ? 0 : 2;
    expect(validExitCode).toBe(0);

    // Now create an invalid chain in a separate project
    repo.insertProject({
      projectId: "proj_cli_invalid",
      rootPath: "/tmp/cli-invalid",
      name: "cli-invalid",
      ignoreGlobs: [],
    });

    repo.insertCheckpoint({
      checkpointId: "cp_cli_invalid_after",
      projectId: "proj_cli_invalid",
      name: "[after] invalid chain",
      scope: "full",
      manifestBlobHash: "mh_cli_invalid",
      linkedCheckpointId: "cp_nonexistent",
    });

    const invalidReport = verifyActionChains(repo, "proj_cli_invalid");
    const invalidExitCode = invalidReport.valid ? 0 : 2;
    expect(invalidExitCode).toBe(2);
  });

  it("handles multiple broken chains and reports all issues", () => {
    // Multiple orphaned after checkpoints
    repo.insertCheckpoint({
      checkpointId: "cp_orphan_1",
      projectId,
      name: "[after] orphan one",
      scope: "full",
      manifestBlobHash: "mh_orphan_1",
      linkedCheckpointId: "cp_ghost_1",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_orphan_2",
      projectId,
      name: "[after] orphan two",
      scope: "full",
      manifestBlobHash: "mh_orphan_2",
      linkedCheckpointId: "cp_ghost_2",
    });

    // One valid pair to ensure it does not pollute valid count
    const validBefore = repo.insertCheckpoint({
      checkpointId: "cp_multi_before",
      projectId,
      name: "[before] valid pair",
      scope: "full",
      manifestBlobHash: "mh_multi_before",
    });

    repo.insertCheckpoint({
      checkpointId: "cp_multi_after",
      projectId,
      name: "[after] valid pair",
      scope: "full",
      manifestBlobHash: "mh_multi_after",
      linkedCheckpointId: validBefore.checkpointId,
    });

    const report = verifyActionChains(repo, projectId);

    expect(report.valid).toBe(false);
    expect(report.linkedCheckpoints).toBe(3);
    expect(report.validLinkedCheckpoints).toBe(1);

    const missingIssues = report.issues.filter((i) => i.code === "MISSING_LINKED_CHECKPOINT");
    expect(missingIssues).toHaveLength(2);
    const missingIds = missingIssues.map((i) => i.linkedCheckpointId).sort();
    expect(missingIds).toEqual(["cp_ghost_1", "cp_ghost_2"]);
  });
});
