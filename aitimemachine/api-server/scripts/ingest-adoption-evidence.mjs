#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const [kind, inputPath, ...flags] = process.argv.slice(2);
const routes = {
  coverage: "/v1/adoption/oss-coverage/batches",
  case: "/v1/adoption/case-evidence",
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

if (!(kind in routes) || !inputPath) {
  fail("Usage: ingest-adoption-evidence.mjs <coverage|case> <payload.json> --idempotency-key=<stable-key> [--dry-run]");
} else {
  const idempotencyFlag = flags.find((flag) => flag.startsWith("--idempotency-key="));
  const idempotencyKey = idempotencyFlag?.slice("--idempotency-key=".length) || "";
  const dryRun = flags.includes("--dry-run");
  const apiUrl = process.env.ADOPTION_API_URL || "";
  const secret = process.env.ADOPTION_INGESTION_SECRET || "";

  try {
    const bytes = await readFile(inputPath);
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) throw new Error("Payload exceeds the 5 MiB operator limit");
    const payload = JSON.parse(bytes.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload must be a JSON object");
    if (typeof payload.collectorVersion !== "string" || payload.collectorVersion.length === 0) {
      throw new Error("Payload must include collectorVersion");
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[\x21-\x7e]+$/.test(idempotencyKey)) {
      throw new Error("Provide a stable 8-128 character --idempotency-key");
    }

    if (dryRun) {
      process.stdout.write(JSON.stringify({ validJson: true, kind, bytes: bytes.byteLength, collectorVersion: payload.collectorVersion }) + "\n");
    } else {
      if (!apiUrl || !secret) throw new Error("ADOPTION_API_URL and ADOPTION_INGESTION_SECRET are required");
      const base = new URL(apiUrl);
      const local = base.hostname === "localhost" || base.hostname === "127.0.0.1" || base.hostname === "::1";
      if (base.protocol !== "https:" && !(local && base.protocol === "http:")) {
        throw new Error("ADOPTION_API_URL must use HTTPS outside localhost");
      }

      const response = await fetch(new URL(routes[kind], base), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Internal-Secret": secret,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Collector API returned HTTP ${response.status}: ${body.slice(0, 1000)}`);
      if (response.headers.get("x-collector-key-rotation") === "previous-key-accepted") {
        process.stderr.write("Warning: the previous collector key was accepted; update this operator environment to the current key.\n");
      }
      process.stdout.write(`${body}\n`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : "Adoption evidence ingestion failed");
  }
}
