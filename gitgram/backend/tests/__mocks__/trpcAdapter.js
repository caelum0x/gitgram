// Stub for src/trpc/adapter — avoids importing @trpc/server which is not installed.
module.exports = {
  trpcMiddleware: (_req, _res, next) => next(),
};
