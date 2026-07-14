import { addIcon, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { CodexAuth } from "./codex/CodexAuth";
import { CodexClient } from "./codex/CodexClient";
import { VaultContext } from "./context/VaultContext";
import { ApprovalManager } from "./security/ApprovalManager";
import { AssistantSettings, DEFAULT_SETTINGS } from "./settings/AssistantSettings";
import { ASSISTANT_VIEW_TYPE, AssistantView } from "./views/AssistantView";

export default class ObsidianCodexAssistantPlugin extends Plugin {
  declare settings: AssistantSettings;
  private codex!: CodexClient;
  private auth!: CodexAuth;
  private vaultContext!: VaultContext;
  private approvals!: ApprovalManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    addIcon(
      "obsidian-codex-assistant",
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" opacity="0.22"/>
        <path d="M4.2 14.2c3.3 3.4 10.4 4.4 14.8 1.9 1.7-1 2.2-2.2 1.5-3.1-.9-1.3-4.2-1.3-8.1-.1-4 1.2-7.2 1.1-8.5-.2-.9-.9-.8-2.1.4-3.1 3.2-2.8 10.5-2.6 15.2.4"/>
        <path d="M8.1 5.6c1.1-.5 2.4-.8 3.9-.8a7.2 7.2 0 0 1 6.7 4.6"/>
        <path d="M18.8 15.4A7.2 7.2 0 0 1 5.7 9.3"/>
        <path d="M9.2 11h5.6"/>
        <path d="M8.6 13.1h6.8"/>
      </svg>`,
    );

    this.buildServices();

    this.registerView(
      ASSISTANT_VIEW_TYPE,
      (leaf) => new AssistantView(leaf, this.codex, this.auth, this.vaultContext, this.approvals, this.settings),
    );

    this.addRibbonIcon("obsidian-codex-assistant", "Obsidian Codex Assistant 열기", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-obsidian-codex-assistant",
      name: "Open Obsidian Codex Assistant",
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

    this.addSettingTab(new ObsidianCodexAssistantSettingTab(this.app, this));
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.buildServices();
  }

  private buildServices(): void {
    this.codex = new CodexClient(this.settings);
    this.auth = new CodexAuth(this.settings.codexCommand);
    this.vaultContext = new VaultContext(this.app, this.settings);
    this.approvals = new ApprovalManager();
  }
}

class ObsidianCodexAssistantSettingTab extends PluginSettingTab {
  constructor(
    app: ObsidianCodexAssistantPlugin["app"],
    private readonly plugin: ObsidianCodexAssistantPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian Codex Assistant" });

    new Setting(containerEl)
      .setName("Chat history folder")
      .setDesc("채팅 기록을 저장할 Vault 내부 폴더입니다.")
      .addText((text) =>
        text
          .setPlaceholder("Assistant/Chats")
          .setValue(this.plugin.settings.chatHistoryFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatHistoryFolder = value.trim() || DEFAULT_SETTINGS.chatHistoryFolder;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Max messages per chat")
      .setDesc("이 개수를 넘으면 새 채팅으로 넘어가도록 안내합니다.")
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.maxChatMessages))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.maxChatMessages = Number.isFinite(parsed) && parsed > 4 ? parsed : DEFAULT_SETTINGS.maxChatMessages;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Codex command")
      .setDesc("일반적으로 codex 그대로 두면 됩니다.")
      .addText((text) =>
        text
          .setPlaceholder("codex")
          .setValue(this.plugin.settings.codexCommand)
          .onChange(async (value) => {
            this.plugin.settings.codexCommand = value.trim() || DEFAULT_SETTINGS.codexCommand;
            await this.plugin.saveSettings();
          }),
      );
  }
}
