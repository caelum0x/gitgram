/**
 * A2A server route backed by the first-party (vendored) A2A SDK under
 * src/a2a/, rather than the npm @a2a-js/sdk package used by the legacy
 * src/routes/a2a.ts. This wires the copied server's Express integration
 * (JSON-RPC transport + agent-card discovery) using the in-memory TaskStore
 * and a simple checkpoint-oriented executor.
 *
 * Mounted at /a2a/v2 (see src/index.ts). The agent card is served at
 * /a2a/v2/.well-known/agent-card.json and JSON-RPC requests are POSTed to
 * /a2a/v2.
 */

import { type Express } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  A2AExpressApp,
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus,
  type AgentCard,
} from "../a2a/index.js";

const A2A_V2_BASE_URL = "/a2a/v2";

const agentCard: AgentCard = {
  name: "AITM Agent (v2)",
  description: "AITimeMachine agent for code checkpointing and restoration",
  url: `${process.env.AITM_API_URL ?? "http://localhost:3000"}${A2A_V2_BASE_URL}`,
  version: "2.0.0",
  protocolVersion: "0.3.0",
  preferredTransport: "JSONRPC",
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
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

const aitmExecutor: AgentExecutor = {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { taskId, contextId, userMessage } = requestContext;

    const userText = userMessage.parts
      .filter(
        (p): p is { kind: "text"; text: string } =>
          p.kind === "text" && typeof (p as { text?: unknown }).text === "string"
      )
      .map((p) => p.text)
      .join(" ");

    const resultText = userText.toLowerCase().includes("checkpoint")
      ? "AITM checkpoint task received. Use tm_checkpoint_create to create checkpoints via the MCP server."
      : "AITM Agent ready. I can help with code checkpointing, restoration, and timeline navigation.";

    eventBus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "working", timestamp: new Date().toISOString() },
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
          messageId: uuidv4(),
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
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    });
    eventBus.finished();
  },
};

/**
 * Register the vendored A2A server routes onto the given Express app.
 */
export function mountA2AVendored(app: Express): void {
  const taskStore = new InMemoryTaskStore();
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    taskStore,
    aitmExecutor
  );
  new A2AExpressApp(requestHandler).setupRoutes(app, A2A_V2_BASE_URL);
}

export { A2A_V2_BASE_URL, agentCard as a2aVendoredAgentCard };
