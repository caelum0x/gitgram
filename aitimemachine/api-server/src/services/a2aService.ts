import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { InMemoryTaskStore, type TaskStore } from "@a2a-js/sdk/server";
import type { Task } from "@a2a-js/sdk";

// ============================================================
// Schemas
// ============================================================

export const registerAgentSchema = z.object({
  agentId: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  capabilities: z.array(z.string().min(1).max(64)).min(1),
  endpoint: z.string().url().optional(),
});

export const sendMessageSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  messageType: z.enum([
    "task_request",
    "task_response",
    "context_share",
    "status_update",
    "error",
  ]),
  payload: z.record(z.unknown()),
  sessionId: z.string().optional(),
});

export const broadcastSchema = z.object({
  capability: z.string().min(1),
  messageType: z.enum([
    "task_request",
    "task_response",
    "context_share",
    "status_update",
    "error",
  ]),
  payload: z.record(z.unknown()),
});

export const getMessagesQuerySchema = z.object({
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================================
// Types
// ============================================================

export type MessageType =
  | "task_request"
  | "task_response"
  | "context_share"
  | "status_update"
  | "error";

export type AgentStatus = "active" | "inactive";

export interface AgentInfo {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly endpoint: string | undefined;
  readonly apiKey: string;
  readonly registeredAt: string;
  status: AgentStatus;
  lastSeen: string;
}

export interface A2AMessage {
  readonly messageId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly messageType: MessageType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sessionId: string | undefined;
  readonly timestamp: string;
}

export interface RegisterAgentResult {
  readonly agentId: string;
  readonly apiKey: string;
}

export interface SendMessageResult {
  readonly messageId: string;
  readonly status: "delivered" | "queued";
  readonly timestamp: string;
}

export interface BroadcastResult {
  readonly broadcastId: string;
  readonly recipientCount: number;
  readonly timestamp: string;
}

export interface PublicAgentInfo {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly status: AgentStatus;
  readonly lastSeen: string;
}

// ============================================================
// AgentRegistry — typed in-memory registry
// ============================================================

/**
 * Typed in-memory agent registry.
 *
 * The A2A spec defines a TaskStore (used here to back messaging) but no
 * notion of a long-lived agent directory, so we keep our own typed registry.
 * If a persistent `a2a_agents` table is later added to the DB schema this
 * class can be swapped for a DB-backed implementation behind the same
 * interface without touching the routes.
 */
export interface AgentRegistry {
  has(agentId: string): boolean;
  get(agentId: string): AgentInfo | undefined;
  set(agentId: string, info: AgentInfo): void;
  delete(agentId: string): boolean;
  values(): IterableIterator<AgentInfo>;
}

class InMemoryAgentRegistry implements AgentRegistry {
  private readonly agents: Map<string, AgentInfo> = new Map();

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  get(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  set(agentId: string, info: AgentInfo): void {
    this.agents.set(agentId, info);
  }

  delete(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  values(): IterableIterator<AgentInfo> {
    return this.agents.values();
  }
}

// ============================================================
// A2AService
// ============================================================

/**
 * Agent-to-Agent communication service.
 *
 * The agent directory lives in a typed {@link AgentRegistry}; per-recipient
 * message delivery is backed by the @a2a-js/sdk {@link TaskStore}. Each
 * delivered A2A message is stored as an A2A `Task` whose `contextId` is the
 * recipient agent id, so the SDK's durable store owns the queue semantics.
 *
 * Agents authenticate via Bearer API keys returned at registration time.
 */
export class A2AService {
  private readonly registry: AgentRegistry;
  private readonly taskStore: TaskStore;
  /** Recipient agentId -> ordered list of stored task ids (delivery order). */
  private readonly inbox: Map<string, string[]> = new Map();

  constructor(
    registry: AgentRegistry = new InMemoryAgentRegistry(),
    taskStore: TaskStore = new InMemoryTaskStore()
  ) {
    this.registry = registry;
    this.taskStore = taskStore;
  }

  // ----------------------------------------------------------
  // Agent registry
  // ----------------------------------------------------------

  /**
   * Register a new agent.
   * Returns the agent's stable ID and a generated API key.
   */
  registerAgent(input: z.infer<typeof registerAgentSchema>): RegisterAgentResult {
    if (this.registry.has(input.agentId)) {
      throw new Error(`Agent '${input.agentId}' is already registered`);
    }

    const apiKey = `a2a_${uuidv4().replace(/-/g, "")}`;
    const now = new Date().toISOString();

    const info: AgentInfo = {
      id: input.agentId,
      name: input.name,
      capabilities: [...input.capabilities],
      endpoint: input.endpoint,
      apiKey,
      registeredAt: now,
      status: "active",
      lastSeen: now,
    };

    this.registry.set(input.agentId, info);
    this.inbox.set(input.agentId, []);

    return { agentId: input.agentId, apiKey };
  }

  /**
   * Unregister an agent and discard its message queue.
   * Returns true if the agent existed and was removed.
   */
  unregisterAgent(agentId: string): boolean {
    if (!this.registry.has(agentId)) {
      return false;
    }
    this.registry.delete(agentId);
    this.inbox.delete(agentId);
    return true;
  }

  /**
   * Return public metadata for all registered agents.
   */
  getAgents(): PublicAgentInfo[] {
    return Array.from(this.registry.values()).map((a) => ({
      id: a.id,
      name: a.name,
      capabilities: a.capabilities,
      status: a.status,
      lastSeen: a.lastSeen,
    }));
  }

  /**
   * Validate an API key against the registry.
   * Returns the owning agentId or null if not found.
   */
  resolveApiKey(apiKey: string): string | null {
    for (const agent of this.registry.values()) {
      if (agent.apiKey === apiKey) {
        this.touchAgent(agent.id);
        return agent.id;
      }
    }
    return null;
  }

  // ----------------------------------------------------------
  // Messaging (backed by the SDK TaskStore)
  // ----------------------------------------------------------

  /**
   * Send a message from one agent to another.
   * The sender and recipient must both be registered.
   */
  async sendMessage(
    input: z.infer<typeof sendMessageSchema>
  ): Promise<SendMessageResult> {
    const sender = this.registry.get(input.fromAgentId);
    if (!sender) {
      throw new Error(`Sender agent '${input.fromAgentId}' is not registered`);
    }

    const recipient = this.registry.get(input.toAgentId);
    if (!recipient) {
      throw new Error(`Recipient agent '${input.toAgentId}' is not registered`);
    }

    const message: A2AMessage = {
      messageId: uuidv4(),
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      messageType: input.messageType,
      payload: { ...input.payload },
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
    };

    await this.persistMessage(message);
    this.touchAgent(input.fromAgentId);

    const status: SendMessageResult["status"] =
      recipient.status === "active" ? "delivered" : "queued";

    return {
      messageId: message.messageId,
      status,
      timestamp: message.timestamp,
    };
  }

  /**
   * Retrieve messages queued for a given agent, optionally filtered by
   * a `since` ISO timestamp and capped at `limit`.
   */
  async getMessages(
    agentId: string,
    since: string | undefined,
    limit: number
  ): Promise<A2AMessage[]> {
    if (!this.registry.has(agentId)) {
      throw new Error(`Agent '${agentId}' is not registered`);
    }

    this.touchAgent(agentId);

    const taskIds = this.inbox.get(agentId) ?? [];
    const sinceMs = since !== undefined ? Date.parse(since) : 0;

    const messages: A2AMessage[] = [];
    for (const taskId of taskIds) {
      const task = await this.taskStore.load(taskId);
      if (task === undefined) {
        continue;
      }
      const message = this.taskToMessage(task);
      if (message !== null && Date.parse(message.timestamp) > sinceMs) {
        messages.push(message);
      }
    }

    return messages.slice(-limit);
  }

  /**
   * Broadcast a message to every agent that declares the given capability.
   */
  async broadcastToCapability(
    input: z.infer<typeof broadcastSchema>
  ): Promise<BroadcastResult> {
    const recipients = this.findAgentsByCapability(input.capability);
    const broadcastId = uuidv4();
    const now = new Date().toISOString();

    for (const agent of recipients) {
      const message: A2AMessage = {
        messageId: uuidv4(),
        fromAgentId: "broadcast",
        toAgentId: agent.id,
        messageType: input.messageType,
        payload: { ...input.payload, broadcastId },
        sessionId: undefined,
        timestamp: now,
      };
      await this.persistMessage(message);
    }

    return {
      broadcastId,
      recipientCount: recipients.length,
      timestamp: now,
    };
  }

  // ----------------------------------------------------------
  // Capability matching
  // ----------------------------------------------------------

  /**
   * Return all agents that declare a given capability.
   * Matching is case-insensitive.
   */
  findAgentsByCapability(capability: string): AgentInfo[] {
    const needle = capability.toLowerCase();
    return Array.from(this.registry.values()).filter((a) =>
      a.capabilities.some((c) => c.toLowerCase() === needle)
    );
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Persist an A2A message as an A2A Task in the SDK TaskStore and record
   * it in the recipient's ordered inbox.
   */
  private async persistMessage(message: A2AMessage): Promise<void> {
    const task: Task = {
      kind: "task",
      id: message.messageId,
      contextId: message.toAgentId,
      status: {
        state: "submitted",
        timestamp: message.timestamp,
      },
      history: [
        {
          kind: "message",
          role: "user",
          messageId: message.messageId,
          contextId: message.toAgentId,
          parts: [
            {
              kind: "data",
              data: this.toEnvelope(message),
            },
          ],
        },
      ],
      metadata: this.toEnvelope(message),
    };

    await this.taskStore.save(task);

    const queue = this.inbox.get(message.toAgentId) ?? [];
    queue.push(task.id);
    this.inbox.set(message.toAgentId, queue);
  }

  /**
   * Build a plain JSON envelope for the message, used both as Task metadata
   * and as the message Part data so it round-trips through the TaskStore.
   */
  private toEnvelope(message: A2AMessage): Record<string, unknown> {
    return {
      messageId: message.messageId,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId,
      messageType: message.messageType,
      payload: message.payload,
      sessionId: message.sessionId ?? null,
      timestamp: message.timestamp,
    };
  }

  /**
   * Reconstruct an A2AMessage from a stored Task envelope.
   * Returns null if the task does not carry a valid envelope.
   */
  private taskToMessage(task: Task): A2AMessage | null {
    const envelope = task.metadata;
    if (envelope === undefined || typeof envelope !== "object") {
      return null;
    }
    const e = envelope as Record<string, unknown>;
    if (
      typeof e.messageId !== "string" ||
      typeof e.fromAgentId !== "string" ||
      typeof e.toAgentId !== "string" ||
      typeof e.messageType !== "string" ||
      typeof e.timestamp !== "string" ||
      typeof e.payload !== "object" ||
      e.payload === null
    ) {
      return null;
    }

    return {
      messageId: e.messageId,
      fromAgentId: e.fromAgentId,
      toAgentId: e.toAgentId,
      messageType: e.messageType as MessageType,
      payload: e.payload as Record<string, unknown>,
      sessionId: typeof e.sessionId === "string" ? e.sessionId : undefined,
      timestamp: e.timestamp,
    };
  }

  private touchAgent(agentId: string): void {
    const agent = this.registry.get(agentId);
    if (agent !== undefined) {
      agent.lastSeen = new Date().toISOString();
      agent.status = "active";
    }
  }
}

// Singleton exported for use across the server process
export const a2aService = new A2AService();
