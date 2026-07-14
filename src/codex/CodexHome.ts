import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function getDefaultCodexHome(): string {
  return join(homedir(), ".codex");
}

export function getAssistantCodexHome(): string {
  return join(homedir(), ".codex-obsidian-assistant");
}

export function syncAssistantCodexHome(): string {
  const sourceHome = getDefaultCodexHome();
  const targetHome = getAssistantCodexHome();

  mkdirSync(targetHome, { recursive: true });

  const sourceAuth = join(sourceHome, "auth.json");
  const targetAuth = join(targetHome, "auth.json");
  if (existsSync(sourceAuth)) {
    copyFileSync(sourceAuth, targetAuth);
  }

  const targetConfig = join(targetHome, "config.toml");
  if (!existsSync(targetConfig)) {
    writeFileSync(targetConfig, "approval_policy = \"never\"\n", "utf8");
  }

  return targetHome;
}

export function clearAssistantCodexHomeAuth(): void {
  const targetAuth = join(getAssistantCodexHome(), "auth.json");
  if (existsSync(targetAuth)) {
    rmSync(targetAuth, { force: true });
  }
}
