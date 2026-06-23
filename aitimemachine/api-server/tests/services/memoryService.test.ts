/**
 * Unit tests for memoryService.ts
 *
 * The memory service is a best-effort write-through layer that ingests Beads
 * tasks and Context7 library docs into saved_contexts. Tests verify:
 *  - ingestTask writes rows with source='task'
 *  - ingestLibraryDoc writes rows with source='library'
 *  - Both functions skip gracefully when no userId/projectId can be resolved
 *  - Both functions are best-effort (never throw, even on DB/embedding errors)
 *  - The embedding service is invoked with the correct text
 *  - Metadata and tags are stored correctly
 *
 * All external deps (db, embeddings, logger) are provided by tests/setup.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockSavedContexts,
  seedTestData,
} from "../setup.js";
import {
  ingestTask,
  ingestLibraryDoc,
  type BeadsTask,
  type Context7DocInput,
} from "../../src/services/memoryService.js";

// ---------------------------------------------------------------------------
// Stable embedding mock singleton
//
// The setup.ts mock factory creates a new object on every getEmbeddingService()
// call, which means mockResolvedValueOnce / spy state is not shared. We
// override the module here with a stable singleton so mockXxx modifiers work
// predictably across all tests in this file.
// ---------------------------------------------------------------------------
const mockGenerateEmbedding = vi.fn().mockResolvedValue({
  embedding: [0.1, 0.2, 0.3],
  model: "mock-model",
  dimensions: 3,
});

vi.mock("../../src/services/embeddings.js", () => ({
  getEmbeddingService: () => ({
    generateEmbedding: mockGenerateEmbedding,
    cosineSimilarity: vi.fn().mockReturnValue(0.85),
    getProviderInfo: () => ({ provider: "mock", dimensions: 3 }),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the most-recently inserted saved_contexts row. */
function lastInserted() {
  return mockSavedContexts[mockSavedContexts.length - 1];
}

/** Count rows in the store matching a predicate. */
function countWhere(pred: (r: (typeof mockSavedContexts)[0]) => boolean) {
  return mockSavedContexts.filter(pred).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("memoryService", () => {
  beforeEach(() => {
    seedTestData();
    // Clean up any rows added by previous tests; seedTestData already
    // resets the stores, but we make the intent explicit.
    vi.clearAllMocks();
  });

  // =========================================================================
  // ingestTask
  // =========================================================================

  describe("ingestTask", () => {
    it("persists a task and returns persisted=true with a contextId", async () => {
      const task: BeadsTask = {
        id: "task_001",
        title: "Add authentication",
        description: "Implement JWT auth for the API",
        status: "open",
      };

      const result = await ingestTask(task, {
        userId: "user_test_001",
        projectId: "proj_test_001",
      });

      expect(result.persisted).toBe(true);
      expect(result.contextId).toBeTruthy();
      expect(result.skippedReason).toBeUndefined();
    });

    it("writes a row with source='task' in saved_contexts", async () => {
      const initialCount = mockSavedContexts.length;

      await ingestTask(
        { id: "task_002", title: "Write unit tests" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(mockSavedContexts.length).toBe(initialCount + 1);
      expect(lastInserted().source).toBe("task");
    });

    it("uses the task title as the name field", async () => {
      await ingestTask(
        { id: "task_003", title: "Refactor database layer" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toBe("Refactor database layer");
    });

    it("falls back to task.id as name when title is absent", async () => {
      await ingestTask(
        { id: "task_no_title" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toBe("task_no_title");
    });

    it("falls back to 'Untitled task' when both id and title are absent", async () => {
      await ingestTask(
        {},
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toBe("Untitled task");
    });

    it("stores beads/task tags on the row", async () => {
      await ingestTask(
        { id: "task_tags", title: "Tagged task" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      const row = lastInserted();
      expect(row.tags).toContain("beads");
      expect(row.tags).toContain("task");
    });

    it("stores task metadata including kind, taskId, status and deps", async () => {
      const task: BeadsTask = {
        id: "task_meta",
        title: "Meta task",
        status: "in_progress",
        deps: ["task_001", "task_002"],
      };

      await ingestTask(task, {
        userId: "user_test_001",
        projectId: "proj_test_001",
      });

      const meta = lastInserted().metadata;
      expect(meta.kind).toBe("beads_task");
      expect(meta.taskId).toBe("task_meta");
      expect(meta.status).toBe("in_progress");
      expect(meta.deps).toEqual(["task_001", "task_002"]);
    });

    it("also handles the 'dependencies' alias for deps", async () => {
      const task: BeadsTask = {
        id: "task_deps_alias",
        title: "Deps alias task",
        dependencies: ["dep_a", "dep_b"],
      };

      await ingestTask(task, {
        userId: "user_test_001",
        projectId: "proj_test_001",
      });

      expect(lastInserted().metadata.deps).toEqual(["dep_a", "dep_b"]);
    });

    it("skips write and returns persisted=false when userId is missing", async () => {
      // Ensure no env fallbacks are set
      delete process.env.AITM_MEMORY_USER_ID;
      delete process.env.AITM_MEMORY_PROJECT_ID;

      const before = mockSavedContexts.length;
      const result = await ingestTask(
        { id: "task_skip", title: "No user" },
        { projectId: "proj_test_001" } // no userId
      );

      expect(result.persisted).toBe(false);
      expect(result.skippedReason).toBeTruthy();
      expect(mockSavedContexts.length).toBe(before);
    });

    it("skips write and returns persisted=false when both userId and projectId are absent", async () => {
      delete process.env.AITM_MEMORY_USER_ID;
      delete process.env.AITM_MEMORY_PROJECT_ID;

      const before = mockSavedContexts.length;
      const result = await ingestTask({ id: "task_no_target", title: "Orphan" }, {});

      expect(result.persisted).toBe(false);
      expect(mockSavedContexts.length).toBe(before);
    });

    it("uses env-configured fallback userId/projectId when target is empty", async () => {
      process.env.AITM_MEMORY_USER_ID = "user_test_001";
      process.env.AITM_MEMORY_PROJECT_ID = "proj_test_001";

      const result = await ingestTask({ id: "task_env", title: "Env fallback task" });

      expect(result.persisted).toBe(true);
      expect(lastInserted().userId).toBe("user_test_001");
      expect(lastInserted().projectId).toBe("proj_test_001");

      // Clean up so other tests are not affected
      delete process.env.AITM_MEMORY_USER_ID;
      delete process.env.AITM_MEMORY_PROJECT_ID;
    });

    it("never throws when the embedding service throws", async () => {
      // Override the shared mock for this one test to simulate an embedding failure.
      mockGenerateEmbedding.mockRejectedValueOnce(
        new Error("embedding provider down")
      );

      const result = await ingestTask(
        { id: "task_embed_fail", title: "Embedding fail task" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      // Should still persist the row (with null embedding)
      expect(result.persisted).toBe(true);
      expect(lastInserted().embeddingJson).toBeNull();
    });

    it("sets isAutoSaved=true and tool='aitm-memory' on every row", async () => {
      await ingestTask(
        { id: "task_auto", title: "Auto save test" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      const row = lastInserted();
      expect(row.isAutoSaved).toBe(true);
      expect(row.tool).toBe("aitm-memory");
    });
  });

  // =========================================================================
  // ingestLibraryDoc
  // =========================================================================

  describe("ingestLibraryDoc", () => {
    it("persists a library doc and returns persisted=true with a contextId", async () => {
      const doc: Context7DocInput = {
        libraryId: "/facebook/react",
        topic: "hooks",
        version: "18.2.0",
        docs: "useState returns a stateful value and a function to update it.",
      };

      const result = await ingestLibraryDoc(doc, {
        userId: "user_test_001",
        projectId: "proj_test_001",
      });

      expect(result.persisted).toBe(true);
      expect(result.contextId).toBeTruthy();
    });

    it("writes a row with source='library' in saved_contexts", async () => {
      const initialCount = mockSavedContexts.length;

      await ingestLibraryDoc(
        { libraryId: "/vercel/next.js", topic: "routing", docs: "File-based routing." },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(mockSavedContexts.length).toBe(initialCount + 1);
      expect(lastInserted().source).toBe("library");
    });

    it("constructs the name as 'libraryId@version — topic'", async () => {
      await ingestLibraryDoc(
        {
          libraryId: "/prisma/prisma",
          topic: "transactions",
          version: "5.0.0",
          docs: "Interactive transactions.",
        },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toBe("/prisma/prisma@5.0.0 — transactions");
    });

    it("omits version suffix when version is not provided", async () => {
      await ingestLibraryDoc(
        { libraryId: "/expressjs/express", topic: "middleware", docs: "Use app.use()." },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toMatch(/^\/expressjs\/express — middleware$/);
    });

    it("defaults topic to 'overview' when topic is absent or blank", async () => {
      await ingestLibraryDoc(
        { libraryId: "/lodash/lodash", docs: "Utility library." },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(lastInserted().name).toContain("overview");
    });

    it("stores context7/library tags on the row", async () => {
      await ingestLibraryDoc(
        { libraryId: "/stripe/stripe-node", topic: "payments", docs: "Stripe SDK." },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      const row = lastInserted();
      expect(row.tags).toContain("context7");
      expect(row.tags).toContain("library");
    });

    it("stores metadata with kind, libraryId, version and topic", async () => {
      await ingestLibraryDoc(
        {
          libraryId: "/axios/axios",
          topic: "interceptors",
          version: "1.6.0",
          docs: "Request/response interceptors.",
        },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      const meta = lastInserted().metadata;
      expect(meta.kind).toBe("context7_doc");
      expect(meta.libraryId).toBe("/axios/axios");
      expect(meta.version).toBe("1.6.0");
      expect(meta.topic).toBe("interceptors");
    });

    it("handles docs as an array of {title, content} objects", async () => {
      const docs = [
        { title: "Introduction", content: "What is Zod?" },
        { title: "Basic usage", content: "z.string().min(3)" },
      ];

      const result = await ingestLibraryDoc(
        { libraryId: "/colinhacks/zod", topic: "schema", docs },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(result.persisted).toBe(true);
    });

    it("skips write and returns persisted=false when target cannot be resolved", async () => {
      delete process.env.AITM_MEMORY_USER_ID;
      delete process.env.AITM_MEMORY_PROJECT_ID;

      const before = mockSavedContexts.length;
      const result = await ingestLibraryDoc(
        { libraryId: "/no/target", docs: "some docs" },
        {} // no userId or projectId
      );

      expect(result.persisted).toBe(false);
      expect(result.skippedReason).toBeTruthy();
      expect(mockSavedContexts.length).toBe(before);
    });

    it("never throws even when the DB insert rejects", async () => {
      // Make the mock DB throw on the next insert by temporarily replacing it
      const { db } = await import("../../src/db/index.js");
      const originalInsert = db.insert.bind(db);
      vi.spyOn(db, "insert").mockImplementationOnce(() => {
        throw new Error("DB constraint violation");
      });

      const result = await ingestLibraryDoc(
        { libraryId: "/fail/case", docs: "docs" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(result.persisted).toBe(false);
      expect(result.skippedReason).toBeTruthy();

      // Restore
      vi.mocked(db.insert).mockRestore?.();
      (db as any).insert = originalInsert;
    });
  });

  // =========================================================================
  // Embedding service integration
  // =========================================================================

  describe("embedding service integration", () => {
    it("calls generateEmbedding when ingesting a task", async () => {
      mockGenerateEmbedding.mockClear();

      await ingestTask(
        { id: "task_emb", title: "Embedding check" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      expect(mockGenerateEmbedding).toHaveBeenCalledOnce();
      const callArg: string = mockGenerateEmbedding.mock.calls[0][0];
      expect(callArg).toContain("Embedding check");
    });

    it("stores the returned embedding vector and model on the row", async () => {
      mockGenerateEmbedding.mockResolvedValueOnce({
        embedding: [0.9, 0.8, 0.7],
        model: "test-embed-model",
        dimensions: 3,
      });

      await ingestTask(
        { id: "task_vec", title: "Vector check" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      const row = lastInserted();
      expect(row.embeddingJson).toEqual([0.9, 0.8, 0.7]);
      expect(row.embeddingModel).toBe("test-embed-model");
    });

    it("stores null embedding when generateEmbedding returns a failure", async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error("quota exceeded"));

      const result = await ingestLibraryDoc(
        { libraryId: "/null/embed", docs: "some content" },
        { userId: "user_test_001", projectId: "proj_test_001" }
      );

      // Best-effort: still persisted
      expect(result.persisted).toBe(true);
      expect(lastInserted().embeddingJson).toBeNull();
      expect(lastInserted().embeddingModel).toBeNull();
    });
  });
});
