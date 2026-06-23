import fs from "node:fs";
import path from "node:path";
import { TmError } from "./errors.js";

export class ProjectLock {
  private lockPath: string;
  constructor(private projectRoot: string) {
    this.lockPath = path.join(projectRoot, ".tm_lock");
  }

  acquire(): void {
    try {
      const fd = fs.openSync(this.lockPath, "wx"); // exclusive create
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
    } catch {
      throw new TmError("TM_CONFLICT_LOCKED", "Project is locked (capture/restore in progress)", {
        lockPath: this.lockPath,
      });
    }
  }

  release(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {
      // ignore
    }
  }
}
