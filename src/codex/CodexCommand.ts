import { existsSync } from "fs";
import { join } from "path";

export interface ResolvedCodexCommand {
  command: string;
  args: string[];
  windowsHide: boolean;
}

export function buildCodexCommand(command: string, args: string[]): ResolvedCodexCommand {
  const resolved = resolveCommandPath(command);

  if (process.platform === "win32" && /\.cmd$/i.test(resolved)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/c", "call", resolved, ...args],
      windowsHide: true,
    };
  }

  return {
    command: resolved,
    args,
    windowsHide: true,
  };
}

function resolveCommandPath(command: string): string {
  if (process.platform !== "win32" || command.includes("\\") || command.includes("/")) {
    return command;
  }

  const appData = process.env.APPDATA;
  const candidates = [
    appData ? join(appData, "npm", `${command}.cmd`) : "",
    appData ? join(appData, "npm", command) : "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return command;
}
