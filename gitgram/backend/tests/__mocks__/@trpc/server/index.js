// Stub for @trpc/server — package is not installed in the test environment.
module.exports = {
  initTRPC: () => ({
    create: () => ({
      router: (routes) => routes,
      procedure: {
        input: () => ({ query: (fn) => fn, mutation: (fn) => fn }),
        query: (fn) => fn,
        mutation: (fn) => fn,
      },
    }),
  }),
  TRPCError: class TRPCError extends Error {
    constructor({ code, message }) {
      super(message);
      this.code = code;
    }
  },
};
