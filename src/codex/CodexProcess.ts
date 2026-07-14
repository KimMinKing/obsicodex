import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { buildCodexCommand } from "./CodexCommand";
import { syncAssistantCodexHome } from "./CodexHome";
import { CodexEventHandler, RpcNotification, RpcRequest } from "./CodexTypes";

export class CodexProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly onEvent: CodexEventHandler,
  ) {}

  get isRunning(): boolean {
    return this.child !== null;
  }

  start(): void {
    if (this.child) {
      return;
    }

    try {
      const codexHome = syncAssistantCodexHome();
      const resolved = buildCodexCommand(this.command, this.args);
      this.child = spawn(resolved.command, resolved.args, {
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
        },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: resolved.windowsHide,
      });
    } catch (error) {
      this.child = null;
      this.onEvent({ type: "error", payload: error instanceof Error ? error : new Error(String(error)) });
      return;
    }

    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.onEvent({ type: "stderr", payload: chunk.toString("utf8") });
    });
    this.child.on("error", (error) => {
      this.onEvent({ type: "error", payload: error });
    });
    this.child.on("exit", (code) => {
      this.child = null;
      this.buffer = "";
      this.onEvent({ type: "exit", payload: code });
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.buffer = "";
  }

  send(message: RpcRequest | RpcNotification): void {
    if (!this.child) {
      throw new Error("Codex app-server가 실행되지 않았습니다.");
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        this.onEvent({ type: "message", payload: JSON.parse(trimmed) });
      } catch {
        this.onEvent({ type: "stderr", payload: `JSON 파싱 실패: ${trimmed}` });
      }
    }
  }
}
