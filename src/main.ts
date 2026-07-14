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
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="5" width="14" height="14" rx="4"/>
        <path d="M9 10h6"/>
        <path d="M9 14h4"/>
        <path d="M17.5 3.5v3"/>
        <path d="M19 5h-3"/>
        <path d="M6.5 17.5 4 20"/>
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
      .setName("Assistant memory folder")
      .setDesc("Profile, Goals, Preferences 같은 비서 문맥 파일을 둘 폴더입니다.")
      .addText((text) =>
        text
          .setPlaceholder("Assistant")
          .setValue(this.plugin.settings.assistantFolder)
          .onChange(async (value) => {
            this.plugin.settings.assistantFolder = value.trim() || DEFAULT_SETTINGS.assistantFolder;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Daily review folder")
      .setDesc("답변 저장 기능으로 만든 일일 정리 파일을 둘 폴더입니다.")
      .addText((text) =>
        text
          .setPlaceholder("Assistant/Daily Review")
          .setValue(this.plugin.settings.dailyReviewFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyReviewFolder = value.trim() || DEFAULT_SETTINGS.dailyReviewFolder;
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
      .setName("Default assistant mode")
      .setDesc("새로 열었을 때 사용할 기본 응답 모드입니다.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("balanced", "Balanced")
          .addOption("quick", "Quick")
          .addOption("deep", "Deep analysis")
          .addOption("diary", "Diary review")
          .addOption("study", "Study coach")
          .setValue(this.plugin.settings.assistantMode)
          .onChange(async (value) => {
            this.plugin.settings.assistantMode = value as AssistantSettings["assistantMode"];
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Compact note context")
      .setDesc("토큰을 아끼기 위해 TODO, 일정, 중요 문장을 우선 보내고 원문 길이를 줄입니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.compactContext).onChange(async (value) => {
          this.plugin.settings.compactContext = value;
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

    new Setting(containerEl)
      .setName("Theme preset")
      .setDesc("사이드바의 기본 색감입니다.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("jupiter", "Jupiter brown")
          .addOption("nebula", "Nebula teal")
          .addOption("midnight", "Midnight")
          .setValue(this.plugin.settings.themePreset)
          .onChange(async (value) => {
            this.plugin.settings.themePreset = value as AssistantSettings["themePreset"];
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Accent color")
      .setDesc("버튼, 강조선, 검색창에 쓰는 대표 색입니다. 예: #f7c56b")
      .addText((text) =>
        text
          .setPlaceholder("#f7c56b")
          .setValue(this.plugin.settings.accentColor)
          .onChange(async (value) => {
            this.plugin.settings.accentColor = /^#[0-9a-f]{6}$/iu.test(value.trim())
              ? value.trim()
              : DEFAULT_SETTINGS.accentColor;
            await this.plugin.saveSettings();
          }),
      );
  }
}
