import { spawn } from "node:child_process";
import path from "node:path";
import { pythonBin } from "./config";

export async function runProcess(
  command: string,
  args: string[],
  options: {
    input?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      stopped: Error | undefined;
    const stop = (error: Error) => {
      stopped = error;
      child.kill("SIGKILL");
    };
    const abort = () =>
      stop(new DOMException("Request cancelled", "AbortError"));
    const timer = setTimeout(
      () => stop(new Error("Worker exceeded its time limit.")),
      options.timeout || 30000,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout) > (options.maxBytes || 8_000_000))
        stop(new Error("Worker output is too large."));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (Buffer.byteLength(stderr) > 100000)
        stop(new Error("Worker error output is too large."));
    });
    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      cleanup();
      if (stopped) reject(stopped);
      else if (code !== 0)
        reject(
          new Error(
            stderr.trim().slice(-2000) || `Worker exited with code ${code}`,
          ),
        );
      else resolve({ stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input || "");
  });
}
export async function pythonJson<T>(
  script: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { stdout } = await runProcess(
    pythonBin(),
    [path.join(process.cwd(), "worker", script)],
    {
      input: JSON.stringify(payload),
      signal,
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        LANG: "C.UTF-8",
        PYTHONIOENCODING: "utf-8",
        NODE_ENV: process.env.NODE_ENV,
      },
    },
  );
  const result = JSON.parse(stdout);
  if (result.error) throw new Error(result.error);
  return result as T;
}
