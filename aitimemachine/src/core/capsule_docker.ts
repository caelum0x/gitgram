import Docker from "dockerode";
import path from "node:path";
import { TmError } from "./errors.js";

export type Capsule = {
  capsuleId: string;
  containerId: string;
  imageRef: string;
  imageDigest: string;
  workdir: string;
};

export class DockerCapsuleManager {
  private docker: Docker;
  constructor() {
    this.docker = new Docker(); // uses env / default socket
  }

  async ensureImage(imageRef: string): Promise<{ imageDigest: string }> {
    // Pull if needed
    // Note: production: resolve to digest via registry inspect; for now pull and inspect.
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(imageRef, (err: any, stream: any) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (e: any) => (e ? reject(e) : resolve()));
      });
    });

    const img = this.docker.getImage(imageRef);
    const info = await img.inspect();
    // RepoDigests like ["node@sha256:...."]
    const digest = (info.RepoDigests && info.RepoDigests[0]?.split("@")[1]) || info.Id;
    return { imageDigest: digest };
  }

  async upsert(params: {
    capsuleId: string;
    imageRef: string;        // e.g. node:20-bookworm
    projectRoot: string;     // host path
    workdir: string;         // container workdir
    env?: Record<string, string>;
  }): Promise<Capsule> {
    const { capsuleId, imageRef, projectRoot, workdir, env } = params;
    const { imageDigest } = await this.ensureImage(imageRef);

    // Create container name stable by capsuleId
    const name = `aitm_${capsuleId}`;
    // If exists, reuse
    try {
      const existing = this.docker.getContainer(name);
      const inspect = await existing.inspect();
      if (inspect?.State?.Running) {
        return { capsuleId, containerId: inspect.Id, imageRef, imageDigest, workdir };
      }
      await existing.start();
      return { capsuleId, containerId: inspect.Id, imageRef, imageDigest, workdir };
    } catch {
      // create new
    }

    const binds = [`${path.resolve(projectRoot)}:/workspace:rw`];

    const container = await this.docker.createContainer({
      name,
      Image: imageRef,
      WorkingDir: workdir,
      Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined,
      HostConfig: { Binds: binds },
      Tty: false,
      Cmd: ["sleep", "infinity"],
    });

    await container.start();
    return { capsuleId, containerId: container.id, imageRef, imageDigest, workdir };
  }

  async exec(params: {
    containerNameOrId: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> {
    const { containerNameOrId, command, cwd, timeoutMs = 60000 } = params;
    const container = this.docker.getContainer(containerNameOrId);

    const exec = await container.exec({
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: cwd,
      Cmd: ["sh", "-lc", command],
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    // Demux stdout/stderr
    (container as any).modem.demuxStream(stream, {
      write: (c: Buffer) => stdoutChunks.push(Buffer.from(c)),
    }, {
      write: (c: Buffer) => stderrChunks.push(Buffer.from(c)),
    });

    const done = new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const timer = setTimeout(() => {
      try { stream.destroy(new Error("timeout")); } catch {}
    }, timeoutMs);

    await done.finally(() => clearTimeout(timer));

    const inspect = await exec.inspect();
    const exitCode = inspect.ExitCode ?? 1;

    if (exitCode === null || exitCode === undefined) {
      throw new TmError("TM_CAPSULE_EXEC_FAILED", "Capsule exec failed (no exit code)");
    }

    return {
      exitCode,
      stdout: Buffer.concat(stdoutChunks),
      stderr: Buffer.concat(stderrChunks),
    };
  }

  async down(capsuleId: string): Promise<void> {
    const name = `aitm_${capsuleId}`;
    const c = this.docker.getContainer(name);
    try { await c.stop({ t: 2 }); } catch {}
    try { await c.remove({ force: true }); } catch {}
  }
}
