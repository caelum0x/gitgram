/**
 * Vendored A2A (Agent-to-Agent) SDK entry point.
 *
 * These modules were copied from external/a2a-js/src into this product so the
 * A2A server + client are first-party and version-pinned. The gRPC transport
 * (src/a2a/grpc, src/a2a/server/grpc, src/a2a/client/transports/grpc, and the
 * protobuf stubs under src/a2a/types/pb + src/a2a/types/converters) is copied
 * but EXCLUDED from compilation (see tsconfig.json) because it needs heavy
 * @grpc/* + protobuf runtime deps that are not installed; the JSON-RPC and REST
 * transports — which is what the server route and client use — compile and run
 * without those deps.
 *
 * Shared modules (core, types, errors, a2a_response, constants, extensions,
 * sse_utils) live alongside server/ and client/ in this directory, so the
 * copied relative imports (`../core`, `../types`, ...) resolve in-place.
 */

export * from "./server/index.js";
export * from "./client/index.js";
export { AGENT_CARD_PATH, HTTP_EXTENSION_HEADER } from "./constants.js";
export { A2AExpressApp } from "./server/express/index.js";
export type { AgentCard } from "./types.js";
