import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { ZodError } from 'zod';
import {
  buildFailedTask,
  buildCompletedTask,
  isSupportedOutputMode,
  parseA2ARequest,
  stringifyA2AOutput,
  toA2ASuccessResponse,
  type A2AAgentCard,
} from './lib/a2a-contract.js';
import { getToolAvailability } from './lib/stable-tools.js';
import {
  getAvailableSkillIds,
  getEnabledA2ASkills,
  getSkillDefinition,
} from './lib/a2a-skills.js';
import {
  applyCorsHeaders,
  checkAuth,
  loadHttpAuthConfig,
  type HttpAuthConfig,
} from './lib/http-auth.js';
import { invokeMcpTool, resolveMcpToolFailure } from './lib/mcp-tool-call.js';
import {
  attachRequestIdHeader,
  buildRequestContext,
  getRequestDurationMs,
  logRequestEvent,
  withRequestContext,
} from './lib/http-request-context.js';

const TOOL_SELECTION_OPTIONS = {
  includeExperimental: process.env.AITM_EXPERIMENTAL_TOOLS === '1',
  disabledTools: process.env.DISABLED_TOOLS,
};

const SUPPORTED_A2A_METHODS = [
  'agent/card',
  'message/send',
  'message/stream',
  'tasks/send',
] as const;

interface HttpTransportOptions {
  readonly port: number;
  readonly mcpServer: McpServer;
  /**
   * Auth/CORS policy. Defaults to {@link loadHttpAuthConfig} (read from env).
   * Exposed primarily so tests can inject a known token/origin policy.
   */
  readonly authConfig?: HttpAuthConfig;
}

interface HttpTransportResult {
  readonly httpServer: HttpServer;
  readonly shutdown: () => Promise<void>;
}


function enabledA2ASkills(): ReturnType<typeof getEnabledA2ASkills> {
  return getEnabledA2ASkills(TOOL_SELECTION_OPTIONS);
}

function availableSkillIds(): string {
  return getAvailableSkillIds(TOOL_SELECTION_OPTIONS);
}

function sendJsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string,
  id: string | number | null = null,
  data?: Record<string, unknown>
): void {
  res.status(status).json({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      data,
      message,
    },
  });
}

async function withEndpointContext(
  req: Request,
  res: Response,
  endpoint: Parameters<typeof buildRequestContext>[1],
  handler: () => Promise<void>
): Promise<void> {
  const context = buildRequestContext(req, endpoint);
  attachRequestIdHeader(res, context.requestId);
  await withRequestContext(context, handler);
}

function createA2ABodyParser() {
  const parser = express.json();

  return (req: Request, res: Response, next: (err?: unknown) => void): void => {
    void withEndpointContext(req, res, 'a2a', async () => {
      await new Promise<void>((resolve) => {
        parser(req, res, (err) => {
          if (!err) {
            next();
            resolve();
            return;
          }

          const parserError = err as Error & {
            readonly status?: number;
            readonly type?: string;
          };

          let code = -32600;
          let message = 'Invalid A2A request body.';

          if (parserError.type === 'entity.parse.failed') {
            code = -32700;
            message = 'Invalid JSON payload.';
          } else if (parserError.type === 'entity.too.large') {
            message = 'A2A request body exceeds the parser size limit.';
          }

          logRequestEvent('complete', {
            status: 'parse-error',
            errorType: parserError.type || null,
            durationMs: getRequestDurationMs(),
          });
          sendJsonRpcError(
            res,
            parserError.status || 400,
            code,
            message
          );
          resolve();
        });
      });
    }).catch(next);
  };
}

function getJsonRpcRequestId(body: unknown): string | number | null {
  if (body && typeof body === 'object' && 'id' in body) {
    const value = (body as Record<string, unknown>).id;
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
  }

  return null;
}

export async function startHttpTransport(
  options: HttpTransportOptions
): Promise<HttpTransportResult> {
  const { port, mcpServer } = options;
  const mcpEndpointUrl = `http://127.0.0.1:${port}/mcp`;

  const authConfig: HttpAuthConfig = options.authConfig ?? loadHttpAuthConfig();

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    applyCorsHeaders(req, res, authConfig);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    next();
  });

  // Authentication gate for the execution surfaces. Health and agent-card
  // discovery stay open; /mcp and /a2a require credentials when configured.
  function requireAuth(req: Request, res: Response): boolean {
    const failure = checkAuth(req, authConfig);
    if (!failure) {
      return true;
    }
    res
      .status(failure.code)
      .json({ error: 'Unauthorized', message: failure.message });
    return false;
  }

  app.get('/health', async (req, res) => {
    await withEndpointContext(req, res, 'health', async () => {
      logRequestEvent('start');
      res.json({
        status: 'ok',
        server: 'ai-time-machine-mcp',
        transport: 'streamable-http',
        uptime: process.uptime(),
      });
      logRequestEvent('complete', {
        status: 'ok',
        durationMs: getRequestDurationMs(),
      });
    });
  });

  function buildAgentCard(): A2AAgentCard {
    const enabledSkills = enabledA2ASkills();

    return {
      additionalInterfaces: [
        {
          transport: 'JSONRPC',
          url: `http://localhost:${port}/a2a`,
        },
      ],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      description:
        'Deterministic restore and timeline system for AI coding workflows, ' +
        'exposing the full MCP tool catalogue (checkpoints, diff, bisect, code ' +
        'graph, Python execution, GitHub, workspace, and more) as A2A skills.',
      name: 'AITimeMachine',
      preferredTransport: 'JSONRPC',
      protocolVersion: '0.3.0',
      provider: {
        organization: 'Gitgram',
        url: 'https://gitgram.app',
      },
      skills: enabledSkills,
      supportsAuthenticatedExtendedCard: false,
      url: `http://localhost:${port}/a2a`,
      version: '2.0.0',
    };
  }

  app.get('/.well-known/agent-card.json', async (req: Request, res: Response) => {
    await withEndpointContext(req, res, 'agent-card', async () => {
      logRequestEvent('start');
      res.json(buildAgentCard());
      logRequestEvent('complete', {
        status: 'ok',
        durationMs: getRequestDurationMs(),
      });
    });
  });

  // Defensive agent-card alias: some A2A clients fetch the card from the
  // JSON-RPC endpoint itself instead of the well-known path. Serving the card
  // on GET /a2a keeps both discovery styles working; JSON-RPC traffic still
  // arrives via POST /a2a below.
  app.get('/a2a', async (req: Request, res: Response) => {
    await withEndpointContext(req, res, 'agent-card', async () => {
      logRequestEvent('start');
      res.json(buildAgentCard());
      logRequestEvent('complete', {
        status: 'ok',
        durationMs: getRequestDurationMs(),
      });
    });
  });

  type A2ASendRequest = Extract<
    ReturnType<typeof parseA2ARequest>,
    { kind: 'message/send' | 'message/stream' }
  >;

  /**
   * Outcome of resolving + executing an A2A send/stream request. Either a
   * JSON-RPC error (validation/skill/availability problem) or a built A2A task.
   */
  interface A2ADispatchError {
    readonly ok: false;
    readonly status: number;
    readonly code: number;
    readonly message: string;
    readonly data?: Record<string, unknown>;
  }

  interface A2ADispatchSuccess {
    readonly ok: true;
    readonly task: ReturnType<typeof buildCompletedTask>;
    readonly failed: boolean;
    readonly toolName: string;
    readonly skillId: string;
  }

  type A2ADispatchResult = A2ADispatchError | A2ADispatchSuccess;

  /**
   * Validate a send/stream request, dispatch it to the mapped MCP tool, and
   * build the resulting A2A task. Shared by message/send and message/stream so
   * both honour the full enabled-tool catalogue identically.
   */
  async function dispatchA2ASkill(
    request: A2ASendRequest
  ): Promise<A2ADispatchResult> {
    if (!isSupportedOutputMode(request.params.acceptedOutputModes)) {
      return {
        ok: false,
        status: 400,
        code: -32005,
        message: 'Requested output mode is not supported.',
        data: {
          acceptedOutputModes: request.params.acceptedOutputModes as
            | string[]
            | undefined,
        },
      };
    }

    const skillId = request.params.skillId;
    if (!skillId) {
      return {
        ok: false,
        status: 400,
        code: -32602,
        message:
          'Missing skill identifier. Provide metadata.skillId (or metadata.skill_id).',
        data: {
          availableSkills: enabledA2ASkills().map((skill) => skill.id),
          legacyAlias: request.params.legacyMethod ? 'tasks/send' : undefined,
        },
      };
    }

    const skill = getSkillDefinition(skillId);
    if (!skill) {
      return {
        ok: false,
        status: 404,
        code: -32601,
        message: `Unknown skill_id "${skillId}". Available skills: ${availableSkillIds()}`,
      };
    }

    const toolAvailability = getToolAvailability(
      skill.toolName,
      TOOL_SELECTION_OPTIONS
    );
    if (!toolAvailability.enabled) {
      return {
        ok: false,
        status: 404,
        code: -32601,
        message: `Skill "${skillId}" is currently unavailable (${toolAvailability.reason}).`,
      };
    }

    const toolArgs =
      (request.params.metadata as Record<string, unknown> | undefined) ?? {};
    const mcpResult = await invokeMcpTool(
      mcpEndpointUrl,
      skill.toolName,
      toolArgs
    );
    const failure = resolveMcpToolFailure(mcpResult);

    const task = failure
      ? buildFailedTask({
          contextId: request.params.contextId,
          errorCode: failure.code,
          errorDetails: failure.details,
          errorText: failure.message,
          inputMessage: request.params.message,
          skillId,
          taskId: request.params.taskId,
          toolName: skill.toolName,
        })
      : buildCompletedTask({
          contextId: request.params.contextId,
          inputMessage: request.params.message,
          outputText: stringifyA2AOutput(mcpResult),
          skillId,
          taskId: request.params.taskId,
          toolName: skill.toolName,
        });

    return {
      ok: true,
      task,
      failed: Boolean(failure),
      toolName: skill.toolName,
      skillId,
    };
  }

  /**
   * Write a JSON-RPC frame as a single Server-Sent Event `data:` line.
   */
  function writeSseEvent(res: Response, payload: unknown): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  app.post('/a2a', createA2ABodyParser(), async (req: Request, res: Response) => {
    await withEndpointContext(req, res, 'a2a', async () => {
      if (!requireAuth(req, res)) {
        logRequestEvent('complete', {
          status: 'unauthorized',
          durationMs: getRequestDurationMs(),
        });
        return;
      }

      logRequestEvent('start', { bodyMethod: req.body?.method || null });

      try {
        const request = parseA2ARequest(req.body);

        if (request.kind === 'agent/card') {
          res.json(toA2ASuccessResponse(request.id, buildAgentCard()));
          logRequestEvent('complete', {
            method: request.method,
            status: 'ok',
            durationMs: getRequestDurationMs(),
          });
          return;
        }

        if (request.kind === 'message/stream') {
          // Stream the lifecycle as SSE: an initial "working" status event,
          // then the terminal task (completed/failed). Errors during
          // validation/dispatch are still streamed as a JSON-RPC error frame so
          // the client's single connection always sees a terminal event.
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();

          writeSseEvent(res, {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              kind: 'status-update',
              status: { state: 'working' },
              taskId: request.params.taskId,
              contextId: request.params.contextId,
              final: false,
            },
          });

          const outcome: A2ADispatchResult = await dispatchA2ASkill(request);
          if (outcome.ok === false) {
            writeSseEvent(res, {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: outcome.code, message: outcome.message, data: outcome.data },
            });
            res.end();
            logRequestEvent('complete', {
              method: request.method,
              status: 'stream-error',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          writeSseEvent(res, toA2ASuccessResponse(request.id, outcome.task));
          res.end();
          logRequestEvent('complete', {
            method: request.method,
            skillId: outcome.skillId,
            status: outcome.failed ? 'stream-tool-failed' : 'stream-ok',
            toolName: outcome.toolName,
            durationMs: getRequestDurationMs(),
          });
          return;
        }

        if (request.kind === 'message/send') {
          const outcome: A2ADispatchResult = await dispatchA2ASkill(request);
          if (outcome.ok === false) {
            sendJsonRpcError(
              res,
              outcome.status,
              outcome.code,
              outcome.message,
              request.id,
              outcome.data
            );
            logRequestEvent('complete', {
              method: request.method,
              status: 'invalid',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          res.json(toA2ASuccessResponse(request.id, outcome.task));
          logRequestEvent('complete', {
            method: request.method,
            skillId: outcome.skillId,
            status: outcome.failed ? 'tool-failed' : 'ok',
            toolName: outcome.toolName,
            durationMs: getRequestDurationMs(),
          });
          return;
        }

        sendJsonRpcError(
          res,
          404,
          -32601,
          `Unknown method "${request.method}". Supported: ${SUPPORTED_A2A_METHODS.join(', ')}`,
          request.id
        );
        logRequestEvent('complete', {
          method: request.method,
          status: 'unknown-method',
          durationMs: getRequestDurationMs(),
        });
      } catch (err: unknown) {
        if (err instanceof ZodError) {
          sendJsonRpcError(
            res,
            400,
            -32602,
            'Invalid A2A request payload.',
            getJsonRpcRequestId(req.body),
            {
              issues: err.issues.map((issue) => ({
                code: issue.code,
                message: issue.message,
                path: issue.path.join('.'),
              })),
            }
          );
          logRequestEvent('complete', {
            status: 'invalid',
            durationMs: getRequestDurationMs(),
          });
          return;
        }

        const message =
          err instanceof Error ? err.message : 'Internal server error';
        logRequestEvent('error', {
          error: message,
          durationMs: getRequestDurationMs(),
        });
        sendJsonRpcError(res, 500, -32603, message);
      }
    });
  });

  // Create the Streamable-HTTP transport ONCE and connect the McpServer to it a
  // single time. In stateless mode (sessionIdGenerator: undefined) the same
  // transport safely serves every request via handleRequest(). Constructing a
  // fresh transport and re-connecting the server on each request (the previous
  // behaviour) leaks transports/handlers and is contrary to the SDK model.
  const mcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(mcpTransport);

  app.all('/mcp', async (req, res) => {
    await withEndpointContext(req, res, 'mcp', async () => {
      if (!requireAuth(req, res)) {
        logRequestEvent('complete', {
          status: 'unauthorized',
          durationMs: getRequestDurationMs(),
        });
        return;
      }

      logRequestEvent('start');

      try {
        await mcpTransport.handleRequest(req, res);

        logRequestEvent('complete', {
          status: 'ok',
          durationMs: getRequestDurationMs(),
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Internal server error';
        logRequestEvent('error', {
          error: message,
          durationMs: getRequestDurationMs(),
        });

        if (!res.headersSent) {
          sendJsonRpcError(res, 500, -32603, message);
        }
      }
    });
  });

  app.use(async (req, res) => {
    await withEndpointContext(req, res, 'unknown', async () => {
      logRequestEvent('complete', {
        status: 'not-found',
        durationMs: getRequestDurationMs(),
      });
      res.status(404).json({ error: 'Not found' });
    });
  });

  const httpServer = createServer(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.error(
        `MCP server (Streamable HTTP) listening on http://localhost:${port}/mcp`
      );
      console.error(
        `A2A agent card: http://localhost:${port}/.well-known/agent-card.json`
      );
      if (authConfig.authToken) {
        console.error(
          'Auth: ENABLED — /mcp and /a2a require Authorization: Bearer <token> (or X-API-Key).'
        );
      } else {
        console.error(
          'Auth: DISABLED — /mcp and /a2a are unauthenticated. Set AITM_MCP_AUTH_TOKEN ' +
            'before exposing this port beyond localhost (it executes tools, incl. the PAL sandbox).'
        );
      }
      if (authConfig.allowedOrigins) {
        console.error(
          `CORS: restricted to ${authConfig.allowedOrigins.join(', ')}.`
        );
      } else {
        console.error(
          'CORS: Access-Control-Allow-Origin=* (dev default). Set AITM_MCP_ALLOWED_ORIGINS to restrict.'
        );
      }
      resolve();
    });
  });

  const shutdown = async (): Promise<void> => {
    console.error('Shutting down HTTP transport...');
    try {
      await mcpTransport.close();
    } catch {
      // ignore transport close errors during shutdown
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    console.error('HTTP transport stopped.');
  };

  return { httpServer, shutdown };
}
