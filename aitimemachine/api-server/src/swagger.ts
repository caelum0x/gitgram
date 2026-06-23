import type { Express, Request, Response } from "express";

/**
 * OpenAPI 3.0.3 specification for the AITimeMachine API.
 *
 * This is self-contained: no swagger-jsdoc or swagger-ui-express dependency
 * required. We serve the raw JSON spec and a Swagger UI page from CDN assets.
 */
const spec = {
  openapi: "3.0.3",
  info: {
    title: "Gitgram TimeMachine API",
    version: "1.0.0",
    description:
      "Time travel for AI-assisted development -- API for cloud sync, search, and team features. " +
      "All authenticated endpoints require a Bearer token (API key with the `aitm_` prefix) " +
      "sent in the `Authorization` header.",
    contact: { name: "Gitgram TimeMachine", url: "https://timemachine.gitgram.app" },
    license: { name: "MIT" },
  },
  servers: [{ url: "/v1", description: "V1 API" }],

  // ---------------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------------
  security: [{ BearerAuth: [] }],

  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "API Key (aitm_*)",
        description:
          "API key with the `aitm_` prefix. Pass as `Authorization: Bearer aitm_...`",
      },
    },

    schemas: {
      // ------ Shared error / envelope schemas ------
      Error: {
        type: "object" as const,
        properties: {
          error: {
            type: "object" as const,
            properties: {
              message: { type: "string" as const },
              type: { type: "string" as const },
              code: { type: "string" as const },
            },
            required: ["message"],
          },
        },
      },
      SimpleError: {
        type: "object" as const,
        properties: {
          error: { type: "string" as const },
        },
      },

      // ------ Auth ------
      AuthMeResponse: {
        type: "object" as const,
        properties: {
          userId: { type: "string" as const },
          email: { type: "string" as const },
          plan: { type: "string" as const },
        },
      },

      // ------ Keys ------
      ApiKey: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          keyPrefix: { type: "string" as const },
          scopes: { type: "array" as const, items: { type: "string" as const } },
          expiresAt: { type: "string" as const, format: "date-time", nullable: true },
          allowedIps: {
            type: "array" as const,
            items: { type: "string" as const },
            nullable: true,
          },
          lastUsedAt: { type: "string" as const, format: "date-time", nullable: true },
          createdAt: { type: "string" as const, format: "date-time" },
          revokedAt: { type: "string" as const, format: "date-time", nullable: true },
          status: {
            type: "string" as const,
            enum: ["active", "expired", "revoked"],
          },
        },
      },
      CreateKeyRequest: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, default: "API Key" },
          scopes: {
            type: "array" as const,
            items: { type: "string" as const, enum: ["read", "write", "admin"] },
            default: ["read", "write"],
          },
          expiresAt: {
            type: "string" as const,
            format: "date-time",
            description: "ISO 8601 date. Must be in the future.",
          },
          allowedIps: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "List of allowed IP addresses.",
          },
        },
      },
      CreateKeyResponse: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          key: {
            type: "string" as const,
            description: "The full API key. Only returned at creation time.",
          },
          name: { type: "string" as const },
          keyPrefix: { type: "string" as const },
          scopes: { type: "array" as const, items: { type: "string" as const } },
          expiresAt: { type: "string" as const, format: "date-time", nullable: true },
          allowedIps: {
            type: "array" as const,
            items: { type: "string" as const },
            nullable: true,
          },
          createdAt: { type: "string" as const, format: "date-time" },
          message: { type: "string" as const },
        },
      },

      // ------ Sessions ------
      Session: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          device: {
            type: "object" as const,
            properties: {
              browser: { type: "string" as const },
              os: { type: "string" as const },
              device: { type: "string" as const },
              isMobile: { type: "boolean" as const },
            },
          },
          location: { type: "string" as const },
          ip_address: { type: "string" as const, nullable: true },
          last_active: { type: "string" as const, format: "date-time", nullable: true },
          created_at: { type: "string" as const, format: "date-time", nullable: true },
          expires_at: { type: "string" as const, format: "date-time" },
          is_current: { type: "boolean" as const },
        },
      },

      // ------ Sync ------
      SyncProjectRequest: {
        type: "object" as const,
        required: ["id", "name"],
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          rootPath: { type: "string" as const },
        },
      },
      SyncCheckpointRequest: {
        type: "object" as const,
        required: ["id", "projectId", "name", "manifestHash"],
        properties: {
          id: { type: "string" as const },
          projectId: { type: "string" as const },
          parentId: { type: "string" as const },
          name: { type: "string" as const },
          description: { type: "string" as const },
          scope: { type: "string" as const },
          manifestHash: { type: "string" as const },
          triggerType: { type: "string" as const },
          linkedCheckpointId: { type: "string" as const },
          createdAt: { type: "string" as const, format: "date-time" },
          metadata: { type: "object" as const, additionalProperties: true },
        },
      },
      SyncBlobRequest: {
        type: "object" as const,
        required: ["hash", "size", "content"],
        properties: {
          hash: { type: "string" as const },
          size: { type: "number" as const },
          mimeType: { type: "string" as const },
          content: { type: "string" as const, description: "Base64-encoded content" },
        },
      },

      // ------ Restore ------
      Project: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          rootPath: { type: "string" as const },
          userId: { type: "string" as const },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
          lastSyncedAt: { type: "string" as const, format: "date-time", nullable: true },
        },
      },
      Checkpoint: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          projectId: { type: "string" as const },
          name: { type: "string" as const },
          description: { type: "string" as const },
          scope: { type: "string" as const },
          manifestHash: { type: "string" as const },
          triggerType: { type: "string" as const },
          createdAt: { type: "string" as const, format: "date-time" },
          metadata: { type: "object" as const, additionalProperties: true },
        },
      },

      // ------ Search ------
      SearchRequest: {
        type: "object" as const,
        required: ["query"],
        properties: {
          query: { type: "string" as const },
          project_id: { type: "string" as const },
          sources: {
            type: "array" as const,
            items: { type: "string" as const, enum: ["checkpoints", "messages"] },
            default: ["checkpoints", "messages"],
          },
          max_results: { type: "integer" as const, default: 20 },
        },
      },
      SearchResult: {
        type: "object" as const,
        properties: {
          source: { type: "string" as const },
          id: { type: "string" as const },
          title: { type: "string" as const },
          snippet: { type: "string" as const },
          project_id: { type: "string" as const },
          created_at: { type: "string" as const, format: "date-time" },
        },
      },

      // ------ Contexts ------
      Context: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          project_id: { type: "string" as const },
          checkpoint_id: { type: "string" as const, nullable: true },
          name: { type: "string" as const },
          description: { type: "string" as const, nullable: true },
          tool: { type: "string" as const },
          is_auto_saved: { type: "boolean" as const },
          tags: { type: "array" as const, items: { type: "string" as const }, nullable: true },
          message_count: { type: "integer" as const },
          open_files: { type: "array" as const, items: { type: "string" as const }, nullable: true },
          git_branch: { type: "string" as const, nullable: true },
          created_at: { type: "string" as const, format: "date-time" },
          updated_at: { type: "string" as const, format: "date-time" },
        },
      },
      CreateContextRequest: {
        type: "object" as const,
        required: ["projectId", "name"],
        properties: {
          projectId: { type: "string" as const },
          name: { type: "string" as const },
          description: { type: "string" as const },
          messages: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                role: { type: "string" as const, enum: ["user", "assistant", "system"] },
                content: { type: "string" as const },
                timestamp: { type: "string" as const, format: "date-time" },
              },
              required: ["role", "content"],
            },
          },
          systemPrompt: { type: "string" as const },
          openFiles: { type: "array" as const, items: { type: "string" as const } },
          workingDirectory: { type: "string" as const },
          gitBranch: { type: "string" as const },
          gitCommit: { type: "string" as const },
          checkpointId: { type: "string" as const },
          tool: { type: "string" as const, default: "claude-code" },
          isAutoSaved: { type: "boolean" as const, default: false },
          tags: { type: "array" as const, items: { type: "string" as const } },
          expiresAt: { type: "string" as const, format: "date-time" },
          metadata: { type: "object" as const, additionalProperties: true },
        },
      },

      // ------ Knowledge Base Schemas ------
      KnowledgeBaseFile: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const, format: "uuid" },
          repository_id: { type: "string" as const },
          project_id: { type: "string" as const },
          path: { type: "string" as const },
          content: { type: "string" as const, nullable: true, description: "File content. Null when stored in S3." },
          language: { type: "string" as const, nullable: true },
          size: { type: "integer" as const },
          source: { type: "string" as const, enum: ["local", "git"] },
          storage: { type: "string" as const, enum: ["db", "s3"], description: "Where the file content lives." },
          s3: {
            type: "object" as const,
            nullable: true,
            description: "S3 pointer (present when storage=s3).",
            properties: {
              bucket: { type: "string" as const },
              key: { type: "string" as const },
              url: { type: "string" as const },
            },
          },
          indexed_at: { type: "string" as const, format: "date-time" },
          updated_at: { type: "string" as const, format: "date-time" },
        },
      },
      KnowledgeBaseArtifact: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          type: { type: "string" as const, enum: ["export", "pipeline"] },
          format: { type: "string" as const },
          storage: { type: "string" as const, enum: ["db", "s3"] },
          size: { type: "integer" as const },
          stats: { type: "object" as const, nullable: true, additionalProperties: true },
          s3: {
            type: "object" as const,
            nullable: true,
            properties: {
              bucket: { type: "string" as const },
              key: { type: "string" as const },
              url: { type: "string" as const },
            },
          },
          content: { type: "object" as const, nullable: true, additionalProperties: true },
          created_at: { type: "string" as const, format: "date-time" },
        },
      },
      UnifiedKBSearchRequest: {
        type: "object" as const,
        required: ["query"],
        properties: {
          query: { type: "string" as const, description: "Search term (case-insensitive substring match)." },
          repository_id: { type: "string" as const },
          project_id: { type: "string" as const },
          limit: { type: "integer" as const, default: 20 },
        },
      },
      UnifiedKBSearchResponse: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const },
          files: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "string" as const },
                repository_id: { type: "string" as const },
                file_path: { type: "string" as const },
                language: { type: "string" as const, nullable: true },
                size: { type: "integer" as const },
                updated_at: { type: "string" as const, format: "date-time" },
                snippet: { type: "string" as const, nullable: true },
              },
            },
          },
          artifacts: {
            type: "array" as const,
            items: { $ref: "#/components/schemas/KnowledgeBaseArtifact" },
          },
          embeddings: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "string" as const },
                repository_id: { type: "string" as const },
                file_path: { type: "string" as const },
                symbol: { type: "string" as const, nullable: true },
                symbol_type: { type: "string" as const, nullable: true },
                language: { type: "string" as const, nullable: true },
                line_start: { type: "integer" as const, nullable: true },
                line_end: { type: "integer" as const, nullable: true },
                snippet: { type: "string" as const },
              },
            },
          },
          total: { type: "integer" as const },
        },
      },

      // ------ Universal Search ------
      UniversalSearchRequest: {
        type: "object" as const,
        required: ["query"],
        properties: {
          query: { type: "string" as const },
          repositories: { type: "array" as const, items: { type: "string" as const } },
          data_sources: { type: "array" as const, items: { type: "string" as const } },
          search_mode: {
            type: "string" as const,
            enum: ["unified", "hybrid", "semantic"],
            default: "unified",
          },
          limit: { type: "integer" as const, default: 20 },
          offset: { type: "integer" as const, default: 0 },
          sources: {
            type: "array" as const,
            items: {
              type: "string" as const,
              enum: ["code", "knowledge_base", "artifact", "context", "message", "repository", "data_source"],
            },
            default: ["code", "knowledge_base", "artifact", "context", "message"],
          },
        },
      },
      UniversalSearchResult: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          source: { type: "string" as const, enum: ["code", "knowledge_base", "artifact", "context", "message", "repository", "data_source"] },
          score: { type: "number" as const },
          title: { type: "string" as const },
          snippet: { type: "string" as const },
          match_offsets: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                field: { type: "string" as const },
                start: { type: "integer" as const },
                end: { type: "integer" as const },
              },
            },
          },
          metadata: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              file_path: { type: "string" as const },
              language: { type: "string" as const },
              content_hash: { type: "string" as const, description: "SHA-256 hash (KB file results)." },
              size: { type: "integer" as const, description: "File size in bytes (KB file results)." },
            },
          },
        },
      },

      // ------ Oracle ------
      OracleRequest: {
        type: "object" as const,
        required: ["query"],
        properties: {
          query: { type: "string" as const },
          project_id: { type: "string" as const },
          sources: { type: "array" as const, items: { type: "string" as const } },
          max_depth: { type: "integer" as const, default: 3 },
          include_web_search: { type: "boolean" as const, default: true },
          metadata: { type: "object" as const, additionalProperties: true },
        },
      },
      OracleSession: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          query: { type: "string" as const },
          status: {
            type: "string" as const,
            enum: ["running", "processing", "completed", "failed"],
          },
          progress: { type: "integer" as const },
          result: { type: "object" as const, nullable: true },
          sources: { type: "array" as const, items: { type: "string" as const }, nullable: true },
          summary: { type: "string" as const, nullable: true },
          error: { type: "string" as const, nullable: true },
          created_at: { type: "string" as const, format: "date-time" },
          started_at: { type: "string" as const, format: "date-time", nullable: true },
          completed_at: { type: "string" as const, format: "date-time", nullable: true },
        },
      },

      // ------ Pipeline ------
      PipelineRequest: {
        type: "object" as const,
        properties: {
          include_chats: { type: "boolean" as const, default: true },
          include_code_changes: { type: "boolean" as const, default: true },
          include_terminal: { type: "boolean" as const, default: true },
          include_checkpoints: { type: "boolean" as const, default: true },
          project_ids: { type: "array" as const, items: { type: "string" as const } },
          since: { type: "string" as const, format: "date-time" },
          until: { type: "string" as const, format: "date-time" },
          min_turns: { type: "integer" as const, default: 2 },
          format: {
            type: "string" as const,
            enum: ["generic", "raw"],
            default: "generic",
          },
          redact_secrets: { type: "boolean" as const, default: true },
          schedule: { type: "string" as const, description: "Cron expression for recurring runs" },
          webhook_url: { type: "string" as const, format: "uri" },
        },
      },
      PipelineJob: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          status: {
            type: "string" as const,
            enum: ["queued", "running", "completed", "failed"],
          },
          progress: { type: "number" as const },
          config: { type: "object" as const, additionalProperties: true },
          stats: { type: "object" as const, additionalProperties: true, nullable: true },
          result: { type: "object" as const, additionalProperties: true, nullable: true },
          error: { type: "string" as const, nullable: true },
          created_at: { type: "string" as const, format: "date-time" },
          updated_at: { type: "string" as const, format: "date-time" },
        },
      },

      // ------ Health ------
      HealthResponse: {
        type: "object" as const,
        properties: {
          status: { type: "string" as const, enum: ["healthy", "unhealthy", "degraded"] },
          timestamp: { type: "string" as const, format: "date-time" },
          version: { type: "string" as const },
          uptime: { type: "number" as const, description: "Uptime in milliseconds" },
          uptimeFormatted: { type: "string" as const },
          checks: {
            type: "object" as const,
            additionalProperties: {
              type: "object" as const,
              properties: {
                status: { type: "string" as const, enum: ["pass", "fail", "warn"] },
                message: { type: "string" as const },
                duration_ms: { type: "number" as const },
              },
            },
          },
        },
      },
    },

    // Reusable response definitions
    responses: {
      Unauthorized: {
        description: "Missing or invalid API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SimpleError" },
            example: { error: "Unauthorized" },
          },
        },
      },
      Forbidden: {
        description: "Insufficient permissions / scope",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SimpleError" },
            example: { error: "Forbidden" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SimpleError" },
            example: { error: "Not found" },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SimpleError" },
            example: { error: "Internal server error" },
          },
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------------
  paths: {
    // ========================================================================
    // Auth
    // ========================================================================
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user info",
        description:
          "Verify the API key and return the associated user information including userId, email, and plan.",
        operationId: "getAuthMe",
        responses: {
          "200": {
            description: "User info",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthMeResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Keys
    // ========================================================================
    "/keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys",
        description:
          "List all API keys for the authenticated user, including their status (active, expired, revoked). Requires `read` scope.",
        operationId: "listKeys",
        responses: {
          "200": {
            description: "List of API keys",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    keys: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/ApiKey" },
                    },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        tags: ["API Keys"],
        summary: "Create a new API key",
        description:
          "Generate a new API key. The full key value is only returned once in the response. " +
          "Requires `admin` scope.",
        operationId: "createKey",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateKeyRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Key created. Store the `key` field -- it will not be shown again.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateKeyResponse" },
              },
            },
          },
          "400": {
            description: "Validation error (invalid scopes, expiration, or IPs)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SimpleError" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/keys/{id}": {
      get: {
        tags: ["API Keys"],
        summary: "Get API key details",
        description: "Get details of a specific API key. Requires `read` scope.",
        operationId: "getKey",
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
            description: "API key ID",
          },
        ],
        responses: {
          "200": {
            description: "Key details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKey" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      patch: {
        tags: ["API Keys"],
        summary: "Update API key metadata",
        description:
          "Update name, expiration, or allowed IPs for an API key. Requires `admin` scope.",
        operationId: "updateKey",
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  expiresAt: { type: "string" as const, format: "date-time", nullable: true },
                  allowedIps: {
                    type: "array" as const,
                    items: { type: "string" as const },
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Key updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKey" },
              },
            },
          },
          "400": {
            description: "Validation error or no updates provided",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SimpleError" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["API Keys"],
        summary: "Revoke an API key",
        description:
          "Revoke (soft-delete) an API key so it can no longer be used. " +
          "You cannot revoke the key you are currently using. Requires `write` scope.",
        operationId: "revokeKey",
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        responses: {
          "200": {
            description: "Key revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    id: { type: "string" as const },
                    status: { type: "string" as const, example: "revoked" },
                    revokedAt: { type: "string" as const, format: "date-time" },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Already revoked or attempting to revoke the current key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SimpleError" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/keys/{id}/scopes": {
      patch: {
        tags: ["API Keys"],
        summary: "Update API key scopes",
        description: "Update the scopes of an API key. Requires `admin` scope.",
        operationId: "updateKeyScopes",
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["scopes"],
                properties: {
                  scopes: {
                    type: "array" as const,
                    items: { type: "string" as const, enum: ["read", "write", "admin"] },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Scopes updated",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    id: { type: "string" as const },
                    scopes: { type: "array" as const, items: { type: "string" as const } },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid scopes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SimpleError" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/keys/scopes/available": {
      get: {
        tags: ["API Keys"],
        summary: "List available scopes",
        description: "List all available API key scopes with descriptions. Requires `read` scope.",
        operationId: "listAvailableScopes",
        responses: {
          "200": {
            description: "Available scopes",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    scopes: { type: "array" as const, items: { type: "string" as const } },
                    descriptions: { type: "object" as const, additionalProperties: { type: "string" as const } },
                    default: { type: "array" as const, items: { type: "string" as const } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Sessions
    // ========================================================================
    "/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "List active sessions",
        description: "List all active sessions for the authenticated user.",
        operationId: "listSessions",
        responses: {
          "200": {
            description: "Session list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    sessions: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/Session" },
                    },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Sessions"],
        summary: "Revoke all sessions",
        description:
          "Revoke all sessions except optionally the current one. " +
          "Requires `current_session_id` query param when `except_current=true`.",
        operationId: "revokeAllSessions",
        parameters: [
          {
            name: "except_current",
            in: "query" as const,
            schema: { type: "boolean" as const, default: true },
          },
          {
            name: "current_session_id",
            in: "query" as const,
            schema: { type: "string" as const },
            description: "Required when except_current is true",
          },
        ],
        responses: {
          "200": {
            description: "Sessions revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    message: { type: "string" as const },
                    revoked_count: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing current_session_id",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/sessions/{id}": {
      delete: {
        tags: ["Sessions"],
        summary: "Revoke a specific session",
        description: "Revoke a single session by its ID.",
        operationId: "revokeSession",
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        responses: {
          "200": {
            description: "Session revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing session ID",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/sessions/cleanup": {
      post: {
        tags: ["Sessions"],
        summary: "Clean up expired sessions",
        description: "Remove expired sessions from the database. Requires authentication.",
        operationId: "cleanupSessions",
        responses: {
          "200": {
            description: "Cleanup result",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    message: { type: "string" as const },
                    cleaned_count: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Sync
    // ========================================================================
    "/sync/projects": {
      post: {
        tags: ["Sync"],
        summary: "Sync a project",
        description: "Create or update a project for cloud sync.",
        operationId: "syncProject",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SyncProjectRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Project synced",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    projectId: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid project data",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/sync/checkpoints": {
      post: {
        tags: ["Sync"],
        summary: "Sync a checkpoint",
        description: "Upload a single checkpoint to the cloud.",
        operationId: "syncCheckpoint",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SyncCheckpointRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkpoint synced",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    checkpointId: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid checkpoint data",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/sync/checkpoints/batch": {
      post: {
        tags: ["Sync"],
        summary: "Batch sync checkpoints",
        description: "Upload multiple checkpoints in a single request.",
        operationId: "syncCheckpointsBatch",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["checkpoints"],
                properties: {
                  checkpoints: {
                    type: "array" as const,
                    items: { $ref: "#/components/schemas/SyncCheckpointRequest" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Batch sync result",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    synced: { type: "integer" as const },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid data",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/sync/blobs": {
      post: {
        tags: ["Sync"],
        summary: "Sync a blob",
        description:
          "Upload a blob (file content) for checkpoint storage. Content must be Base64-encoded. " +
          "Subject to storage quota limits.",
        operationId: "syncBlob",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SyncBlobRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Blob synced (or already existed)",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    success: { type: "boolean" as const },
                    exists: { type: "boolean" as const },
                    hash: { type: "string" as const },
                    storageAdded: { type: "integer" as const },
                    storageAddedFormatted: { type: "string" as const },
                    quota: {
                      type: "object" as const,
                      properties: {
                        used: { type: "integer" as const },
                        usedFormatted: { type: "string" as const },
                        limit: { type: "integer" as const },
                        limitFormatted: { type: "string" as const },
                        percentage: { type: "integer" as const },
                      },
                    },
                    quotaWarning: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid blob data",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "413": {
            description: "Storage quota exceeded",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
        },
      },
    },
    "/sync/blobs/check": {
      post: {
        tags: ["Sync"],
        summary: "Check existing blobs",
        description: "Check which blobs already exist on the server to avoid re-uploading.",
        operationId: "checkBlobs",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["hashes"],
                properties: {
                  hashes: { type: "array" as const, items: { type: "string" as const } },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Blob existence check results",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    existing: { type: "array" as const, items: { type: "string" as const } },
                    missing: { type: "array" as const, items: { type: "string" as const } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/sync/quota": {
      get: {
        tags: ["Sync"],
        summary: "Get storage quota",
        description: "Get current storage usage and quota information.",
        operationId: "getQuota",
        responses: {
          "200": {
            description: "Quota info",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    used: { type: "integer" as const },
                    usedFormatted: { type: "string" as const },
                    limit: { type: "integer" as const },
                    limitFormatted: { type: "string" as const },
                    percentage: { type: "integer" as const },
                    plan: { type: "string" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Restore
    // ========================================================================
    "/restore/projects": {
      get: {
        tags: ["Restore"],
        summary: "List projects",
        description: "List all projects for the authenticated user.",
        operationId: "listProjects",
        responses: {
          "200": {
            description: "Project list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    projects: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/Project" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/restore/projects/{projectId}": {
      get: {
        tags: ["Restore"],
        summary: "Get project details",
        description: "Get details of a specific project by ID.",
        operationId: "getProject",
        parameters: [
          {
            name: "projectId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        responses: {
          "200": {
            description: "Project details",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    project: { $ref: "#/components/schemas/Project" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/restore/projects/{projectId}/checkpoints": {
      get: {
        tags: ["Restore"],
        summary: "List checkpoints for a project",
        description: "List all checkpoints for a project with optional pagination and search.",
        operationId: "listCheckpoints",
        parameters: [
          {
            name: "projectId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
          {
            name: "limit",
            in: "query" as const,
            schema: { type: "integer" as const, default: 50 },
          },
          {
            name: "offset",
            in: "query" as const,
            schema: { type: "integer" as const, default: 0 },
          },
          {
            name: "search",
            in: "query" as const,
            schema: { type: "string" as const },
          },
        ],
        responses: {
          "200": {
            description: "Checkpoint list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    checkpoints: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/Checkpoint" },
                    },
                    project: { $ref: "#/components/schemas/Project" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/restore/projects/{projectId}/checkpoints/{checkpointId}": {
      get: {
        tags: ["Restore"],
        summary: "Get checkpoint details",
        description: "Get details of a specific checkpoint.",
        operationId: "getCheckpoint",
        parameters: [
          {
            name: "projectId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
          {
            name: "checkpointId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
        ],
        responses: {
          "200": {
            description: "Checkpoint details",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    checkpoint: { $ref: "#/components/schemas/Checkpoint" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/restore/projects/{projectId}/checkpoints/{checkpointId}/full": {
      get: {
        tags: ["Restore"],
        summary: "Full context restore",
        description:
          "Get everything needed to restore a project to a specific checkpoint, including manifest, " +
          "recent messages, and terminal events.",
        operationId: "fullRestore",
        parameters: [
          {
            name: "projectId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
          {
            name: "checkpointId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
          },
          {
            name: "includeMessages",
            in: "query" as const,
            schema: { type: "string" as const, default: "true" },
          },
          {
            name: "messageLimit",
            in: "query" as const,
            schema: { type: "integer" as const, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Full restore data including checkpoint, manifest, messages, and terminal events",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    checkpoint: { $ref: "#/components/schemas/Checkpoint" },
                    manifest: { type: "string" as const, nullable: true, description: "Base64-encoded manifest" },
                    messages: { type: "array" as const, items: { type: "object" as const } },
                    terminalEvents: { type: "array" as const, items: { type: "object" as const } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Search
    // ========================================================================
    "/search/universal": {
      post: {
        tags: ["Search"],
        summary: "Universal search",
        description: "Search across all sources including checkpoints and messages.",
        operationId: "universalSearch",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SearchRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    query: { type: "string" as const },
                    sources: { type: "array" as const, items: { type: "string" as const } },
                    results: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/SearchResult" },
                    },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing query parameter",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/checkpoints": {
      post: {
        tags: ["Search"],
        summary: "Search checkpoints",
        description: "Search through checkpoint history by name.",
        operationId: "searchCheckpoints",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const },
                  project_id: { type: "string" as const },
                  max_results: { type: "integer" as const, default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkpoint search results",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/conversations": {
      post: {
        tags: ["Search"],
        summary: "Search conversations",
        description: "Search through AI conversation history with optional role filtering.",
        operationId: "searchConversations",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const },
                  project_id: { type: "string" as const },
                  role: { type: "string" as const, enum: ["user", "assistant", "system", "all"] },
                  max_results: { type: "integer" as const, default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Conversation search results",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/code": {
      post: {
        tags: ["Search"],
        summary: "Search code",
        description: "Search code across repositories using indexed embeddings.",
        operationId: "searchCode",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const },
                  project_id: { type: "string" as const },
                  file_types: { type: "array" as const, items: { type: "string" as const } },
                  symbol_type: { type: "string" as const },
                  max_results: { type: "integer" as const, default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Code search results",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/symbols": {
      post: {
        tags: ["Search"],
        summary: "Search symbols",
        description: "Search for specific code symbols (functions, classes, etc.).",
        operationId: "searchSymbols",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["symbol"],
                properties: {
                  symbol: { type: "string" as const },
                  project_id: { type: "string" as const },
                  symbol_type: { type: "string" as const },
                  max_results: { type: "integer" as const, default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Symbol search results",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/find-definition": {
      post: {
        tags: ["Search"],
        summary: "Find symbol definition",
        description: "Find the definition of a specific symbol across the codebase.",
        operationId: "findDefinition",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["symbol"],
                properties: {
                  symbol: { type: "string" as const },
                  project_id: { type: "string" as const },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Definition result (found or not found)",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/find-usages": {
      post: {
        tags: ["Search"],
        summary: "Find symbol usages",
        description: "Find all usages of a symbol across the codebase.",
        operationId: "findUsages",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["symbol"],
                properties: {
                  symbol: { type: "string" as const },
                  project_id: { type: "string" as const },
                  max_results: { type: "integer" as const, default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Usage search results",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Contexts
    // ========================================================================
    "/contexts": {
      get: {
        tags: ["Contexts"],
        summary: "List conversation contexts",
        description: "List saved conversation contexts with optional filters by project, tool, and tags.",
        operationId: "listContexts",
        parameters: [
          { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
          { name: "tool", in: "query" as const, schema: { type: "string" as const } },
          { name: "tags", in: "query" as const, schema: { type: "string" as const }, description: "Comma-separated tag list" },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const, default: 20 } },
          { name: "offset", in: "query" as const, schema: { type: "integer" as const, default: 0 } },
        ],
        responses: {
          "200": {
            description: "Context list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    data: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/Context" },
                    },
                    has_more: { type: "boolean" as const },
                    limit: { type: "integer" as const },
                    offset: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        tags: ["Contexts"],
        summary: "Save a new context",
        description:
          "Save a conversation context with messages, system prompt, file state, and git info. " +
          "An embedding is automatically generated for semantic search.",
        operationId: "createContext",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateContextRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Context created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Context" },
              },
            },
          },
          "400": {
            description: "Missing required fields",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/contexts/search/text": {
      get: {
        tags: ["Contexts"],
        summary: "Text search contexts",
        description: "Search across context names, descriptions, and message content.",
        operationId: "textSearchContexts",
        parameters: [
          { name: "q", in: "query" as const, required: true, schema: { type: "string" as const } },
          { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Text search results with matching snippets",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "400": {
            description: "Missing query",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/contexts/search/semantic": {
      get: {
        tags: ["Contexts"],
        summary: "Semantic search contexts",
        description:
          "Search across contexts using vector embeddings for semantic similarity. " +
          "Falls back to text search if embeddings are unavailable.",
        operationId: "semanticSearchContexts",
        parameters: [
          { name: "q", in: "query" as const, required: true, schema: { type: "string" as const } },
          { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const, default: 20 } },
          { name: "threshold", in: "query" as const, schema: { type: "number" as const, default: 0.3 }, description: "Minimum similarity score" },
        ],
        responses: {
          "200": {
            description: "Semantic search results with similarity scores",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "400": {
            description: "Missing query",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/contexts/{id}": {
      get: {
        tags: ["Contexts"],
        summary: "Get context by ID",
        description: "Get a specific saved context with full message history.",
        operationId: "getContext",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Context with full details including messages",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      put: {
        tags: ["Contexts"],
        summary: "Update a context",
        description: "Update an existing context. Embedding is regenerated if content changes.",
        operationId: "updateContext",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateContextRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Context updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Context" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Contexts"],
        summary: "Delete a context",
        description: "Permanently delete a saved context.",
        operationId: "deleteContext",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Context deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    deleted: { type: "boolean" as const },
                    id: { type: "string" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Universal Search
    // ========================================================================
    "/universal-search": {
      post: {
        tags: ["Universal Search"],
        summary: "Search across all sources",
        description:
          "Unified search across code, saved contexts, chat messages, repositories, and data sources. " +
          "Supports unified, hybrid, and semantic search modes.",
        operationId: "universalSearchPost",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UniversalSearchRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Paginated search results",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    query: { type: "string" as const },
                    search_mode: { type: "string" as const },
                    sources: { type: "array" as const, items: { type: "string" as const } },
                    data: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/UniversalSearchResult" },
                    },
                    pagination: {
                      type: "object" as const,
                      properties: {
                        total: { type: "integer" as const },
                        limit: { type: "integer" as const },
                        offset: { type: "integer" as const },
                        has_more: { type: "boolean" as const },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing query parameter",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/universal-search/sources": {
      get: {
        tags: ["Universal Search"],
        summary: "List available search sources",
        description: "List all available search sources and modes with their current counts.",
        operationId: "listSearchSources",
        responses: {
          "200": {
            description: "Available sources and search modes",
            content: { "application/json": { schema: { type: "object" as const } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/universal-search/query": {
      post: {
        tags: ["Universal Search"],
        summary: "Conversational search with chat context",
        description:
          "Search with additional conversation context for context-aware ranking. " +
          "Recent messages are used to boost relevance of results matching the current conversation topic.",
        operationId: "queryWithContext",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const },
                  context: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      required: ["role", "content"],
                      properties: {
                        role: { type: "string" as const, enum: ["user", "assistant", "system"] },
                        content: { type: "string" as const },
                      },
                    },
                  },
                  repositories: { type: "array" as const, items: { type: "string" as const } },
                  limit: { type: "integer" as const, default: 20 },
                  offset: { type: "integer" as const, default: 0 },
                  include_sources: { type: "boolean" as const, default: true },
                  search_mode: {
                    type: "string" as const,
                    enum: ["unified", "hybrid", "semantic"],
                    default: "hybrid",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Context-aware search results with source breakdown",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    query: { type: "string" as const },
                    search_mode: { type: "string" as const },
                    context_length: { type: "integer" as const },
                    data: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/UniversalSearchResult" },
                    },
                    pagination: {
                      type: "object" as const,
                      properties: {
                        total: { type: "integer" as const },
                        limit: { type: "integer" as const },
                        offset: { type: "integer" as const },
                        has_more: { type: "boolean" as const },
                      },
                    },
                    source_breakdown: { type: "object" as const, additionalProperties: true },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid query or context format",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Oracle
    // ========================================================================
    "/oracle": {
      post: {
        tags: ["Oracle"],
        summary: "Start Oracle research session",
        description:
          "Start an autonomous multi-step research session. Requires Pro plan. " +
          "The research runs asynchronously -- poll GET /v1/oracle/:id for results.",
        operationId: "createOracleSession",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OracleRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Research session started",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    session_id: { type: "string" as const },
                    query: { type: "string" as const },
                    status: { type: "string" as const, example: "running" },
                    sources: { type: "array" as const, items: { type: "string" as const } },
                    created_at: { type: "string" as const, format: "date-time" },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing query",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": {
            description: "Pro plan required",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      get: {
        tags: ["Oracle"],
        summary: "List Oracle sessions",
        description: "List all Oracle research sessions for the authenticated user.",
        operationId: "listOracleSessions",
        parameters: [
          { name: "project_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "status", in: "query" as const, schema: { type: "string" as const, enum: ["running", "processing", "completed", "failed"] } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Oracle session list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    sessions: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          id: { type: "string" as const },
                          query: { type: "string" as const },
                          status: { type: "string" as const },
                          progress: { type: "integer" as const },
                          created_at: { type: "string" as const, format: "date-time" },
                          completed_at: { type: "string" as const, format: "date-time", nullable: true },
                        },
                      },
                    },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/oracle/{id}": {
      get: {
        tags: ["Oracle"],
        summary: "Get Oracle session details",
        description: "Get the details and result of an Oracle research session.",
        operationId: "getOracleSession",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Oracle session details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OracleSession" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Oracle"],
        summary: "Delete Oracle session",
        description: "Cancel and delete an Oracle research session.",
        operationId: "deleteOracleSession",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Session deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    deleted: { type: "boolean" as const },
                    id: { type: "string" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/oracle/{id}/followup": {
      post: {
        tags: ["Oracle"],
        summary: "Send follow-up to Oracle session",
        description: "Send a follow-up question to an existing Oracle research session.",
        operationId: "oracleFollowup",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["message"],
                properties: {
                  message: { type: "string" as const },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Follow-up response",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    session_id: { type: "string" as const },
                    message: { type: "string" as const },
                    response: { type: "string" as const },
                    status: { type: "string" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/oracle/stream": {
      post: {
        tags: ["Oracle"],
        summary: "Stream Oracle research (SSE)",
        description:
          "Start an Oracle research session with Server-Sent Events (SSE) streaming for real-time progress. " +
          "Requires Pro plan.",
        operationId: "streamOracleSession",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const },
                  project_id: { type: "string" as const },
                  sources: { type: "array" as const, items: { type: "string" as const } },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "SSE stream with progress and results",
            content: {
              "text/event-stream": {
                schema: { type: "string" as const },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": {
            description: "Pro plan required",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SimpleError" } },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Pipeline
    // ========================================================================
    "/pipeline": {
      post: {
        tags: ["Pipeline"],
        summary: "Create a pipeline job",
        description:
          "Create a data pipeline job to export chat sessions, code changes, terminal commands, " +
          "and checkpoints in various formats. Supports scheduling with cron expressions.",
        operationId: "createPipelineJob",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PipelineRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Pipeline job created",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    id: { type: "string" as const },
                    status: { type: "string" as const },
                    config: { type: "object" as const },
                    created_at: { type: "string" as const, format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      get: {
        tags: ["Pipeline"],
        summary: "List pipeline jobs",
        description: "List all pipeline jobs for the authenticated user.",
        operationId: "listPipelineJobs",
        responses: {
          "200": {
            description: "Pipeline job list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    data: {
                      type: "array" as const,
                      items: { $ref: "#/components/schemas/PipelineJob" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/pipeline/{id}": {
      get: {
        tags: ["Pipeline"],
        summary: "Get pipeline job details",
        description: "Get the status and details of a pipeline job.",
        operationId: "getPipelineJob",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Pipeline job details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PipelineJob" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/pipeline/{id}/download": {
      get: {
        tags: ["Pipeline"],
        summary: "Download pipeline output",
        description: "Download the completed pipeline output as NDJSON.",
        operationId: "downloadPipelineOutput",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Pipeline output file",
            content: {
              "application/x-ndjson": {
                schema: { type: "string" as const, format: "binary" },
              },
            },
          },
          "400": {
            description: "Job not completed yet",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/pipeline/schedule": {
      delete: {
        tags: ["Pipeline"],
        summary: "Cancel scheduled pipeline",
        description: "Cancel a recurring pipeline schedule.",
        operationId: "cancelPipelineSchedule",
        responses: {
          "200": {
            description: "Schedule cancelled (or no schedule found)",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    cancelled: { type: "boolean" as const },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Knowledge Base
    // ========================================================================
    "/knowledge-base/repositories": {
      get: {
        tags: ["Knowledge Base"],
        summary: "List knowledge base repositories",
        description: "List repositories with persisted knowledge base files for the authenticated user.",
        operationId: "listKnowledgeBaseRepositories",
        responses: {
          "200": {
            description: "Repository list",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    repositories: { type: "array" as const, items: { type: "object" as const } },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/repositories/{id}/files": {
      get: {
        tags: ["Knowledge Base"],
        summary: "List knowledge base files for a repository",
        operationId: "listKnowledgeBaseRepoFiles",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
          { name: "prefix", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
          { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
        ],
        responses: {
          "200": { description: "Files for repository" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Knowledge Base"],
        summary: "Delete all knowledge base files for a repository",
        operationId: "deleteKnowledgeBaseRepoFiles",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": { description: "Deletion result" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/repositories/{id}/file": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Get a knowledge base file by repository and path",
        operationId: "getKnowledgeBaseRepoFile",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
          { name: "path", in: "query" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": { description: "File content or S3 pointer" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/search": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Search knowledge base content",
        operationId: "searchKnowledgeBase",
        parameters: [
          { name: "query", in: "query" as const, required: true, schema: { type: "string" as const } },
          { name: "repositoryId", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        ],
        responses: {
          "200": { description: "Search results" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/files": {
      get: {
        tags: ["Knowledge Base"],
        summary: "List all knowledge base files",
        operationId: "listKnowledgeBaseFiles",
        parameters: [
          { name: "repository_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "project_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "language", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
          { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
        ],
        responses: {
          "200": { description: "Files list" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/files/search": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Search knowledge base files",
        operationId: "searchKnowledgeBaseFiles",
        parameters: [
          { name: "q", in: "query" as const, required: true, schema: { type: "string" as const } },
          { name: "repository_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "language", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        ],
        responses: {
          "200": { description: "Search results" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/files/{id}": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Get knowledge base file by ID",
        description:
          "Returns file content when stored in DB, or an S3 pointer object when content is offloaded to S3.",
        operationId: "getKnowledgeBaseFile",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "File content (storage=db) or S3 pointer (storage=s3)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/KnowledgeBaseFile" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Knowledge Base"],
        summary: "Delete knowledge base file by ID",
        operationId: "deleteKnowledgeBaseFile",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": { description: "Deletion result" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/artifacts": {
      get: {
        tags: ["Knowledge Base"],
        summary: "List knowledge base artifacts",
        operationId: "listKnowledgeBaseArtifacts",
        parameters: [
          { name: "type", in: "query" as const, schema: { type: "string" as const } },
          { name: "format", in: "query" as const, schema: { type: "string" as const } },
          { name: "project_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
          { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
        ],
        responses: {
          "200": { description: "Artifact list" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/artifacts/{id}": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Get knowledge base artifact by ID",
        description:
          "Returns artifact metadata and content. When storage=s3, content is null and an s3 pointer is provided.",
        operationId: "getKnowledgeBaseArtifact",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Artifact with content or S3 pointer",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/KnowledgeBaseArtifact" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Knowledge Base"],
        summary: "Delete knowledge base artifact by ID",
        operationId: "deleteKnowledgeBaseArtifact",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": { description: "Deletion result" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/stats": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Knowledge base storage stats",
        operationId: "getKnowledgeBaseStats",
        parameters: [
          { name: "project_id", in: "query" as const, schema: { type: "string" as const } },
        ],
        responses: {
          "200": { description: "Stats response" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/knowledge-base/unified-search": {
      get: {
        tags: ["Knowledge Base"],
        summary: "Unified search across KB files, artifacts, and embeddings",
        description:
          "Search across all knowledge base data types in a single call. " +
          "Returns matching KB files, artifacts, and code embeddings.",
        operationId: "unifiedKnowledgeBaseSearch",
        parameters: [
          { name: "query", in: "query" as const, required: true, schema: { type: "string" as const }, description: "Search term (case-insensitive substring match)" },
          { name: "repository_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "project_id", in: "query" as const, schema: { type: "string" as const } },
          { name: "limit", in: "query" as const, schema: { type: "integer" as const, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Unified search results grouped by type",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnifiedKBSearchResponse" },
              },
            },
          },
          "400": {
            description: "Missing query parameter",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ========================================================================
    // Health (note: mounted at /health, not /v1/health)
    // ========================================================================
  },

  tags: [
    { name: "Auth", description: "Authentication and user identity" },
    { name: "API Keys", description: "Manage API keys and scopes" },
    { name: "Sessions", description: "User session management" },
    { name: "Sync", description: "Push projects, checkpoints, blobs, and events to the cloud" },
    { name: "Restore", description: "Pull projects and checkpoints from the cloud" },
    { name: "Search", description: "Search checkpoints, conversations, code, and symbols" },
    { name: "Contexts", description: "Save and retrieve conversation contexts with semantic search" },
    { name: "Universal Search", description: "Cross-source unified, hybrid, and semantic search" },
    { name: "Oracle", description: "Autonomous multi-step research agent (Pro plan)" },
    { name: "Pipeline", description: "Data export pipeline for training data and analytics" },
    { name: "Knowledge Base", description: "Persistent knowledge base for files and artifacts" },
    { name: "Health", description: "Health and readiness checks (no authentication required)" },
  ],
};

const additionalTags = [
  { name: "Time", description: "Checkpoint diff, timeline, restore events, and undo/restore flows" },
  { name: "Consent", description: "Operational capture and training-export consent management" },
  { name: "Data Governance", description: "Delete requests, retention policy, and data lifecycle controls" },
  { name: "Gitgram", description: "Social repository APIs: repos, posts, comments, reactions, follows, trending" },
];

const additionalPaths = {
  "/time/restore": {
    post: {
      tags: ["Time"],
      summary: "Restore project state from a checkpoint or timestamp",
      operationId: "restoreProjectState",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Restore payload" }, "400": { description: "Invalid request" }, "404": { description: "Project/checkpoint not found" } },
    },
  },
  "/time/restore-file": {
    post: {
      tags: ["Time"],
      summary: "Restore one file from a checkpoint",
      operationId: "restoreFileState",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Restore payload" }, "400": { description: "Invalid request" }, "404": { description: "Project/checkpoint not found" } },
    },
  },
  "/time/restore-folder": {
    post: {
      tags: ["Time"],
      summary: "Restore one folder from a checkpoint",
      operationId: "restoreFolderState",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Restore payload" }, "400": { description: "Invalid request" }, "404": { description: "Project/checkpoint not found" } },
    },
  },
  "/time/undo": {
    post: {
      tags: ["Time"],
      summary: "Undo latest AI action by restoring linked before checkpoint",
      operationId: "undoLatestAction",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Undo restore result" }, "400": { description: "Invalid request" }, "404": { description: "No undo candidate found" }, "409": { description: "Linked checkpoint missing" } },
    },
  },
  "/time/preview": {
    post: {
      tags: ["Time"],
      summary: "Preview diff rows between checkpoints",
      operationId: "previewCheckpointDiff",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Diff preview" }, "400": { description: "Invalid request" }, "409": { description: "No baseline checkpoint" } },
    },
  },
  "/time/diff": {
    get: {
      tags: ["Time"],
      summary: "Get diff rows with scope filters",
      operationId: "getCheckpointDiff",
      parameters: [
        { name: "projectId", in: "query" as const, required: true, schema: { type: "string" as const } },
        { name: "toCheckpointId", in: "query" as const, required: true, schema: { type: "string" as const } },
        { name: "fromCheckpointId", in: "query" as const, schema: { type: "string" as const } },
        { name: "scopeType", in: "query" as const, schema: { type: "string" as const, enum: ["project", "folder", "file"] } },
        { name: "scopePath", in: "query" as const, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Diff rows" }, "400": { description: "Invalid query" }, "404": { description: "Project/checkpoint not found" }, "409": { description: "No baseline checkpoint" } },
    },
  },
  "/time/timeline": {
    get: {
      tags: ["Time"],
      summary: "List timeline checkpoints with filters",
      operationId: "getCheckpointTimeline",
      parameters: [
        { name: "projectId", in: "query" as const, required: true, schema: { type: "string" as const } },
        { name: "triggerType", in: "query" as const, schema: { type: "string" as const } },
        { name: "action", in: "query" as const, schema: { type: "string" as const } },
        { name: "from", in: "query" as const, schema: { type: "string" as const, format: "date-time" } },
        { name: "to", in: "query" as const, schema: { type: "string" as const, format: "date-time" } },
        { name: "scopeType", in: "query" as const, schema: { type: "string" as const, enum: ["project", "folder", "file"] } },
        { name: "scopePath", in: "query" as const, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Timeline items" }, "400": { description: "Invalid query" }, "404": { description: "Project not found" } },
    },
  },
  "/time/restore-events": {
    get: {
      tags: ["Time"],
      summary: "List restore events for a project",
      operationId: "listRestoreEvents",
      parameters: [
        { name: "projectId", in: "query" as const, required: true, schema: { type: "string" as const } },
        { name: "scopeType", in: "query" as const, schema: { type: "string" as const, enum: ["project", "folder", "file"] } },
        { name: "status", in: "query" as const, schema: { type: "string" as const, enum: ["requested", "applied", "failed"] } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Restore events" }, "400": { description: "Invalid query" }, "404": { description: "Project not found" } },
    },
  },
  "/context/{checkpointId}": {
    get: {
      tags: ["Time"],
      summary: "Fetch context snapshot for a checkpoint",
      operationId: "getCheckpointContext",
      parameters: [
        { name: "checkpointId", in: "path" as const, required: true, schema: { type: "string" as const } },
        { name: "messageLimit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "toolCallLimit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "contextLimit", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Checkpoint context" }, "400": { description: "Invalid request" }, "404": { description: "Checkpoint not found" } },
    },
  },
  "/consent": {
    post: {
      tags: ["Consent"],
      summary: "Create consent version for project/org scope",
      operationId: "createConsent",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Consent created" }, "400": { description: "Invalid request" }, "403": { description: "Org access denied" }, "404": { description: "Project not found" } },
    },
    get: {
      tags: ["Consent"],
      summary: "List current consent state per scope",
      operationId: "listConsent",
      parameters: [
        { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
        { name: "organizationId", in: "query" as const, schema: { type: "string" as const } },
        { name: "consentType", in: "query" as const, schema: { type: "string" as const, enum: ["operational_capture", "training_export"] } },
        { name: "includeExpired", in: "query" as const, schema: { type: "boolean" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Current consent values" }, "400": { description: "Invalid query" }, "403": { description: "Org access denied" }, "404": { description: "Project not found" } },
    },
  },
  "/consent/history": {
    get: {
      tags: ["Consent"],
      summary: "List consent history",
      operationId: "listConsentHistory",
      parameters: [
        { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
        { name: "organizationId", in: "query" as const, schema: { type: "string" as const } },
        { name: "consentType", in: "query" as const, schema: { type: "string" as const, enum: ["operational_capture", "training_export"] } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Consent history" }, "400": { description: "Invalid query" }, "403": { description: "Org access denied" }, "404": { description: "Project not found" } },
    },
  },
  "/data/delete-request": {
    post: {
      tags: ["Data Governance"],
      summary: "Create data deletion request",
      operationId: "createDeleteRequest",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "202": { description: "Delete request queued" }, "400": { description: "Invalid request" }, "404": { description: "Project not found" } },
    },
    get: {
      tags: ["Data Governance"],
      summary: "List delete requests",
      operationId: "listDeleteRequests",
      parameters: [
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Delete requests" }, "400": { description: "Invalid query" } },
    },
  },
  "/data/delete-request/{requestId}": {
    get: {
      tags: ["Data Governance"],
      summary: "Get delete request details",
      operationId: "getDeleteRequest",
      parameters: [
        { name: "requestId", in: "path" as const, required: true, schema: { type: "string" as const } },
      ],
      responses: { "200": { description: "Delete request detail" }, "400": { description: "Invalid request id" }, "404": { description: "Delete request not found" } },
    },
  },
  "/data/delete-request/{requestId}/process": {
    post: {
      tags: ["Data Governance"],
      summary: "Process a delete request (manual trigger)",
      operationId: "processDeleteRequest",
      parameters: [
        { name: "requestId", in: "path" as const, required: true, schema: { type: "string" as const } },
      ],
      requestBody: { required: false, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Delete request processed" }, "400": { description: "Processing failed" } },
    },
  },
  "/data/delete-request/process-pending": {
    post: {
      tags: ["Data Governance"],
      summary: "Process pending delete requests for authenticated user",
      operationId: "processPendingDeleteRequests",
      requestBody: { required: false, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Batch process result" }, "400": { description: "Invalid request" } },
    },
  },
  "/retention": {
    post: {
      tags: ["Data Governance"],
      summary: "Create or update retention policy",
      operationId: "upsertRetentionPolicy",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Policy upserted" }, "400": { description: "Invalid policy payload" }, "403": { description: "Org access denied" }, "404": { description: "Project not found" } },
    },
    get: {
      tags: ["Data Governance"],
      summary: "List retention policies",
      operationId: "listRetentionPolicies",
      parameters: [
        { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
        { name: "organizationId", in: "query" as const, schema: { type: "string" as const } },
        { name: "dataClass", in: "query" as const, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Retention policies" }, "400": { description: "Invalid query" }, "403": { description: "Org access denied" }, "404": { description: "Project not found" } },
    },
  },
  "/retention/apply": {
    post: {
      tags: ["Data Governance"],
      summary: "Apply retention policy to a project",
      operationId: "applyRetentionPolicy",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Retention apply result" }, "400": { description: "Invalid request" }, "404": { description: "Project not found" } },
    },
  },
  "/gitgram/repos/import": {
    post: {
      tags: ["Gitgram"],
      summary: "Import GitHub repository into Gitgram",
      operationId: "gitgramImportRepo",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Repository imported" }, "400": { description: "Invalid request" }, "404": { description: "Project not found" }, "409": { description: "Repo owned by another account" } },
    },
  },
  "/gitgram/posts": {
    post: {
      tags: ["Gitgram"],
      summary: "Create social post/reel/story/snippet",
      operationId: "gitgramCreatePost",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Post created" }, "400": { description: "Invalid request" }, "404": { description: "Project/repository not found" } },
    },
    get: {
      tags: ["Gitgram"],
      summary: "List posts feed",
      operationId: "gitgramListPosts",
      parameters: [
        { name: "repositoryId", in: "query" as const, schema: { type: "string" as const } },
        { name: "projectId", in: "query" as const, schema: { type: "string" as const } },
        { name: "authorUserId", in: "query" as const, schema: { type: "string" as const } },
        { name: "type", in: "query" as const, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Posts feed" }, "400": { description: "Invalid query" }, "404": { description: "Project not found" } },
    },
  },
  "/gitgram/repos/{repositoryId}/feed": {
    get: {
      tags: ["Gitgram"],
      summary: "Get repository social feed",
      operationId: "gitgramGetRepoFeed",
      parameters: [
        { name: "repositoryId", in: "path" as const, required: true, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Repository feed" }, "400": { description: "Invalid request" } },
    },
  },
  "/gitgram/posts/{postId}/comments": {
    post: {
      tags: ["Gitgram"],
      summary: "Create comment for post",
      operationId: "gitgramCreatePostComment",
      parameters: [
        { name: "postId", in: "path" as const, required: true, schema: { type: "string" as const } },
      ],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Comment created" }, "400": { description: "Invalid request" }, "404": { description: "Post not found" } },
    },
    get: {
      tags: ["Gitgram"],
      summary: "List comments for post",
      operationId: "gitgramListPostComments",
      parameters: [
        { name: "postId", in: "path" as const, required: true, schema: { type: "string" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
        { name: "offset", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Comments list" }, "400": { description: "Invalid request" } },
    },
  },
  "/gitgram/comments": {
    post: {
      tags: ["Gitgram"],
      summary: "Create comment using postId in body",
      operationId: "gitgramCreateComment",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Comment created" }, "400": { description: "Invalid request" }, "404": { description: "Post not found" } },
    },
  },
  "/gitgram/reactions": {
    post: {
      tags: ["Gitgram"],
      summary: "Add/remove reaction on post/comment/repository",
      operationId: "gitgramSetReaction",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Reaction removed" }, "201": { description: "Reaction created" }, "400": { description: "Invalid request" }, "404": { description: "Target not found" } },
    },
  },
  "/gitgram/follows": {
    post: {
      tags: ["Gitgram"],
      summary: "Follow a user or repository",
      operationId: "gitgramFollow",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "201": { description: "Follow created" }, "400": { description: "Invalid request" }, "404": { description: "Target not found" } },
    },
    delete: {
      tags: ["Gitgram"],
      summary: "Unfollow a user or repository",
      operationId: "gitgramUnfollow",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" as const } } } },
      responses: { "200": { description: "Unfollowed" }, "400": { description: "Invalid request" } },
    },
  },
  "/gitgram/trending": {
    get: {
      tags: ["Gitgram"],
      summary: "List trending repositories",
      operationId: "gitgramTrending",
      parameters: [
        { name: "windowDays", in: "query" as const, schema: { type: "integer" as const } },
        { name: "limit", in: "query" as const, schema: { type: "integer" as const } },
      ],
      responses: { "200": { description: "Trending repositories" }, "400": { description: "Invalid request" } },
    },
  },
};

// Also add health endpoints (these are served outside /v1, at /health)
const healthPaths = {
  "/health": {
    get: {
      tags: ["Health"],
      summary: "Basic health check",
      description: "Returns 200 OK if the server is running. No authentication required.",
      operationId: "healthCheck",
      security: [],
      responses: {
        "200": {
          description: "Server is healthy",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
      },
    },
  },
  "/health/live": {
    get: {
      tags: ["Health"],
      summary: "Liveness probe",
      description:
        "Returns 200 if the server process is running. Used by container orchestrators.",
      operationId: "livenessCheck",
      security: [],
      responses: {
        "200": {
          description: "Server process is alive",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
      },
    },
  },
  "/health/ready": {
    get: {
      tags: ["Health"],
      summary: "Readiness probe",
      description:
        "Returns 200 if the server is ready to accept traffic. Checks database connectivity and memory usage.",
      operationId: "readinessCheck",
      security: [],
      responses: {
        "200": {
          description: "Server is ready",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
        "503": {
          description: "Server is not ready (e.g. database unavailable)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
      },
    },
  },
};

// Build the final spec with health endpoints added under a separate server
const fullSpec = {
  ...spec,
  // Health endpoints are at the root, not under /v1, so we add a second server entry
  // and include them in paths with a note.
  paths: {
    ...spec.paths,
    ...additionalPaths,
  },
  tags: [...spec.tags, ...additionalTags],
};

// We serve health paths separately since they're mounted at / not /v1
const healthSpec = {
  ...healthPaths,
};

/**
 * Set up Swagger UI and OpenAPI spec serving.
 *
 * - GET /docs/openapi.json  -- raw OpenAPI 3.0.3 spec
 * - GET /docs               -- Swagger UI (CDN)
 */
export function setupSwagger(app: Express): void {
  // Combine all paths into a single spec for the docs page.
  // Health endpoints are at the root level, so we add them with their full paths.
  const combinedSpec = {
    ...fullSpec,
    servers: [
      { url: "/v1", description: "V1 API" },
      { url: "/", description: "Root (health endpoints)" },
    ],
    paths: {
      ...fullSpec.paths,
      ...healthSpec,
    },
  };

  // Serve the raw spec
  app.get("/docs/openapi.json", (_req: Request, res: Response) => {
    res.json(combinedSpec);
  });

  // Serve Swagger UI via CDN
  app.get("/docs", (_req: Request, res: Response) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gitgram TimeMachine API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
}
