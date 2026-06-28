/**
 * Local type override for express-rate-limit.
 *
 * The package is hoisted to the workspace root's node_modules, where it
 * resolves its `express` import against @types/express v4. The backend uses
 * @types/express v5. This declaration file re-declares the public surface of
 * express-rate-limit using the backend's own Express 5 types, eliminating
 * the incompatibility without using `any` or `@ts-ignore`.
 */
declare module 'express-rate-limit' {
  import type {
    NextFunction,
    Request,
    RequestHandler,
    Response,
  } from 'express';

  export function ipKeyGenerator(
    ip: string,
    ipv6Subnet?: number | false,
  ): string;

  export type LoggerFn = (error: unknown, message?: string) => void;

  export type Logger = {
    error: LoggerFn;
    warn: LoggerFn;
  };

  export type IncrementCallback = (
    error: Error | undefined,
    totalHits: number,
    resetTime: Date | undefined,
  ) => void;

  /** A middleware-style function that derives a value T from the request. */
  export type ValueDeterminingMiddleware<T> = (
    request: Request,
    response: Response,
  ) => T | Promise<T>;

  /** Handler called when the rate limit is exceeded. */
  export type RateLimitExceededEventHandler = (
    request: Request,
    response: Response,
    next: NextFunction,
    optionsUsed: Options,
  ) => void;

  export type RateLimitReachedEventHandler = (
    request: Request,
    response: Response,
    optionsUsed: Options,
  ) => void;

  export type ClientRateLimitInfo = {
    totalHits: number;
    resetTime: Date | undefined;
  };

  export type IncrementResponse = ClientRateLimitInfo;

  export type RateLimitInfo = {
    limit: number;
    used: number;
    remaining: number;
    resetTime: Date | undefined;
    key: string;
  };

  export type AugmentedRequest = Request & {
    [key: string]: RateLimitInfo;
  };

  export type RateLimitRequestHandler = RequestHandler & {
    resetKey: (key: string) => void;
    getKey: (
      key: string,
    ) =>
      | Promise<ClientRateLimitInfo | undefined>
      | ClientRateLimitInfo
      | undefined;
  };

  export type LegacyStore = {
    incr: (key: string, callback: IncrementCallback) => void;
    decrement: (key: string) => void;
    resetKey: (key: string) => void;
    resetAll?: () => void;
  };

  export type Store = {
    init?: (options: Options) => void | Promise<void>;
    get?: (
      key: string,
    ) => Promise<ClientRateLimitInfo | undefined> | ClientRateLimitInfo | undefined;
    increment: (key: string) => Promise<IncrementResponse> | IncrementResponse;
    decrement: (key: string) => Promise<void> | void;
    resetKey: (key: string) => Promise<void> | void;
    resetAll?: () => Promise<void> | void;
    shutdown?: () => Promise<void> | void;
    localKeys?: boolean;
    prefix?: string;
  };

  export type EnabledValidations = {
    [key: string]: boolean | undefined;
  };

  export type Options = {
    windowMs: number;
    limit?: number | ValueDeterminingMiddleware<number>;
    max?: number | ValueDeterminingMiddleware<number>;
    message?: unknown | ValueDeterminingMiddleware<unknown>;
    statusCode?: number;
    legacyHeaders?: boolean;
    standardHeaders?: boolean | string;
    identifier?: string | ValueDeterminingMiddleware<string>;
    requestPropertyName?: string;
    skipFailedRequests?: boolean;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: ValueDeterminingMiddleware<string>;
    ipv6Subnet?: number | ValueDeterminingMiddleware<number> | false;
    handler?: RateLimitExceededEventHandler;
    skip?: ValueDeterminingMiddleware<boolean>;
    requestWasSuccessful?: ValueDeterminingMiddleware<boolean>;
    store?: Store | LegacyStore;
    validate?: boolean | EnabledValidations;
    passOnStoreError?: boolean;
    logger?: Logger;
  };

  export const rateLimit: (passedOptions?: Options) => RateLimitRequestHandler;

  export default rateLimit;
}
