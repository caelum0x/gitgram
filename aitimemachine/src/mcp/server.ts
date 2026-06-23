import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

import { CasStore } from "../core/cas.js";
import { buildManifest, parseManifestJson } from "../core/manifest.js";
import { persistCheckpointTrees } from "../core/checkpoint-tree-storage.js";
import { restoreWorkspaceAtomic, restoreToDirectory, generateMaterializedFolderName } from "../core/restore.js";
import { ProjectLock } from "../core/lock.js";
import { DockerCapsuleManager } from "../core/capsule_docker.js";
import { TmError } from "../core/errors.js";
import { TimeMachineEngine } from "../core/engine.js";
import { makeIgnoreMatcher, DEFAULT_IGNORES } from "../core/ignore.js";
import { AITimeConceptTools } from "./ai-time-concept-tools.js";
import { cloudTools, handleCloudTool, isCloudTool } from "./cloud-mcp-handler.js";
import { AugmentedTools, createAugmentedTools } from "./augmented-tools.js";
import { getStoredAuth, isAuthenticated } from "../auth/cli-auth.js";

import {
  zCheckpointCreateInput,
  zCheckpointRestoreInput,
  zCapsuleExecInput,
  zCapsuleUpsertInput,
} from "./schemas.js";

import type { Repo } from "../store/repo.js";
import { findLastGreenCheckpoint, generateRestoreContext } from "../tools/rewind.js";
import { buildContextPacket } from "../context/context-packet.js";
import { generateDebugRegressionPrompt, generatePostmortem, generateReproSteps } from "../tools/prompts.js";
import { runGarbageCollection } from "../core/gc.js";
import { verifyIntegrity } from "../core/integrity.js";

// Get current auth context for MCP operations
function getAuthContext(): { userId?: string; email?: string; authenticated: boolean } {
  const auth = getStoredAuth();
  if (auth) {
    return { userId: auth.userId, email: auth.email, authenticated: true };
  }
  return { authenticated: false };
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readPayloadString(payload: unknown, key: string): string {
  const record = asRecord(payload);
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

export function createTmMcpServer(opts: {
  repo: Repo;
  dataDir: string;
}) {
  const server = new Server(
    { name: "ai-time-machine-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  const blobsDir = path.join(opts.dataDir, "blobs");
  const cas = new CasStore(blobsDir);
  const capsuleMgr = new DockerCapsuleManager();
  
  // Create engine for new GC
  const engine = new TimeMachineEngine(process.cwd());
  
  // Initialize AI Time & Concept Tools
  const aiTimeTools = new AITimeConceptTools(engine, opts.repo);

  // Initialize Augmented Tools (semantic search, research, etc.)
  const augmentedTools = createAugmentedTools(engine, opts.repo);

  const stableTools = new Set<string>([
    // Auth + cloud basics
    "tm_auth_login",
    "tm_auth_status",
    "tm_cloud_list_projects",
    "tm_cloud_get_conversation",
    "tm_cloud_get_checkpoints",
    "tm_cloud_restore_checkpoint",
    // Core time travel + stats
    "tm_checkpoint_create",
    "tm_checkpoint_list",
    "tm_checkpoint_restore",
    "tm_diff_checkpoints",
    "tm_search",
    "tm_stats",
    "tm_get_file_at",
    "tm_file_history",
    "tm_timeline",
    "tm_go_back",
    "tm_show_timeline",
    "tm_what_changed",
    "tm_restore_file",
    "tm_conversation_context",
    "tm_conversation_history",
    "tm_search_history",
    "tm_search_conversations",
    "tm_universal_search",
    // KB tools
    "tm_kb_list_repositories",
    "tm_kb_search",
    "tm_kb_get_file",
    "tm_kb_unified_search",
    // Capabilities
    "tm_capabilities",
  ]);

  const experimentalEnabled = process.env.AITM_MCP_EXPERIMENTAL === "1";

  function isToolStable(name: string): boolean {
    return stableTools.has(name);
  }

  function annotateTool(tool: any): any {
    return {
      ...tool,
      "x-aitm-stability": isToolStable(tool.name) ? "stable" : "experimental",
    };
  }

  function toToolError(e: unknown) {
    if (e instanceof TmError) {
      return { code: e.code, message: e.message, details: e.details ?? {} };
    }
    if (e instanceof Error) {
      return { code: "TM_IO_ERROR", message: e.message, details: {} };
    }
    return { code: "TM_IO_ERROR", message: "Unknown error", details: {} };
  }

  function cryptoRandomId() {
    return crypto.randomBytes(8).toString("hex");
  }

  // Setup tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: "tm_auth_login",
        description: "Login with API key to enable cloud sync. Get your key from timemachine.gitgram.app/dashboard",
        inputSchema: {
          type: "object",
          required: ["api_key"],
          properties: {
            api_key: { type: "string", description: "Your API key (starts with aitm_)" }
          }
        }
      },
      {
        name: "tm_auth_status",
        description: "Check authentication status. Returns current user info if logged in.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "tm_capabilities",
        description: "Return MCP server capabilities and enabled feature flags.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "tm_cloud_list_projects",
        description: "List all projects from cloud storage. Requires authentication.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "tm_cloud_get_conversation",
        description: "Get conversation history from cloud for a project. Great for resuming where you left off.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", description: "Project ID" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }
          }
        }
      },
      {
        name: "tm_cloud_get_checkpoints",
        description: "List checkpoints from cloud storage for a project.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", description: "Project ID" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }
          }
        }
      },
      {
        name: "tm_cloud_restore_checkpoint",
        description: "Restore a checkpoint from cloud storage. Downloads and applies the checkpoint to your local workspace.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", description: "Project ID" },
            checkpointId: { type: "string", description: "Checkpoint ID to restore" },
            includeConversation: { type: "boolean", default: true, description: "Include conversation context" },
            messageLimit: { type: "integer", default: 20, description: "Number of recent messages to include" }
          }
        }
      },
      {
        name: "tm_checkpoint_create",
        description: "Create a checkpoint (manifest + blob store) and store pointers to chat/terminal heads",
        inputSchema: {
          type: "object",
          required: ["projectId","name","scope"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            scope: {
              type: "string",
              enum: ["files","files+chat","files+chat+terminal","full"]
            },
            mode: { type: "string", enum: ["shallow","full"], default: "shallow" },
            capsule: {
              type: "object",
              properties: {
                imageRef: { type: "string" },
                imageDigest: { type: "string" },
                workdir: { type: "string" },
                env: { type: "object", additionalProperties: { type: "string" } }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      {
        name: "tm_checkpoint_list",
        description: "List checkpoints for a project",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
          }
        }
      },
      {
        name: "tm_checkpoint_restore",
        description: "Restore workspace (atomic) to checkpoint; optionally return chat head pointer for context rehydrate",
        inputSchema: {
          type: "object",
          required: ["projectId","checkpointId","mode","restoreScope"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            mode: { type: "string", enum: ["safe","hard"] },
            restoreScope: { type: "string", enum: ["files","files+chat"] },
            backupCurrent: { type: "boolean", default: true },
            dryRun: { type: "boolean", default: false }
          },
          additionalProperties: false
        }
      },
      {
        name: "tm_checkpoint_materialize",
        description: "Materialize a checkpoint to a separate folder (non-destructive). Perfect for browsing past states, diffing, or opening in a new IDE window.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            targetParentDir: { type: "string", description: "Parent directory for materialized folder (default: <projectRoot>/.aitm/restored/)" },
            folderName: { type: "string", description: "Custom folder name (default: auto-generated from project+date+checkpoint)" },
            includeContext: { type: "boolean", default: true, description: "Include .aitm/context.md with checkpoint info" }
          }
        }
      },
      {
        name: "tm_diff_checkpoints",
        description: "Compare file/chat/terminal differences between two checkpoints",
        inputSchema: {
          type: "object",
          required: ["projectId","aCheckpointId","bCheckpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            aCheckpointId: { type: "string", minLength: 1 },
            bCheckpointId: { type: "string", minLength: 1 },
            includePatches: { type: "boolean", default: false }
          }
        }
      },
      {
        name: "tm_search",
        description: "Search across conversations and checkpoints",
        inputSchema: {
          type: "object",
          required: ["projectId","query"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            query: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_stats",
        description: "Get storage and session statistics",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" }
          }
        }
      },
      {
        name: "tm_capsule_upsert",
        description: "Create or reuse a project capsule container (pinned image digest) and mount workspace",
        inputSchema: {
          type: "object",
          required: ["projectId","imageRef","workdir"],
          properties: {
            projectId: { type: "string" },
            imageRef: { type: "string" },
            workdir: { type: "string" },
            env: { type: "object", additionalProperties: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        name: "tm_capsule_exec",
        description: "Execute a command in a capsule and store stdout/stderr as blobs; also emit terminal events for replay",
        inputSchema: {
          type: "object",
          required: ["projectId","capsuleId","command"],
          properties: {
            projectId: { type: "string" },
            capsuleId: { type: "string" },
            command: { type: "string" },
            cwd: { type: "string" },
            timeoutMs: { type: "integer", default: 60000 }
          },
          additionalProperties: false
        }
      },
      {
        name: "tm_get_file_at",
        description: "Get file content at a specific checkpoint",
        inputSchema: {
          type: "object",
          required: ["projectId","checkpointId","filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_file_history",
        description: "Get history of a file across checkpoints",
        inputSchema: {
          type: "object",
          required: ["projectId","filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      },
      {
        name: "tm_timeline",
        description: "Get timeline of events for a project",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            type: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
          }
        }
      },
      {
        name: "tm_project_init",
        description: "Initialize or register a project for time tracking",
        inputSchema: {
          type: "object",
          required: ["projectPath"],
          properties: {
            projectPath: { type: "string", minLength: 1 },
            name: { type: "string" }
          }
        }
      },
      {
        name: "tm_set_project",
        description: "Set the current working project",
        inputSchema: {
          type: "object",
          required: ["projectPath"],
          properties: {
            projectPath: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_rewind_to_last_green",
        description: "Find and restore to the last checkpoint with tests/build passing",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            mode: { type: "string", enum: ["safe", "hard"], default: "hard" },
            includeContext: { type: "boolean", default: true },
            patterns: {
              type: "array",
              items: { type: "string" },
              default: ["Tests green", "Build green", "Tests passed"]
            }
          }
        }
      },
      {
        name: "tm_rewind_to_checkpoint",
        description: "Restore workspace to a specific checkpoint and return context packet for AI continuation",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            mode: { type: "string", enum: ["safe", "hard"], default: "hard" },
            includeContextText: { type: "boolean", default: true }
          }
        }
      },
      {
        name: "tm_get_context_packet",
        description: "Get the context packet for a checkpoint (conversation history, terminal commands) without restoring",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            maxMessages: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      },
      {
        name: "tm_prompt_debug_regression",
        description: "Generate a debugging prompt for a regression between two checkpoints",
        inputSchema: {
          type: "object",
          required: ["projectId", "fromCheckpointId", "toCheckpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", minLength: 1 },
            toCheckpointId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_prompt_postmortem",
        description: "Generate an incident postmortem report",
        inputSchema: {
          type: "object",
          required: ["projectId", "fromCheckpointId", "toCheckpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", minLength: 1 },
            toCheckpointId: { type: "string", minLength: 1 },
            incidentDescription: { type: "string" }
          }
        }
      },
      {
        name: "tm_prompt_repro_steps",
        description: "Generate reproduction steps from a checkpoint",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_gc_run",
        description: "Run garbage collection to remove unreferenced blobs (mark & sweep)",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            dryRun: { type: "boolean", default: false },
            safetyWindowDays: { type: "integer", minimum: 1, maximum: 90, default: 7 }
          }
        }
      },
      {
        name: "tm_integrity_check",
        description: "Verify integrity of checkpoints and blobs",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            level: { type: "string", enum: ["light", "deep"], default: "light" }
          }
        }
      },
      // ============================================================================
      // AI TIME & CONCEPT REALIZATION TOOLS
      // ============================================================================
      {
        name: "ai_realize_concepts",
        description: "🧠 Help AI understand current conceptual context - what concepts are active, completed, or blocked. Essential for AI temporal awareness.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "ai_realize_time",
        description: "⏰ Help AI understand temporal context - time elapsed, patterns, and development velocity. Reduces AI confusion about 'when' things happened.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "ai_suggest_focus",
        description: "🎯 Help AI determine what to focus on next based on current conceptual and temporal context. Provides reasoning and time allocation.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "ai_analyze_transitions",
        description: "🔄 Help AI understand how development state changes over time - patterns, transitions, and recommendations for better workflow.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", minLength: 1 }
          }
        }
      },
      // ============================================================================
      // GIT-INSPIRED TOOLS
      // ============================================================================
      {
        name: "tm_stash",
        description: "📦 Stash current changes temporarily (like git stash). Save work-in-progress without committing.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            action: { type: "string", enum: ["push", "pop", "list", "apply", "drop", "clear"], default: "push" },
            message: { type: "string", description: "Stash message (for push)" },
            index: { type: "integer", description: "Stash index (for apply/drop)", default: 0 }
          }
        }
      },
      {
        name: "tm_blame",
        description: "🔍 Show which checkpoint last modified each line of a file (like git blame)",
        inputSchema: {
          type: "object",
          required: ["projectId", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 },
            lineRange: { type: "string", description: "Line range e.g. '10,20'" }
          }
        }
      },
      {
        name: "tm_reflog",
        description: "📜 Show history of all operations (like git reflog). See every action taken.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      },
      {
        name: "tm_log",
        description: "📋 Show checkpoint log with various formats (like git log)",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            oneline: { type: "boolean", default: false },
            stat: { type: "boolean", default: false },
            since: { type: "string", description: "Show since date/time" },
            until: { type: "string", description: "Show until date/time" }
          }
        }
      },
      {
        name: "tm_tag",
        description: "🏷️ Create or list named tags for checkpoints (like git tag)",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            action: { type: "string", enum: ["create", "list", "delete"], default: "list" },
            name: { type: "string", description: "Tag name" },
            checkpointId: { type: "string", description: "Checkpoint to tag (defaults to latest)" },
            message: { type: "string", description: "Tag message" }
          }
        }
      },
      {
        name: "tm_cherry_pick",
        description: "🍒 Apply changes from a specific checkpoint to current state (like git cherry-pick)",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            dryRun: { type: "boolean", default: false, description: "Preview changes without applying" }
          }
        }
      },
      {
        name: "tm_reset",
        description: "🔄 Reset to a checkpoint (like git reset). Modes: soft (keep changes), hard (discard all)",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", description: "Checkpoint to reset to (defaults to previous)" },
            mode: { type: "string", enum: ["soft", "mixed", "hard"], default: "mixed" }
          }
        }
      },
      {
        name: "tm_clean",
        description: "🧹 Remove files not in latest checkpoint (like git clean)",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            dryRun: { type: "boolean", default: true, description: "Preview what would be removed" },
            force: { type: "boolean", default: false, description: "Actually remove files" }
          }
        }
      },
      {
        name: "tm_revert",
        description: "↩️ Create checkpoint that undoes a previous checkpoint's changes (like git revert)",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_shortlog",
        description: "📊 Summarize checkpoint history by type",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            numbered: { type: "boolean", default: false, description: "Sort by count" }
          }
        }
      },
      // ============================================================================
      // END GIT-INSPIRED TOOLS
      // ============================================================================
      {
        name: "tm_go_back",
        description: "🕐 TIME MACHINE: Go back to a previous checkpoint (like macOS Time Machine). Restores files + provides chat context. Use this when user says 'go back', 'undo', 'revert', 'restore'.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", description: "Specific checkpoint ID to restore" },
            searchQuery: { type: "string", description: "Search for checkpoint by name/description (e.g. 'before docker changes')" },
            minutesAgo: { type: "integer", description: "Go back N minutes (e.g. 30 for 30 minutes ago)" },
            hoursAgo: { type: "integer", description: "Go back N hours (e.g. 2 for 2 hours ago)" },
            safe: { type: "boolean", default: true, description: "Safe mode: creates backup before restore" }
          }
        }
      },
      {
        name: "tm_show_timeline",
        description: "📅 Show visual timeline of all checkpoints (like Time Machine browser). Returns formatted list with timestamps, descriptions, and file counts.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            format: { type: "string", enum: ["detailed", "compact"], default: "detailed" }
          }
        }
      },
      {
        name: "tm_what_changed",
        description: "🔍 Show what changed between two points in time (or checkpoint vs now). Returns file-level diff with added/modified/deleted files.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", description: "Starting checkpoint" },
            toCheckpointId: { type: "string", description: "Ending checkpoint (omit for 'vs now')" },
            showFileContent: { type: "boolean", default: false, description: "Include actual file content diffs" },
            filePattern: { type: "string", description: "Filter files (e.g. '*.ts', 'src/**')" }
          }
        }
      },
      {
        name: "tm_restore_file",
        description: "📄 Restore a single file from a checkpoint. Supports 3-way merge for conflicts.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 },
            preview: { type: "boolean", default: false, description: "Just show the file content, don't restore" },
            strategy: { type: "string", enum: ["ours", "theirs", "merge"], default: "theirs", description: "Conflict strategy: ours (keep current), theirs (overwrite), merge (3-way merge)" },
            baseCheckpointId: { type: "string", description: "Base checkpoint for 3-way merge (optional)" }
          }
        }
      },
      {
        name: "tm_browse_checkpoint",
        description: "👁️ Browse files at a specific checkpoint (like opening Time Machine and looking around). Returns file tree and can read specific files.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            path: { type: "string", description: "Specific path to browse (omit for root)" },
            showContent: { type: "boolean", default: false, description: "Show file contents" }
          }
        }
      },
      {
        name: "tm_conversation_context",
        description: "💬 Get conversation context for a checkpoint. Shows messages, tool calls, and timeline.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_conversation_history",
        description: "📜 Get recent conversation history (messages and tool calls)",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 20 }
          }
        }
      },
      // Git-enhanced tools
      {
        name: "tm_diff_advanced",
        description: "📊 Compare files using Git-quality diff algorithms (Myers, Patience, Histogram). Better for code diffs.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointA", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointA: { type: "string", minLength: 1, description: "First checkpoint ID" },
            checkpointB: { type: "string", description: "Second checkpoint ID (optional, defaults to current)" },
            filePath: { type: "string", minLength: 1, description: "File to diff" },
            algorithm: { type: "string", enum: ["myers", "patience", "histogram"], default: "histogram" }
          }
        }
      },
      {
        name: "tm_file_history",
        description: "📜 Find all checkpoints containing a specific file. Fast lookup using bloom filters.",
        inputSchema: {
          type: "object",
          required: ["projectId", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        }
      },
      {
        name: "tm_merge_file",
        description: "🔀 3-way merge a file from checkpoint with current version. Shows conflicts with Git-style markers.",
        inputSchema: {
          type: "object",
          required: ["projectId", "baseCheckpointId", "theirsCheckpointId", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            baseCheckpointId: { type: "string", description: "Common ancestor checkpoint" },
            theirsCheckpointId: { type: "string", description: "Incoming checkpoint" },
            filePath: { type: "string", minLength: 1 },
            apply: { type: "boolean", default: false, description: "Apply merge result to file" }
          }
        }
      },
      {
        name: "tm_repack",
        description: "📦 Optimize storage by repacking loose objects into compressed pack files.",
        inputSchema: {
          type: "object",
          properties: {
            aggressive: { type: "boolean", default: false, description: "Repack everything" }
          }
        }
      },
      {
        name: "tm_timeline_viz",
        description: "📊 Export timeline data for visualization (3D Time Machine UI).",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            limit: { type: "integer", default: 50 },
            format: { type: "string", enum: ["json", "threejs"], default: "json" }
          }
        }
      },
      // ============================================================================
      // TIME MACHINE EXPERIENCE TOOLS (macOS Time Machine-like)
      // ============================================================================
      {
        name: "tm_undo_last",
        description: "⏪ Quick undo the last AI action. Restores to the most recent checkpoint with full context about what was undone.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            steps: { type: "integer", minimum: 1, maximum: 10, default: 1, description: "Number of actions to undo (default 1)" },
            safe: { type: "boolean", default: true, description: "Create backup before undo" }
          }
        }
      },
      {
        name: "tm_diff_file",
        description: "📝 Show line-by-line diff for a single file between two checkpoints or checkpoint vs current.",
        inputSchema: {
          type: "object",
          required: ["projectId", "filePath"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            filePath: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", description: "Starting checkpoint (default: latest)" },
            toCheckpointId: { type: "string", description: "Ending checkpoint (omit for current state)" },
            context: { type: "integer", minimum: 0, maximum: 20, default: 3, description: "Context lines around changes" },
            algorithm: { type: "string", enum: ["myers", "patience", "histogram"], default: "histogram" }
          }
        }
      },
      {
        name: "tm_diff_summary",
        description: "📊 Quick summary of all changes between two points in time. Shows stats and most changed files.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", description: "Starting checkpoint (default: previous)" },
            toCheckpointId: { type: "string", description: "Ending checkpoint (default: current)" },
            showTopChanged: { type: "integer", minimum: 1, maximum: 20, default: 5, description: "Number of top changed files to show" }
          }
        }
      },
      {
        name: "tm_before_message",
        description: "💬 Find checkpoint before a specific AI message/conversation. Search by message content to go back to before that conversation.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            messageQuery: { type: "string", description: "Search text in messages (e.g., 'refactor', 'docker')" },
            role: { type: "string", enum: ["user", "assistant", "any"], default: "any" },
            restore: { type: "boolean", default: false, description: "If true, restore to checkpoint before that message" }
          }
        }
      },
      {
        name: "tm_restore_before",
        description: "⏪ Restore to the state right before a specific event. Combines search + restore in one step.",
        inputSchema: {
          type: "object",
          required: ["projectId", "query"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            query: { type: "string", description: "Natural language query (e.g., 'before docker changes', 'before the refactor')" },
            safe: { type: "boolean", default: true, description: "Create backup before restore" }
          }
        }
      },
      {
        name: "tm_before_action",
        description: "⏮️ Find the checkpoint right before a specific action type (create_file, edit_file, etc). Perfect for 'go back to before I created that file'.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            actionType: { type: "string", description: "Action type to find (e.g., 'create_file', 'edit_file', 'delete_file')" },
            actionQuery: { type: "string", description: "Search in action descriptions (e.g., 'docker', 'api endpoint')" },
            filePath: { type: "string", description: "Find action that modified this file" },
            restore: { type: "boolean", default: false, description: "If true, restore to that checkpoint" }
          }
        }
      },
      {
        name: "tm_restore_files",
        description: "📂 Restore multiple files by pattern from a checkpoint. Supports glob patterns like '*.ts' or 'src/**/*.js'.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId", "pattern"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            pattern: { type: "string", minLength: 1, description: "Glob pattern (e.g., '*.ts', 'src/**', 'src/api/*.ts')" },
            dryRun: { type: "boolean", default: false, description: "Preview files without restoring" },
            strategy: { type: "string", enum: ["overwrite", "skip_existing", "merge"], default: "overwrite", description: "How to handle existing files" }
          }
        }
      },
      {
        name: "tm_find_error_point",
        description: "🔍 Smart detection of when things went wrong. Analyzes events, error patterns, and test failures to find the best restore point.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            errorPattern: { type: "string", description: "Error message to search for" },
            lookbackMinutes: { type: "integer", minimum: 1, maximum: 1440, default: 60, description: "How far back to search (minutes)" },
            autoRestore: { type: "boolean", default: false, description: "Automatically restore to last good state" }
          }
        }
      },
      // ============================================================================
      // CONTEXT-AWARE RESTORATION TOOLS (Enhanced Time Machine)
      // ============================================================================
      {
        name: "tm_restore_with_context",
        description: "🧠 FULL CONTEXT RESTORE: Restore files AND inject complete conversation history. This is the ultimate 'go back in time' - restores everything including what AI was thinking/doing. Use when user wants to fully resume from a past state.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            maxMessages: { type: "integer", minimum: 1, maximum: 100, default: 30, description: "Number of conversation messages to include" },
            maxTerminalEvents: { type: "integer", minimum: 0, maximum: 50, default: 10, description: "Number of terminal commands to include" },
            includeToolCalls: { type: "boolean", default: true, description: "Include AI tool calls in context" },
            includeFileChanges: { type: "boolean", default: true, description: "Include summary of file changes leading to this point" },
            safe: { type: "boolean", default: true, description: "Create backup before restore" }
          }
        }
      },
      {
        name: "tm_find_when_broke",
        description: "🔍 SMART ERROR DETECTION: Analyzes your timeline to find exactly when things went wrong. Looks at error patterns, test failures, and file changes to pinpoint the breaking change. Returns the last known good checkpoint.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            errorMessage: { type: "string", description: "Specific error message to search for" },
            errorPatterns: {
              type: "array",
              items: { type: "string" },
              description: "Patterns to match (e.g., ['TypeError', 'Cannot find module', 'ENOENT'])"
            },
            lookbackMinutes: { type: "integer", minimum: 1, maximum: 2880, default: 120, description: "How far back to analyze (minutes)" },
            analyzeTestResults: { type: "boolean", default: true, description: "Look for test failures" },
            analyzeBuildErrors: { type: "boolean", default: true, description: "Look for build/compile errors" },
            autoRestore: { type: "boolean", default: false, description: "Automatically restore to last good state" }
          }
        }
      },
      {
        name: "tm_natural_query",
        description: "💬 NATURAL LANGUAGE TIME TRAVEL: Understand natural language requests like 'go back before the docker changes', 'show me what I had 2 hours ago', 'restore to when tests were passing'. Parses intent and executes the appropriate action.",
        inputSchema: {
          type: "object",
          required: ["projectId", "query"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            query: { type: "string", minLength: 1, description: "Natural language query (e.g., 'before docker', '30 minutes ago', 'when tests passed')" },
            execute: { type: "boolean", default: false, description: "Execute the action (restore) or just show what would happen" },
            safe: { type: "boolean", default: true, description: "Create backup before any restore" }
          }
        }
      },
      {
        name: "tm_get_full_context",
        description: "📋 GET FULL CONTEXT: Get complete context for a checkpoint without restoring. Shows conversation, tool calls, terminal commands, and file state. Perfect for understanding what was happening at a point in time.",
        inputSchema: {
          type: "object",
          required: ["projectId", "checkpointId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            checkpointId: { type: "string", minLength: 1 },
            maxMessages: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            includeFileList: { type: "boolean", default: true, description: "Include list of files at this checkpoint" },
            includeToolCalls: { type: "boolean", default: true, description: "Include tool calls made around this time" }
          }
        }
      },
      {
        name: "tm_compare_states",
        description: "⚖️ COMPARE STATES: Compare two points in time - shows what changed in files, conversation, and actions. Helps understand 'what went wrong between then and now'.",
        inputSchema: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            fromCheckpointId: { type: "string", description: "Starting checkpoint (default: find automatically based on query)" },
            toCheckpointId: { type: "string", description: "Ending checkpoint (default: current state)" },
            fromQuery: { type: "string", description: "Natural language for 'from' point (e.g., 'before docker')" },
            includeConversationDiff: { type: "boolean", default: true },
            includeFileDiff: { type: "boolean", default: true },
            includeActionSummary: { type: "boolean", default: true }
          }
        }
      },
      // ============================================================================
      // AUGMENTED LAYER TOOLS (Repository Indexing, Semantic Search, Context Sharing)
      // ============================================================================
      {
        name: "tm_index_project",
        description: "📚 INDEX PROJECT: Index the current project for fast semantic search. Creates a searchable index of all code files with their symbols, functions, classes, and documentation.",
        inputSchema: {
          type: "object",
          required: ["projectPath"],
          properties: {
            projectPath: { type: "string", minLength: 1, description: "Project root path to index" },
            includePatterns: {
              type: "array",
              items: { type: "string" },
              default: ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.rs", "**/*.java"],
              description: "Glob patterns for files to include"
            },
            excludePatterns: {
              type: "array",
              items: { type: "string" },
              default: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/venv/**"],
              description: "Glob patterns for files to exclude"
            },
            extractSymbols: { type: "boolean", default: true, description: "Extract function/class symbols" },
            extractComments: { type: "boolean", default: true, description: "Extract documentation comments" }
          }
        }
      },
      {
        name: "tm_search_code",
        description: "🔎 SEMANTIC CODE SEARCH: Search code across your project using natural language or keywords. Finds relevant functions, classes, and code sections.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Search query (natural language or keywords)" },
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            fileTypes: {
              type: "array",
              items: { type: "string" },
              description: "Filter by file extensions (e.g., ['ts', 'js'])"
            },
            symbolType: {
              type: "string",
              enum: ["function", "class", "variable", "interface", "type", "all"],
              default: "all",
              description: "Filter by symbol type"
            },
            maxResults: { type: "integer", minimum: 1, maximum: 50, default: 10 },
            includeContext: { type: "boolean", default: true, description: "Include surrounding code context" }
          }
        }
      },
      {
        name: "tm_find_definition",
        description: "📍 FIND DEFINITION: Find where a function, class, or variable is defined in your codebase.",
        inputSchema: {
          type: "object",
          required: ["symbol"],
          properties: {
            symbol: { type: "string", minLength: 1, description: "Symbol name to find (function, class, variable)" },
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            fileTypes: {
              type: "array",
              items: { type: "string" },
              description: "Filter by file extensions"
            },
            includeSourceCode: { type: "boolean", default: true, description: "Include the source code in results" }
          }
        }
      },
      {
        name: "tm_find_usages",
        description: "🔗 FIND USAGES: Find all usages/references of a symbol across your codebase.",
        inputSchema: {
          type: "object",
          required: ["symbol"],
          properties: {
            symbol: { type: "string", minLength: 1, description: "Symbol name to find usages of" },
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            fileTypes: {
              type: "array",
              items: { type: "string" },
              description: "Filter by file extensions"
            },
            maxResults: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            groupByFile: { type: "boolean", default: true, description: "Group results by file" }
          }
        }
      },
      {
        name: "tm_get_project_structure",
        description: "🌳 PROJECT STRUCTURE: Get a comprehensive overview of the project structure including file tree, main entry points, and architecture.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            maxDepth: { type: "integer", minimum: 1, maximum: 10, default: 4, description: "Maximum directory depth" },
            includeFiles: { type: "boolean", default: true, description: "Include files in tree" },
            excludePatterns: {
              type: "array",
              items: { type: "string" },
              default: ["node_modules", ".git", "dist", "__pycache__", "venv"],
              description: "Directories to exclude"
            },
            analyzeEntryPoints: { type: "boolean", default: true, description: "Identify main entry points" },
            analyzeExports: { type: "boolean", default: true, description: "Identify exported modules" }
          }
        }
      },
      {
        name: "tm_universal_search",
        description: "🌐 UNIVERSAL SEARCH: Search across everything - code, checkpoints, conversations, and knowledge base. One query to find it all.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Search query" },
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            projectId: { type: "string", description: "Project ID for checkpoint/conversation search" },
            searchIn: {
              type: "array",
              items: { type: "string", enum: ["code", "checkpoints", "conversations", "docs", "kb"] },
              default: ["code", "checkpoints", "conversations", "kb"],
              description: "Where to search"
            },
            includeKb: { type: "boolean", default: true, description: "Include cloud knowledge base results (requires AITM_API_URL + AITM_API_KEY)" },
            maxResults: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            timeRange: {
              type: "object",
              properties: {
                from: { type: "string", description: "Start date (ISO format or relative like '7d' for 7 days ago)" },
                to: { type: "string", description: "End date (ISO format, defaults to now)" }
              }
            }
          }
        }
      },
      {
        name: "tm_search_history",
        description: "📜 SEARCH HISTORY: Search through all checkpoints and saved states. Find when a specific file existed, when code changed, or when a feature was added.",
        inputSchema: {
          type: "object",
          required: ["projectId", "query"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            query: { type: "string", minLength: 1, description: "Search query (file names, checkpoint descriptions, code content)" },
            searchType: {
              type: "string",
              enum: ["all", "filename", "description", "content"],
              default: "all"
            },
            maxResults: { type: "integer", minimum: 1, maximum: 50, default: 15 },
            sortBy: { type: "string", enum: ["relevance", "date"], default: "relevance" }
          }
        }
      },
      {
        name: "tm_search_conversations",
        description: "💬 SEARCH CONVERSATIONS: Search through all AI conversation history to find discussions about specific topics, errors, or features.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Search query" },
            projectId: { type: "string", description: "Limit to specific project" },
            role: {
              type: "string",
              enum: ["all", "user", "assistant"],
              default: "all",
              description: "Filter by message role"
            },
            maxResults: { type: "integer", minimum: 1, maximum: 50, default: 15 },
            includeContext: { type: "boolean", default: true, description: "Include surrounding messages for context" }
          }
        }
      },
      {
        name: "tm_save_context",
        description: "💾 SAVE CONTEXT: Save the current conversation context and workspace state for later retrieval. Create named snapshots of your mental model.",
        inputSchema: {
          type: "object",
          required: ["projectId", "name"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1, description: "Name for this saved context (e.g., 'auth-refactor', 'bug-investigation')" },
            description: { type: "string", description: "Description of what this context represents" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization (e.g., ['feature', 'auth', 'WIP'])"
            },
            includeConversation: { type: "boolean", default: true },
            includeCheckpoint: { type: "boolean", default: true, description: "Create checkpoint with this context" },
            maxMessages: { type: "integer", minimum: 1, maximum: 100, default: 30 }
          }
        }
      },
      {
        name: "tm_load_context",
        description: "📂 LOAD CONTEXT: Load a previously saved context. Restore your mental model and optionally restore files to that state.",
        inputSchema: {
          type: "object",
          required: ["contextId"],
          properties: {
            contextId: { type: "string", minLength: 1, description: "Context ID to load" },
            restoreFiles: { type: "boolean", default: false, description: "Also restore files to this state" },
            safe: { type: "boolean", default: true, description: "Create backup before restore" }
          }
        }
      },
      {
        name: "tm_list_contexts",
        description: "📋 LIST CONTEXTS: List all saved contexts for a project. See your bookmarked states and mental snapshots.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Filter by project" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Filter by tags"
            },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            sortBy: { type: "string", enum: ["date", "name"], default: "date" }
          }
        }
      },
      {
        name: "tm_explain_code",
        description: "📖 EXPLAIN CODE: Get an AI-powered explanation of a code section, function, or file. Understand what code does without reading every line.",
        inputSchema: {
          type: "object",
          required: ["filePath"],
          properties: {
            filePath: { type: "string", minLength: 1, description: "Path to file" },
            startLine: { type: "integer", minimum: 1, description: "Start line (optional, explains whole file if not specified)" },
            endLine: { type: "integer", minimum: 1, description: "End line" },
            symbol: { type: "string", description: "Specific function/class to explain" },
            detailLevel: {
              type: "string",
              enum: ["brief", "detailed", "comprehensive"],
              default: "detailed",
              description: "How detailed the explanation should be"
            }
          }
        }
      },
      {
        name: "tm_suggest_fix",
        description: "🔧 SUGGEST FIX: Analyze an error and suggest a fix based on your codebase history and patterns. Uses checkpoint data to find when similar errors were fixed.",
        inputSchema: {
          type: "object",
          required: ["projectId", "error"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            error: { type: "string", minLength: 1, description: "Error message or description" },
            filePath: { type: "string", description: "File where error occurs (if known)" },
            stackTrace: { type: "string", description: "Full stack trace if available" },
            searchHistory: { type: "boolean", default: true, description: "Search checkpoint history for similar fixes" }
          }
        }
      },
      // ============================================================================
      // AUGMENTED TOOLS (Semantic Search, Research, etc.)
      // ============================================================================
      ...augmentedTools.getToolDefinitions(),
      // ============================================================================
      // CLOUD STORAGE TOOLS (Neon Database Integration)
      // ============================================================================
      ...cloudTools
    ].map(annotateTool);

    const uniqueTools = Array.from(
      new Map(tools.map((tool) => [tool.name, tool])).values()
    );

    const filteredTools = experimentalEnabled
      ? uniqueTools
      : uniqueTools.filter((t) => isToolStable(t.name));

    return { tools: filteredTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (!experimentalEnabled && !isToolStable(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      // Auth login tool
      if (name === "tm_auth_login") {
        const apiKey = (args as any)?.api_key as string;
        if (!apiKey?.startsWith('aitm_')) {
          return { content: [{ type: 'text', text: '❌ Invalid API key format. Keys start with aitm_' }] };
        }

        const apiUrl = process.env.AITM_API_URL || 'http://localhost:3001';
        try {
          const response = await fetch(`${apiUrl}/api/auth/me`, {
            headers: { 'X-API-Key': apiKey },
          });
          
          if (!response.ok) {
            return { content: [{ type: 'text', text: '❌ Invalid API key. Get yours at timemachine.gitgram.app/dashboard' }] };
          }

          const user = await response.json() as { email: string };
          
          // Save credentials
          const credPath = path.join(os.homedir(), '.aitimemachine', 'credentials.json');
          fs.mkdirSync(path.dirname(credPath), { recursive: true });
          fs.writeFileSync(credPath, JSON.stringify({ apiKey, email: user.email }, null, 2), { mode: 0o600 });

          return { content: [{ type: 'text', text: `✅ Logged in as ${user.email}\nCloud sync is now enabled!` }] };
        } catch (e: any) {
          return { content: [{ type: 'text', text: `❌ Connection failed: ${e.message}` }] };
        }
      }

      // Auth status tool - always available
      if (name === "tm_auth_status") {
        const auth = getAuthContext();
        if (auth.authenticated) {
          return {
            content: [{
              type: "text",
              text: `✅ Authenticated\nUser: ${auth.email}\nID: ${auth.userId}`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `⚠️ Not authenticated\n\nTo login:\n1. Get API key at timemachine.gitgram.app/dashboard\n2. Use tm_auth_login tool with your key`
            }]
          };
        }
      }

      if (name === "tm_capabilities") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              version: "0.1.0",
              experimental_enabled: experimentalEnabled,
              stable_tools: Array.from(stableTools.values()).sort(),
            }, null, 2)
          }]
        };
      }

      // Cloud tools - require authentication
      if (name === "tm_cloud_list_projects") {
        const { createCloudSyncClient } = await import("../cloud/sync-client.js");
        const client = createCloudSyncClient();
        if (!client) {
          return { content: [{ type: "text", text: "❌ Cloud sync not configured. Use tm_auth_login first." }] };
        }
        try {
          const { projects } = await client.getProjects();
          const list = projects.map((p: any) => `- ${p.name} (${p.id})\n  Path: ${p.rootPath || 'N/A'}\n  Updated: ${p.updatedAt}`).join('\n\n');
          return { content: [{ type: "text", text: `📁 Your Projects:\n\n${list || 'No projects found.'}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `❌ Failed to list projects: ${e.message}` }] };
        }
      }

      if (name === "tm_cloud_get_conversation") {
        const projectId = (args as any)?.projectId;
        const limit = (args as any)?.limit || 50;

        const { createCloudSyncClient } = await import("../cloud/sync-client.js");
        const client = createCloudSyncClient();
        if (!client) {
          return { content: [{ type: "text", text: "❌ Cloud sync not configured. Use tm_auth_login first." }] };
        }
        try {
          const { messages } = await client.getProjectMessages(projectId, { limit });
          if (messages.length === 0) {
            return { content: [{ type: "text", text: "No conversation history found for this project." }] };
          }

          const conversation = messages.map((m: any, i: number) => {
            const role = m.role === 'user' ? '👤 User' : m.role === 'assistant' ? '🤖 Assistant' : '⚙️ System';
            const time = new Date(m.timestamp).toLocaleString();
            const content = m.content.length > 500 ? m.content.substring(0, 500) + '...' : m.content;
            return `${i + 1}. ${role} [${time}]:\n${content}`;
          }).join('\n\n---\n\n');

          return { content: [{ type: "text", text: `💬 Conversation History (${messages.length} messages):\n\n${conversation}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `❌ Failed to get conversation: ${e.message}` }] };
        }
      }

      if (name === "tm_cloud_get_checkpoints") {
        const projectId = (args as any)?.projectId;
        const limit = (args as any)?.limit || 50;

        const { createCloudSyncClient } = await import("../cloud/sync-client.js");
        const client = createCloudSyncClient();
        if (!client) {
          return { content: [{ type: "text", text: "❌ Cloud sync not configured. Use tm_auth_login first." }] };
        }
        try {
          const { checkpoints } = await client.getCheckpoints(projectId, { limit });
          if (checkpoints.length === 0) {
            return { content: [{ type: "text", text: "No checkpoints found for this project." }] };
          }

          const list = checkpoints.map((cp: any, i: number) => {
            const time = new Date(cp.createdAt).toLocaleString();
            return `${i + 1}. ${cp.name}\n   ID: ${cp.id}\n   Created: ${time}\n   Scope: ${cp.scope || 'files'}`;
          }).join('\n\n');

          return { content: [{ type: "text", text: `📍 Cloud Checkpoints (${checkpoints.length}):\n\n${list}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `❌ Failed to get checkpoints: ${e.message}` }] };
        }
      }

      if (name === "tm_cloud_restore_checkpoint") {
        const projectId = (args as any)?.projectId;
        const checkpointId = (args as any)?.checkpointId;
        const includeConversation = (args as any)?.includeConversation !== false;
        const messageLimit = (args as any)?.messageLimit || 20;

        const { createCloudSyncClient } = await import("../cloud/sync-client.js");
        const client = createCloudSyncClient();
        if (!client) {
          return { content: [{ type: "text", text: "❌ Cloud sync not configured. Use tm_auth_login first." }] };
        }

        try {
          // Get full checkpoint data from cloud
          const data = await client.getCheckpointFull(projectId, checkpointId, {
            includeMessages: includeConversation,
            messageLimit,
          });

          if (!data.checkpoint) {
            return { content: [{ type: "text", text: "❌ Checkpoint not found in cloud." }] };
          }

          // Parse manifest
          const manifestJson = data.manifest ? JSON.parse(Buffer.from(data.manifest, 'base64').toString('utf8')) : null;

          // Get project to find root path
          const project = opts.repo.getProject(projectId);
          if (!project) {
            return { content: [{ type: "text", text: "❌ Project not found locally. Please initialize the project first." }] };
          }

          // Download missing blobs
          if (manifestJson?.files) {
            const hashes = manifestJson.files.map((f: any) => f.hash);
            const { blobs } = await client.getBlobsBatch(hashes);

            // Store blobs in local CAS
            for (const blob of blobs) {
              const content = Buffer.from(blob.content, 'base64');
              cas.putBytes(blob.mimeType || 'application/octet-stream', content);
            }
          }

          // Restore files
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            if (manifestJson) {
              const res = restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest: manifestJson,
                mode: "safe",
                backupCurrent: true,
              });

              // Build context text
              let contextText = `✅ Restored from cloud!\n\n`;
              contextText += `📍 Checkpoint: ${data.checkpoint.name}\n`;
              contextText += `🕐 Created: ${data.checkpoint.createdAt}\n`;
              contextText += `📁 Files restored: ${res.filesWritten}\n`;
              contextText += `💾 Backup: ${res.backupPath || 'none'}\n\n`;

              if (includeConversation && data.messages?.length > 0) {
                contextText += `## Previous Conversation:\n\n`;
                for (const m of data.messages) {
                  const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
                  contextText += `**${role}**: ${m.content.substring(0, 300)}${m.content.length > 300 ? '...' : ''}\n\n`;
                }
              }

              contextText += `\nYou are now at this checkpoint. Continue from where you left off.`;

              return { content: [{ type: "text", text: contextText }] };
            }
          } finally {
            lock.release();
          }

          return { content: [{ type: "text", text: "❌ Checkpoint has no manifest." }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `❌ Failed to restore: ${e.message}` }] };
        }
      }

      switch (name) {
        case "tm_go_back": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const searchQuery = (args as any)?.searchQuery;
          const minutesAgo = (args as any)?.minutesAgo;
          const hoursAgo = (args as any)?.hoursAgo;
          const safe = (args as any)?.safe !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          let targetCheckpoint;

          // Find checkpoint by various methods
          if (checkpointId) {
            targetCheckpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          } else if (searchQuery) {
            const results = opts.repo.searchCheckpoints(projectId, searchQuery);
            targetCheckpoint = results[0];
          } else if (minutesAgo || hoursAgo) {
            const targetTime = new Date();
            if (minutesAgo) targetTime.setMinutes(targetTime.getMinutes() - minutesAgo);
            if (hoursAgo) targetTime.setHours(targetTime.getHours() - hoursAgo);
            
            const all = opts.repo.listCheckpointsNewestFirst(projectId, 100);
            targetCheckpoint = all.find(cp => new Date(cp.createdAt) <= targetTime);
          }

          if (!targetCheckpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "No matching checkpoint found");
          }

          // Restore
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            const manifestBuf = cas.getBytes(targetCheckpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));

            const res = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: safe ? "safe" : "hard",
              backupCurrent: safe,
            });

            // Generate context for AI
            const context = generateRestoreContext(targetCheckpoint);

            return {
              content: [{
                type: "text",
                text: `✅ TIME MACHINE: Restored to checkpoint\n\n` +
                      `📍 Checkpoint: ${targetCheckpoint.name}\n` +
                      `🕐 Created: ${targetCheckpoint.createdAt}\n` +
                      `📁 Files restored: ${res.filesWritten}\n` +
                      `💾 Backup: ${res.backupPath || 'none'}\n\n` +
                      `${context}\n\n` +
                      `You are now at this point in time. All files have been restored to their exact state.`
              }]
            };
          } finally {
            lock.release();
          }
        }

        // ============================================================================
        // TIME MACHINE EXPERIENCE HANDLERS (macOS Time Machine-like)
        // ============================================================================

        case "tm_undo_last": {
          const projectId = (args as any)?.projectId;
          const steps = (args as any)?.steps || 1;
          const safe = (args as any)?.safe !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, steps + 1);
          if (checkpoints.length < steps + 1) {
            throw new TmError("TM_NO_CHECKPOINT", `Not enough history to undo ${steps} steps. Only ${checkpoints.length - 1} checkpoints available.`);
          }

          const currentCp = checkpoints[0];
          const targetCp = checkpoints[steps];

          // Restore to target checkpoint
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            const manifestBuf = cas.getBytes(targetCp.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));

            const res = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: safe ? "safe" : "hard",
              backupCurrent: safe,
            });

            // Calculate what was undone
            const currentManifest = parseManifestJson(cas.getBytes(currentCp.manifestBlobHash).toString("utf8"));
            const targetManifest = manifest;
            const currentFiles = new Map(currentManifest.files.map(f => [f.path, f.hash]));
            const targetFiles = new Map(targetManifest.files.map(f => [f.path, f.hash]));
            
            let filesRemoved = 0, filesRestored = 0, filesModified = 0;
            for (const path of currentFiles.keys()) {
              if (!targetFiles.has(path)) filesRemoved++;
            }
            for (const [path, hash] of targetFiles) {
              if (!currentFiles.has(path)) filesRestored++;
              else if (currentFiles.get(path) !== hash) filesModified++;
            }

            const undoneCheckpoints = checkpoints.slice(0, steps).map(cp => `  - ${cp.name}`).join('\n');

            return {
              content: [{
                type: "text",
                text: `⏪ UNDO: Reverted ${steps} action${steps > 1 ? 's' : ''}\n\n` +
                      `📍 Now at: ${targetCp.name}\n` +
                      `🕐 Time: ${targetCp.createdAt}\n\n` +
                      `Changes:\n` +
                      `  - ${filesRemoved} files removed (were added)\n` +
                      `  - ${filesRestored} files restored (were deleted)\n` +
                      `  - ${filesModified} files reverted to earlier version\n\n` +
                      `Undone checkpoints:\n${undoneCheckpoints}\n\n` +
                      `${safe ? `💾 Backup saved: ${res.backupPath}` : ''}\n\n` +
                      `Use tm_go_back if you want to return to the undone state.`
              }]
            };
          } finally {
            lock.release();
          }
        }

        case "tm_diff_file": {
          const { AdvancedDiffEngine } = await import('../core/diff-engine-v2.js');
          const projectId = (args as any)?.projectId;
          const filePath = (args as any)?.filePath;
          const fromId = (args as any)?.fromCheckpointId;
          const toId = (args as any)?.toCheckpointId;
          const contextLines = (args as any)?.context ?? 3;
          const algorithm = (args as any)?.algorithm || 'histogram';

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          
          // Get from checkpoint (default: latest)
          let fromCp = fromId 
            ? checkpoints.find(cp => cp.checkpointId.startsWith(fromId))
            : checkpoints[0];
          if (!fromCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "From checkpoint not found");

          // Get old content from checkpoint
          const fromManifest = parseManifestJson(cas.getBytes(fromCp.manifestBlobHash).toString("utf8"));
          const fromFile = fromManifest.files.find(f => f.path === filePath);
          const oldContent = fromFile ? cas.getBytes(fromFile.hash).toString("utf8") : '';

          // Get new content
          let newContent: string;
          let toLabel: string;
          
          if (toId) {
            const toCp = checkpoints.find(cp => cp.checkpointId.startsWith(toId));
            if (!toCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "To checkpoint not found");
            const toManifest = parseManifestJson(cas.getBytes(toCp.manifestBlobHash).toString("utf8"));
            const toFile = toManifest.files.find(f => f.path === filePath);
            newContent = toFile ? cas.getBytes(toFile.hash).toString("utf8") : '';
            toLabel = `${toCp.name} (${toCp.checkpointId.slice(0, 8)})`;
          } else {
            // Compare to current file
            const fs = await import('fs');
            const fullPath = path.join(project.rootPath, filePath);
            try {
              newContent = fs.readFileSync(fullPath, 'utf8');
            } catch {
              newContent = '';
            }
            toLabel = 'CURRENT';
          }

          if (oldContent === newContent) {
            return {
              content: [{
                type: "text",
                text: `📝 FILE DIFF: ${filePath}\n\nNo changes between checkpoints.`
              }]
            };
          }

          const diffEngine = new AdvancedDiffEngine();
          const result = diffEngine.diff(oldContent, newContent, { 
            algorithm: algorithm as any, 
            context: contextLines 
          });

          // Format unified diff output
          let diffOutput = `--- a/${filePath} (${fromCp.name})\n+++ b/${filePath} (${toLabel})\n`;
          
          for (const hunk of result.hunks) {
            diffOutput += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
            for (const line of hunk.lines) {
              const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
              diffOutput += `${prefix}${line.content}\n`;
            }
          }

          return {
            content: [{
              type: "text",
              text: `📝 FILE DIFF: ${filePath}\n` +
                    `Algorithm: ${algorithm}\n` +
                    `+${result.added} lines added, -${result.removed} lines removed\n\n` +
                    `\`\`\`diff\n${diffOutput}\`\`\``
            }]
          };
        }

        case "tm_diff_summary": {
          const projectId = (args as any)?.projectId;
          const fromId = (args as any)?.fromCheckpointId;
          const toId = (args as any)?.toCheckpointId;
          const showTopChanged = (args as any)?.showTopChanged || 5;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          
          // Get from checkpoint (default: previous)
          let fromCp = fromId 
            ? checkpoints.find(cp => cp.checkpointId.startsWith(fromId))
            : checkpoints[1];
          if (!fromCp) {
            return { content: [{ type: "text", text: "📊 No previous checkpoint to compare" }] };
          }

          // Get to checkpoint (default: current/latest)
          let toCp = toId 
            ? checkpoints.find(cp => cp.checkpointId.startsWith(toId))
            : checkpoints[0];
          if (!toCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "To checkpoint not found");

          // Load manifests
          const fromManifest = parseManifestJson(cas.getBytes(fromCp.manifestBlobHash).toString("utf8"));
          const toManifest = parseManifestJson(cas.getBytes(toCp.manifestBlobHash).toString("utf8"));

          const fromFiles = new Map(fromManifest.files.map(f => [f.path, { hash: f.hash, size: f.size }]));
          const toFiles = new Map(toManifest.files.map(f => [f.path, { hash: f.hash, size: f.size }]));

          const added: { path: string; size: number }[] = [];
          const deleted: { path: string; size: number }[] = [];
          const modified: { path: string; oldSize: number; newSize: number; diff: number }[] = [];

          for (const [filePath, info] of toFiles) {
            if (!fromFiles.has(filePath)) {
              added.push({ path: filePath, size: info.size });
            } else if (fromFiles.get(filePath)!.hash !== info.hash) {
              const oldSize = fromFiles.get(filePath)!.size;
              modified.push({ path: filePath, oldSize, newSize: info.size, diff: info.size - oldSize });
            }
          }

          for (const [filePath, info] of fromFiles) {
            if (!toFiles.has(filePath)) {
              deleted.push({ path: filePath, size: info.size });
            }
          }

          // Sort modified by absolute diff
          modified.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

          const totalAdded = added.reduce((sum, f) => sum + f.size, 0);
          const totalDeleted = deleted.reduce((sum, f) => sum + f.size, 0);
          const netChange = modified.reduce((sum, f) => sum + f.diff, 0);

          const formatSize = (bytes: number) => {
            if (bytes < 1024) return `${bytes}B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
          };

          let output = `📊 CHANGE SUMMARY\n\n`;
          output += `From: ${fromCp.name} (${getTimeAgo(new Date(fromCp.createdAt))})\n`;
          output += `To: ${toCp.name} (${getTimeAgo(new Date(toCp.createdAt))})\n\n`;
          output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          output += `📈 Statistics:\n`;
          output += `   ✅ Files added:    ${added.length} (+${formatSize(totalAdded)})\n`;
          output += `   ❌ Files deleted:  ${deleted.length} (-${formatSize(totalDeleted)})\n`;
          output += `   ✏️  Files modified: ${modified.length} (${netChange >= 0 ? '+' : ''}${formatSize(netChange)})\n`;
          output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

          if (modified.length > 0) {
            output += `🔥 Most changed files:\n`;
            for (const f of modified.slice(0, showTopChanged)) {
              const sign = f.diff >= 0 ? '+' : '';
              output += `   ${f.path} (${sign}${formatSize(f.diff)})\n`;
            }
            output += '\n';
          }

          if (added.length > 0) {
            output += `✅ Added:\n`;
            for (const f of added.slice(0, 5)) {
              output += `   + ${f.path}\n`;
            }
            if (added.length > 5) output += `   ... and ${added.length - 5} more\n`;
            output += '\n';
          }

          if (deleted.length > 0) {
            output += `❌ Deleted:\n`;
            for (const f of deleted.slice(0, 5)) {
              output += `   - ${f.path}\n`;
            }
            if (deleted.length > 5) output += `   ... and ${deleted.length - 5} more\n`;
          }

          return {
            content: [{ type: "text", text: output }]
          };
        }

        case "tm_before_message": {
          const projectId = (args as any)?.projectId;
          const messageQuery = (args as any)?.messageQuery || '';
          const role = (args as any)?.role || 'any';
          const shouldRestore = (args as any)?.restore || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          // Get events to find messages
          const events = opts.repo.listEvents(projectId, undefined, 500);
          const messageEvents = events.filter(e => 
            e.type === 'chat.message' || e.type === 'message'
          );

	          // Find matching message
	          let foundEvent = null;
	          for (const event of messageEvents) {
	            const content = readPayloadString(event.payload, "content") || readPayloadString(event.payload, "message");
	            const eventRole = readPayloadString(event.payload, "role") || "unknown";
	            
	            if (role !== 'any' && eventRole !== role) continue;
	            if (messageQuery && !content.toLowerCase().includes(messageQuery.toLowerCase())) continue;
            
            foundEvent = event;
            break;
          }

          if (!foundEvent) {
            return {
              content: [{
                type: "text",
                text: `💬 BEFORE MESSAGE\n\nNo matching message found.\n\nQuery: "${messageQuery}"\nRole filter: ${role}`
              }]
            };
          }

          // Find checkpoint before this message
          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          const messageTime = new Date(foundEvent.timestamp);
          const beforeCheckpoint = checkpoints.find(cp => new Date(cp.createdAt) < messageTime);

          if (!beforeCheckpoint) {
            return {
	              content: [{
	                type: "text",
	                text: `💬 BEFORE MESSAGE\n\nFound message but no checkpoint exists before it.\n\nMessage: "${readPayloadString(foundEvent.payload, "content").slice(0, 100)}..."`
	              }]
	            };
	          }

          if (shouldRestore) {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(beforeCheckpoint.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));
              restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest,
                mode: "safe",
                backupCurrent: true,
              });
            } finally {
              lock.release();
            }
          }

          return {
	              content: [{
	                type: "text",
	                text: `💬 BEFORE MESSAGE\n\n` +
	                      `Found message: "${readPayloadString(foundEvent.payload, "content").slice(0, 100)}..."\n` +
	                      `Message time: ${foundEvent.timestamp}\n\n` +
	                      `Checkpoint before: ${beforeCheckpoint.name}\n` +
	                      `Checkpoint time: ${beforeCheckpoint.createdAt}\n\n` +
                    (shouldRestore ? `✅ Restored to this checkpoint!` : `Use restore: true to restore to this point.`)
            }]
          };
        }

        case "tm_restore_before": {
          const projectId = (args as any)?.projectId;
          const query = (args as any)?.query || '';
          const safe = (args as any)?.safe !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          
          // Find checkpoint matching query
          let matchIndex = -1;
          for (let i = 0; i < checkpoints.length; i++) {
            if (checkpoints[i].name.toLowerCase().includes(query.toLowerCase())) {
              matchIndex = i;
              break;
            }
          }

          if (matchIndex === -1 || matchIndex >= checkpoints.length - 1) {
            return {
              content: [{
                type: "text",
                text: `⏪ RESTORE BEFORE\n\nNo checkpoint found matching: "${query}"\n\nTry a different search term.`
              }]
            };
          }

          // Get the checkpoint BEFORE the match
          const targetCheckpoint = checkpoints[matchIndex + 1];

          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            const manifestBuf = cas.getBytes(targetCheckpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));
            const result = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: safe ? "safe" : "hard",
              backupCurrent: safe,
            });

            return {
              content: [{
                type: "text",
                text: `⏪ RESTORE BEFORE "${query}"\n\n` +
                      `✅ Restored to: ${targetCheckpoint.name}\n` +
                      `Time: ${targetCheckpoint.createdAt}\n` +
                      `Files restored: ${result.filesWritten}\n` +
                      (result.backupPath ? `Backup: ${result.backupPath}` : '')
              }]
            };
          } finally {
            lock.release();
          }
        }

        case "tm_before_action": {
          const projectId = (args as any)?.projectId;
          const actionType = (args as any)?.actionType;
          const actionQuery = (args as any)?.actionQuery;
          const filePath = (args as any)?.filePath;
          const shouldRestore = (args as any)?.restore || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          
          let foundIndex = -1;
          let foundAction = '';

          // Search through checkpoints to find matching action
          for (let i = 0; i < checkpoints.length - 1; i++) {
            const cp = checkpoints[i];
            const prevCp = checkpoints[i + 1];
            
            // Check if checkpoint name matches action type or query
            const name = cp.name.toLowerCase();
            const matchesType = actionType && (
              name.includes(actionType.toLowerCase()) ||
              (actionType === 'create_file' && name.includes('create')) ||
              (actionType === 'edit_file' && (name.includes('edit') || name.includes('modify') || name.includes('update'))) ||
              (actionType === 'delete_file' && name.includes('delete'))
            );
            const matchesQuery = actionQuery && name.includes(actionQuery.toLowerCase());

            // Check if this checkpoint modified the specified file
            let matchesFile = false;
            if (filePath) {
              const cpManifest = parseManifestJson(cas.getBytes(cp.manifestBlobHash).toString("utf8"));
              const prevManifest = parseManifestJson(cas.getBytes(prevCp.manifestBlobHash).toString("utf8"));
              const cpFile = cpManifest.files.find(f => f.path === filePath);
              const prevFile = prevManifest.files.find(f => f.path === filePath);
              
              if (cpFile && !prevFile) matchesFile = true; // File was created
              else if (!cpFile && prevFile) matchesFile = true; // File was deleted
              else if (cpFile && prevFile && cpFile.hash !== prevFile.hash) matchesFile = true; // File was modified
            }

            if (matchesType || matchesQuery || matchesFile) {
              foundIndex = i + 1; // The checkpoint BEFORE this action
              foundAction = cp.name;
              break;
            }
          }

          if (foundIndex === -1 || foundIndex >= checkpoints.length) {
            return {
              content: [{
                type: "text",
                text: `⏮️ BEFORE ACTION\n\nNo matching action found.\n\n` +
                      `Searched for:\n` +
                      (actionType ? `  - Action type: ${actionType}\n` : '') +
                      (actionQuery ? `  - Query: "${actionQuery}"\n` : '') +
                      (filePath ? `  - File: ${filePath}\n` : '') +
                      `\nTry tm_show_timeline to see available checkpoints.`
              }]
            };
          }

          const targetCp = checkpoints[foundIndex];

          if (shouldRestore) {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(targetCp.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));

              const res = restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest,
                mode: "safe",
                backupCurrent: true,
              });

              return {
                content: [{
                  type: "text",
                  text: `⏮️ RESTORED TO BEFORE ACTION\n\n` +
                        `Action undone: ${foundAction}\n` +
                        `Now at: ${targetCp.name}\n` +
                        `Time: ${targetCp.createdAt}\n` +
                        `Files restored: ${res.filesWritten}\n` +
                        `Backup: ${res.backupPath}\n\n` +
                        `You are now at the state before "${foundAction}" was performed.`
                }]
              };
            } finally {
              lock.release();
            }
          }

          return {
            content: [{
              type: "text",
              text: `⏮️ BEFORE ACTION: ${foundAction}\n\n` +
                    `Found checkpoint before this action:\n` +
                    `  ID: ${targetCp.checkpointId}\n` +
                    `  Name: ${targetCp.name}\n` +
                    `  Time: ${targetCp.createdAt}\n` +
                    `  Ago: ${getTimeAgo(new Date(targetCp.createdAt))}\n\n` +
                    `To restore to this point, call this tool again with restore=true,\n` +
                    `or use tm_go_back with checkpointId="${targetCp.checkpointId}"`
            }]
          };
        }

        case "tm_restore_files": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const pattern = (args as any)?.pattern;
          const dryRun = (args as any)?.dryRun || false;
          const strategy = (args as any)?.strategy || 'overwrite';

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const cp = opts.repo.getCheckpoint(projectId, checkpointId) ||
                     opts.repo.listCheckpointsNewestFirst(projectId, 100)
                       .find(c => c.checkpointId.startsWith(checkpointId));
          if (!cp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          const manifestBuf = cas.getBytes(cp.manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));

          // Match files against glob pattern
          const { minimatch } = await import('minimatch');
          const matchingFiles = manifest.files.filter(f => minimatch(f.path, pattern));

          if (matchingFiles.length === 0) {
            return {
              content: [{
                type: "text",
                text: `📂 RESTORE FILES\n\nNo files matched pattern: ${pattern}\n\n` +
                      `Available files in checkpoint: ${manifest.files.length}`
              }]
            };
          }

          if (dryRun) {
            return {
              content: [{
                type: "text",
                text: `📂 RESTORE FILES (dry run)\n\n` +
                      `Pattern: ${pattern}\n` +
                      `Matched ${matchingFiles.length} files:\n\n` +
                      matchingFiles.slice(0, 30).map(f => `  ${f.path} (${f.size} bytes)`).join('\n') +
                      (matchingFiles.length > 30 ? `\n  ... and ${matchingFiles.length - 30} more` : '') +
                      `\n\nRun again with dryRun=false to restore these files.`
              }]
            };
          }

          const fs = await import('fs');
          let restored = 0, skipped = 0, errors = 0;
          const details: string[] = [];

          for (const file of matchingFiles) {
            try {
              const fullPath = path.join(project.rootPath, file.path);
              const exists = fs.existsSync(fullPath);

              if (exists && strategy === 'skip_existing') {
                skipped++;
                continue;
              }

              if (exists && strategy === 'merge') {
                // 3-way merge: ours = current file, theirs = checkpoint version
                const { ThreeWayMerge } = await import('../core/three-way-merge.js');
                const oursContent = fs.readFileSync(fullPath, 'utf8');
                const theirsContent = cas.getBytes(file.hash).toString('utf8');

                // Find base content from the previous checkpoint
                let baseContent = '';
                const allCheckpoints = opts.repo.listCheckpointsNewestFirst(projectId, 1000);
                const cpIndex = allCheckpoints.findIndex(c => c.checkpointId === cp.checkpointId);
                for (let i = cpIndex + 1; i < allCheckpoints.length; i++) {
                  const prevManifest = parseManifestJson(cas.getBytes(allCheckpoints[i].manifestBlobHash).toString('utf8'));
                  const prevFile = prevManifest.files.find(f => f.path === file.path);
                  if (prevFile) {
                    baseContent = cas.getBytes(prevFile.hash).toString('utf8');
                    break;
                  }
                }

                const merger = new ThreeWayMerge({ conflictStyle: 'diff3' });
                const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });

                fs.writeFileSync(fullPath, result.merged);
                restored++;
                if (result.hasConflicts) {
                  details.push(`⚠️ ${file.path} (merged with ${result.conflicts.length} conflicts)`);
                } else {
                  details.push(`✅ ${file.path} (auto-merged)`);
                }
              } else {
                const content = cas.getBytes(file.hash);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, content);
                restored++;
                details.push(`✅ ${file.path}`);
              }
            } catch (e) {
              errors++;
              details.push(`❌ ${file.path}: ${(e as Error).message}`);
            }
          }

          return {
            content: [{
              type: "text",
              text: `📂 RESTORE FILES\n\n` +
                    `From: ${cp.name} (${cp.checkpointId.slice(0, 12)})\n` +
                    `Pattern: ${pattern}\n` +
                    `Strategy: ${strategy}\n\n` +
                    `Results:\n` +
                    `  ✅ Restored: ${restored}\n` +
                    `  ⏭️  Skipped: ${skipped}\n` +
                    `  ❌ Errors: ${errors}\n\n` +
                    (details.length <= 20 ? details.join('\n') : details.slice(0, 20).join('\n') + `\n... and ${details.length - 20} more`)
            }]
          };
        }

        case "tm_find_error_point": {
          const projectId = (args as any)?.projectId;
          const errorPattern = (args as any)?.errorPattern;
          const lookbackMinutes = (args as any)?.lookbackMinutes || 60;
          const autoRestore = (args as any)?.autoRestore || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
          
          // Filter checkpoints within time range
          const recentCheckpoints = checkpoints.filter(cp => new Date(cp.createdAt) >= cutoffTime);

          let lastGoodIndex = -1;
          let errorInfo = '';

          // Look for error indicators in checkpoint names
          const errorIndicators = ['error', 'fail', 'broke', 'fix', 'revert', 'undo', 'rollback'];
          const goodIndicators = ['green', 'pass', 'success', 'working', 'stable'];

          for (let i = 0; i < recentCheckpoints.length; i++) {
            const cp = recentCheckpoints[i];
            const name = cp.name.toLowerCase();

            // Check for error pattern match
            if (errorPattern && name.includes(errorPattern.toLowerCase())) {
              lastGoodIndex = i + 1;
              errorInfo = `Found "${errorPattern}" in checkpoint: ${cp.name}`;
              break;
            }

            // Check for error indicators
            if (errorIndicators.some(ind => name.includes(ind))) {
              lastGoodIndex = i + 1;
              errorInfo = `Found error indicator in checkpoint: ${cp.name}`;
              break;
            }

            // Check for good indicators (last known good state)
            if (goodIndicators.some(ind => name.includes(ind))) {
              lastGoodIndex = i;
              errorInfo = `Found good state: ${cp.name}`;
              // Don't break - keep looking for errors after this point
            }
          }

          if (lastGoodIndex === -1 || lastGoodIndex >= recentCheckpoints.length) {
            return {
              content: [{
                type: "text",
                text: `🔍 FIND ERROR POINT\n\n` +
                      `No clear error point found in the last ${lookbackMinutes} minutes.\n\n` +
                      `Searched ${recentCheckpoints.length} checkpoints.\n` +
                      (errorPattern ? `Pattern: "${errorPattern}"\n` : '') +
                      `\nSuggestion: Use tm_show_timeline to review checkpoints manually.`
              }]
            };
          }

          const targetCp = recentCheckpoints[lastGoodIndex];

          if (autoRestore) {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(targetCp.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));

              const res = restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest,
                mode: "safe",
                backupCurrent: true,
              });

              return {
                content: [{
                  type: "text",
                  text: `🔍 ERROR POINT FOUND & RESTORED\n\n` +
                        `${errorInfo}\n\n` +
                        `Restored to last good state:\n` +
                        `  Name: ${targetCp.name}\n` +
                        `  Time: ${targetCp.createdAt}\n` +
                        `  Files: ${res.filesWritten}\n` +
                        `  Backup: ${res.backupPath}\n\n` +
                        `You are now at a state before the error occurred.`
                }]
              };
            } finally {
              lock.release();
            }
          }

          return {
            content: [{
              type: "text",
              text: `🔍 ERROR POINT FOUND\n\n` +
                    `${errorInfo}\n\n` +
                    `Suggested restore point:\n` +
                    `  ID: ${targetCp.checkpointId}\n` +
                    `  Name: ${targetCp.name}\n` +
                    `  Time: ${targetCp.createdAt}\n` +
                    `  Ago: ${getTimeAgo(new Date(targetCp.createdAt))}\n\n` +
                    `To restore, run again with autoRestore=true,\n` +
                    `or use tm_go_back with checkpointId="${targetCp.checkpointId}"`
            }]
          };
        }

        // ============================================================================
        // CONTEXT-AWARE RESTORATION HANDLERS
        // ============================================================================

        case "tm_restore_with_context": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const maxMessages = (args as any)?.maxMessages || 30;
          const maxTerminalEvents = (args as any)?.maxTerminalEvents || 10;
          const includeToolCalls = (args as any)?.includeToolCalls !== false;
          const includeFileChanges = (args as any)?.includeFileChanges !== false;
          const safe = (args as any)?.safe !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          // Restore files
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          let restoreResult: any;
          try {
            const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));

            restoreResult = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: safe ? "safe" : "hard",
              backupCurrent: safe,
            });
          } finally {
            lock.release();
          }

          // Build rich context packet
          const contextPacket = await buildContextPacket({
            repo: opts.repo,
            cas,
            projectId,
            checkpointId,
            maxMessages,
            maxTerminalEvents,
            includeTerminalOutputs: true,
          });

          // Get tool calls if requested
          let toolCallsSection = "";
          if (includeToolCalls) {
            const toolEvents = opts.repo.listEvents(projectId, "tool.call", 20);
            if (toolEvents.length > 0) {
              const toolLines = toolEvents.slice(0, 10).map((e, i) => {
                const toolName = e.payload?.toolName || "unknown";
                const success = e.payload?.success ? "✓" : "✗";
                return `${i + 1}. ${toolName} ${success}`;
              });
              toolCallsSection = `\n\n## Recent Tool Calls\n${toolLines.join("\n")}`;
            }
          }

          // Get file changes summary if requested
          let fileChangesSection = "";
          if (includeFileChanges) {
            const allCheckpoints = opts.repo.listCheckpointsNewestFirst(projectId, 10);
            const recentChanges = allCheckpoints.slice(0, 5).map(cp => {
              return `- ${cp.name} (${getTimeAgo(new Date(cp.createdAt))})`;
            });
            fileChangesSection = `\n\n## Recent Changes Leading Here\n${recentChanges.join("\n")}`;
          }

          // Generate "Mental State" summary - what was the AI working on?
          let mentalStateSection = "";
          const chatEvents = opts.repo.listEvents(projectId, "chat.message", 20);
          if (chatEvents.length > 0) {
            const assistantMsgs = chatEvents.filter((e: any) => e.payload?.role === "assistant");
            const userMsgs = chatEvents.filter((e: any) => e.payload?.role === "user");

            // Analyze recent context to understand what was being worked on
            const topics = new Set<string>();
            const actions = new Set<string>();

	            for (const msg of assistantMsgs.slice(0, 5)) {
	              const content = readPayloadString(msg.payload, "content").toLowerCase();
              // Extract topics being discussed
              if (content.includes("test")) topics.add("testing");
              if (content.includes("bug") || content.includes("fix")) topics.add("bug fixing");
              if (content.includes("implement") || content.includes("add")) topics.add("feature development");
              if (content.includes("refactor")) topics.add("refactoring");
              if (content.includes("error") || content.includes("debug")) topics.add("debugging");
              if (content.includes("config")) topics.add("configuration");
              // Extract actions taken
              if (content.includes("created") || content.includes("creating")) actions.add("creating files");
              if (content.includes("updated") || content.includes("updating")) actions.add("updating code");
              if (content.includes("running") || content.includes("ran")) actions.add("running commands");
            }

	            const lastUserMsg = readPayloadString(userMsgs[0]?.payload, "content").slice(0, 200) || "N/A";
            const topicsStr = topics.size > 0 ? Array.from(topics).join(", ") : "general development";
            const actionsStr = actions.size > 0 ? Array.from(actions).join(", ") : "various operations";

            mentalStateSection = `\n\n## 🧠 Mental State at Checkpoint\n` +
              `**Focus area:** ${topicsStr}\n` +
              `**Recent actions:** ${actionsStr}\n` +
              `**Last user request:** ${lastUserMsg}...\n` +
              `**Chat messages available:** ${chatEvents.length}`;
          }

          const fullContext = contextPacket + mentalStateSection + toolCallsSection + fileChangesSection;

          // Write context to file for easy access
          const contextPath = path.join(project.rootPath, ".aitm", "context.md");
          fs.mkdirSync(path.dirname(contextPath), { recursive: true });
          fs.writeFileSync(contextPath, fullContext, "utf8");

          return {
            content: [{
              type: "text",
              text: `🧠 FULL CONTEXT RESTORE COMPLETE\n\n` +
                    `📍 Restored to: ${checkpoint.name}\n` +
                    `🕐 Time: ${checkpoint.createdAt} (${getTimeAgo(new Date(checkpoint.createdAt))})\n` +
                    `📁 Files restored: ${restoreResult.filesWritten}\n` +
                    `💾 Backup: ${restoreResult.backupPath || 'none'}\n` +
                    `📋 Context saved to: .aitm/context.md\n\n` +
                    `${'='.repeat(60)}\n\n` +
                    fullContext
            }]
          };
        }

        case "tm_find_when_broke": {
          const projectId = (args as any)?.projectId;
          const errorMessage = (args as any)?.errorMessage;
          const errorPatterns = (args as any)?.errorPatterns || [];
          const lookbackMinutes = (args as any)?.lookbackMinutes || 120;
          const analyzeTestResults = (args as any)?.analyzeTestResults !== false;
          const analyzeBuildErrors = (args as any)?.analyzeBuildErrors !== false;
          const autoRestore = (args as any)?.autoRestore || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 200);
          const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
          const recentCheckpoints = checkpoints.filter(cp => new Date(cp.createdAt) >= cutoffTime);

          // Build comprehensive error patterns
          const allPatterns = [
            ...errorPatterns,
            ...(errorMessage ? [errorMessage.toLowerCase()] : []),
          ];

          if (analyzeTestResults) {
            allPatterns.push('test fail', 'tests fail', 'assertion', 'expect', 'should have');
          }
          if (analyzeBuildErrors) {
            allPatterns.push('build fail', 'compile error', 'syntax error', 'type error', 'cannot find');
          }

          // Also get terminal events to analyze
          const terminalEvents = opts.repo.listEvents(projectId, "term.exit", 50);
          const failedCommands = terminalEvents.filter(e => e.payload?.exitCode !== 0);

          // Get chat events to find when errors were first mentioned
          const allChatEvents = opts.repo.listEvents(projectId, "chat.message", 100);
          const errorMentionInChat = allChatEvents.find((e: any) => {
            const content = (e.payload?.content || "").toLowerCase();
            return content.includes("error") || content.includes("fail") ||
                   content.includes("broken") || content.includes("doesn't work");
          });

          // Get tool calls to find potentially problematic actions
          const toolCallEvents = opts.repo.listEvents(projectId, "tool.call", 50);
          const failedToolCalls = toolCallEvents.filter((e: any) => e.payload?.success === false);

          // Score checkpoints by likelihood of being "before the break"
          interface ScoredCheckpoint {
            checkpoint: typeof recentCheckpoints[0];
            score: number;
            confidence: number;  // Percentage confidence
            reasons: string[];
            linkedActions: string[];  // AI actions that might be related
          }

          const scoredCheckpoints: ScoredCheckpoint[] = recentCheckpoints.map((cp, idx) => {
            const reasons: string[] = [];
            const linkedActions: string[] = [];
            const name = cp.name.toLowerCase();

            // Good indicators (higher = better restore candidate)
            const goodIndicators = ['green', 'pass', 'success', 'working', 'stable', 'before'];
            const badIndicators = ['error', 'fail', 'broke', 'fix', 'revert', 'undo', 'after'];

            let s = 50; // Base score

            // Check good indicators
            for (const ind of goodIndicators) {
              if (name.includes(ind)) {
                s += 20;
                reasons.push(`Good indicator: "${ind}"`);
              }
            }

            // Check bad indicators (reduce score)
            for (const ind of badIndicators) {
              if (name.includes(ind)) {
                s -= 30;
                reasons.push(`Bad indicator: "${ind}"`);
              }
            }

            // Check error patterns
            for (const pattern of allPatterns) {
              if (name.includes(pattern)) {
                s -= 40;
                reasons.push(`Error pattern matched: "${pattern}"`);
              }
            }

            // Older checkpoints get slight preference (more likely stable)
            s += Math.min(idx * 2, 20);

            // Check if this checkpoint was created before error was first mentioned in chat
            if (errorMentionInChat) {
              const errorTime = new Date(errorMentionInChat.timestamp);
              const cpTime = new Date(cp.createdAt);
              if (cpTime < errorTime) {
                s += 25;
                reasons.push("Created before error was first mentioned");
              }
            }

            // Link to tool calls around this checkpoint's time
            const cpTime = new Date(cp.createdAt);
            const nearbyToolCalls = toolCallEvents.filter((e: any) => {
              const eTime = new Date(e.timestamp);
              const diffMs = Math.abs(eTime.getTime() - cpTime.getTime());
              return diffMs < 5 * 60 * 1000; // Within 5 minutes
            });
            for (const tc of nearbyToolCalls.slice(0, 3)) {
              const toolName = tc.payload?.toolName || "unknown";
              const success = tc.payload?.success ? "succeeded" : "failed";
              linkedActions.push(`${toolName} ${success}`);
            }

            // Link to failed commands
            const nearbyFailedCmds = failedCommands.filter((e: any) => {
              const eTime = new Date(e.timestamp);
              const diffMs = Math.abs(eTime.getTime() - cpTime.getTime());
              return diffMs < 5 * 60 * 1000;
            });
            if (nearbyFailedCmds.length > 0) {
              s -= 15;
              reasons.push(`${nearbyFailedCmds.length} failed command(s) near this time`);
              for (const fc of nearbyFailedCmds.slice(0, 2)) {
                linkedActions.push(`Command exited with code ${fc.payload?.exitCode}`);
              }
            }

            // Calculate confidence percentage (0-100)
            const confidence = Math.max(0, Math.min(100, s));

            return { checkpoint: cp, score: s, confidence, reasons, linkedActions };
          });

          // Sort by score (highest = best restore candidate)
          scoredCheckpoints.sort((a, b) => b.score - a.score);

          const bestCandidate = scoredCheckpoints[0];
          if (!bestCandidate || bestCandidate.score < 20) {
            return {
              content: [{
                type: "text",
                text: `🔍 FIND WHEN BROKE\n\n` +
                      `❓ Could not confidently identify when things broke.\n\n` +
                      `Analyzed ${recentCheckpoints.length} checkpoints in the last ${lookbackMinutes} minutes.\n` +
                      `Found ${failedCommands.length} failed terminal commands.\n\n` +
                      `Suggestions:\n` +
                      `1. Use tm_show_timeline to review checkpoints manually\n` +
                      `2. Provide a specific errorMessage to search for\n` +
                      `3. Try increasing lookbackMinutes`
              }]
            };
          }

          if (autoRestore) {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(bestCandidate.checkpoint.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));

              const res = restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest,
                mode: "safe",
                backupCurrent: true,
              });

              return {
                content: [{
                  type: "text",
                  text: `🔍 FOUND & RESTORED TO LAST GOOD STATE\n\n` +
                        `📍 Checkpoint: ${bestCandidate.checkpoint.name}\n` +
                        `🕐 Time: ${bestCandidate.checkpoint.createdAt}\n` +
                        `📊 Confidence: ${bestCandidate.score}%\n` +
                        `📁 Files restored: ${res.filesWritten}\n` +
                        `💾 Backup: ${res.backupPath}\n\n` +
                        `Why this checkpoint:\n${bestCandidate.reasons.map(r => `  - ${r}`).join('\n')}\n\n` +
                        `You are now at a state before the error likely occurred.`
                }]
              };
            } finally {
              lock.release();
            }
          }

          // Show analysis without restoring
          const topCandidates = scoredCheckpoints.slice(0, 5);
          const candidateList = topCandidates.map((sc, i) => {
            let entry = `${i + 1}. ${sc.checkpoint.name}\n` +
                   `   📊 Confidence: ${sc.confidence}% | Time: ${getTimeAgo(new Date(sc.checkpoint.createdAt))}\n` +
                   `   ID: ${sc.checkpoint.checkpointId}`;

            if (sc.reasons.length > 0) {
              entry += `\n   Reasons: ${sc.reasons.slice(0, 2).join("; ")}`;
            }

            if (sc.linkedActions.length > 0) {
              entry += `\n   🔗 Related AI actions: ${sc.linkedActions.slice(0, 2).join(", ")}`;
            }

            return entry;
          }).join('\n\n');

          // Add conversation analysis section
          let conversationAnalysis = "";
	          if (errorMentionInChat) {
	            const errorContent = readPayloadString(errorMentionInChat.payload, "content").slice(0, 100);
	            conversationAnalysis = `\n\n📝 Error first mentioned in conversation:\n"${errorContent}..."\n` +
	                                   `Time: ${getTimeAgo(new Date(errorMentionInChat.timestamp))}`;
	          }

          // Add failed tool calls summary
          let failedToolsSection = "";
          if (failedToolCalls.length > 0) {
            const toolNames = failedToolCalls.slice(0, 3).map((tc: any) => tc.payload?.toolName || "unknown").join(", ");
            failedToolsSection = `\n\n⚠️ Failed tool calls detected: ${toolNames}`;
          }

          return {
            content: [{
              type: "text",
              text: `🔍 FIND WHEN BROKE - ANALYSIS\n\n` +
                    `Analyzed ${recentCheckpoints.length} checkpoints.\n` +
                    `Found ${failedCommands.length} failed terminal commands.\n` +
                    `Found ${failedToolCalls.length} failed tool calls.\n\n` +
                    `📊 Top candidates for "last good state":\n\n${candidateList}` +
                    conversationAnalysis + failedToolsSection +
                    `\n\n✨ To restore to the best candidate:\n` +
                    `- Run again with autoRestore=true, or\n` +
                    `- Use tm_go_back with checkpointId="${bestCandidate.checkpoint.checkpointId}"`
            }]
          };
        }

        case "tm_natural_query": {
          const projectId = (args as any)?.projectId;
          const query = (args as any)?.query?.toLowerCase() || "";
          const execute = (args as any)?.execute || false;
          const safe = (args as any)?.safe !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          // Parse natural language query
          interface ParsedIntent {
            action: "restore" | "show" | "compare" | "search";
            timeSpec?: { minutes?: number; hours?: number; days?: number };
            searchTerm?: string;
            checkpointId?: string;
          }

          const intent: ParsedIntent = { action: "search" };

          // Time patterns
          const minuteMatch = query.match(/(\d+)\s*min(ute)?s?\s*ago/i);
          const hourMatch = query.match(/(\d+)\s*hours?\s*ago/i);
          const dayMatch = query.match(/(\d+)\s*days?\s*ago/i);

          if (minuteMatch) {
            intent.timeSpec = { minutes: parseInt(minuteMatch[1]) };
            intent.action = "restore";
          } else if (hourMatch) {
            intent.timeSpec = { hours: parseInt(hourMatch[1]) };
            intent.action = "restore";
          } else if (dayMatch) {
            intent.timeSpec = { days: parseInt(dayMatch[1]) };
            intent.action = "restore";
          }

          // Action patterns
          if (query.includes("go back") || query.includes("restore") || query.includes("revert")) {
            intent.action = "restore";
          }
          if (query.includes("show") || query.includes("what") || query.includes("list")) {
            intent.action = "show";
          }
          if (query.includes("compare") || query.includes("diff") || query.includes("between")) {
            intent.action = "compare";
          }

          // Search term patterns
          const beforeMatch = query.match(/before\s+(?:the\s+)?(.+?)(?:\s+change|$)/i);
          const whenMatch = query.match(/when\s+(.+?)(?:\s+was|\s+were|$)/i);

          if (beforeMatch) {
            intent.searchTerm = beforeMatch[1].trim();
            intent.action = "restore";
          } else if (whenMatch) {
            intent.searchTerm = whenMatch[1].trim();
          }

          // Keywords to search for
          const keywords = ["docker", "api", "test", "build", "deploy", "config", "refactor", "fix", "feature"];
          for (const kw of keywords) {
            if (query.includes(kw)) {
              intent.searchTerm = intent.searchTerm || kw;
            }
          }

          // Find matching checkpoint
          let targetCheckpoint;
          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);

          if (intent.timeSpec) {
            const targetTime = new Date();
            if (intent.timeSpec.minutes) targetTime.setMinutes(targetTime.getMinutes() - intent.timeSpec.minutes);
            if (intent.timeSpec.hours) targetTime.setHours(targetTime.getHours() - intent.timeSpec.hours);
            if (intent.timeSpec.days) targetTime.setDate(targetTime.getDate() - intent.timeSpec.days);

            targetCheckpoint = checkpoints.find(cp => new Date(cp.createdAt) <= targetTime);
          } else if (intent.searchTerm) {
            targetCheckpoint = checkpoints.find(cp =>
              cp.name.toLowerCase().includes(intent.searchTerm!)
            );
          }

          if (!targetCheckpoint) {
            const suggestions = checkpoints.slice(0, 5).map((cp, i) =>
              `${i + 1}. ${cp.name} (${getTimeAgo(new Date(cp.createdAt))})`
            ).join('\n');

            return {
              content: [{
                type: "text",
                text: `💬 NATURAL QUERY: "${query}"\n\n` +
                      `❓ Couldn't find a matching checkpoint.\n\n` +
                      `Interpreted as:\n` +
                      `  Action: ${intent.action}\n` +
                      `  Time: ${JSON.stringify(intent.timeSpec || 'not specified')}\n` +
                      `  Search: ${intent.searchTerm || 'none'}\n\n` +
                      `Recent checkpoints:\n${suggestions}\n\n` +
                      `Try being more specific or use tm_show_timeline.`
              }]
            };
          }

          if (intent.action === "restore" && execute) {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(targetCheckpoint.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));

              const res = restoreWorkspaceAtomic({
                projectRoot: project.rootPath,
                cas,
                manifest,
                mode: safe ? "safe" : "hard",
                backupCurrent: safe,
              });

              return {
                content: [{
                  type: "text",
                  text: `💬 NATURAL QUERY EXECUTED: "${query}"\n\n` +
                        `✅ Restored to: ${targetCheckpoint.name}\n` +
                        `🕐 Time: ${targetCheckpoint.createdAt}\n` +
                        `📁 Files: ${res.filesWritten}\n` +
                        `💾 Backup: ${res.backupPath || 'none'}\n\n` +
                        `You are now at this point in time.`
                }]
              };
            } finally {
              lock.release();
            }
          }

          // Show what would happen
          return {
            content: [{
              type: "text",
              text: `💬 NATURAL QUERY: "${query}"\n\n` +
                    `🎯 Found matching checkpoint:\n` +
                    `  Name: ${targetCheckpoint.name}\n` +
                    `  ID: ${targetCheckpoint.checkpointId}\n` +
                    `  Time: ${targetCheckpoint.createdAt}\n` +
                    `  Ago: ${getTimeAgo(new Date(targetCheckpoint.createdAt))}\n\n` +
                    `Interpreted as:\n` +
                    `  Action: ${intent.action}\n` +
                    `  Time: ${JSON.stringify(intent.timeSpec || 'not specified')}\n` +
                    `  Search: ${intent.searchTerm || 'none'}\n\n` +
                    `To execute this restore, run again with execute=true.`
            }]
          };
        }

        case "tm_get_full_context": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const maxMessages = (args as any)?.maxMessages || 20;
          const includeFileList = (args as any)?.includeFileList !== false;
          const includeToolCalls = (args as any)?.includeToolCalls !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          // Build context packet
          const contextPacket = await buildContextPacket({
            repo: opts.repo,
            cas,
            projectId,
            checkpointId,
            maxMessages,
            maxTerminalEvents: 10,
            includeTerminalOutputs: true,
          });

          let fileListSection = "";
          if (includeFileList) {
            const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));
            const fileCount = manifest.files.length;
            const topFiles = manifest.files.slice(0, 20).map(f => `  - ${f.path}`).join('\n');
            fileListSection = `\n\n## Files at this checkpoint (${fileCount} total)\n${topFiles}` +
                              (fileCount > 20 ? `\n  ... and ${fileCount - 20} more` : '');
          }

          let toolCallsSection = "";
          if (includeToolCalls) {
            const toolEvents = opts.repo.listEvents(projectId, "tool.call", 15);
            if (toolEvents.length > 0) {
              const toolLines = toolEvents.map((e, i) => {
                const toolName = e.payload?.toolName || "unknown";
                const success = e.payload?.success ? "✓" : "✗";
                const args = e.payload?.arguments ? JSON.stringify(e.payload.arguments).slice(0, 50) : "";
                return `${i + 1}. ${toolName} ${success} ${args}...`;
              });
              toolCallsSection = `\n\n## Tool Calls Around This Time\n${toolLines.join("\n")}`;
            }
          }

          return {
            content: [{
              type: "text",
              text: `📋 FULL CONTEXT FOR CHECKPOINT\n\n` +
                    `📍 ${checkpoint.name}\n` +
                    `🕐 ${checkpoint.createdAt} (${getTimeAgo(new Date(checkpoint.createdAt))})\n` +
                    `📁 Scope: ${checkpoint.scope}\n\n` +
                    `${'='.repeat(60)}\n\n` +
                    contextPacket + fileListSection + toolCallsSection
            }]
          };
        }

        case "tm_compare_states": {
          const projectId = (args as any)?.projectId;
          let fromId = (args as any)?.fromCheckpointId;
          let toId = (args as any)?.toCheckpointId;
          const fromQuery = (args as any)?.fromQuery;
          const includeConversationDiff = (args as any)?.includeConversationDiff !== false;
          const includeFileDiff = (args as any)?.includeFileDiff !== false;
          const includeActionSummary = (args as any)?.includeActionSummary !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);

          // Resolve from checkpoint
          if (!fromId && fromQuery) {
            const match = checkpoints.find(cp => cp.name.toLowerCase().includes(fromQuery.toLowerCase()));
            if (match) fromId = match.checkpointId;
          }
          if (!fromId && checkpoints.length > 1) {
            fromId = checkpoints[1].checkpointId; // Previous checkpoint
          }

          // Resolve to checkpoint (default: latest)
          if (!toId && checkpoints.length > 0) {
            toId = checkpoints[0].checkpointId;
          }

          if (!fromId || !toId) {
            throw new TmError("TM_INVALID_INPUT", "Could not determine checkpoints to compare");
          }

          const cpFrom = opts.repo.getCheckpoint(projectId, fromId);
          const cpTo = opts.repo.getCheckpoint(projectId, toId);
          if (!cpFrom || !cpTo) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          let output = `⚖️ COMPARE STATES\n\n` +
                       `FROM: ${cpFrom.name}\n` +
                       `  Time: ${cpFrom.createdAt}\n` +
                       `  ID: ${cpFrom.checkpointId}\n\n` +
                       `TO: ${cpTo.name}\n` +
                       `  Time: ${cpTo.createdAt}\n` +
                       `  ID: ${cpTo.checkpointId}\n\n`;

          // File diff
          if (includeFileDiff) {
            const manifestFrom = parseManifestJson(cas.getBytes(cpFrom.manifestBlobHash).toString("utf8"));
            const manifestTo = parseManifestJson(cas.getBytes(cpTo.manifestBlobHash).toString("utf8"));

            const filesFrom = new Map(manifestFrom.files.map(f => [f.path, f.hash]));
            const filesTo = new Map(manifestTo.files.map(f => [f.path, f.hash]));

            const added: string[] = [];
            const deleted: string[] = [];
            const modified: string[] = [];

            for (const [p, h] of filesTo) {
              if (!filesFrom.has(p)) added.push(p);
              else if (filesFrom.get(p) !== h) modified.push(p);
            }
            for (const p of filesFrom.keys()) {
              if (!filesTo.has(p)) deleted.push(p);
            }

            output += `## File Changes\n` +
                      `  Added: ${added.length}\n` +
                      `  Modified: ${modified.length}\n` +
                      `  Deleted: ${deleted.length}\n`;

            if (added.length > 0) output += `\n  Added files:\n${added.slice(0, 10).map(f => `    + ${f}`).join('\n')}`;
            if (modified.length > 0) output += `\n  Modified files:\n${modified.slice(0, 10).map(f => `    ~ ${f}`).join('\n')}`;
            if (deleted.length > 0) output += `\n  Deleted files:\n${deleted.slice(0, 10).map(f => `    - ${f}`).join('\n')}`;
            output += '\n\n';
          }

          // Action summary
          if (includeActionSummary) {
            const fromTime = new Date(cpFrom.createdAt);
            const toTime = new Date(cpTo.createdAt);

            // Get checkpoints between
            const betweenCheckpoints = checkpoints.filter(cp => {
              const t = new Date(cp.createdAt);
              return t > fromTime && t <= toTime;
            });

            output += `## Actions Between\n` +
                      `  Checkpoints created: ${betweenCheckpoints.length}\n`;

            if (betweenCheckpoints.length > 0) {
              output += `\n  Timeline:\n`;
              betweenCheckpoints.slice(0, 10).forEach((cp, i) => {
                output += `    ${i + 1}. ${cp.name} (${getTimeAgo(new Date(cp.createdAt))})\n`;
              });
            }
            output += '\n';
          }

          return {
            content: [{ type: "text", text: output }]
          };
        }

        // ============================================================================
        // AUGMENTED LAYER HANDLERS (Indexing, Search, Context)
        // ============================================================================

        case "tm_index_project": {
          const projectPath = (args as any)?.projectPath || process.cwd();
          const includePatterns = (args as any)?.includePatterns || ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.rs", "**/*.java"];
          const excludePatterns = (args as any)?.excludePatterns || ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/venv/**"];
          const extractSymbols = (args as any)?.extractSymbols !== false;
          const extractComments = (args as any)?.extractComments !== false;

          // Simple indexing - count files and extract basic structure
          const { globSync } = await import("glob");

          interface IndexedFile {
            path: string;
            size: number;
            symbols: string[];
            imports: string[];
          }

          const indexedFiles: IndexedFile[] = [];
          let totalSymbols = 0;
          let totalImports = 0;

          for (const pattern of includePatterns) {
            try {
              const files = globSync(pattern, {
                cwd: projectPath,
                ignore: excludePatterns,
                nodir: true
              });

              for (const file of files.slice(0, 500)) { // Limit to 500 files
                const fullPath = path.join(projectPath, file);
                try {
                  const stat = fs.statSync(fullPath);
                  const content = fs.readFileSync(fullPath, 'utf8');

                  const symbols: string[] = [];
                  const imports: string[] = [];

                  if (extractSymbols) {
                    // Extract function/class definitions (simplified regex)
                    const funcMatch = content.match(/(?:function|async function|const|let|var)\s+(\w+)\s*[=(]/g) || [];
                    const classMatch = content.match(/class\s+(\w+)/g) || [];
                    const exportMatch = content.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g) || [];

                    funcMatch.forEach(m => {
                      const name = m.match(/(\w+)\s*[=(]/)?.[1];
                      if (name && !['if', 'for', 'while', 'switch'].includes(name)) symbols.push(name);
                    });
                    classMatch.forEach(m => {
                      const name = m.match(/class\s+(\w+)/)?.[1];
                      if (name) symbols.push(`class:${name}`);
                    });
                  }

                  // Extract imports
                  const importMatch = content.match(/(?:import|require)\s*\(?['"](.*?)['"]/g) || [];
                  importMatch.forEach(m => {
                    const mod = m.match(/['"](.+?)['"]/)?.[1];
                    if (mod) imports.push(mod);
                  });

                  totalSymbols += symbols.length;
                  totalImports += imports.length;

                  indexedFiles.push({
                    path: file,
                    size: stat.size,
                    symbols,
                    imports
                  });
                } catch (e) {
                  // Skip files that can't be read
                }
              }
            } catch (e) {
              // Skip patterns that fail
            }
          }

          // Store index in memory (in a real implementation, this would go to a database)
          const indexId = `idx_${Date.now()}_${cryptoRandomId()}`;

          return {
            content: [{
              type: "text",
              text: `📚 PROJECT INDEXED\n\n` +
                    `Project: ${projectPath}\n` +
                    `Index ID: ${indexId}\n\n` +
                    `📊 Statistics:\n` +
                    `  Files indexed: ${indexedFiles.length}\n` +
                    `  Symbols found: ${totalSymbols}\n` +
                    `  Imports found: ${totalImports}\n\n` +
                    `📁 File Types:\n` +
                    `  TypeScript: ${indexedFiles.filter(f => f.path.endsWith('.ts')).length}\n` +
                    `  JavaScript: ${indexedFiles.filter(f => f.path.endsWith('.js')).length}\n` +
                    `  Python: ${indexedFiles.filter(f => f.path.endsWith('.py')).length}\n` +
                    `  Other: ${indexedFiles.filter(f => !f.path.match(/\.(ts|js|py)$/)).length}\n\n` +
                    `Ready for search! Use tm_search_code to find code.`
            }]
          };
        }

        case "tm_search_code": {
          const query = (args as any)?.query?.toLowerCase() || "";
          const projectPath = (args as any)?.projectPath || process.cwd();
          const fileTypes = (args as any)?.fileTypes || [];
          const symbolType = (args as any)?.symbolType || "all";
          const maxResults = (args as any)?.maxResults || 10;
          const includeContext = (args as any)?.includeContext !== false;

          const { globSync } = await import("glob");

          interface SearchResult {
            file: string;
            line: number;
            content: string;
            context?: string;
            matchType: "symbol" | "content" | "filename";
          }

          const results: SearchResult[] = [];
          const patterns = fileTypes.length > 0
            ? fileTypes.map((t: string) => `**/*.${t}`)
            : ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.java"];

          for (const pattern of patterns) {
            try {
              const files = globSync(pattern, {
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
                nodir: true
              });

              for (const file of files) {
                if (results.length >= maxResults * 3) break; // Get extra for scoring

                const fullPath = path.join(projectPath, file);
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const lines = content.split('\n');

                  // Filename match
                  if (file.toLowerCase().includes(query)) {
                    results.push({
                      file,
                      line: 1,
                      content: `[File: ${file}]`,
                      matchType: "filename"
                    });
                  }

                  // Content search
                  lines.forEach((line, i) => {
                    if (line.toLowerCase().includes(query)) {
                      let context = "";
                      if (includeContext) {
                        const start = Math.max(0, i - 2);
                        const end = Math.min(lines.length, i + 3);
                        context = lines.slice(start, end).map((l, j) =>
                          `${start + j + 1}: ${l}`
                        ).join('\n');
                      }

                      // Check if it's a symbol definition
                      const isSymbol = /(?:function|class|const|let|var|def|type|interface)\s/.test(line);

                      if (symbolType === "all" ||
                          (symbolType === "function" && /function|def/.test(line)) ||
                          (symbolType === "class" && /class/.test(line)) ||
                          (symbolType === "variable" && /const|let|var/.test(line)) ||
                          (symbolType === "interface" && /interface/.test(line)) ||
                          (symbolType === "type" && /type\s/.test(line))) {

                        results.push({
                          file,
                          line: i + 1,
                          content: line.trim().slice(0, 100),
                          context,
                          matchType: isSymbol ? "symbol" : "content"
                        });
                      }
                    }
                  });
                } catch (e) {
                  // Skip unreadable files
                }
              }
            } catch (e) {
              // Skip failed patterns
            }
          }

          // Sort: symbols first, then content, then filename
          const sortedResults = results
            .sort((a, b) => {
              const order = { symbol: 0, content: 1, filename: 2 };
              return order[a.matchType] - order[b.matchType];
            })
            .slice(0, maxResults);

          if (sortedResults.length === 0) {
            return {
              content: [{
                type: "text",
                text: `🔎 SEARCH CODE\n\nQuery: "${query}"\nNo results found.\n\nTry:\n- Different keywords\n- Broader file types\n- Checking the project path`
              }]
            };
          }

          const resultText = sortedResults.map((r, i) => {
            let text = `${i + 1}. [${r.matchType.toUpperCase()}] ${r.file}:${r.line}\n   ${r.content}`;
            if (r.context && includeContext) {
              text += `\n\n   Context:\n${r.context.split('\n').map(l => '   ' + l).join('\n')}`;
            }
            return text;
          }).join('\n\n---\n\n');

          return {
            content: [{
              type: "text",
              text: `🔎 SEARCH CODE RESULTS\n\nQuery: "${query}"\nFound: ${sortedResults.length} results\n\n${resultText}`
            }]
          };
        }

        case "tm_find_definition": {
          const symbol = (args as any)?.symbol || "";
          const projectPath = (args as any)?.projectPath || process.cwd();
          const fileTypes = (args as any)?.fileTypes || ["ts", "js", "py", "go", "java"];
          const includeSourceCode = (args as any)?.includeSourceCode !== false;

          const { globSync } = await import("glob");

          interface Definition {
            file: string;
            line: number;
            type: string;
            code: string;
          }

          const definitions: Definition[] = [];

          for (const ext of fileTypes) {
            try {
              const files = globSync(`**/*.${ext}`, {
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
                nodir: true
              });

              for (const file of files) {
                const fullPath = path.join(projectPath, file);
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const lines = content.split('\n');

                  // Definition patterns for different languages
                  const patterns = [
                    { regex: new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${symbol}\\s*[(<]`, 'i'), type: 'function' },
                    { regex: new RegExp(`(?:export\\s+)?class\\s+${symbol}\\s*[{<]`, 'i'), type: 'class' },
                    { regex: new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${symbol}\\s*[=:]`, 'i'), type: 'variable' },
                    { regex: new RegExp(`(?:export\\s+)?interface\\s+${symbol}\\s*[{<]`, 'i'), type: 'interface' },
                    { regex: new RegExp(`(?:export\\s+)?type\\s+${symbol}\\s*[=<]`, 'i'), type: 'type' },
                    { regex: new RegExp(`def\\s+${symbol}\\s*\\(`, 'i'), type: 'function' }, // Python
                    { regex: new RegExp(`func\\s+${symbol}\\s*\\(`, 'i'), type: 'function' }, // Go
                  ];

                  lines.forEach((line, i) => {
                    for (const { regex, type } of patterns) {
                      if (regex.test(line)) {
                        let code = line.trim();
                        if (includeSourceCode) {
                          // Get the full definition (up to 20 lines or closing brace)
                          const codeLines = [line];
                          let braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                          let j = i + 1;
                          while (j < lines.length && j < i + 20 && braceCount > 0) {
                            codeLines.push(lines[j]);
                            braceCount += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
                            j++;
                          }
                          if (braceCount === 0 && codeLines.length > 1) {
                            code = codeLines.join('\n');
                          }
                        }

                        definitions.push({
                          file,
                          line: i + 1,
                          type,
                          code: code.slice(0, 500) // Limit code length
                        });
                        break;
                      }
                    }
                  });
                } catch (e) {
                  // Skip unreadable files
                }
              }
            } catch (e) {
              // Skip failed patterns
            }
          }

          if (definitions.length === 0) {
            return {
              content: [{
                type: "text",
                text: `📍 FIND DEFINITION\n\nSymbol: "${symbol}"\nNo definitions found.\n\nTry:\n- Checking spelling\n- Different file types\n- The symbol might be imported from node_modules`
              }]
            };
          }

          const defText = definitions.map((d, i) => {
            let text = `${i + 1}. [${d.type.toUpperCase()}] ${d.file}:${d.line}`;
            if (includeSourceCode) {
              text += `\n\n\`\`\`\n${d.code}\n\`\`\``;
            }
            return text;
          }).join('\n\n---\n\n');

          return {
            content: [{
              type: "text",
              text: `📍 FIND DEFINITION\n\nSymbol: "${symbol}"\nFound: ${definitions.length} definition(s)\n\n${defText}`
            }]
          };
        }

        case "tm_find_usages": {
          const symbol = (args as any)?.symbol || "";
          const projectPath = (args as any)?.projectPath || process.cwd();
          const fileTypes = (args as any)?.fileTypes || ["ts", "js", "py", "go", "java"];
          const maxResults = (args as any)?.maxResults || 25;
          const groupByFile = (args as any)?.groupByFile !== false;

          const { globSync } = await import("glob");

          interface Usage {
            file: string;
            line: number;
            content: string;
          }

          const usages: Usage[] = [];

          for (const ext of fileTypes) {
            try {
              const files = globSync(`**/*.${ext}`, {
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
                nodir: true
              });

              for (const file of files) {
                if (usages.length >= maxResults * 2) break;

                const fullPath = path.join(projectPath, file);
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const lines = content.split('\n');

                  // Word boundary regex to find actual usages
                  const regex = new RegExp(`\\b${symbol}\\b`, 'g');

                  lines.forEach((line, i) => {
                    if (regex.test(line)) {
                      usages.push({
                        file,
                        line: i + 1,
                        content: line.trim().slice(0, 100)
                      });
                    }
                  });
                } catch (e) {
                  // Skip unreadable files
                }
              }
            } catch (e) {
              // Skip failed patterns
            }
          }

          if (usages.length === 0) {
            return {
              content: [{
                type: "text",
                text: `🔗 FIND USAGES\n\nSymbol: "${symbol}"\nNo usages found.`
              }]
            };
          }

          const limitedUsages = usages.slice(0, maxResults);
          let resultText: string;

          if (groupByFile) {
            const byFile = new Map<string, Usage[]>();
            limitedUsages.forEach(u => {
              if (!byFile.has(u.file)) byFile.set(u.file, []);
              byFile.get(u.file)!.push(u);
            });

            resultText = Array.from(byFile.entries()).map(([file, fileUsages]) => {
              const usageLines = fileUsages.map(u => `  Line ${u.line}: ${u.content}`).join('\n');
              return `📄 ${file} (${fileUsages.length} usages)\n${usageLines}`;
            }).join('\n\n');
          } else {
            resultText = limitedUsages.map((u, i) =>
              `${i + 1}. ${u.file}:${u.line}\n   ${u.content}`
            ).join('\n\n');
          }

          return {
            content: [{
              type: "text",
              text: `🔗 FIND USAGES\n\nSymbol: "${symbol}"\nFound: ${usages.length} usages (showing ${limitedUsages.length})\n\n${resultText}`
            }]
          };
        }

        case "tm_get_project_structure": {
          const projectPath = (args as any)?.projectPath || process.cwd();
          const maxDepth = (args as any)?.maxDepth || 4;
          const includeFiles = (args as any)?.includeFiles !== false;
          const excludePatterns = (args as any)?.excludePatterns || ["node_modules", ".git", "dist", "__pycache__", "venv"];
          const analyzeEntryPoints = (args as any)?.analyzeEntryPoints !== false;
          const analyzeExports = (args as any)?.analyzeExports !== false;

          interface TreeNode {
            name: string;
            type: "dir" | "file";
            children?: TreeNode[];
          }

          function buildTree(dir: string, depth: number): TreeNode | null {
            if (depth > maxDepth) return null;

            const name = path.basename(dir) || dir;
            if (excludePatterns.some((p: string) => name === p || name.startsWith('.'))) return null;

            try {
              const stat = fs.statSync(dir);
              if (stat.isFile()) {
                return includeFiles ? { name, type: "file" } : null;
              }

              const children: TreeNode[] = [];
              const entries = fs.readdirSync(dir);

              for (const entry of entries.sort()) {
                const child = buildTree(path.join(dir, entry), depth + 1);
                if (child) children.push(child);
              }

              if (children.length === 0 && !includeFiles) return null;
              return { name, type: "dir", children };
            } catch (e) {
              return null;
            }
          }

          function renderTree(node: TreeNode, prefix: string = ""): string {
            const lines: string[] = [];
            const icon = node.type === "dir" ? "📁" : "📄";
            lines.push(`${prefix}${icon} ${node.name}`);

            if (node.children) {
              node.children.forEach((child, i) => {
                const isLast = i === node.children!.length - 1;
                const newPrefix = prefix + (isLast ? "   " : "│  ");
                lines.push(renderTree(child, newPrefix));
              });
            }
            return lines.join('\n');
          }

          const tree = buildTree(projectPath, 0);
          const treeText = tree ? renderTree(tree) : "Unable to build tree";

          // Find entry points
          let entryPoints = "";
          if (analyzeEntryPoints) {
            const pkgPath = path.join(projectPath, "package.json");
            if (fs.existsSync(pkgPath)) {
              try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                entryPoints = `\n📦 Package: ${pkg.name || 'unnamed'}\n`;
                if (pkg.main) entryPoints += `  Main: ${pkg.main}\n`;
                if (pkg.module) entryPoints += `  Module: ${pkg.module}\n`;
                if (pkg.bin) entryPoints += `  Bin: ${JSON.stringify(pkg.bin)}\n`;
                if (pkg.scripts) {
                  entryPoints += `  Scripts: ${Object.keys(pkg.scripts).slice(0, 5).join(', ')}\n`;
                }
              } catch (e) { /* ignore */ }
            }
          }

          // Count files by type
          const { globSync } = await import("glob");
          let fileStats = "";
          try {
            const tsFiles = globSync("**/*.ts", { cwd: projectPath, ignore: excludePatterns.map((p: string) => `**/${p}/**`) }).length;
            const jsFiles = globSync("**/*.js", { cwd: projectPath, ignore: excludePatterns.map((p: string) => `**/${p}/**`) }).length;
            const pyFiles = globSync("**/*.py", { cwd: projectPath, ignore: excludePatterns.map((p: string) => `**/${p}/**`) }).length;
            const mdFiles = globSync("**/*.md", { cwd: projectPath, ignore: excludePatterns.map((p: string) => `**/${p}/**`) }).length;

            fileStats = `\n📊 File Statistics:\n` +
                        `  TypeScript: ${tsFiles}\n` +
                        `  JavaScript: ${jsFiles}\n` +
                        `  Python: ${pyFiles}\n` +
                        `  Markdown: ${mdFiles}\n`;
          } catch (e) { /* ignore */ }

          return {
            content: [{
              type: "text",
              text: `🌳 PROJECT STRUCTURE\n\nPath: ${projectPath}\n${entryPoints}${fileStats}\n📂 Directory Tree:\n\n${treeText}`
            }]
          };
        }

        case "tm_universal_search": {
          const query = (args as any)?.query?.toLowerCase() || "";
          const projectPath = (args as any)?.projectPath || process.cwd();
          const projectId = (args as any)?.projectId;
          const searchIn = (args as any)?.searchIn || ["code", "checkpoints", "conversations", "kb"];
          const includeKb = (args as any)?.includeKb !== false;
          const maxResults = (args as any)?.maxResults || 20;

          interface UniversalResult {
            source: string;
            title: string;
            snippet: string;
            location: string;
            timestamp?: string;
          }

          const results: UniversalResult[] = [];

          // Search in code
          if (searchIn.includes("code")) {
            const { globSync } = await import("glob");
            try {
              const files = globSync("**/*.{ts,js,py,go,java,md}", {
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
                nodir: true
              }).slice(0, 100);

              for (const file of files) {
                const fullPath = path.join(projectPath, file);
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(query)) {
                      results.push({
                        source: "code",
                        title: file,
                        snippet: lines[i].trim().slice(0, 80),
                        location: `${file}:${i + 1}`
                      });
                      if (results.filter(r => r.source === "code").length >= maxResults / 2) break;
                    }
                  }
                } catch (e) { /* skip */ }
                if (results.filter(r => r.source === "code").length >= maxResults / 2) break;
              }
            } catch (e) { /* skip */ }
          }

          // Search in checkpoints
          if (searchIn.includes("checkpoints") && projectId) {
            try {
              const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 50);
              for (const cp of checkpoints) {
                if (cp.name.toLowerCase().includes(query)) {
                  results.push({
                    source: "checkpoint",
                    title: cp.name,
                    snippet: `Checkpoint: ${cp.scope}`,
                    location: cp.checkpointId,
                    timestamp: cp.createdAt
                  });
                  if (results.filter(r => r.source === "checkpoint").length >= maxResults / 3) break;
                }
              }
            } catch (e) { /* skip */ }
          }

          // Search in conversations
          if (searchIn.includes("conversations") && projectId) {
            try {
              const events = opts.repo.listEvents(projectId, "chat.message", 200);
	              const chatEvents = events.filter((e: any) => e.type === "chat.message");

	              for (const event of chatEvents) {
	                const content = readPayloadString(event.payload, "content");
	                const role = readPayloadString(event.payload, "role") || "message";
	                if (content.toLowerCase().includes(query)) {
	                  results.push({
	                    source: "conversation",
	                    title: `${role}: ${content.slice(0, 40)}...`,
	                    snippet: content.slice(0, 100),
	                    location: event.id ?? event.eventId,
	                    timestamp: event.timestamp
	                  });
                  if (results.filter(r => r.source === "conversation").length >= maxResults / 3) break;
                }
              }
            } catch (e) { /* skip */ }
          }

          // Search in knowledge base (cloud)
          if (includeKb && searchIn.includes("kb")) {
            try {
              const { createCloudSyncClient } = await import("../cloud/sync-client.js");
              const client = createCloudSyncClient();
              if (client) {
                const kb = await client.unifiedKnowledgeBaseSearch(query, { limit: maxResults });
                const kbResults: UniversalResult[] = [];

                (kb.files || []).forEach((f: any) => {
                  kbResults.push({
                    source: "kb",
                    title: f.file_path || f.id,
                    snippet: (f.snippet || "").slice(0, 120),
                    location: f.repository_id || "kb",
                  });
                });

                (kb.artifacts || []).forEach((a: any) => {
                  kbResults.push({
                    source: "kb",
                    title: `artifact:${a.type || "unknown"}`,
                    snippet: `format=${a.format || "unknown"} storage=${a.storage || "db"}`,
                    location: a.id,
                  });
                });

                (kb.embeddings || []).forEach((e: any) => {
                  kbResults.push({
                    source: "kb",
                    title: e.symbol ? `${e.symbol} (${e.symbol_type || "symbol"})` : (e.file_path || e.id),
                    snippet: (e.snippet || "").slice(0, 120),
                    location: e.file_path || e.id,
                  });
                });

                results.push(...kbResults.slice(0, Math.max(1, Math.floor(maxResults / 3))));
              }
            } catch (e) { /* skip */ }
          }

          if (results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `🌐 UNIVERSAL SEARCH\n\nQuery: "${query}"\nNo results found in: ${searchIn.join(", ")}`
              }]
            };
          }

          const resultText = results.slice(0, maxResults).map((r, i) => {
            const icon = r.source === "code" ? "📄" : r.source === "checkpoint" ? "🕐" : r.source === "kb" ? "📚" : "💬";
            let text = `${i + 1}. ${icon} [${r.source.toUpperCase()}] ${r.title}\n   ${r.snippet}`;
            if (r.timestamp) text += `\n   Time: ${r.timestamp}`;
            return text;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `🌐 UNIVERSAL SEARCH\n\nQuery: "${query}"\nFound: ${results.length} results\n\n${resultText}`
            }]
          };
        }

        case "tm_search_history": {
          const projectId = (args as any)?.projectId;
          const query = (args as any)?.query?.toLowerCase() || "";
          const searchType = (args as any)?.searchType || "all";
          const maxResults = (args as any)?.maxResults || 15;
          const sortBy = (args as any)?.sortBy || "relevance";

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);

          interface HistoryResult {
            checkpoint: typeof checkpoints[0];
            matchType: string;
            score: number;
          }

          const results: HistoryResult[] = [];

          for (const cp of checkpoints) {
            let score = 0;
            let matchType = "";

            // Search in description
            if ((searchType === "all" || searchType === "description") &&
                cp.name.toLowerCase().includes(query)) {
              score += 10;
              matchType = "description";
            }

            // Search in file manifest (if available)
            if (searchType === "all" || searchType === "filename" || searchType === "content") {
              try {
                const manifestBuf = cas.getBytes(cp.manifestBlobHash);
                const manifest = parseManifestJson(manifestBuf.toString("utf8"));

                for (const entry of manifest.files) {
                  if (entry.path.toLowerCase().includes(query)) {
                    score += 5;
                    matchType = matchType || "filename";
                    break;
                  }
                }
              } catch (e) { /* skip */ }
            }

            if (score > 0) {
              results.push({ checkpoint: cp, matchType, score });
            }
          }

          // Sort
          if (sortBy === "relevance") {
            results.sort((a, b) => b.score - a.score);
          } else {
            results.sort((a, b) => new Date(b.checkpoint.createdAt).getTime() - new Date(a.checkpoint.createdAt).getTime());
          }

          const limited = results.slice(0, maxResults);

          if (limited.length === 0) {
            return {
              content: [{
                type: "text",
                text: `📜 SEARCH HISTORY\n\nQuery: "${query}"\nNo matching checkpoints found.`
              }]
            };
          }

          const resultText = limited.map((r, i) => {
            const ago = getTimeAgo(new Date(r.checkpoint.createdAt));
            return `${i + 1}. ${r.checkpoint.name} (${ago})\n` +
                   `   ID: ${r.checkpoint.checkpointId}\n` +
                   `   Match: ${r.matchType}, Score: ${r.score}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `📜 SEARCH HISTORY\n\nQuery: "${query}"\nFound: ${results.length} checkpoints\n\n${resultText}`
            }]
          };
        }

        case "tm_search_conversations": {
          const query = (args as any)?.query?.toLowerCase() || "";
          const projectId = (args as any)?.projectId;
          const role = (args as any)?.role || "all";
          const maxResults = (args as any)?.maxResults || 15;
          const includeContext = (args as any)?.includeContext !== false;

          // Get all projects if no specific one
          const projectIds = projectId ? [projectId] : opts.repo.listProjects().map(p => p.projectId);

          interface ConvResult {
            projectId: string;
            message: any;
            context: any[];
          }

          const results: ConvResult[] = [];

          for (const pid of projectIds) {
            try {
              const events = opts.repo.listEvents(pid, "chat.message", 500);
              const chatEvents = events.filter((e: any) => e.type === "chat.message");

              chatEvents.forEach((event: any, i: number) => {
                const payload = event.payload as any;
                const content = payload?.content || "";
                const msgRole = payload?.role || "unknown";

                if ((role === "all" || role === msgRole) && content.toLowerCase().includes(query)) {
                  const context: any[] = [];
                  if (includeContext) {
                    // Get 2 messages before and after
                    for (let j = Math.max(0, i - 2); j <= Math.min(chatEvents.length - 1, i + 2); j++) {
                      if (j !== i) {
                        const ctxPayload = chatEvents[j].payload as any;
                        context.push({
                          role: ctxPayload?.role,
                          content: ctxPayload?.content?.slice(0, 80)
                        });
                      }
                    }
                  }

                  results.push({
                    projectId: pid,
                    message: { ...payload, timestamp: event.timestamp },
                    context
                  });
                }
              });
            } catch (e) { /* skip */ }
          }

          if (results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `💬 SEARCH CONVERSATIONS\n\nQuery: "${query}"\nNo matching messages found.`
              }]
            };
          }

          const limited = results.slice(0, maxResults);
          const resultText = limited.map((r, i) => {
            let text = `${i + 1}. [${r.message.role?.toUpperCase()}] ${r.message.content?.slice(0, 100)}...\n` +
                       `   Project: ${r.projectId}\n` +
                       `   Time: ${r.message.timestamp}`;
            if (includeContext && r.context.length > 0) {
              text += `\n   Context:\n${r.context.map(c => `     ${c.role}: ${c.content}...`).join('\n')}`;
            }
            return text;
          }).join('\n\n---\n\n');

          return {
            content: [{
              type: "text",
              text: `💬 SEARCH CONVERSATIONS\n\nQuery: "${query}"\nFound: ${results.length} messages\n\n${resultText}`
            }]
          };
        }

        case "tm_save_context": {
          const projectId = (args as any)?.projectId;
          const name = (args as any)?.name || "unnamed-context";
          const description = (args as any)?.description || "";
          const tags = (args as any)?.tags || [];
          const includeConversation = (args as any)?.includeConversation !== false;
          const includeCheckpoint = (args as any)?.includeCheckpoint !== false;
          const maxMessages = (args as any)?.maxMessages || 30;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          // Gather context data
          const contextData: any = {
            id: `ctx_${Date.now()}_${cryptoRandomId()}`,
            name,
            description,
            tags,
            projectId,
            createdAt: new Date().toISOString(),
            conversation: [] as any[],
            checkpointId: null as string | null
          };

          // Get recent conversation
          if (includeConversation) {
            const events = opts.repo.listEvents(projectId, "chat.message", maxMessages * 2);
            const chatEvents = events.slice(0, maxMessages);
            contextData.conversation = chatEvents.map((e: any) => ({
              role: (e.payload as any)?.role,
              content: (e.payload as any)?.content,
              timestamp: e.timestamp
            }));
          }

          // Create checkpoint
          if (includeCheckpoint) {
            const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
            const { manifest } = await buildManifest(project.rootPath, cas, { ignore: ignoreMatcher });

            const manifestJson = JSON.stringify(manifest, null, 2);
            const manifestRef = cas.putBytes("application/json", Buffer.from(manifestJson, "utf8"));
            const rootTreeHash = persistCheckpointTrees(opts.repo, projectId, manifest.files);

            const cpId = `ctx_cp_${Date.now()}_${cryptoRandomId()}`;
            opts.repo.insertCheckpoint({
              checkpointId: cpId,
              projectId,
              name: `Context: ${name}`,
              manifestBlobHash: manifestRef.hash,
              rootTreeHash,
              scope: "full",
            });

            contextData.checkpointId = cpId;
          }

          // Store context (in a real implementation, this would go to database)
          const contextPath = path.join(opts.dataDir, "contexts", `${contextData.id}.json`);
          fs.mkdirSync(path.dirname(contextPath), { recursive: true });
          fs.writeFileSync(contextPath, JSON.stringify(contextData, null, 2));

          return {
            content: [{
              type: "text",
              text: `💾 CONTEXT SAVED\n\n` +
                    `ID: ${contextData.id}\n` +
                    `Name: ${name}\n` +
                    `Description: ${description}\n` +
                    `Tags: ${tags.join(", ") || "none"}\n\n` +
                    `📝 Conversation: ${contextData.conversation.length} messages\n` +
                    `🕐 Checkpoint: ${contextData.checkpointId || "not created"}\n\n` +
                    `Use tm_load_context with ID "${contextData.id}" to restore.`
            }]
          };
        }

        case "tm_load_context": {
          const contextId = (args as any)?.contextId;
          const restoreFiles = (args as any)?.restoreFiles || false;
          const safe = (args as any)?.safe !== false;

          // Load context
          const contextPath = path.join(opts.dataDir, "contexts", `${contextId}.json`);
          if (!fs.existsSync(contextPath)) {
            throw new TmError("TM_FILE_NOT_FOUND", `Context ${contextId} not found`);
          }

          const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));

          let restoreInfo = "";
          if (restoreFiles && contextData.checkpointId) {
            const project = opts.repo.getProject(contextData.projectId);
            if (project) {
              const checkpoint = opts.repo.getCheckpoint(contextData.projectId, contextData.checkpointId);
              if (checkpoint) {
                const lock = new ProjectLock(project.rootPath);
                lock.acquire();
                try {
                  const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
                  const manifest = parseManifestJson(manifestBuf.toString("utf8"));

                  const res = restoreWorkspaceAtomic({
                    projectRoot: project.rootPath,
                    cas,
                    manifest,
                    mode: safe ? "safe" : "hard",
                    backupCurrent: safe,
                  });

                  restoreInfo = `\n✅ Files restored: ${res.filesWritten}`;
                  if (res.backupPath) restoreInfo += `\n📦 Backup: ${res.backupPath}`;
                } finally {
                  lock.release();
                }
              }
            }
          }

          // Format conversation
          const convSummary = contextData.conversation?.length > 0
            ? contextData.conversation.map((m: any) =>
                `[${m.role}] ${m.content?.slice(0, 100)}...`
              ).join('\n')
            : "No conversation saved";

          return {
            content: [{
              type: "text",
              text: `📂 CONTEXT LOADED\n\n` +
                    `Name: ${contextData.name}\n` +
                    `Description: ${contextData.description}\n` +
                    `Created: ${contextData.createdAt}\n` +
                    `Tags: ${contextData.tags?.join(", ") || "none"}\n${restoreInfo}\n\n` +
                    `📝 Conversation (${contextData.conversation?.length || 0} messages):\n${convSummary}`
            }]
          };
        }

        case "tm_list_contexts": {
          const projectId = (args as any)?.projectId;
          const tags = (args as any)?.tags || [];
          const limit = (args as any)?.limit || 20;
          const sortBy = (args as any)?.sortBy || "date";

          const contextsDir = path.join(opts.dataDir, "contexts");
          if (!fs.existsSync(contextsDir)) {
            return {
              content: [{
                type: "text",
                text: `📋 SAVED CONTEXTS\n\nNo contexts saved yet.\n\nUse tm_save_context to create one.`
              }]
            };
          }

          const files = fs.readdirSync(contextsDir).filter(f => f.endsWith('.json'));
          const contexts: any[] = [];

          for (const file of files) {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(contextsDir, file), 'utf8'));

              // Filter by project
              if (projectId && data.projectId !== projectId) continue;

              // Filter by tags
              if (tags.length > 0 && !tags.some((t: string) => data.tags?.includes(t))) continue;

              contexts.push(data);
            } catch (e) { /* skip */ }
          }

          // Sort
          if (sortBy === "date") {
            contexts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          } else {
            contexts.sort((a, b) => a.name.localeCompare(b.name));
          }

          const limited = contexts.slice(0, limit);

          if (limited.length === 0) {
            return {
              content: [{
                type: "text",
                text: `📋 SAVED CONTEXTS\n\nNo contexts found matching criteria.`
              }]
            };
          }

          const listText = limited.map((c, i) => {
            const ago = getTimeAgo(new Date(c.createdAt));
            return `${i + 1}. ${c.name} (${ago})\n` +
                   `   ID: ${c.id}\n` +
                   `   Tags: ${c.tags?.join(", ") || "none"}\n` +
                   `   Messages: ${c.conversation?.length || 0}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `📋 SAVED CONTEXTS\n\nFound: ${contexts.length} contexts\n\n${listText}`
            }]
          };
        }

        case "tm_explain_code": {
          const filePath = (args as any)?.filePath;
          const startLine = (args as any)?.startLine;
          const endLine = (args as any)?.endLine;
          const symbol = (args as any)?.symbol;
          const detailLevel = (args as any)?.detailLevel || "detailed";

          if (!fs.existsSync(filePath)) {
            throw new TmError("TM_FILE_NOT_FOUND", `File not found: ${filePath}`);
          }

          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');

          let codeToExplain: string;
          let lineInfo: string;

          if (symbol) {
            // Find symbol definition
            const symbolRegex = new RegExp(`(?:function|class|const|let|var|def)\\s+${symbol}\\s*[({<=]`);
            let foundLine = -1;
            for (let i = 0; i < lines.length; i++) {
              if (symbolRegex.test(lines[i])) {
                foundLine = i;
                break;
              }
            }

            if (foundLine === -1) {
              throw new TmError("TM_INVALID_INPUT", `Symbol "${symbol}" not found in file`);
            }

            // Extract the full definition
            let braceCount = 0;
            let endIdx = foundLine;
            for (let i = foundLine; i < Math.min(lines.length, foundLine + 50); i++) {
              braceCount += (lines[i].match(/[{(]/g) || []).length;
              braceCount -= (lines[i].match(/[})]/g) || []).length;
              endIdx = i;
              if (braceCount <= 0 && i > foundLine) break;
            }

            codeToExplain = lines.slice(foundLine, endIdx + 1).join('\n');
            lineInfo = `Lines ${foundLine + 1}-${endIdx + 1}`;
          } else if (startLine && endLine) {
            codeToExplain = lines.slice(startLine - 1, endLine).join('\n');
            lineInfo = `Lines ${startLine}-${endLine}`;
          } else {
            codeToExplain = content.slice(0, 2000);
            lineInfo = `Full file (${lines.length} lines)`;
          }

          // Generate explanation based on detail level
          const ext = path.extname(filePath).slice(1);
          const language = { ts: "TypeScript", js: "JavaScript", py: "Python", go: "Go", java: "Java" }[ext] || "code";

          // Simple code analysis
          const imports = (codeToExplain.match(/(?:import|require|from)\s+['"]([^'"]+)['"]/g) || []).length;
          const functions = (codeToExplain.match(/(?:function|async function|def|func)\s+\w+/g) || []).length;
          const classes = (codeToExplain.match(/class\s+\w+/g) || []).length;
          const exports = (codeToExplain.match(/export\s+(?:default\s+)?(?:function|class|const)/g) || []).length;

          let explanation = `📖 CODE EXPLANATION\n\n`;
          explanation += `File: ${filePath}\n`;
          explanation += `${lineInfo}\n`;
          explanation += `Language: ${language}\n\n`;

          if (detailLevel === "brief") {
            explanation += `Quick overview:\n`;
            explanation += `- Imports: ${imports}\n`;
            explanation += `- Functions: ${functions}\n`;
            explanation += `- Classes: ${classes}\n`;
            explanation += `- Exports: ${exports}\n`;
          } else {
            explanation += `Code Structure:\n`;
            explanation += `- ${imports} imports/requires\n`;
            explanation += `- ${functions} functions defined\n`;
            explanation += `- ${classes} classes defined\n`;
            explanation += `- ${exports} exports\n\n`;

            if (detailLevel === "comprehensive") {
              explanation += `Code Preview:\n\`\`\`${ext}\n${codeToExplain.slice(0, 1000)}\n\`\`\`\n`;
            }
          }

          return {
            content: [{
              type: "text",
              text: explanation
            }]
          };
        }

        case "tm_suggest_fix": {
          const projectId = (args as any)?.projectId;
          const error = (args as any)?.error || "";
          const filePath = (args as any)?.filePath;
          const stackTrace = (args as any)?.stackTrace;
          const searchHistory = (args as any)?.searchHistory !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          interface Suggestion {
            type: string;
            description: string;
            checkpoint?: string;
            confidence: number;
          }

          const suggestions: Suggestion[] = [];

          // Analyze error type
          const errorLower = error.toLowerCase();
          const errorTypes = [
            { pattern: "cannot find module", type: "missing_dependency", fix: "Check if the module is installed (npm install)" },
            { pattern: "is not a function", type: "type_error", fix: "Check if the function exists and is exported correctly" },
            { pattern: "undefined", type: "null_reference", fix: "Add null checks or initialize the variable" },
            { pattern: "enoent", type: "file_not_found", fix: "Verify the file path exists" },
            { pattern: "syntaxerror", type: "syntax", fix: "Check for missing brackets, commas, or quotes" },
            { pattern: "typeerror", type: "type_mismatch", fix: "Verify types match expectations" },
            { pattern: "permission denied", type: "permissions", fix: "Check file/folder permissions" },
            { pattern: "connection refused", type: "network", fix: "Verify service is running and port is correct" },
          ];

          for (const et of errorTypes) {
            if (errorLower.includes(et.pattern)) {
              suggestions.push({
                type: et.type,
                description: et.fix,
                confidence: 0.8
              });
            }
          }

          // Search history for similar errors and their fixes
          if (searchHistory) {
            const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 50);

            for (const cp of checkpoints) {
              // Look for checkpoints that mention fixing similar errors
              const errorFirstWord = error.split(' ')[0].toLowerCase();
              if (cp.name.toLowerCase().includes("fix") &&
                  cp.name.toLowerCase().includes(errorFirstWord)) {
                suggestions.push({
                  type: "historical_fix",
                  description: `Similar error was fixed at: ${cp.name}`,
                  checkpoint: cp.checkpointId,
                  confidence: 0.6
                });
              }
            }
          }

          // Extract file from stack trace if provided
          let affectedFile = filePath;
          if (!affectedFile && stackTrace) {
            const fileMatch = stackTrace.match(/at\s+(?:.+?\s+\()?([^:]+):(\d+)/);
            if (fileMatch) {
              affectedFile = fileMatch[1];
            }
          }

          if (suggestions.length === 0) {
            suggestions.push({
              type: "general",
              description: "No specific fix found. Try:\n" +
                          "1. Check recent changes with tm_show_changes\n" +
                          "2. Compare with working state using tm_compare_states\n" +
                          "3. Restore to last working checkpoint",
              confidence: 0.3
            });
          }

          const suggestionsText = suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .map((s, i) => {
              let text = `${i + 1}. [${(s.confidence * 100).toFixed(0)}% confidence] ${s.type.toUpperCase()}\n   ${s.description}`;
              if (s.checkpoint) {
                text += `\n   → Use tm_restore with checkpointId="${s.checkpoint}" to restore`;
              }
              return text;
            }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `🔧 SUGGEST FIX\n\n` +
                    `Error: "${error.slice(0, 100)}..."\n` +
                    `${affectedFile ? `File: ${affectedFile}\n` : ''}\n` +
                    `💡 Suggestions:\n\n${suggestionsText}`
            }]
          };
        }

        // ============================================================================
        // END TIME MACHINE EXPERIENCE HANDLERS
        // ============================================================================

        case "tm_show_timeline": {
          const projectId = (args as any)?.projectId;
          const limit = (args as any)?.limit || 20;
          const format = (args as any)?.format || "detailed";

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);

          if (format === "compact") {
            const lines = checkpoints.map((cp, i) => {
              const date = new Date(cp.createdAt);
              const ago = getTimeAgo(date);
              return `${i + 1}. ${cp.checkpointId.slice(0, 12)} - ${cp.name} (${ago})`;
            });
            
            return {
              content: [{
                type: "text",
                text: `📅 TIMELINE (${checkpoints.length} checkpoints)\n\n` + lines.join('\n')
              }]
            };
          }

          // Detailed format
          const lines = checkpoints.map((cp, i) => {
            const date = new Date(cp.createdAt);
            const ago = getTimeAgo(date);
            return `\n${'='.repeat(60)}\n` +
                   `📍 Checkpoint ${i + 1}\n` +
                   `   ID: ${cp.checkpointId}\n` +
                   `   Name: ${cp.name}\n` +
                   `   Created: ${date.toLocaleString()} (${ago})\n` +
                   `   Scope: ${cp.scope}`;
          });

          return {
            content: [{
              type: "text",
              text: `📅 TIME MACHINE TIMELINE\n` +
                    `Showing ${checkpoints.length} most recent checkpoints\n` +
                    lines.join('\n') +
                    `\n${'='.repeat(60)}\n\n` +
                    `Use tm_go_back with a checkpoint ID to restore.`
            }]
          };
        }

        case "tm_what_changed": {
          const projectId = (args as any)?.projectId;
          const fromId = (args as any)?.fromCheckpointId;
          const toId = (args as any)?.toCheckpointId;
          const showContent = (args as any)?.showFileContent;

          if (!fromId) {
            throw new TmError("TM_INVALID_INPUT", "fromCheckpointId required");
          }

          const cpFrom = opts.repo.getCheckpoint(projectId, fromId);
          if (!cpFrom) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "From checkpoint not found");

          let cpTo;
          if (toId) {
            cpTo = opts.repo.getCheckpoint(projectId, toId);
            if (!cpTo) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "To checkpoint not found");
          } else {
            // Compare with current state
            const all = opts.repo.listCheckpointsNewestFirst(projectId, 1);
            cpTo = all[0];
          }

          const manifestFrom = parseManifestJson(cas.getBytes(cpFrom.manifestBlobHash).toString("utf8"));
          const manifestTo = cpTo ? parseManifestJson(cas.getBytes(cpTo.manifestBlobHash).toString("utf8")) : manifestFrom;

          const filesFrom = new Map(manifestFrom.files.map(f => [f.path, f.hash]));
          const filesTo = new Map(manifestTo.files.map(f => [f.path, f.hash]));

          const added: string[] = [];
          const deleted: string[] = [];
          const modified: string[] = [];

          for (const [path, hash] of filesTo) {
            if (!filesFrom.has(path)) added.push(path);
            else if (filesFrom.get(path) !== hash) modified.push(path);
          }

          for (const path of filesFrom.keys()) {
            if (!filesTo.has(path)) deleted.push(path);
          }

          let output = `🔍 WHAT CHANGED\n\n`;
          output += `From: ${cpFrom.name} (${cpFrom.createdAt})\n`;
          output += `To: ${toId ? cpTo.name : 'CURRENT STATE'}\n\n`;
          output += `📊 Summary:\n`;
          output += `   ✅ Added: ${added.length} files\n`;
          output += `   ✏️  Modified: ${modified.length} files\n`;
          output += `   ❌ Deleted: ${deleted.length} files\n\n`;

          if (added.length > 0) {
            output += `✅ Added files:\n${added.slice(0, 20).map(f => `   + ${f}`).join('\n')}\n`;
            if (added.length > 20) output += `   ... and ${added.length - 20} more\n`;
            output += '\n';
          }

          if (modified.length > 0) {
            output += `✏️  Modified files:\n${modified.slice(0, 20).map(f => `   ~ ${f}`).join('\n')}\n`;
            if (modified.length > 20) output += `   ... and ${modified.length - 20} more\n`;
            output += '\n';
          }

          if (deleted.length > 0) {
            output += `❌ Deleted files:\n${deleted.slice(0, 20).map(f => `   - ${f}`).join('\n')}\n`;
            if (deleted.length > 20) output += `   ... and ${deleted.length - 20} more\n`;
          }

          return {
            content: [{ type: "text", text: output }]
          };
        }

        case "tm_restore_file": {
          const { ThreeWayMerge } = await import('../core/three-way-merge.js');
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const filePath = (args as any)?.filePath;
          const preview = (args as any)?.preview;
          const strategy = (args as any)?.strategy || 'theirs';
          const baseCheckpointId = (args as any)?.baseCheckpointId;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const cp = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!cp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          const manifestBuf = cas.getBytes(cp.manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));

          const fileEntry = manifest.files.find(f => f.path === filePath);
          if (!fileEntry) {
            throw new TmError("TM_FILE_NOT_FOUND", `File "${filePath}" not found in checkpoint`);
          }

          const theirsContent = cas.getBytes(fileEntry.hash).toString("utf8");

          if (preview) {
            return {
              content: [{
                type: "text",
                text: `📄 File: ${filePath}\n` +
                      `📍 From checkpoint: ${cp.name}\n` +
                      `🕐 Created: ${cp.createdAt}\n\n` +
                      `Content:\n${'─'.repeat(60)}\n${theirsContent}\n${'─'.repeat(60)}`
              }]
            };
          }

          const fs = await import("fs");
          const targetPath = path.join(project.rootPath, filePath);
          
          // Check if file exists and has conflicts
          let oursContent = '';
          let hasLocalChanges = false;
          try {
            oursContent = fs.readFileSync(targetPath, 'utf8');
            hasLocalChanges = oursContent !== theirsContent;
          } catch {}

          let finalContent = theirsContent;
          let mergeInfo = '';

          if (hasLocalChanges && strategy === 'merge') {
            // 3-way merge
            let baseContent = '';
            if (baseCheckpointId) {
              const baseCp = opts.repo.getCheckpoint(projectId, baseCheckpointId);
              if (baseCp) {
                const baseManifest = parseManifestJson(cas.getBytes(baseCp.manifestBlobHash).toString("utf8"));
                const baseFile = baseManifest.files.find(f => f.path === filePath);
                if (baseFile) baseContent = cas.getBytes(baseFile.hash).toString("utf8");
              }
            }

            const merger = new ThreeWayMerge();
            const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });
            finalContent = result.merged;
            
            if (result.hasConflicts) {
              mergeInfo = `\n⚠️ MERGE CONFLICTS: ${result.conflicts.length} regions need manual resolution`;
            } else {
              mergeInfo = '\n✅ Auto-merged successfully';
            }
          } else if (hasLocalChanges && strategy === 'ours') {
            return {
              content: [{
                type: "text",
                text: `⏭️ Skipped: ${filePath} (keeping local changes)`
              }]
            };
          }

          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, finalContent);

          return {
            content: [{
              type: "text",
              text: `✅ Restored file: ${filePath}\n` +
                    `From checkpoint: ${cp.name}\n` +
                    `Strategy: ${strategy}\n` +
                    `Size: ${Buffer.byteLength(finalContent)} bytes` +
                    mergeInfo
            }]
          };
        }

        case "tm_browse_checkpoint": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const browsePath = (args as any)?.path || "";
          const showContent = (args as any)?.showContent;

          const cp = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!cp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          const manifestBuf = cas.getBytes(cp.manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));

          // Filter files by path
          const files = manifest.files.filter(f => 
            browsePath ? f.path.startsWith(browsePath) : true
          );

          let output = `👁️  BROWSING CHECKPOINT\n\n`;
          output += `📍 ${cp.name}\n`;
          output += `🕐 ${cp.createdAt}\n`;
          output += `📁 Path: ${browsePath || '/'}\n`;
          output += `📊 ${files.length} files\n\n`;

          files.slice(0, 50).forEach(f => {
            output += `   ${f.path} (${f.size} bytes)\n`;
          });

          if (files.length > 50) {
            output += `\n   ... and ${files.length - 50} more files\n`;
          }

          output += `\nUse tm_restore_file to restore specific files.`;

          return {
            content: [{ type: "text", text: output }]
          };
        }

        case "tm_conversation_context": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;

          const { ConversationLogger } = await import('../core/conversation-logger.js');
          const logger = new ConversationLogger(projectId);
          const context = logger.getContextForCheckpoint(checkpointId);

          let output = `💬 CONVERSATION CONTEXT\n\n`;
          output += `📍 Checkpoint: ${checkpointId}\n`;
          output += `📨 Messages: ${context.messages.length}\n`;
          output += `🔧 Tool calls: ${context.toolCalls.length}\n`;
          output += `📍 Checkpoints: ${context.checkpoints.length}\n\n`;

          // Recent messages
          const recentMsgs = context.messages.slice(-5);
          if (recentMsgs.length > 0) {
            output += `Recent Messages:\n`;
            for (const msg of recentMsgs) {
              output += `  ${msg.role}: ${msg.content.slice(0, 80)}...\n`;
            }
            output += '\n';
          }

          // Tools used
          const toolsUsed = new Set(context.toolCalls.map(t => t.tool));
          if (toolsUsed.size > 0) {
            output += `Tools used: ${Array.from(toolsUsed).join(', ')}`;
          }

          return {
            content: [{ type: "text", text: output }]
          };
        }

        // ============================================================================
        // GIT-INSPIRED TOOL HANDLERS
        // ============================================================================

        case "tm_stash": {
          const projectId = (args as any)?.projectId;
          const action = (args as any)?.action || "push";
          const message = (args as any)?.message || "WIP";
          const index = (args as any)?.index || 0;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const stashDir = path.join(opts.dataDir, "stashes", projectId);
          const fs = await import('fs');
          fs.mkdirSync(stashDir, { recursive: true });
          const stashIndex = path.join(stashDir, "index.json");

          interface Stash { id: string; message: string; timestamp: string; checkpointId: string; }
          let stashes: Stash[] = [];
          if (fs.existsSync(stashIndex)) {
            stashes = JSON.parse(fs.readFileSync(stashIndex, 'utf-8'));
          }

          switch (action) {
            case "list": {
              if (stashes.length === 0) {
                return { content: [{ type: "text", text: "📦 No stashes" }] };
              }
              let output = "📦 STASHES\n\n";
              stashes.forEach((s, i) => {
                output += `stash@{${i}}: ${s.message} (${getTimeAgo(new Date(s.timestamp))})\n`;
              });
              return { content: [{ type: "text", text: output }] };
            }
            case "clear": {
              stashes = [];
              fs.writeFileSync(stashIndex, '[]');
              return { content: [{ type: "text", text: "📦 Cleared all stashes" }] };
            }
            case "drop": {
              if (index < 0 || index >= stashes.length) {
                throw new TmError("TM_INVALID_INDEX", "Invalid stash index");
              }
              const dropped = stashes.splice(index, 1)[0];
              fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2));
              return { content: [{ type: "text", text: `📦 Dropped stash@{${index}}: ${dropped.message}` }] };
            }
            case "pop":
            case "apply": {
              if (stashes.length === 0) {
                throw new TmError("TM_NO_STASH", "No stashes to apply");
              }
              if (index < 0 || index >= stashes.length) {
                throw new TmError("TM_INVALID_INDEX", "Invalid stash index");
              }
              const stash = stashes[index];
              
              // Restore the stashed checkpoint
              const cp = opts.repo.getCheckpoint(projectId, stash.checkpointId);
              if (!cp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Stash checkpoint not found");
              
              const lock = new ProjectLock(project.rootPath);
              lock.acquire();
              try {
                const manifestBuf = cas.getBytes(cp.manifestBlobHash);
                const manifest = parseManifestJson(manifestBuf.toString("utf8"));
                restoreWorkspaceAtomic({ projectRoot: project.rootPath, cas, manifest, mode: "safe", backupCurrent: true });
              } finally {
                lock.release();
              }

              if (action === "pop") {
                stashes.splice(index, 1);
                fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2));
              }
              return { content: [{ type: "text", text: `📦 Applied stash@{${index}}: ${stash.message}` }] };
            }
            case "push":
            default: {
              // Create checkpoint for stash
              const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
              const { manifest, fileCount } = await buildManifest(project.rootPath, cas, { ignore: ignoreMatcher });
              const manifestJson = JSON.stringify(manifest, null, 2);
              const manifestRef = cas.putBytes("application/json", Buffer.from(manifestJson, "utf8"));
              const rootTreeHash = persistCheckpointTrees(opts.repo, projectId, manifest.files);
              
              const checkpointId = `stash_${Date.now()}_${cryptoRandomId()}`;
              opts.repo.insertCheckpoint({
                projectId,
                checkpointId,
                name: `Stash: ${message}`,
                scope: "files",
                manifestBlobHash: manifestRef.hash,
                rootTreeHash,
              });

              stashes.unshift({ id: checkpointId, message, timestamp: new Date().toISOString(), checkpointId });
              fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2));
              return { content: [{ type: "text", text: `📦 Saved working directory: ${message}\n   ${fileCount} files stashed` }] };
            }
          }
        }

        case "tm_blame": {
          const projectId = (args as any)?.projectId;
          const filePath = (args as any)?.filePath;
          const lineRange = (args as any)?.lineRange;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const fs = await import('fs');
          const fullPath = path.join(project.rootPath, filePath);
          if (!fs.existsSync(fullPath)) {
            throw new TmError("TM_FILE_NOT_FOUND", "File not found");
          }

          const currentContent = fs.readFileSync(fullPath, 'utf-8');
          const lines = currentContent.split('\n');
          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);

          // Parse line range
          let start = 0, end = lines.length;
          if (lineRange) {
            const [s, e] = lineRange.split(',').map((n: string) => parseInt(n));
            start = Math.max(0, s - 1);
            end = Math.min(lines.length, e || s);
          }

          let output = `🔍 BLAME: ${filePath}\n\n`;
          
          for (let i = start; i < end; i++) {
            let foundCp = checkpoints[0];
            // Find when this line was last modified
            for (const cp of checkpoints) {
              const manifestBuf = cas.getBytes(cp.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));
              const fileEntry = manifest.files.find(f => f.path === filePath);
              if (fileEntry) {
                const content = cas.getBytes(fileEntry.hash).toString('utf-8');
                const oldLines = content.split('\n');
                if (oldLines[i] !== lines[i]) {
                  break;
                }
                foundCp = cp;
              }
            }
            const cpShort = foundCp.checkpointId.slice(0, 8);
            const dateStr = new Date(foundCp.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
            const lineNum = String(i + 1).padStart(4);
            output += `${cpShort} ${dateStr} ${lineNum}) ${lines[i]}\n`;
          }

          return { content: [{ type: "text", text: output }] };
        }

        case "tm_reflog": {
          const projectId = (args as any)?.projectId;
          const limit = (args as any)?.limit || 20;

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);

          let output = "📜 REFLOG\n\n";
          checkpoints.forEach((cp, i) => {
            const cpShort = cp.checkpointId.slice(0, 8);
            const ago = getTimeAgo(new Date(cp.createdAt));
            output += `${cpShort} HEAD@{${i}}: checkpoint: ${cp.name} (${ago})\n`;
          });

          return { content: [{ type: "text", text: output }] };
        }

        case "tm_log": {
          const projectId = (args as any)?.projectId;
          const limit = (args as any)?.limit || 20;
          const oneline = (args as any)?.oneline || false;
          const stat = (args as any)?.stat || false;

          let checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);

          if (oneline) {
            let output = "";
            for (const cp of checkpoints) {
              output += `${cp.checkpointId.slice(0, 8)} ${cp.name}\n`;
            }
            return { content: [{ type: "text", text: output }] };
          }

          let output = "";
          for (const cp of checkpoints) {
            output += `checkpoint ${cp.checkpointId}\n`;
            output += `Date:   ${new Date(cp.createdAt).toISOString()}\n`;
            output += `\n    ${cp.name}\n\n`;
          }

          return { content: [{ type: "text", text: output }] };
        }

        case "tm_tag": {
          const projectId = (args as any)?.projectId;
          const action = (args as any)?.action || "list";
          const tagName = (args as any)?.name;
          const checkpointId = (args as any)?.checkpointId;
          const message = (args as any)?.message;

          const tagDir = path.join(opts.dataDir, "tags", projectId);
          const fs = await import('fs');
          fs.mkdirSync(tagDir, { recursive: true });
          const tagIndex = path.join(tagDir, "index.json");

          interface Tag { name: string; checkpoint: string; message?: string; timestamp: string; }
          let tags: Tag[] = [];
          if (fs.existsSync(tagIndex)) {
            tags = JSON.parse(fs.readFileSync(tagIndex, 'utf-8'));
          }

          switch (action) {
            case "list": {
              if (tags.length === 0) {
                return { content: [{ type: "text", text: "🏷️ No tags" }] };
              }
              let output = "🏷️ TAGS\n\n";
              for (const t of tags) {
                output += `${t.name} → ${t.checkpoint.slice(0, 12)} ${t.message ? `"${t.message}"` : ''}\n`;
              }
              return { content: [{ type: "text", text: output }] };
            }
            case "delete": {
              const idx = tags.findIndex(t => t.name === tagName);
              if (idx === -1) throw new TmError("TM_TAG_NOT_FOUND", "Tag not found");
              tags.splice(idx, 1);
              fs.writeFileSync(tagIndex, JSON.stringify(tags, null, 2));
              return { content: [{ type: "text", text: `🏷️ Deleted tag: ${tagName}` }] };
            }
            case "create":
            default: {
              if (!tagName) throw new TmError("TM_INVALID_INPUT", "Tag name required");
              
              let targetId = checkpointId;
              if (!targetId) {
                const latest = opts.repo.listCheckpointsNewestFirst(projectId, 1)[0];
                targetId = latest?.checkpointId;
              }
              if (!targetId) throw new TmError("TM_NO_CHECKPOINT", "No checkpoint to tag");
              if (tags.some(t => t.name === tagName)) throw new TmError("TM_TAG_EXISTS", "Tag already exists");

              tags.push({ name: tagName, checkpoint: targetId, message, timestamp: new Date().toISOString() });
              fs.writeFileSync(tagIndex, JSON.stringify(tags, null, 2));
              return { content: [{ type: "text", text: `🏷️ Created tag '${tagName}' at ${targetId.slice(0, 12)}` }] };
            }
          }
        }

        case "tm_cherry_pick": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const dryRun = (args as any)?.dryRun || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          const targetCp = checkpoints.find(cp => cp.checkpointId.startsWith(checkpointId));
          if (!targetCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          const idx = checkpoints.findIndex(cp => cp.checkpointId === targetCp.checkpointId);
          if (idx >= checkpoints.length - 1) {
            throw new TmError("TM_INVALID_OPERATION", "Cannot cherry-pick first checkpoint");
          }

          const prevCp = checkpoints[idx + 1];
          
          // Get manifests
          const targetManifest = parseManifestJson(cas.getBytes(targetCp.manifestBlobHash).toString("utf8"));
          const prevManifest = parseManifestJson(cas.getBytes(prevCp.manifestBlobHash).toString("utf8"));

          const prevFiles = new Map(prevManifest.files.map(f => [f.path, f.hash]));
          const targetFiles = new Map(targetManifest.files.map(f => [f.path, f.hash]));

          const changes: string[] = [];
          const fs = await import('fs');

          for (const [filePath, hash] of targetFiles) {
            const prevHash = prevFiles.get(filePath);
            if (prevHash !== hash) {
              changes.push(filePath);
              if (!dryRun) {
                const content = cas.getBytes(hash);
                const fullPath = path.join(project.rootPath, filePath);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, content);
              }
            }
          }

          if (dryRun) {
            return { content: [{ type: "text", text: `🍒 Would cherry-pick ${changes.length} files:\n${changes.join('\n')}` }] };
          }

          return { content: [{ type: "text", text: `🍒 Cherry-picked ${targetCp.checkpointId.slice(0, 12)}\n   Applied ${changes.length} file changes\n   ${targetCp.name}` }] };
        }

        case "tm_reset": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const mode = (args as any)?.mode || "mixed";

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          let targetCp = checkpointId 
            ? checkpoints.find(cp => cp.checkpointId.startsWith(checkpointId))
            : checkpoints[1]; // Previous checkpoint

          if (!targetCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          if (mode === "hard") {
            const lock = new ProjectLock(project.rootPath);
            lock.acquire();
            try {
              const manifestBuf = cas.getBytes(targetCp.manifestBlobHash);
              const manifest = parseManifestJson(manifestBuf.toString("utf8"));
              restoreWorkspaceAtomic({ projectRoot: project.rootPath, cas, manifest, mode: "hard", backupCurrent: true });
            } finally {
              lock.release();
            }
            return { content: [{ type: "text", text: `🔄 Hard reset to ${targetCp.checkpointId.slice(0, 12)}\n   ${targetCp.name}` }] };
          }

          return { content: [{ type: "text", text: `🔄 Reset HEAD to ${targetCp.checkpointId.slice(0, 12)} (${mode} mode)\n   Working directory unchanged` }] };
        }

        case "tm_clean": {
          const projectId = (args as any)?.projectId;
          const dryRun = (args as any)?.dryRun !== false;
          const force = (args as any)?.force || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 1);
          if (checkpoints.length === 0) throw new TmError("TM_NO_CHECKPOINT", "No checkpoints");

          const manifestBuf = cas.getBytes(checkpoints[0].manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));
          const trackedFiles = new Set(manifest.files.map(f => f.path));

          const fs = await import('fs');
          const toRemove: string[] = [];

          const scanDir = (dir: string, base = '') => {
            try {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                const rel = base ? `${base}/${entry.name}` : entry.name;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) scanDir(full, rel);
                else if (!trackedFiles.has(rel)) toRemove.push(rel);
              }
            } catch {}
          };
          scanDir(project.rootPath);

          if (toRemove.length === 0) {
            return { content: [{ type: "text", text: "🧹 Nothing to clean" }] };
          }

          if (!dryRun && force) {
            for (const f of toRemove) {
              fs.unlinkSync(path.join(project.rootPath, f));
            }
            return { content: [{ type: "text", text: `🧹 Removed ${toRemove.length} untracked files` }] };
          }

          return { content: [{ type: "text", text: `🧹 Would remove ${toRemove.length} files:\n${toRemove.slice(0, 20).join('\n')}${toRemove.length > 20 ? '\n...' : ''}` }] };
        }

        case "tm_revert": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          const targetCp = checkpoints.find(cp => cp.checkpointId.startsWith(checkpointId));
          if (!targetCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");

          const idx = checkpoints.findIndex(cp => cp.checkpointId === targetCp.checkpointId);
          if (idx >= checkpoints.length - 1) {
            throw new TmError("TM_INVALID_OPERATION", "Cannot revert first checkpoint");
          }

          const prevCp = checkpoints[idx + 1];
          const targetManifest = parseManifestJson(cas.getBytes(targetCp.manifestBlobHash).toString("utf8"));
          const prevManifest = parseManifestJson(cas.getBytes(prevCp.manifestBlobHash).toString("utf8"));

          const prevFiles = new Map(prevManifest.files.map(f => [f.path, f.hash]));
          const targetFiles = new Map(targetManifest.files.map(f => [f.path, f.hash]));

          const fs = await import('fs');
          let reverted = 0;

          // Restore files that were deleted
          for (const [filePath, hash] of prevFiles) {
            if (!targetFiles.has(filePath)) {
              const content = cas.getBytes(hash);
              const fullPath = path.join(project.rootPath, filePath);
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, content);
              reverted++;
            }
          }

          // Delete files that were added
          for (const filePath of targetFiles.keys()) {
            if (!prevFiles.has(filePath)) {
              const fullPath = path.join(project.rootPath, filePath);
              if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); reverted++; }
            }
          }

          // Restore modified files to previous state
          for (const [filePath, hash] of prevFiles) {
            const targetHash = targetFiles.get(filePath);
            if (targetHash && targetHash !== hash) {
              const content = cas.getBytes(hash);
              fs.writeFileSync(path.join(project.rootPath, filePath), content);
              reverted++;
            }
          }

          return { content: [{ type: "text", text: `↩️ Reverted ${targetCp.checkpointId.slice(0, 12)}\n   ${reverted} files changed\n   "${targetCp.name}"` }] };
        }

        case "tm_shortlog": {
          const projectId = (args as any)?.projectId;
          const numbered = (args as any)?.numbered || false;

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 200);
          
          const byScope: Record<string, number> = {};
          for (const cp of checkpoints) {
            const scope = cp.scope || 'files';
            byScope[scope] = (byScope[scope] || 0) + 1;
          }

          let entries = Object.entries(byScope);
          if (numbered) entries.sort((a, b) => b[1] - a[1]);

          let output = "📊 CHECKPOINT SUMMARY\n\n";
          for (const [scope, count] of entries) {
            output += `${scope}: ${count} checkpoints\n`;
          }
          output += `\nTotal: ${checkpoints.length} checkpoints`;

          return { content: [{ type: "text", text: output }] };
        }

        // ============================================================================
        // END GIT-INSPIRED TOOLS
        // ============================================================================
        case "tm_go_back":
        case "tm_show_timeline":
        case "tm_what_changed":
        case "tm_restore_file":
        case "tm_browse_checkpoint":
        case "tm_conversation_context":
        case "tm_conversation_history":
        case "tm_checkpoint_list": {
          const projectId = (args as any)?.projectId;
          const limit = (args as any)?.limit || 50;

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                items: checkpoints.map(cp => ({
                  checkpointId: cp.checkpointId,
                  name: cp.name,
                  createdAt: cp.createdAt,
                  scope: cp.scope,
                })),
                total: checkpoints.length,
              }, null, 2)
            }]
          };
        }

        case "tm_diff_checkpoints": {
          const projectId = (args as any)?.projectId;
          const aId = (args as any)?.aCheckpointId;
          const bId = (args as any)?.bCheckpointId;

          const cpA = opts.repo.getCheckpoint(projectId, aId);
          const cpB = opts.repo.getCheckpoint(projectId, bId);

          if (!cpA || !cpB) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "One or both checkpoints not found");
          }

          // Load both manifests
          const manifestA = parseManifestJson(cas.getBytes(cpA.manifestBlobHash).toString("utf8"));
          const manifestB = parseManifestJson(cas.getBytes(cpB.manifestBlobHash).toString("utf8"));

          const filesA = new Map(manifestA.files.map(f => [f.path, f.hash]));
          const filesB = new Map(manifestB.files.map(f => [f.path, f.hash]));

          const added: string[] = [];
          const deleted: string[] = [];
          const modified: string[] = [];

          // Find added and modified
          for (const [path, hash] of filesB) {
            if (!filesA.has(path)) {
              added.push(path);
            } else if (filesA.get(path) !== hash) {
              modified.push(path);
            }
          }

          // Find deleted
          for (const path of filesA.keys()) {
            if (!filesB.has(path)) {
              deleted.push(path);
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                fileDiffs: {
                  added: added.slice(0, 20),
                  modified: modified.slice(0, 20),
                  deleted: deleted.slice(0, 20),
                  totalAdded: added.length,
                  totalModified: modified.length,
                  totalDeleted: deleted.length,
                }
              }, null, 2)
            }]
          };
        }

        case "tm_search": {
          const projectId = (args as any)?.projectId;
          const query = (args as any)?.query;

          const results = opts.repo.searchCheckpoints(projectId, query);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                results: results.map(cp => ({
                  checkpointId: cp.checkpointId,
                  name: cp.name,
                  createdAt: cp.createdAt,
                  scope: cp.scope,
                })),
                total: results.length,
              }, null, 2)
            }]
          };
        }

        case "tm_stats": {
          const stats = opts.repo.getStats();

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                projects: stats.projects,
                checkpoints: stats.checkpoints,
                events: stats.events,
              }, null, 2)
            }]
          };
        }

        case "tm_checkpoint_create": {
          const input = zCheckpointCreateInput.parse(args);
          const project = opts.repo.getProject(input.projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            const ignoreMatcher = makeIgnoreMatcher([...(project.ignoreGlobs ?? []), ...DEFAULT_IGNORES]);

            // Build manifest + write file blobs into CAS
            const { manifest, fileCount } = await buildManifest(project.rootPath, cas, {
              ignore: ignoreMatcher,
              maxFileBytes: 25 * 1024 * 1024,
            });

            // Store manifest itself as a blob
            const manifestText = JSON.stringify(
              { ...manifest, ignore: [...(project.ignoreGlobs ?? []), ...DEFAULT_IGNORES] },
              null,
              2
            );
            const manifestBlob = cas.putBytes("application/json", Buffer.from(manifestText, "utf8"));
            const rootTreeHash = persistCheckpointTrees(opts.repo, project.projectId, manifest.files);

            // Capture head pointers (best-effort)
            const chatHead = input.scope.includes("chat") ? opts.repo.getChatHeadEventId(project.projectId) : null;
            const termHead = input.scope.includes("terminal") ? opts.repo.getTerminalHeadEventId(project.projectId) : null;

            // Capsule metadata (pin digest if imageRef provided)
            let capsuleImageRef: string | null = null;
            let capsuleImageDigest: string | null = null;
            let capsuleWorkdir: string | null = null;
            let capsuleEnvJson: string | null = null;

            if (input.capsule?.imageRef) {
              capsuleImageRef = input.capsule.imageRef;
              const { imageDigest } = await capsuleMgr.ensureImage(input.capsule.imageRef);
              capsuleImageDigest = imageDigest;
              capsuleWorkdir = input.capsule.workdir ?? "/workspace";
              capsuleEnvJson = input.capsule.env ? JSON.stringify(input.capsule.env) : null;
            } else if (input.capsule?.imageDigest) {
              // If you allow explicit digest pinning (advanced)
              capsuleImageDigest = input.capsule.imageDigest;
              capsuleWorkdir = input.capsule.workdir ?? "/workspace";
              capsuleEnvJson = input.capsule.env ? JSON.stringify(input.capsule.env) : null;
            }

            const row = opts.repo.insertCheckpoint({
              checkpointId: `cp_${cryptoRandomId()}`,
              projectId: project.projectId,
              name: input.name,
              scope: input.scope,
              manifestBlobHash: manifestBlob.hash,
              rootTreeHash,
              chatHeadEventId: chatHead,
              terminalHeadEventId: termHead,
              capsuleImageRef,
              capsuleImageDigest,
              capsuleWorkdir,
              capsuleEnvJson,
            });

            // Cloud sync (non-blocking, best-effort)
            let cloudSynced = false;
            try {
              const { syncCheckpointToCloud, isCloudSyncEnabled } = await import("../cloud/checkpoint-sync.js");
              if (isCloudSyncEnabled()) {
                const syncResult = await syncCheckpointToCloud({
                  projectId: project.projectId,
                  projectName: project.name,
                  projectRootPath: project.rootPath,
                  checkpointId: row.checkpointId,
                  checkpointName: input.name,
                  scope: input.scope,
                  manifestHash: manifestBlob.hash,
                  manifestContent: Buffer.from(manifestText, "utf8"),
                  manifestFiles: manifest.files,
                  cas,
                  triggerType: "manual",
                  createdAt: new Date(row.createdAt),
                });
                cloudSynced = syncResult.synced;
              }
            } catch (e) {
              // Cloud sync failure should not fail checkpoint creation
              console.error("[CloudSync] Non-blocking sync error:", e);
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      checkpointId: row.checkpointId,
                      createdAt: row.createdAt,
                      fileCount,
                      manifestBlob,
                      chatHeadEventId: row.chatHeadEventId ?? null,
                      terminalHeadEventId: row.terminalHeadEventId ?? null,
                      capsule: capsuleImageDigest
                        ? { imageRef: capsuleImageRef, imageDigest: capsuleImageDigest, workdir: capsuleWorkdir }
                        : null,
                      cloudSynced,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } finally {
            lock.release();
          }
        }

        case "tm_checkpoint_restore": {
          const input = zCheckpointRestoreInput.parse(args);
          const project = opts.repo.getProject(input.projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

          const cp = opts.repo.getCheckpoint(input.projectId, input.checkpointId);
          if (!cp) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found", {
              projectId: input.projectId,
              checkpointId: input.checkpointId,
            });
          }

          const lock = new ProjectLock(project.rootPath);
          lock.acquire();
          try {
            // Load manifest blob
            const manifestBuf = cas.getBytes(cp.manifestBlobHash);
            const manifest = parseManifestJson(manifestBuf.toString("utf8"));

            if (input.dryRun) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        dryRun: true,
                        willWriteFiles: manifest.files.length,
                        mode: input.mode,
                        backupCurrent: input.backupCurrent,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            const res = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: input.mode,
              backupCurrent: input.backupCurrent,
            });

            // Return chat head pointer (rehydrate) if requested and exists
            const chatHeadEventId =
              input.restoreScope === "files+chat" ? (cp.chatHeadEventId ?? null) : null;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      restored: { filesWritten: res.filesWritten },
                      backupPath: res.backupPath ?? null,
                      chatHeadEventId,
                      capsule: cp.capsuleImageDigest
                        ? {
                            imageRef: cp.capsuleImageRef,
                            imageDigest: cp.capsuleImageDigest,
                            workdir: cp.capsuleWorkdir,
                            env: cp.capsuleEnvJson ? JSON.parse(cp.capsuleEnvJson) : null,
                          }
                        : null,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } finally {
            lock.release();
          }
        }

        case "tm_checkpoint_materialize": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const targetParentDir = (args as any)?.targetParentDir;
          const customFolderName = (args as any)?.folderName;
          const includeContext = (args as any)?.includeContext !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) {
            throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId });
          }

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found", { checkpointId });
          }

          // Load manifest
          const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));

          // Determine target directory
          const parentDir = targetParentDir || path.join(project.rootPath, ".aitm", "restored");
          const folderName = customFolderName || generateMaterializedFolderName({
            projectName: project.name,
            checkpointId: checkpoint.checkpointId,
            timestamp: checkpoint.createdAt,
          });
          const targetDir = path.join(parentDir, folderName);

          // Build context if requested
          let contextContent: string | undefined;
          if (includeContext) {
            contextContent = await buildContextPacket({
              repo: opts.repo,
              cas,
              projectId,
              checkpointId: checkpoint.checkpointId,
            });
          }

          // Materialize checkpoint to the target directory
          const result = restoreToDirectory({
            cas,
            manifest,
            targetDir,
            contextContent,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                materialized: true,
                checkpoint: {
                  checkpointId: checkpoint.checkpointId,
                  name: checkpoint.name,
                  createdAt: checkpoint.createdAt,
                },
                result: {
                  targetDir: result.targetDir,
                  filesWritten: result.filesWritten,
                  folderName,
                },
                openHint: {
                  vscode: `code "${result.targetDir}"`,
                  cursor: `cursor "${result.targetDir}"`,
                },
                next: `Checkpoint "${checkpoint.name}" materialized to ${folderName}. Open in IDE to browse or diff.`,
              }, null, 2)
            }]
          };
        }

        case "tm_capsule_upsert": {
          const input = zCapsuleUpsertInput.parse(args);
          const project = opts.repo.getProject(input.projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

          const cap = await capsuleMgr.upsert({
            capsuleId: input.capsuleId,
            imageRef: input.imageRef,
            projectRoot: project.rootPath,
            workdir: input.workdir,
            env: input.env as Record<string, string> | undefined,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(cap, null, 2) }],
          };
        }

        case "tm_capsule_exec": {
          const input = zCapsuleExecInput.parse(args);
          const project = opts.repo.getProject(input.projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

          // Emit term.command event (optional but recommended)
          opts.repo.appendEvent(input.projectId, "term.command", new Date().toISOString(), {
            capsuleId: input.capsuleId,
            command: input.command,
            cwd: input.cwd ?? null,
          });

          const containerName = `aitm_${input.capsuleId}`;
          const r = await capsuleMgr.exec({
            containerNameOrId: containerName,
            command: input.command,
            cwd: input.cwd,
            timeoutMs: input.timeoutMs,
          });

          const stdoutBlob = cas.putBytes("text/plain", r.stdout);
          const stderrBlob = cas.putBytes("text/plain", r.stderr);

          // Emit term.exit + refs
          opts.repo.appendEvent(input.projectId, "term.exit", new Date().toISOString(), {
            capsuleId: input.capsuleId,
            command: input.command,
            exitCode: r.exitCode,
            stdoutHash: stdoutBlob.hash,
            stderrHash: stderrBlob.hash,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    exitCode: r.exitCode,
                    stdoutBlob,
                    stderrBlob,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "tm_get_file_at": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const filePath = (args as any)?.filePath;

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");
          }

          const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
          const manifest = parseManifestJson(manifestBlob.toString("utf8"));

          // Find file in manifest
          const fileEntry = manifest.files.find(f => f.path === filePath);
          if (!fileEntry) {
            throw new TmError("TM_BLOB_MISSING", "File not found in checkpoint", { filePath });
          }

          const fileContent = cas.getBytes(fileEntry.hash);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                filePath: fileEntry.path,
                hash: fileEntry.hash,
                size: fileEntry.size,
                content: fileContent.toString("utf8"),
              }, null, 2)
            }]
          };
        }

        case "tm_file_history": {
          const projectId = (args as any)?.projectId;
          const filePath = (args as any)?.filePath;
          const limit = (args as any)?.limit || 20;

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);
          const history: any[] = [];

          for (const checkpoint of checkpoints) {
            const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBlob.toString("utf8"));

            const fileEntry = manifest.files.find(f => f.path === filePath);
            if (fileEntry) {
              history.push({
                checkpointId: checkpoint.checkpointId,
                checkpointName: checkpoint.name,
                createdAt: checkpoint.createdAt,
                hash: fileEntry.hash,
                size: fileEntry.size,
              });
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                filePath,
                history,
                total: history.length,
              }, null, 2)
            }]
          };
        }

        case "tm_timeline": {
          const projectId = (args as any)?.projectId;
          const type = (args as any)?.type;
          const limit = (args as any)?.limit || 50;

          const events = opts.repo.listEvents(projectId, type, limit);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                events: events.map(e => ({
                  eventId: e.eventId,
                  type: e.type,
                  timestamp: e.timestamp,
                  payload: e.payload,
                })),
                total: events.length,
              }, null, 2)
            }]
          };
        }

        case "tm_project_init": {
          const projectPath = (args as any)?.projectPath;
          const name = (args as any)?.name || path.basename(projectPath);
          const projectId = `proj_${cryptoRandomId()}`;

          opts.repo.insertProject({
            projectId,
            rootPath: projectPath,
            name,
            ignoreGlobs: DEFAULT_IGNORES,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                projectId,
                name,
                rootPath: projectPath,
                createdAt: new Date().toISOString(),
              }, null, 2)
            }]
          };
        }

        case "tm_set_project": {
          const projectPath = (args as any)?.projectPath;

          // In a real implementation, this would set context state
          // For now, just verify project exists
          const projects = opts.repo.listProjects();
          const project = projects.find(p => p.rootPath === projectPath);

          if (!project) {
            throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectPath });
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                projectId: project.projectId,
                name: project.name,
                rootPath: project.rootPath,
              }, null, 2)
            }]
          };
        }

        case "tm_rewind_to_last_green": {
          const projectId = (args as any)?.projectId;
          const mode = (args as any)?.mode || "hard";
          const includeContext = (args as any)?.includeContext !== false;
          const patterns = (args as any)?.patterns || ["Tests green", "Build green", "Tests passed"];

          const project = opts.repo.getProject(projectId);
          if (!project) {
            throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");
          }

          const greenCheckpoint = findLastGreenCheckpoint(opts.repo, projectId, patterns);

          if (!greenCheckpoint) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  found: false,
                  message: "No 'green' checkpoint found matching patterns",
                  patterns,
                }, null, 2)
              }]
            };
          }

          // Restore to this checkpoint
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();

          try {
            const manifestBlob = cas.getBytes(greenCheckpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBlob.toString("utf8"));

            const result = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: mode as "safe" | "hard",
              backupCurrent: true,
            });

            const context = includeContext ? generateRestoreContext(greenCheckpoint) : null;

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  found: true,
                  checkpoint: {
                    checkpointId: greenCheckpoint.checkpointId,
                    name: greenCheckpoint.name,
                    createdAt: greenCheckpoint.createdAt,
                  },
                  restored: {
                    filesWritten: result.filesWritten,
                    backupPath: result.backupPath,
                  },
                  context,
                }, null, 2)
              }]
            };
          } finally {
            lock.release();
          }
        }

        case "tm_rewind_to_checkpoint": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const mode = (args as any)?.mode || "hard";
          const includeContextText = (args as any)?.includeContextText !== false;

          const project = opts.repo.getProject(projectId);
          if (!project) {
            throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");
          }

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");
          }

          // Restore to this checkpoint
          const lock = new ProjectLock(project.rootPath);
          lock.acquire();

          try {
            const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
            const manifest = parseManifestJson(manifestBlob.toString("utf8"));

            const result = restoreWorkspaceAtomic({
              projectRoot: project.rootPath,
              cas,
              manifest,
              mode: mode as "safe" | "hard",
              backupCurrent: true,
            });

            // Build context packet if requested
            let contextText = null;
            if (includeContextText) {
              contextText = await buildContextPacket({
                repo: opts.repo,
                cas,
                projectId,
                checkpointId: checkpoint.checkpointId,
              });
            }

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  restored: true,
                  checkpoint: {
                    checkpointId: checkpoint.checkpointId,
                    name: checkpoint.name,
                    createdAt: checkpoint.createdAt,
                    scope: checkpoint.scope,
                  },
                  result: {
                    filesWritten: result.filesWritten,
                    backupPath: result.backupPath,
                  },
                  contextText,
                  next: `Workspace restored to checkpoint "${checkpoint.name}". ${contextText ? 'Context packet available for AI continuation.' : ''}`
                }, null, 2)
              }]
            };
          } finally {
            lock.release();
          }
        }

        case "tm_get_context_packet": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;
          const maxMessages = (args as any)?.maxMessages || 20;

          const project = opts.repo.getProject(projectId);
          if (!project) {
            throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");
          }

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
          if (!checkpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");
          }

          const contextText = await buildContextPacket({
            repo: opts.repo,
            cas,
            projectId,
            checkpointId: checkpoint.checkpointId,
            maxMessages,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                checkpoint: {
                  checkpointId: checkpoint.checkpointId,
                  name: checkpoint.name,
                  createdAt: checkpoint.createdAt,
                },
                contextText,
              }, null, 2)
            }]
          };
        }

        case "tm_prompt_debug_regression": {
          const projectId = (args as any)?.projectId;
          const fromId = (args as any)?.fromCheckpointId;
          const toId = (args as any)?.toCheckpointId;

          const fromCheckpoint = opts.repo.getCheckpoint(projectId, fromId);
          const toCheckpoint = opts.repo.getCheckpoint(projectId, toId);

          if (!fromCheckpoint || !toCheckpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "One or both checkpoints not found");
          }

          const manifestFrom = parseManifestJson(cas.getBytes(fromCheckpoint.manifestBlobHash).toString("utf8"));
          const manifestTo = parseManifestJson(cas.getBytes(toCheckpoint.manifestBlobHash).toString("utf8"));

          const prompt = generateDebugRegressionPrompt(fromCheckpoint, toCheckpoint, manifestFrom, manifestTo);

          return {
            content: [{
              type: "text",
              text: prompt
            }]
          };
        }

        case "tm_prompt_postmortem": {
          const projectId = (args as any)?.projectId;
          const fromId = (args as any)?.fromCheckpointId;
          const toId = (args as any)?.toCheckpointId;
          const incidentDescription = (args as any)?.incidentDescription || "Incident detected";

          const fromCheckpoint = opts.repo.getCheckpoint(projectId, fromId);
          const toCheckpoint = opts.repo.getCheckpoint(projectId, toId);

          if (!fromCheckpoint || !toCheckpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "One or both checkpoints not found");
          }

          const postmortem = generatePostmortem(fromCheckpoint, toCheckpoint, incidentDescription);

          return {
            content: [{
              type: "text",
              text: postmortem
            }]
          };
        }

        case "tm_prompt_repro_steps": {
          const projectId = (args as any)?.projectId;
          const checkpointId = (args as any)?.checkpointId;

          const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);

          if (!checkpoint) {
            throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found");
          }

          const reproSteps = generateReproSteps(checkpoint);

          return {
            content: [{
              type: "text",
              text: reproSteps
            }]
          };
        }

        case "tm_gc_run": {
          const dryRun = (args as any)?.dryRun ?? false;
          const keepDays = (args as any)?.keepDays ?? 7;
          const keepMinimum = (args as any)?.keepMinimum ?? 10;

          const result = await runGarbageCollection(engine, {
            dryRun,
            keepDays,
            keepMinimum,
          });

          const summary = dryRun
            ? `DRY RUN: Would delete ${result.blobsRemoved} blobs (${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB)`
            : `Deleted ${result.blobsRemoved} blobs, reclaimed ${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB`;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                summary,
                ...result,
              }, null, 2)
            }]
          };
        }

        case "tm_integrity_check": {
          const projectId = (args as any)?.projectId;
          const level = (args as any)?.level ?? "light";

          const result = await verifyIntegrity(opts.repo, cas, projectId, level as "light" | "deep");

          const summary = result.passed
            ? `✅ Integrity check PASSED\n` +
              `Checkpoints: ${result.checkpointsChecked}\n` +
              `Manifests verified: ${result.manifestsVerified}\n` +
              `Blobs verified: ${result.blobsVerified}`
            : `❌ Integrity check FAILED\n` +
              `Errors: ${result.errors.length}\n` +
              `Warnings: ${result.warnings.length}`;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: result.passed,
                summary,
                ...result,
              }, null, 2)
            }]
          };
        }

        // ============================================================================
        // AI TIME & CONCEPT REALIZATION HANDLERS
        // ============================================================================
        case "ai_realize_concepts": {
          try {
            const context = await aiTimeTools.realizeCurrentConcepts();
            
            return {
              content: [{
                type: "text",
                text: `🧠 **Conceptual Context Analysis**

**Current State:**
- Phase: ${context.currentState.conceptualPhase}
- Confidence: ${Math.round(context.currentState.confidence * 100)}%
- Working Directory: ${context.currentState.workingDirectory}

**Temporal Awareness:**
- Time Elapsed: ${context.temporalAwareness.timeElapsed}
- Last Significant Change: ${context.temporalAwareness.lastSignificantChange}
- Development Velocity: ${context.temporalAwareness.developmentVelocity}
- Context Switches: ${context.temporalAwareness.contextSwitches}

**Conceptual Map:**
- Active Themes: ${context.conceptualMap.activeThemes.join(', ') || 'None'}
- Completed: ${context.conceptualMap.completedConcepts.join(', ') || 'None'}
- Blocked: ${context.conceptualMap.blockedConcepts.join(', ') || 'None'}
- Emerging: ${context.conceptualMap.emergingPatterns.join(', ') || 'None'}

**Recent Actions:**
${context.causalChain.lastActions.map(action => 
  `- ${action.action} (${action.outcome}) - ${action.conceptualImpact} impact`
).join('\n')}

**Predicted Next Actions:**
${context.causalChain.predictedNext.map(action => `- ${action}`).join('\n')}

This analysis helps you understand what concepts are currently active and how they relate to your development workflow.`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `❌ Error analyzing concepts: ${error instanceof Error ? error.message : 'Unknown error'}`
              }]
            };
          }
        }

        case "ai_realize_time": {
          try {
            const timeContext = await aiTimeTools.realizeTimeContext();
            
            return {
              content: [{
                type: "text",
                text: `⏰ **Temporal Context Analysis**

**Absolute Time:**
- Now: ${new Date(timeContext.absoluteTime.now).toLocaleString()}
- Session Start: ${new Date(timeContext.absoluteTime.sessionStart).toLocaleString()}
- Last Checkpoint: ${timeContext.absoluteTime.lastCheckpoint !== 'never' ? 
    new Date(timeContext.absoluteTime.lastCheckpoint).toLocaleString() : 'Never'}

**Relative Time:**
- Since Last Change: ${timeContext.relativeTime.sinceLastChange}
- Since Last Success: ${timeContext.relativeTime.sinceLastSuccess}
- Since Last Failure: ${timeContext.relativeTime.sinceLastFailure}
- Working Time Today: ${timeContext.relativeTime.workingTimeToday}

**Temporal Patterns:**
- Typical Session Length: ${timeContext.temporalPatterns.typicalSessionLength}
- Most Productive Time: ${timeContext.temporalPatterns.mostProductiveTimeOfDay}
- Average Checkpoint Interval: ${timeContext.temporalPatterns.averageTimeBetweenCheckpoints}
- Concept Completion Rate: ${timeContext.temporalPatterns.conceptCompletionRate}

This temporal awareness helps you understand the rhythm and timing of your development work.`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `❌ Error analyzing time context: ${error instanceof Error ? error.message : 'Unknown error'}`
              }]
            };
          }
        }

        case "ai_suggest_focus": {
          try {
            const suggestion = await aiTimeTools.suggestConceptualFocus();
            
            return {
              content: [{
                type: "text",
                text: `🎯 **Focus Recommendation**

**Primary Focus:** ${suggestion.primaryFocus}

**Reasoning:** ${suggestion.reasoning}

**Suggested Time Allocation:** ${suggestion.timeAllocation}

**Risk Factors:**
${suggestion.riskFactors.map(risk => `⚠️ ${risk}`).join('\n')}

**Success Metrics:**
${suggestion.successMetrics.map(metric => `✅ ${metric}`).join('\n')}

This recommendation is based on your current conceptual context and temporal patterns.`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `❌ Error generating focus suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`
              }]
            };
          }
        }

        case "ai_analyze_transitions": {
          try {
            const analysis = await aiTimeTools.analyzeStateTransitions();
            
            return {
              content: [{
                type: "text",
                text: `🔄 **State Transition Analysis**

**Recent Transitions:**
${analysis.transitions.map(t => 
  `${t.from} → ${t.to} (${t.duration}) ${t.success ? '✅' : '❌'}\n  Trigger: ${t.trigger}`
).join('\n\n')}

**Patterns Identified:**
${analysis.patterns.map(pattern => `📊 ${pattern}`).join('\n')}

**Recommendations:**
${analysis.recommendations.map(rec => `💡 ${rec}`).join('\n')}

This analysis helps you understand how your development state changes over time and optimize your workflow.`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `❌ Error analyzing transitions: ${error instanceof Error ? error.message : 'Unknown error'}`
              }]
            };
          }
        }

        // Git-enhanced tools
        case "tm_diff_advanced": {
          const { AdvancedDiffEngine } = await import('../core/diff-engine-v2.js');
          const projectId = (args as any)?.projectId;
          const checkpointA = (args as any)?.checkpointA;
          const checkpointB = (args as any)?.checkpointB;
          const filePath = (args as any)?.filePath;
          const algorithm = (args as any)?.algorithm || 'histogram';

          const cpA = opts.repo.getCheckpoint(projectId, checkpointA);
          if (!cpA) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint A not found");

          const manifestA = parseManifestJson(cas.getBytes(cpA.manifestBlobHash).toString("utf8"));
          const fileA = manifestA.files.find((f) => f.path === filePath);
          if (!fileA) throw new TmError("TM_FILE_NOT_FOUND", "File not found in checkpoint A");

          let contentA = cas.getBytes(fileA.hash).toString("utf8");
          let contentB = "";

          if (checkpointB) {
            const cpB = opts.repo.getCheckpoint(projectId, checkpointB);
            if (!cpB) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint B not found");
            const manifestB = parseManifestJson(cas.getBytes(cpB.manifestBlobHash).toString("utf8"));
            const fileB = manifestB.files.find((f) => f.path === filePath);
            if (fileB) contentB = cas.getBytes(fileB.hash).toString("utf8");
          } else {
            // Compare with current file
            const fs = await import('fs');
            const project = opts.repo.getProject(projectId);
            const fullPath = path.join(project!.rootPath, filePath);
            try { contentB = fs.readFileSync(fullPath, 'utf8'); } catch {}
          }

          const diffEngine = new AdvancedDiffEngine();
          const diff = diffEngine.diff(contentA, contentB, { algorithm: algorithm as any });
          const unified = diffEngine.formatUnified(diff, `a/${filePath}`, `b/${filePath}`);

          return {
            content: [{
              type: "text",
              text: `📊 DIFF (${algorithm} algorithm)\n` +
                    `+${diff.added} -${diff.removed}\n\n` +
                    unified
            }]
          };
        }

        case "tm_file_history": {
          const { CheckpointGraph } = await import('../core/checkpoint-graph.js');
          const projectId = (args as any)?.projectId;
          const filePath = (args as any)?.filePath;
          const limit = (args as any)?.limit || 20;

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);
          const history: any[] = [];

          for (const cp of checkpoints) {
            const manifest = parseManifestJson(cas.getBytes(cp.manifestBlobHash).toString("utf8"));
            if (manifest.files.some((f) => f.path === filePath)) {
              history.push({
                id: cp.checkpointId,
                name: cp.name,
                date: cp.createdAt
              });
              if (history.length >= limit) break;
            }
          }

          const lines = history.map((h, i) => 
            `${i + 1}. ${h.id.slice(0, 12)} - ${h.name} (${new Date(h.date).toLocaleString()})`
          );

          return {
            content: [{
              type: "text",
              text: `📜 FILE HISTORY: ${filePath}\n` +
                    `Found in ${history.length} checkpoints:\n\n` +
                    lines.join('\n')
            }]
          };
        }

        case "tm_merge_file": {
          const { ThreeWayMerge } = await import('../core/three-way-merge.js');
          const fs = await import('fs');
          const projectId = (args as any)?.projectId;
          const baseId = (args as any)?.baseCheckpointId;
          const theirsId = (args as any)?.theirsCheckpointId;
          const filePath = (args as any)?.filePath;
          const apply = (args as any)?.apply || false;

          const project = opts.repo.getProject(projectId);
          if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found");

          // Get base version
          const baseCp = opts.repo.getCheckpoint(projectId, baseId);
          if (!baseCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Base checkpoint not found");
          const baseManifest = parseManifestJson(cas.getBytes(baseCp.manifestBlobHash).toString("utf8"));
          const baseFile = baseManifest.files.find((f) => f.path === filePath);
          const baseContent = baseFile ? cas.getBytes(baseFile.hash).toString("utf8") : '';

          // Get theirs version
          const theirsCp = opts.repo.getCheckpoint(projectId, theirsId);
          if (!theirsCp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Theirs checkpoint not found");
          const theirsManifest = parseManifestJson(cas.getBytes(theirsCp.manifestBlobHash).toString("utf8"));
          const theirsFile = theirsManifest.files.find((f) => f.path === filePath);
          const theirsContent = theirsFile ? cas.getBytes(theirsFile.hash).toString("utf8") : '';

          // Get current (ours) version
          const fullPath = path.join(project.rootPath, filePath);
          let oursContent = '';
          try { oursContent = fs.readFileSync(fullPath, 'utf8'); } catch {}

          // Perform 3-way merge
          const merger = new ThreeWayMerge();
          const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });

          if (apply && !result.hasConflicts) {
            fs.writeFileSync(fullPath, result.merged);
          }

          const status = result.hasConflicts 
            ? `⚠️ CONFLICTS (${result.conflicts.length} regions)`
            : '✅ CLEAN MERGE';

          return {
            content: [{
              type: "text",
              text: `🔀 3-WAY MERGE: ${filePath}\n` +
                    `Base: ${baseId.slice(0, 12)} | Theirs: ${theirsId.slice(0, 12)}\n` +
                    `Status: ${status}\n` +
                    (apply && !result.hasConflicts ? '✅ Applied to file\n' : '') +
                    `\n--- RESULT ---\n${result.merged}`
            }]
          };
        }

        case "tm_repack": {
          const { PackOptimizer } = await import('../core/pack-optimizer.js');
          const aggressive = (args as any)?.aggressive || false;

          const optimizer = new PackOptimizer(opts.dataDir);
          const result = await optimizer.repack({ aggressive, minLooseObjects: aggressive ? 0 : 100 });

          const savings = (result.savings / 1024).toFixed(2);
          return {
            content: [{
              type: "text",
              text: `📦 REPACK COMPLETE\n` +
                    `Packs created: ${result.packsCreated}\n` +
                    `Objects packed: ${result.objectsPacked}\n` +
                    `Space saved: ${savings} KB`
            }]
          };
        }

        case "tm_timeline_viz": {
          const { CheckpointGraph } = await import('../core/checkpoint-graph.js');
          const { TimelineVisualizer } = await import('../core/timeline-visualizer.js');
          const projectId = (args as any)?.projectId;
          const limit = (args as any)?.limit || 50;
          const format = (args as any)?.format || 'json';

          const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, limit);
          const graph = new CheckpointGraph(opts.dataDir);
          
          await graph.build(checkpoints.map(cp => ({
            id: cp.checkpointId,
            timestamp: new Date(cp.createdAt),
            description: cp.name,
            files: [],
            stats: { totalFiles: 0, totalSize: 0 }
          })));

          const visualizer = new TimelineVisualizer(graph);
          
          if (format === 'threejs') {
            const data = visualizer.toThreeJS({ limit });
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
          }
          
          return { content: [{ type: "text", text: visualizer.toJSON({ limit }) }] };
        }

        default:
          // Handle cloud storage tools (Neon integration)
          // Check if it's an augmented tool
          const augmentedToolNames = augmentedTools.getToolDefinitions().map((t: any) => t.name);
          if (augmentedToolNames.includes(name)) {
            const result = await augmentedTools.handleToolCall(name, args || {});
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          if (isCloudTool(name)) {
            // Get project path from args or use current working directory
            const projectPath = (args as any)?.projectPath || process.cwd();
            return handleCloudTool(name, args || {}, projectPath);
          }
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      const err = toToolError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }],
        isError: true,
      };
    }
  });

  // ============================================================================
  // MCP RESOURCES - Browseable data (projects, checkpoints, conversations)
  // ============================================================================

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources: Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }> = [];

    // Add projects resource
    resources.push({
      uri: "tm://projects",
      name: "All Projects",
      description: "List all TimeMachine projects",
      mimeType: "application/json"
    });

    // Add each project and its checkpoints as resources
    const projects = opts.repo.listProjects();
    for (const project of projects) {
      resources.push({
        uri: `tm://projects/${project.projectId}`,
        name: project.name || project.projectId,
        description: `Project: ${project.rootPath}`,
        mimeType: "application/json"
      });

      resources.push({
        uri: `tm://projects/${project.projectId}/checkpoints`,
        name: `${project.name || project.projectId} Checkpoints`,
        description: `All checkpoints for ${project.name || project.projectId}`,
        mimeType: "application/json"
      });

      resources.push({
        uri: `tm://projects/${project.projectId}/conversations`,
        name: `${project.name || project.projectId} Conversations`,
        description: `Conversation history for ${project.name || project.projectId}`,
        mimeType: "application/json"
      });

      resources.push({
        uri: `tm://projects/${project.projectId}/timeline`,
        name: `${project.name || project.projectId} Timeline`,
        description: `Full timeline of events for ${project.name || project.projectId}`,
        mimeType: "application/json"
      });
    }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    // Parse the URI: tm://projects, tm://projects/{id}, tm://projects/{id}/checkpoints, etc.
    const match = uri.match(/^tm:\/\/(.+)$/);
    if (!match) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid resource URI: ${uri}`);
    }

    const resourcePath = match[1];
    const parts = resourcePath.split('/');

    // tm://projects
    if (resourcePath === 'projects') {
      const projects = opts.repo.listProjects();
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            projects: projects.map(p => ({
              id: p.projectId,
              name: p.name,
              rootPath: p.rootPath
            }))
          }, null, 2)
        }]
      };
    }

    // tm://projects/{projectId}
    if (parts[0] === 'projects' && parts.length === 2) {
      const projectId = parts[1];
      const project = opts.repo.getProject(projectId);
      if (!project) {
        throw new McpError(ErrorCode.InvalidParams, `Project not found: ${projectId}`);
      }

      const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 10);
      const recentEvents = opts.repo.listEvents(projectId, undefined, 20);

      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            project: {
              id: project.projectId,
              name: project.name,
              rootPath: project.rootPath
            },
            recentCheckpoints: checkpoints.slice(0, 5).map(cp => ({
              id: cp.checkpointId,
              name: cp.name,
              createdAt: cp.createdAt,
              timeAgo: getTimeAgo(new Date(cp.createdAt))
            })),
            recentActivity: recentEvents.slice(0, 10).map(e => ({
              type: e.type,
              timestamp: e.timestamp,
              timeAgo: getTimeAgo(new Date(e.timestamp))
            }))
          }, null, 2)
        }]
      };
    }

    // tm://projects/{projectId}/checkpoints
    if (parts[0] === 'projects' && parts.length === 3 && parts[2] === 'checkpoints') {
      const projectId = parts[1];
      const project = opts.repo.getProject(projectId);
      if (!project) {
        throw new McpError(ErrorCode.InvalidParams, `Project not found: ${projectId}`);
      }

      const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 100);

      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            projectId,
            checkpoints: checkpoints.map(cp => ({
              id: cp.checkpointId,
              name: cp.name,
              scope: cp.scope,
              manifestBlobHash: cp.manifestBlobHash,
              chatHeadEventId: cp.chatHeadEventId,
              terminalHeadEventId: cp.terminalHeadEventId,
              createdAt: cp.createdAt,
              timeAgo: getTimeAgo(new Date(cp.createdAt))
            }))
          }, null, 2)
        }]
      };
    }

    // tm://projects/{projectId}/checkpoints/{checkpointId}
    if (parts[0] === 'projects' && parts.length === 4 && parts[2] === 'checkpoints') {
      const projectId = parts[1];
      const checkpointId = parts[3];
      const checkpoint = opts.repo.getCheckpoint(projectId, checkpointId);
      if (!checkpoint) {
        throw new McpError(ErrorCode.InvalidParams, `Checkpoint not found: ${checkpointId}`);
      }

      // Get files in this checkpoint
      let files: string[] = [];
      try {
        const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
        const manifest = parseManifestJson(manifestBuf.toString("utf8"));
        files = Object.keys(manifest.files || {});
      } catch (e) {
        // Manifest might not be available
      }

      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            checkpoint: {
              id: checkpoint.checkpointId,
              name: checkpoint.name,
              scope: checkpoint.scope,
              manifestBlobHash: checkpoint.manifestBlobHash,
              chatHeadEventId: checkpoint.chatHeadEventId,
              terminalHeadEventId: checkpoint.terminalHeadEventId,
              createdAt: checkpoint.createdAt,
              timeAgo: getTimeAgo(new Date(checkpoint.createdAt))
            },
            fileCount: files.length,
            files: files.slice(0, 100) // Limit to first 100 files
          }, null, 2)
        }]
      };
    }

    // tm://projects/{projectId}/conversations
    if (parts[0] === 'projects' && parts.length === 3 && parts[2] === 'conversations') {
      const projectId = parts[1];
      const project = opts.repo.getProject(projectId);
      if (!project) {
        throw new McpError(ErrorCode.InvalidParams, `Project not found: ${projectId}`);
      }

      const chatEvents = opts.repo.listEvents(projectId, "chat.message", 50);

      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            projectId,
            conversations: chatEvents.map(e => ({
              id: e.eventId,
              timestamp: e.timestamp,
              timeAgo: getTimeAgo(new Date(e.timestamp)),
              role: e.payload?.role,
              contentPreview: typeof e.payload?.content === 'string'
                ? e.payload.content.substring(0, 200) + (e.payload.content.length > 200 ? '...' : '')
                : '[complex content]'
            }))
          }, null, 2)
        }]
      };
    }

    // tm://projects/{projectId}/timeline
    if (parts[0] === 'projects' && parts.length === 3 && parts[2] === 'timeline') {
      const projectId = parts[1];
      const project = opts.repo.getProject(projectId);
      if (!project) {
        throw new McpError(ErrorCode.InvalidParams, `Project not found: ${projectId}`);
      }

      const events = opts.repo.listEvents(projectId, undefined, 100);
      const checkpoints = opts.repo.listCheckpointsNewestFirst(projectId, 50);

      // Merge and sort by timestamp
      const timeline = [
        ...events.map(e => ({
          type: 'event' as const,
          eventType: e.type,
          timestamp: e.timestamp,
          timeAgo: getTimeAgo(new Date(e.timestamp)),
          data: e.payload
        })),
        ...checkpoints.map(cp => ({
          type: 'checkpoint' as const,
          eventType: 'checkpoint',
          timestamp: cp.createdAt,
          timeAgo: getTimeAgo(new Date(cp.createdAt)),
          data: { id: cp.checkpointId, name: cp.name, scope: cp.scope }
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            projectId,
            timeline: timeline.slice(0, 100)
          }, null, 2)
        }]
      };
    }

    throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
  });

  return server;
}

export async function runMcpServer(opts: { repo: Repo; dataDir: string }) {
  const server = createTmMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gitgram TimeMachine MCP Server running");
}
