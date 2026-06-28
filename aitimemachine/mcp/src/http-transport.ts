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
  type A2AAgentSkill,
} from './lib/a2a-contract.js';
import { getToolAvailability } from './lib/stable-tools.js';
import {
  attachRequestIdHeader,
  buildRequestContext,
  getRequestDurationMs,
  getRequestId,
  logRequestEvent,
  withRequestContext,
} from './lib/http-request-context.js';

interface A2ASkillDefinition extends A2AAgentSkill {
  readonly toolName: string;
}

const A2A_SKILLS: readonly A2ASkillDefinition[] = [
  {
    description:
      'Capture current file state as a content-addressable checkpoint.',
    id: 'checkpoint',
    inputModes: ['text/plain', 'application/json'],
    name: 'Create Checkpoint',
    outputModes: ['text/plain', 'application/json'],
    tags: ['checkpoint', 'history', 'time-travel'],
    toolName: 'tm_checkpoint_create',
  },
  {
    description: 'Atomically restore files to a previous checkpoint state.',
    id: 'restore',
    inputModes: ['text/plain', 'application/json'],
    name: 'Restore Checkpoint',
    outputModes: ['text/plain', 'application/json'],
    tags: ['checkpoint', 'restore', 'time-travel'],
    toolName: 'tm_checkpoint_restore',
  },
  {
    description:
      'Compare two checkpoints using Myers, Patience, or Histogram algorithms.',
    id: 'diff',
    inputModes: ['text/plain', 'application/json'],
    name: 'Diff Checkpoints',
    outputModes: ['text/plain', 'application/json'],
    tags: ['diff', 'compare', 'history'],
    toolName: 'tm_diff',
  },
  {
    description: 'Binary search to find when a test started failing.',
    id: 'bisect',
    inputModes: ['text/plain', 'application/json'],
    name: 'Bisect Sessions',
    outputModes: ['text/plain', 'application/json'],
    tags: ['bisect', 'debugging', 'history'],
    toolName: 'tm_bisect',
  },
  {
    description:
      'Browse chronological history of all AI actions and checkpoints.',
    id: 'timeline',
    inputModes: ['text/plain', 'application/json'],
    name: 'View Timeline',
    outputModes: ['text/plain', 'application/json'],
    tags: ['timeline', 'history', 'audit'],
    toolName: 'tm_timeline',
  },
  {
    description:
      'Full-text search across checkpoint descriptions and conversations.',
    id: 'search',
    inputModes: ['text/plain', 'application/json'],
    name: 'Search History',
    outputModes: ['text/plain', 'application/json'],
    tags: ['search', 'history', 'conversation'],
    toolName: 'tm_search',
  },
  {
    description: 'Upload and download checkpoints to S3-compatible storage.',
    id: 'sync',
    inputModes: ['text/plain', 'application/json'],
    name: 'Cloud Sync',
    outputModes: ['text/plain', 'application/json'],
    tags: ['backup', 's3', 'sync'],
    toolName: 'tm_s3_backup',
  },
];

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
}

interface HttpTransportResult {
  readonly httpServer: HttpServer;
  readonly shutdown: () => Promise<void>;
}

interface McpToolFailure {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly message: string;
}

function getEnabledA2ASkills(): readonly A2AAgentSkill[] {
  return A2A_SKILLS.filter((skill) =>
    getToolAvailability(skill.toolName, TOOL_SELECTION_OPTIONS).enabled
  ).map(({ toolName: _toolName, ...skill }) => skill);
}

function getSkillDefinition(skillId: string): A2ASkillDefinition | undefined {
  return A2A_SKILLS.find((skill) => skill.id === skillId);
}

function getAvailableSkillIds(): string {
  return getEnabledA2ASkills()
    .map((skill) => skill.id)
    .join(', ');
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

function extractMcpTextSegments(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const content =
    'content' in value && Array.isArray(value.content)
      ? value.content
      : null;

  if (!content) {
    return [];
  }

  return content
    .map((entry) => {
      if (
        entry &&
        typeof entry === 'object' &&
        'type' in entry &&
        entry.type === 'text' &&
        'text' in entry &&
        typeof entry.text === 'string'
      ) {
        return entry.text.trim();
      }

      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function parseStructuredToolError(text: string): McpToolFailure | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('error' in parsed)) {
      return null;
    }

    const error = parsed.error;
    if (!error || typeof error !== 'object') {
      return null;
    }

    return {
      code:
        'code' in error && error.code != null ? String(error.code) : undefined,
      details:
        'details' in error && error.details && typeof error.details === 'object'
          ? (error.details as Record<string, unknown>)
          : undefined,
      message:
        'message' in error && typeof error.message === 'string'
          ? error.message
          : text,
    };
  } catch {
    const match = text.match(/^MCP error ([^:]+):\s*(.+)$/s);
    if (!match) {
      return null;
    }

    return {
      code: match[1],
      message: match[2].trim(),
    };
  }
}

function resolveMcpToolFailure(result: unknown): McpToolFailure | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  if ('error' in result && result.error && typeof result.error === 'object') {
    const error = result.error as Record<string, unknown>;
    return {
      code: error.code != null ? String(error.code) : undefined,
      details:
        error.data && typeof error.data === 'object'
          ? (error.data as Record<string, unknown>)
          : undefined,
      message:
        typeof error.message === 'string'
          ? error.message
          : 'MCP tool call failed.',
    };
  }

  if (!('result' in result) || !result.result || typeof result.result !== 'object') {
    return null;
  }

  const payload = result.result as Record<string, unknown>;
  if (payload.isError !== true) {
    return null;
  }

  const textSegments = extractMcpTextSegments(payload);
  const structuredFailure = textSegments
    .map(parseStructuredToolError)
    .find((failure): failure is McpToolFailure => Boolean(failure));

  if (structuredFailure) {
    return structuredFailure;
  }

  return {
    code: 'MCP_TOOL_ERROR',
    message:
      textSegments.join('\n\n') || 'MCP tool call failed without error details.',
  };
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

async function invokeMcpTool(
  mcpEndpointUrl: string,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<unknown> {
  const parentRequestId = getRequestId();
  const mcpRequest = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call' as const,
    params: { name: toolName, arguments: toolArgs },
  };

  const response = await fetch(mcpEndpointUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(parentRequestId ? { 'x-request-id': parentRequestId } : {}),
    },
    body: JSON.stringify(mcpRequest),
  });
  const rawBody = await response.text();

  const trimmed = rawBody.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const ssePayloads = trimmed
    .split(/\n\n+/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
    )
    .filter(Boolean);

  if (ssePayloads.length > 0) {
    return JSON.parse(ssePayloads[ssePayloads.length - 1]);
  }

  return rawBody;
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

  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Mcp-Session-Id'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (_req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    next();
  });

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
    const enabledSkills = getEnabledA2ASkills();

    return {
      additionalInterfaces: [
        {
          transport: 'JSONRPC',
          url: `http://localhost:${port}/a2a`,
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      description:
        'Deterministic restore and timeline system for AI coding workflows. ' +
        'Captures checkpoints before and after AI actions, with restore, diff, bisect, and cloud sync support.',
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

  app.post('/a2a', createA2ABodyParser(), async (req: Request, res: Response) => {
    await withEndpointContext(req, res, 'a2a', async () => {
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
          if (!isSupportedOutputMode(request.params.acceptedOutputModes)) {
            sendJsonRpcError(
              res,
              400,
              -32005,
              'Requested output mode is not supported.',
              request.id,
              {
                acceptedOutputModes: request.params.acceptedOutputModes as string[] | undefined,
              }
            );
            logRequestEvent('complete', {
              method: request.method,
              status: 'unsupported-output-mode',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          sendJsonRpcError(
            res,
            501,
            -32004,
            'message/stream is not supported by this agent. Use message/send.',
            request.id
          );
          logRequestEvent('complete', {
            method: request.method,
            status: 'unsupported',
            durationMs: getRequestDurationMs(),
          });
          return;
        }

        if (request.kind === 'message/send') {
          if (!isSupportedOutputMode(request.params.acceptedOutputModes)) {
            sendJsonRpcError(
              res,
              400,
              -32005,
              'Requested output mode is not supported.',
              request.id,
              {
                acceptedOutputModes: request.params.acceptedOutputModes as string[] | undefined,
              }
            );
            logRequestEvent('complete', {
              method: request.method,
              status: 'unsupported-output-mode',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          const skillId = request.params.skillId;
          if (!skillId) {
            sendJsonRpcError(
              res,
              400,
              -32602,
              'Missing skill identifier. Provide metadata.skillId (or metadata.skill_id) on message/send requests.',
              request.id,
              {
                availableSkills: getEnabledA2ASkills().map((skill) => skill.id),
                legacyAlias: request.params.legacyMethod ? 'tasks/send' : undefined,
              }
            );
            logRequestEvent('complete', {
              method: request.method,
              status: 'invalid',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          const skill = getSkillDefinition(skillId);
          if (!skill) {
            sendJsonRpcError(
              res,
              404,
              -32601,
              `Unknown skill_id "${skillId}". Available skills: ${getAvailableSkillIds()}`,
              request.id
            );
            logRequestEvent('complete', {
              method: request.method,
              skillId,
              status: 'unknown-skill',
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          const toolAvailability = getToolAvailability(
            skill.toolName,
            TOOL_SELECTION_OPTIONS
          );
          if (!toolAvailability.enabled) {
            sendJsonRpcError(
              res,
              404,
              -32601,
              `Skill "${skillId}" is currently unavailable (${toolAvailability.reason}).`,
              request.id
            );
            logRequestEvent('complete', {
              method: request.method,
              reason: toolAvailability.reason,
              skillId,
              status: 'disabled',
              toolName: skill.toolName,
              durationMs: getRequestDurationMs(),
            });
            return;
          }

          const toolArgs =
            (request.params.metadata as Record<string, unknown> | undefined) ?? {};
          const mcpResult = await invokeMcpTool(
            mcpEndpointUrl,
            skill.toolName,
            toolArgs
          );
          const failure = resolveMcpToolFailure(mcpResult);

          res.json(
            toA2ASuccessResponse(
              request.id,
              failure
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
                  })
            )
          );
          logRequestEvent('complete', {
            failureCode: failure?.code,
            method: request.method,
            skillId,
            status: failure ? 'tool-failed' : 'ok',
            toolName: skill.toolName,
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

  app.all('/mcp', async (req, res) => {
    await withEndpointContext(req, res, 'mcp', async () => {
      logRequestEvent('start');

      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);

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
      resolve();
    });
  });

  const shutdown = async (): Promise<void> => {
    console.error('Shutting down HTTP transport...');
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    console.error('HTTP transport stopped.');
  };

  return { httpServer, shutdown };
}
