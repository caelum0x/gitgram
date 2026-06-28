import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "../db/index.js";

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
  readonly status: AgentStatus;
  readonly lastSeen: string;
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
// AgentRegistry — durable, Postgres-backed agent directory
// ============================================================

/**
 * Agent directory abstraction. The A2A spec defines a TaskStore for messaging
 * but no long-lived agent directory, so we keep our own registry. The default
 * implementation is Postgres-backed ({@link DbAgentRegistry}) so registered
 * agents and their API keys survive restarts and are shared across instances.
 */
export interface AgentRegistry {
  has(agentId: string): Promise<boolean>;
  get(agentId: string): Promise<AgentInfo | undefined>;
  insert(info: AgentInfo): Promise<void>;
  delete(agentId: string): Promise<boolean>;
  list(): Promise<AgentInfo[]>;
  findByApiKey(apiKey: string): Promise<AgentInfo | undefined>;
  touch(agentId: string, lastSeen: string): Promise<void>;
}

type AgentRow = typeof schema.a2aAgents.$inferSelect;

function rowToAgentInfo(row: AgentRow): AgentInfo {
  return {
    id: row.id,
    name: row.name,
    capabilities: row.capabilities ?? [],
    endpoint: row.endpoint ?? undefined,
    apiKey: row.apiKey,
    registeredAt: row.registeredAt.toISOString(),
    status: (row.status as AgentStatus) ?? "active",
    lastSeen: row.lastSeen.toISOString(),
  };
}

class DbAgentRegistry implements AgentRegistry {
  async has(agentId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.a2aAgents.id })
      .from(schema.a2aAgents)
      .where(eq(schema.a2aAgents.id, agentId))
      .limit(1);
    return row !== undefined;
  }

  async get(agentId: string): Promise<AgentInfo | undefined> {
    const [row] = await db
      .select()
      .from(schema.a2aAgents)
      .where(eq(schema.a2aAgents.id, agentId))
      .limit(1);
    return row ? rowToAgentInfo(row) : undefined;
  }

  async insert(info: AgentInfo): Promise<void> {
    await db.insert(schema.a2aAgents).values({
      id: info.id,
      name: info.name,
      capabilities: [...info.capabilities],
      endpoint: info.endpoint ?? null,
      apiKey: info.apiKey,
      status: info.status,
      registeredAt: new Date(info.registeredAt),
      lastSeen: new Date(info.lastSeen),
    });
  }

  async delete(agentId: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.a2aAgents)
      .where(eq(schema.a2aAgents.id, agentId))
      .returning({ id: schema.a2aAgents.id });
    return deleted.length > 0;
  }

  async list(): Promise<AgentInfo[]> {
    const rows = await db.select().from(schema.a2aAgents);
    return rows.map(rowToAgentInfo);
  }

  async findByApiKey(apiKey: string): Promise<AgentInfo | undefined> {
    const [row] = await db
      .select()
      .from(schema.a2aAgents)
      .where(eq(schema.a2aAgents.apiKey, apiKey))
      .limit(1);
    return row ? rowToAgentInfo(row) : undefined;
  }

  async touch(agentId: string, lastSeen: string): Promise<void> {
    await db
      .update(schema.a2aAgents)
      .set({ lastSeen: new Date(lastSeen), status: "active" })
      .where(eq(schema.a2aAgents.id, agentId));
  }
}

// ============================================================
// MessageStore — durable, Postgres-backed message inbox
// ============================================================

/**
 * Per-recipient durable message inbox. Replaces the previous in-memory
 * TaskStore-backed queue so queued/broadcast messages survive restarts and are
 * delivered consistently across horizontally-scaled instances.
 */
export interface MessageStore {
  append(message: A2AMessage): Promise<void>;
  loadForRecipient(
    agentId: string,
    sinceIso: string | undefined,
    limit: number
  ): Promise<A2AMessage[]>;
}

type MessageRow = typeof schema.a2aMessages.$inferSelect;

function rowToMessage(row: MessageRow): A2AMessage {
  return {
    messageId: row.id,
    fromAgentId: row.fromAgentId,
    toAgentId: row.toAgentId,
    messageType: row.messageType as MessageType,
    payload: (row.payload as Record<string, unknown>) ?? {},
    sessionId: row.sessionId ?? undefined,
    timestamp: row.createdAt.toISOString(),
  };
}

class DbMessageStore implements MessageStore {
  async append(message: A2AMessage): Promise<void> {
    await db.insert(schema.a2aMessages).values({
      id: message.messageId,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId,
      messageType: message.messageType,
      payload: message.payload as Record<string, unknown>,
      sessionId: message.sessionId ?? null,
      createdAt: new Date(message.timestamp),
    });
  }

  async loadForRecipient(
    agentId: string,
    sinceIso: string | undefined,
    limit: number
  ): Promise<A2AMessage[]> {
    const conditions = [eq(schema.a2aMessages.toAgentId, agentId)];
    if (sinceIso !== undefined) {
      const since = new Date(sinceIso);
      if (!Number.isNaN(since.getTime())) {
        conditions.push(gt(schema.a2aMessages.createdAt, since));
      }
    }

    const rows = await db
      .select()
      .from(schema.a2aMessages)
      .where(and(...conditions))
      .orderBy(asc(schema.a2aMessages.createdAt))
      .limit(limit);

    return rows.map(rowToMessage);
  }
}

// ============================================================
// A2AService
// ============================================================

/**
 * Agent-to-Agent communication service.
 *
 * Both the agent directory and the per-recipient message inbox are backed by
 * Postgres, so registered agents, their API keys, and all queued/broadcast
 * messages are durable and shared across instances.
 *
 * Agents authenticate via Bearer API keys returned at registration time.
 */
export class A2AService {
  private readonly registry: AgentRegistry;
  private readonly messages: MessageStore;

  constructor(
    registry: AgentRegistry = new DbAgentRegistry(),
    messages: MessageStore = new DbMessageStore()
  ) {
    this.registry = registry;
    this.messages = messages;
  }

  // ----------------------------------------------------------
  // Agent registry
  // ----------------------------------------------------------

  /**
   * Register a new agent.
   * Returns the agent's stable ID and a generated API key.
   */
  async registerAgent(
    input: z.infer<typeof registerAgentSchema>
  ): Promise<RegisterAgentResult> {
    if (await this.registry.has(input.agentId)) {
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

    await this.registry.insert(info);

    return { agentId: input.agentId, apiKey };
  }

  /**
   * Unregister an agent. Returns true if the agent existed and was removed.
   */
  async unregisterAgent(agentId: string): Promise<boolean> {
    return this.registry.delete(agentId);
  }

  /**
   * Return public metadata for all registered agents.
   */
  async getAgents(): Promise<PublicAgentInfo[]> {
    const agents = await this.registry.list();
    return agents.map((a) => ({
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
  async resolveApiKey(apiKey: string): Promise<string | null> {
    const agent = await this.registry.findByApiKey(apiKey);
    if (!agent) {
      return null;
    }
    await this.touchAgent(agent.id);
    return agent.id;
  }

  // ----------------------------------------------------------
  // Messaging
  // ----------------------------------------------------------

  /**
   * Send a message from one agent to another.
   * The sender and recipient must both be registered.
   */
  async sendMessage(
    input: z.infer<typeof sendMessageSchema>
  ): Promise<SendMessageResult> {
    const sender = await this.registry.get(input.fromAgentId);
    if (!sender) {
      throw new Error(`Sender agent '${input.fromAgentId}' is not registered`);
    }

    const recipient = await this.registry.get(input.toAgentId);
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

    await this.messages.append(message);
    await this.touchAgent(input.fromAgentId);

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
    if (!(await this.registry.has(agentId))) {
      throw new Error(`Agent '${agentId}' is not registered`);
    }

    await this.touchAgent(agentId);
    return this.messages.loadForRecipient(agentId, since, limit);
  }

  /**
   * Broadcast a message to every agent that declares the given capability.
   */
  async broadcastToCapability(
    input: z.infer<typeof broadcastSchema>
  ): Promise<BroadcastResult> {
    const recipients = await this.findAgentsByCapability(input.capability);
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
      await this.messages.append(message);
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
  async findAgentsByCapability(capability: string): Promise<AgentInfo[]> {
    const needle = capability.toLowerCase();
    const agents = await this.registry.list();
    return agents.filter((a) =>
      a.capabilities.some((c) => c.toLowerCase() === needle)
    );
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private async touchAgent(agentId: string): Promise<void> {
    await this.registry.touch(agentId, new Date().toISOString());
  }
}

// Singleton exported for use across the server process
export const a2aService = new A2AService();
