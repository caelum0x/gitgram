import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  InMemoryTaskStore,
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus,
} from "@a2a-js/sdk/server";
import type { AgentCard } from "@a2a-js/sdk";
import {
  a2aService,
  registerAgentSchema,
  sendMessageSchema,
  broadcastSchema,
  getMessagesQuerySchema,
} from "../services/a2aService.js";

const router = Router();

// ============================================================
// Agent metadata (A2A spec — agent card)
// ============================================================

const agentCard: AgentCard = {
  name: "AITM Agent",
  description:
    "AITimeMachine agent for code checkpointing and restoration",
  url: process.env.AITM_API_URL ?? "http://localhost:3000",
  version: "2.0.0",
  protocolVersion: "2.0",
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "checkpoint",
      name: "Checkpoint",
      description:
        "Create, list, and restore code checkpoints via the AITM MCP server.",
      tags: ["checkpoint", "restore", "timeline"],
      examples: [
        "Create a checkpoint for my project",
        "List all checkpoints",
        "Restore to a previous checkpoint",
      ],
    },
  ],
};

// ============================================================
// Agent executor (A2A spec)
// ============================================================

const itmExecutor: AgentExecutor = {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;

    const userMessage = requestContext.userMessage;
    const userText: string =
      (userMessage.parts as Array<{ kind: string; text?: string }>)
        .filter(
          (p): p is { kind: "text"; text: string } =>
            p.kind === "text" && typeof p.text === "string"
        )
        .map((p) => p.text)
        .join(" ") ?? "";

    const resultText = userText.toLowerCase().includes("checkpoint")
      ? "AITM checkpoint task received. Use tm_checkpoint_create to create checkpoints via the MCP server."
      : "AITM Agent ready. I can help with code checkpointing, restoration, and timeline navigation.";

    const responseMessageId = uuidv4();

    eventBus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: {
        state: "working",
        timestamp: new Date().toISOString(),
      },
      history: [],
    });

    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "completed",
        timestamp: new Date().toISOString(),
        message: {
          kind: "message",
          role: "agent",
          messageId: responseMessageId,
          taskId,
          contextId,
          parts: [{ kind: "text", text: resultText }],
        },
      },
      final: true,
    });

    eventBus.finished();
  },

  async cancelTask(
    taskId: string,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId: "",
      status: {
        state: "canceled",
        timestamp: new Date().toISOString(),
      },
      final: true,
    });
    eventBus.finished();
  },
};

// ============================================================
// Wire up A2A JSON-RPC transport
// ============================================================

const taskStore = new InMemoryTaskStore();
const requestHandler = new DefaultRequestHandler(
  agentCard,
  taskStore,
  itmExecutor
);
const transportHandler = new JsonRpcTransportHandler(requestHandler);

// ============================================================
// Helper: extract Bearer token from Authorization header
// ============================================================

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? (match[1] ?? null) : null;
}

// ============================================================
// A2A JSON-RPC protocol routes
// ============================================================

/**
 * GET /a2a
 * Agent discovery — returns the agent card JSON.
 */
router.get("/", (_req: Request, res: Response): void => {
  res.json(agentCard);
});

/**
 * POST /a2a
 * Handles incoming A2A JSON-RPC task requests.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await transportHandler.handle(req.body);
    res.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message },
    });
  }
});

// ============================================================
// REST management routes backed by A2AService
// ============================================================

/**
 * POST /a2a/agents/register
 * Register a new agent. Returns { agentId, apiKey }.
 */
router.post("/agents/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = registerAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await a2aService.registerAgent(parsed.data);
    res.status(201).json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Registration failed";
    res.status(409).json({ error: message });
  }
});

/**
 * GET /a2a/agents
 * List registered agents (public metadata only).
 */
router.get("/agents", async (_req: Request, res: Response): Promise<void> => {
  const agents = await a2aService.getAgents();
  res.json({ agents });
});

/**
 * DELETE /a2a/agents/:agentId
 * Unregister an agent. Requires a valid Bearer API key.
 */
router.delete("/agents/:agentId", async (req: Request, res: Response): Promise<void> => {
  const apiKey = extractBearerToken(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  const callerAgentId = await a2aService.resolveApiKey(apiKey);
  if (!callerAgentId) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const { agentId } = req.params;
  if (callerAgentId !== agentId) {
    res.status(403).json({ error: "Cannot unregister another agent" });
    return;
  }

  const removed = await a2aService.unregisterAgent(agentId);
  if (!removed) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.status(204).send();
});

/**
 * POST /a2a/message
 * Send a message between agents.
 * Body: { fromAgentId, toAgentId, messageType, payload, sessionId? }
 */
router.post("/message", async (req: Request, res: Response): Promise<void> => {
  const apiKey = extractBearerToken(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  const callerAgentId = await a2aService.resolveApiKey(apiKey);
  if (!callerAgentId) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.fromAgentId !== callerAgentId) {
    res.status(403).json({ error: "fromAgentId does not match API key owner" });
    return;
  }

  try {
    const result = await a2aService.sendMessage(parsed.data);
    res.status(200).json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";
    res.status(404).json({ error: message });
  }
});

/**
 * GET /a2a/messages/:agentId
 * Retrieve queued messages for an agent.
 * Query: ?since=<ISO timestamp>&limit=<number>
 */
router.get("/messages/:agentId", async (req: Request, res: Response): Promise<void> => {
  const apiKey = extractBearerToken(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  const callerAgentId = await a2aService.resolveApiKey(apiKey);
  if (!callerAgentId) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const { agentId } = req.params;
  if (callerAgentId !== agentId) {
    res.status(403).json({ error: "Cannot read another agent's messages" });
    return;
  }

  const queryParsed = getMessagesQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.flatten() });
    return;
  }

  const { since, limit } = queryParsed.data;

  try {
    const messages = await a2aService.getMessages(agentId, since, limit);
    res.json({ messages });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get messages";
    res.status(404).json({ error: message });
  }
});

/**
 * POST /a2a/broadcast
 * Broadcast a message to all agents with a given capability.
 * Body: { capability, messageType, payload }
 * Requires a valid Bearer API key.
 */
router.post("/broadcast", async (req: Request, res: Response): Promise<void> => {
  const apiKey = extractBearerToken(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  const callerAgentId = await a2aService.resolveApiKey(apiKey);
  if (!callerAgentId) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await a2aService.broadcastToCapability(parsed.data);
  res.status(200).json(result);
});

export default router;
