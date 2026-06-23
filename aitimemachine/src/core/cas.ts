import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TmError } from "./errors.js";

export type BlobRef = { hash: string; sizeBytes: number; mimeType: string };

export class CasStore {
  constructor(public readonly blobsDir: string) {
    fs.mkdirSync(this.blobsDir, { recursive: true });
  }

  sha256Hex(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
  }

  blobPath(hash: string): string {
    const a = hash.slice(0, 2);
    const b = hash.slice(2, 4);
    return path.join(this.blobsDir, a, b, hash);
  }

  has(hash: string): boolean {
    return fs.existsSync(this.blobPath(hash));
  }

  putBytes(mimeType: string, data: Buffer): BlobRef {
    const hash = this.sha256Hex(data);
    const p = this.blobPath(hash);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) fs.writeFileSync(p, data);
    const st = fs.statSync(p);
    return { hash, sizeBytes: st.size, mimeType };
  }

  getBytes(hash: string): Buffer {
    const p = this.blobPath(hash);
    if (!fs.existsSync(p)) throw new TmError("TM_BLOB_MISSING", "Blob missing", { hash });
    return fs.readFileSync(p);
  }
}
