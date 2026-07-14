import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { CodexAuth } from "./codex/CodexAuth";
import { CodexClient } from "./codex/CodexClient";
import { VaultContext } from "./context/VaultContext";
import { ApprovalManager } from "./security/ApprovalManager";
import { AssistantSettings, DEFAULT_SETTINGS } from "./settings/AssistantSettings";
import { ASSISTANT_VIEW_TYPE, AssistantView } from "./views/AssistantView";

export default class PersonalCodexAssistantPlugin extends Plugin {
  private assistantSettings!: AssistantSettings;
  private codex!: CodexClient;
  private auth!: CodexAuth;
  private vaultContext!: VaultContext;
  private approvals!: ApprovalManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.codex = new CodexClient(this.assistantSettings);
    this.auth = new CodexAuth(this.assistantSettings.codexCommand);
    this.vaultContext = new VaultContext(this.app, this.assistantSettings);
    this.approvals = new ApprovalManager();

    this.registerView(
      ASSISTANT_VIEW_TYPE,
      (leaf) => new AssistantView(leaf, this.codex, this.auth, this.vaultContext, this.approvals),
    );

    this.addRibbonIcon("bot", "Codex Assistant 열기", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-personal-codex-assistant",
      name: "Open Personal Codex Assistant",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "create-assistant-files",
      name: "Create assistant context files",
      callback: async () => {
        await this.vaultContext.ensureAssistantFiles();
        new Notice("Assistant 폴더와 기본 문맥 파일을 만들었습니다.");
      },
    });

    await this.vaultContext.ensureAssistantFiles();
  }

  onunload(): void {
    this.codex.stop();
    this.app.workspace.detachLeavesOfType(ASSISTANT_VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(ASSISTANT_VIEW_TYPE);
    let leaf: WorkspaceLeaf | null = leaves[0] ?? null;

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: ASSISTANT_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.assistantSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.assistantSettings);
  }
}
