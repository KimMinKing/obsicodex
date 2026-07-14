import { addIcon, Notice, Plugin, WorkspaceLeaf } from "obsidian";
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

    addIcon(
      "personal-codex-assistant",
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" opacity="0.22"/>
        <path d="M4.2 14.2c3.3 3.4 10.4 4.4 14.8 1.9 1.7-1 2.2-2.2 1.5-3.1-.9-1.3-4.2-1.3-8.1-.1-4 1.2-7.2 1.1-8.5-.2-.9-.9-.8-2.1.4-3.1 3.2-2.8 10.5-2.6 15.2.4"/>
        <path d="M8.1 5.6c1.1-.5 2.4-.8 3.9-.8a7.2 7.2 0 0 1 6.7 4.6"/>
        <path d="M18.8 15.4A7.2 7.2 0 0 1 5.7 9.3"/>
        <path d="M9.2 11h5.6"/>
        <path d="M8.6 13.1h6.8"/>
      </svg>`,
    );

    this.codex = new CodexClient(this.assistantSettings);
    this.auth = new CodexAuth(this.assistantSettings.codexCommand);
    this.vaultContext = new VaultContext(this.app, this.assistantSettings);
    this.approvals = new ApprovalManager();

    this.registerView(
      ASSISTANT_VIEW_TYPE,
      (leaf) => new AssistantView(leaf, this.codex, this.auth, this.vaultContext, this.approvals),
    );

    this.addRibbonIcon("personal-codex-assistant", "Codex Assistant 열기", () => {
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
