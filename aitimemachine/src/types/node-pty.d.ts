/**
 * Type declaration for node-pty (optional dependency)
 * node-pty is a native module for PTY support
 */
declare module "node-pty" {
  export interface IPty {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    onData(callback: (data: string) => void): void;
    onExit(callback: (event: { exitCode: number; signal?: number }) => void): void;
    kill(signal?: string): void;
  }

  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
    encoding?: string | null;
    handleFlowControl?: boolean;
    flowControlPause?: string;
    flowControlResume?: string;
  }

  export function spawn(
    shell: string,
    args: string[],
    options?: IPtyForkOptions
  ): IPty;
}
