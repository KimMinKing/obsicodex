import { spawn } from "child_process";
import { buildCodexCommand } from "./CodexCommand";
import { clearAssistantCodexHomeAuth } from "./CodexHome";

export interface CodexAuthStatus {
  available: boolean;
  signedIn: boolean;
  output: string;
}

export type CodexAuthLogHandler = (message: string) => void;

export class CodexAuth {
  constructor(private readonly command: string) {}

  checkStatus(): Promise<CodexAuthStatus> {
    return new Promise((resolve) => {
      const resolved = buildCodexCommand(this.command, ["login", "status"]);
      const child = spawn(resolved.command, resolved.args, {
        shell: false,
        windowsHide: resolved.windowsHide,
      });

      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        resolve({
          available: false,
          signedIn: false,
          output: error.message,
        });
      });
      child.on("exit", (code) => {
        resolve({
          available: true,
          signedIn: code === 0 && !/not logged in|not signed in|no active/i.test(output),
          output: output.trim(),
        });
      });
    });
  }

  login(onLog: CodexAuthLogHandler): Promise<number | null> {
    return new Promise((resolve) => {
      const resolved = buildCodexCommand(this.command, ["login"]);
      const child = spawn(resolved.command, resolved.args, {
        shell: false,
        windowsHide: resolved.windowsHide,
      });

      child.stdout.on("data", (chunk: Buffer) => {
        this.handleLoginOutput(chunk.toString("utf8"), onLog);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        this.handleLoginOutput(chunk.toString("utf8"), onLog);
      });
      child.on("error", (error) => {
        onLog(error.message);
        resolve(null);
      });
      child.on("exit", (code) => {
        clearAssistantCodexHomeAuth();
        resolve(code);
      });
    });
  }

  logout(onLog: CodexAuthLogHandler): Promise<number | null> {
    return new Promise((resolve) => {
      const resolved = buildCodexCommand(this.command, ["logout"]);
      const child = spawn(resolved.command, resolved.args, {
        shell: false,
        windowsHide: resolved.windowsHide,
      });

      child.stdout.on("data", (chunk: Buffer) => {
        const message = chunk.toString("utf8").trim();
        if (message) {
          onLog(message);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const message = chunk.toString("utf8").trim();
        if (message) {
          onLog(message);
        }
      });
      child.on("error", (error) => {
        onLog(error.message);
        resolve(null);
      });
      child.on("exit", (code) => {
        resolve(code);
      });
    });
  }

  private handleLoginOutput(output: string, onLog: CodexAuthLogHandler): void {
    const trimmed = output.trim();
    if (trimmed) {
      onLog(trimmed);
    }

    const urls = output.match(/https?:\/\/\S+/gu) ?? [];
    for (const url of urls) {
      this.openExternalUrl(url.replace(/[.)\]]+$/u, ""));
    }
  }

  private openExternalUrl(url: string): void {
    try {
      const electron = require("electron") as { shell?: { openExternal: (url: string) => Promise<void> } };
      electron.shell?.openExternal(url);
    } catch {
      // If Electron is unavailable, the login output remains visible to copy.
    }
  }
}
