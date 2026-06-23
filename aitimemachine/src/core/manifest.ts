import fs from "node:fs";
import path from "node:path";
import { CasStore } from "./cas.js";
import { TmError } from "./errors.js";
import {
  shouldRedactContent,
  createRedactedPlaceholder,
  createRedactionEvent,
  type RedactionEvent,
} from "./redaction.js";
import { putSmart, type FileRef, isChunkedRef } from "./chunked.js";

export type FileEntry = {
  path: string;     // relative, posix-style recommended
  hash: string;     // sha256 (for simple blobs) or first chunk hash (for chunked)
  size: number;
  mode?: number;
  mtimeMs?: number;
  isRedacted?: boolean; // true if content was redacted
  isChunked?: boolean;  // true if stored as chunked blob
  chunkRef?: FileRef;   // full chunked reference if isChunked=true
};

export type Manifest = {
  version: 1;
  rootRel: ".";
  capturedAt: string;
  ignore: string[];
  files: FileEntry[];
};

function toPosix(rel: string) {
  return rel.split(path.sep).join("/");
}

export async function buildManifest(
  projectRoot: string,
  cas: CasStore,
  options: {
    ignore: (relPosix: string) => boolean;
    maxFileBytes?: number;
    enableRedaction?: boolean;
    enableChunking?: boolean;
  }
): Promise<{
  manifest: Manifest;
  fileCount: number;
  bytesHashed: number;
  redactionEvents: RedactionEvent[];
}> {
  const files: FileEntry[] = [];
  let bytesHashed = 0;
  const maxFileBytes = options.maxFileBytes ?? 100 * 1024 * 1024; // 100MB default
  const enableRedaction = options.enableRedaction ?? true;
  const enableChunking = options.enableChunking ?? true;
  const redactionEvents: RedactionEvent[] = [];

  function walk(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
      const abs = path.join(dir, it.name);
      const rel = path.relative(projectRoot, abs);
      const relPosix = toPosix(rel);

      if (options.ignore(relPosix)) continue;

      if (it.isDirectory()) {
        walk(abs);
      } else if (it.isFile()) {
        const st = fs.statSync(abs);
        if (st.size > maxFileBytes) {
          throw new TmError("TM_TOO_LARGE", "File too large for snapshot", { path: relPosix, size: st.size });
        }

        let buf = fs.readFileSync(abs);
        let isRedacted = false;

        // Check for secrets and redact if needed
        if (enableRedaction) {
          const redactionResult = shouldRedactContent(buf, relPosix);
          if (redactionResult.isRedacted) {
            const event = createRedactionEvent(relPosix, redactionResult);
            redactionEvents.push(event);

            // Replace content with redacted placeholder
            buf = Buffer.from(createRedactedPlaceholder(relPosix, redactionResult.reason!, redactionResult.patterns!));
            isRedacted = true;
          }
        }

        bytesHashed += buf.byteLength;

        // Use smart storage (chunked for large files)
        let fileRef: FileRef;
        if (enableChunking) {
          fileRef = putSmart(cas, "application/octet-stream", buf);
        } else {
          fileRef = cas.putBytes("application/octet-stream", buf);
        }

        const entry: FileEntry = {
          path: relPosix,
          hash: isChunkedRef(fileRef) ? fileRef.chunks[0] : fileRef.hash,
          size: st.size,
          mode: st.mode & 0o777,
          mtimeMs: st.mtimeMs,
        };

        if (isRedacted) {
          entry.isRedacted = true;
        }

        if (isChunkedRef(fileRef)) {
          entry.isChunked = true;
          entry.chunkRef = fileRef;
        }

        files.push(entry);
      }
    }
  }

  walk(projectRoot);

  const manifest: Manifest = {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [], // store patterns elsewhere; keep resolver deterministic in your DB
    files,
  };

  return { manifest, fileCount: files.length, bytesHashed, redactionEvents };
}

export function parseManifestJson(text: string): Manifest {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new TmError("TM_MANIFEST_CORRUPT", "Manifest JSON parse failed");
  }
  if (obj?.version !== 1 || !Array.isArray(obj.files)) {
    throw new TmError("TM_MANIFEST_CORRUPT", "Manifest schema invalid");
  }
  return obj as Manifest;
}
