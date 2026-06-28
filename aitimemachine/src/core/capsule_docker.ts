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
    // Deterministic / offline-friendly resolution:
    //   1. If the image is already present locally, resolve its digest without
    //      hitting the registry. This pins to the exact local image and works
    //      offline (e.g. air-gapped restores).
    //   2. Otherwise pull, then inspect to obtain the registry digest.
    // If imageRef already pins a digest (repo@sha256:...), the local inspect in
    // step 1 returns that digest directly, so we never re-pull a pinned image
    // that is already cached.
    const localDigest = await this.resolveLocalDigest(imageRef);
    if (localDigest) {
      return { imageDigest: localDigest };
    }

    await this.pullImage(imageRef);

    const digest = await this.resolveLocalDigest(imageRef);
    if (!digest) {
      throw new TmError("TM_CAPSULE_IMAGE_DIGEST_FAILED", "Could not resolve image digest after pull", { imageRef });
    }
    return { imageDigest: digest };
  }

  /**
   * Resolve an image's digest from the local Docker image store. Returns null
   * when the image is not present locally (so the caller can pull it).
   */
  private async resolveLocalDigest(imageRef: string): Promise<string | null> {
    try {
      const info = await this.docker.getImage(imageRef).inspect();
      // RepoDigests look like ["node@sha256:...."]; fall back to the image Id.
      return (info.RepoDigests && info.RepoDigests[0]?.split("@")[1]) || info.Id || null;
    } catch {
      // Image not present locally.
      return null;
    }
  }

  /** Pull an image, resolving once the pull stream completes. */
  private async pullImage(imageRef: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(imageRef, (err: unknown, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err instanceof Error ? err : new Error(String(err)));
        this.docker.modem.followProgress(stream, (e: unknown) =>
          e ? reject(e instanceof Error ? e : new Error(String(e))) : resolve(),
        );
      });
    });
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
