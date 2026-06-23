import path from "node:path";
import fs from "node:fs";

export function real(p: string): string {
  // realpathSync.native is faster and returns normalized casing on Windows
  return fs.realpathSync.native(p);
}

export function joinSafe(root: string, rel: string): string {
  const rootReal = real(root);
  const target = path.resolve(rootReal, rel);
  const targetReal = fs.existsSync(target) ? real(target) : target; // if doesn't exist yet
  if (!targetReal.startsWith(rootReal + path.sep) && targetReal !== rootReal) {
    throw new Error(`Path escape: ${rel}`);
  }
  return target;
}
