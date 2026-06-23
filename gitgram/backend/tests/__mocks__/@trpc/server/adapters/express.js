// Stub for @trpc/server/adapters/express — package is not installed in the test environment.
module.exports = {
  createExpressMiddleware: () => (_req, _res, next) => next(),
};
