import net from "node:net";
import { spawn } from "node:child_process";

function canBindLoopback() {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: false,
    });

    child.on("exit", (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });
}

async function main() {
  const hasLoopback = await canBindLoopback();

  if (!hasLoopback) {
    console.warn(
      "[integration-safe] Loopback sockets unavailable. Skipping integration tests and running service tests instead."
    );

    const fallbackCode = await runCommand(
      "npx",
      ["vitest", "run", "tests/services"],
      { ...process.env, AITM_TEST_NO_LISTEN: "1" }
    );
    process.exit(fallbackCode);
  }

  const code = await runCommand(
    "npx",
    ["vitest", "run", "tests/integration"],
    { ...process.env, AITM_TEST_NO_LISTEN: process.env.AITM_TEST_NO_LISTEN || "0" }
  );
  process.exit(code);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[integration-safe] fatal error: ${message}`);
  process.exit(1);
});
