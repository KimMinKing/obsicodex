import { ItemView, MarkdownRenderer, Modal, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { CodexAuth } from "../codex/CodexAuth";
import { CodexClient } from "../codex/CodexClient";
import { CodexEvent } from "../codex/CodexTypes";
import { VaultContext } from "../context/VaultContext";
import { ApprovalManager } from "../security/ApprovalManager";
import { AssistantSettings } from "../settings/AssistantSettings";

export const ASSISTANT_VIEW_TYPE = "obsidian-codex-assistant-view";

type MessageRole = "나" | "Codex" | "시스템";

interface ChatEntry {
  role: MessageRole;
  text: string;
}

export class AssistantView extends ItemView {
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private rootEl!: HTMLElement;
  private tokenUsageEl: HTMLElement | null = null;
  private thinkingEl: HTMLElement | null = null;
  private actionListEl: HTMLElement | null = null;
  private currentChatPath: string | null = null;
  private chatMessageCount = 0;
  private lastAssistantText = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly codex: CodexClient,
    private readonly auth: CodexAuth,
    private readonly vaultContext: VaultContext,
    private readonly approvals: ApprovalManager,
    private readonly settings: AssistantSettings,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return ASSISTANT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Obsidian Codex Assistant";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("obsidian-codex-assistant");
    this.rootEl = container as HTMLElement;

    await this.render();
    this.codex.onEvent((event) => this.handleCodexEvent(event));
  }

  private async render(): Promise<void> {
    this.rootEl.empty();
    this.rootEl.addClass("obsidian-codex-assistant");

    const authStatus = await this.auth.checkStatus();
    if (!authStatus.available) {
      this.renderMissingCli(authStatus.output);
      return;
    }

    if (!authStatus.signedIn) {
      this.renderSignedOut(authStatus.output);
      return;
    }

    this.renderChat();
  }

  private renderHeader(subtitle: string): void {
    const header = this.rootEl.createDiv({ cls: "pca-header" });
    const mark = header.createDiv({ cls: "pca-orbit-mark" });
    mark.createDiv({ cls: "pca-orbit-core" });

    const titleWrap = header.createDiv({ cls: "pca-title-wrap" });
    titleWrap.createEl("h2", { text: "Obsidian Codex Assistant" });
    titleWrap.createEl("p", { text: subtitle });
  }

  private renderMissingCli(output: string): void {
    this.renderHeader("먼저 Codex CLI를 설치하면 바로 사용할 수 있습니다.");

    const panel = this.rootEl.createDiv({ cls: "pca-messages pca-auth-panel" });
    panel.createEl("strong", { cls: "pca-role", text: "설치 필요" });
    panel.createEl("div", {
      text: "이 플러그인은 로컬 Codex CLI와 연결됩니다. 아래 명령을 터미널에 붙여넣어 설치한 뒤, 설치 확인을 눌러주세요.",
    });

    this.createInstallBlock(panel, "Windows", "npm install -g @openai/codex");
    this.createInstallBlock(panel, "macOS / Linux", "curl -fsSL https://chatgpt.com/codex/install.sh | sh");

    const verify = panel.createEl("div", { cls: "pca-install-note" });
    verify.createEl("span", { text: "설치 후 확인 명령: " });
    verify.createEl("code", { text: "codex --version" });

    if (output) {
      panel.createEl("pre", { text: output });
    }

    const toolbar = this.rootEl.createDiv({ cls: "pca-toolbar" });
    this.createToolbarButton(toolbar, "설치 확인", () => this.verifyInstallation());
    this.createToolbarButton(toolbar, "공식 설치 문서 열기", () => {
      this.openExternalUrl("https://developers.openai.com/codex/cli");
    });
  }

  private createInstallBlock(parent: HTMLElement, title: string, command: string): void {
    const block = parent.createDiv({ cls: "pca-install-block" });
    block.createEl("span", { cls: "pca-install-title", text: title });
    block.createEl("code", { text: command });
    const copyButton = block.createEl("button", { text: "복사" });
    copyButton.onclick = () => this.copyText(command);
  }

  private renderSignedOut(output: string): void {
    this.renderHeader("ChatGPT 계정으로 Codex를 연결하세요.");

    const messages = this.rootEl.createDiv({ cls: "pca-messages pca-auth-panel" });
    messages.createEl("strong", { cls: "pca-role", text: "로그인 필요" });
    messages.createEl("div", {
      text: "브라우저에서 ChatGPT 로그인을 완료하면 이후에는 로컬 Codex 세션을 재사용합니다.",
    });

    if (output) {
      messages.createEl("pre", { text: output });
    }

    const toolbar = this.rootEl.createDiv({ cls: "pca-toolbar" });
    const loginButton = toolbar.createEl("button", { text: "ChatGPT로 로그인" });
    loginButton.onclick = () => this.startLogin(loginButton);
    this.createToolbarButton(toolbar, "상태 다시 확인", () => this.render());
  }

  private renderChat(): void {
    this.renderHeader("노트와 목표를 읽고 다음 행동을 정리합니다.");

    this.tokenUsageEl = this.rootEl.createDiv({ cls: "pca-token-usage" });
    this.setTokenUsageText("토큰 사용량 대기 중");

    this.messagesEl = this.rootEl.createDiv({ cls: "pca-messages" });
    this.addMessage("시스템", "새 채팅입니다. 질문을 보내면 기록이 자동 저장됩니다.", false);

    const compose = this.rootEl.createDiv({ cls: "pca-compose" });
    this.inputEl = compose.createEl("textarea", {
      placeholder: "Codex에게 요청하세요. 현재 노트를 함께 보냅니다.",
    });

    const sendButton = compose.createEl("button", { text: "전송" });
    sendButton.onclick = () => this.sendWithContext(this.inputEl.value, false, false);

    this.renderActionMenu();
  }

  private renderActionMenu(): void {
    const actionMenu = this.rootEl.createDiv({ cls: "pca-action-menu" });
    const toggle = actionMenu.createEl("button", { cls: "pca-action-toggle", text: "작업" });
    this.actionListEl = actionMenu.createDiv({ cls: "pca-action-list is-collapsed" });

    toggle.onclick = () => {
      this.actionListEl?.toggleClass("is-collapsed", !this.actionListEl.hasClass("is-collapsed"));
    };

    this.createActionButton("새 채팅", () => this.startNewChat());
    this.createActionButton("채팅 불러오기", () => this.openChatHistoryModal());
    this.createActionButton("로그인 상태", async () => {
      const status = await this.auth.checkStatus();
      this.addMessage("시스템", status.signedIn ? "Codex 로그인 상태입니다." : "Codex 로그인이 필요합니다.");
    });
    this.createActionButton("다시 로그인", () => this.relogin());
    this.createActionButton("현재 노트 요약", () => {
      this.sendWithContext("현재 노트를 간결하게 요약해줘.", false, false);
    });
    this.createActionButton("여러 노트 요약", () => this.openMultiNoteModal());
    this.createActionButton("오늘 정리", () => {
      this.sendWithContext("오늘 기록을 바탕으로 해야 할 일, 일정, 우선순위를 정리해줘.", false, true);
    });
    this.createActionButton("선택 영역 다듬기", () => {
      this.sendWithContext("선택 영역을 더 자연스럽고 명확한 문장으로 고쳐줘. 원문을 직접 수정하지 말고 제안문만 보여줘.", true, false);
    });
    this.createActionButton("답변 저장", () => this.saveDailyReview());
  }

  private createActionButton(text: string, onClick: () => void): void {
    const button = this.actionListEl?.createEl("button", { text });
    if (button) {
      button.onclick = () => {
        this.actionListEl?.addClass("is-collapsed");
        onClick();
      };
    }
  }

  private createToolbarButton(parent: HTMLElement, text: string, onClick: () => void): void {
    const button = parent.createEl("button", { text });
    button.onclick = onClick;
  }

  private async verifyInstallation(): Promise<void> {
    const status = await this.auth.checkStatus();
    if (status.available) {
      new Notice("Codex CLI를 찾았습니다.");
      await this.render();
      return;
    }

    new Notice("아직 Codex CLI를 찾지 못했습니다. 설치 후 Obsidian을 다시 시작해보세요.");
    this.rootEl.empty();
    this.renderMissingCli(status.output || "Codex CLI가 아직 감지되지 않았습니다. 설치 명령을 실행한 뒤 Obsidian을 다시 시작해보세요.");
  }

  private async startLogin(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    new Notice("브라우저 로그인 시작 중...");

    const code = await this.auth.login((message) => {
      if (message) {
        new Notice(message);
      }
    });

    if (code === 0) {
      new Notice("로그인 완료");
      await this.render();
      return;
    }

    button.disabled = false;
    new Notice("로그인이 완료되지 않았습니다. 브라우저 창이 열렸는지 확인하세요.");
  }

  private async relogin(): Promise<void> {
    this.codex.stop();
    this.addMessage("시스템", "저장된 Codex 로그인 정보를 지우고 다시 로그인합니다.");

    await this.auth.logout((message) => {
      if (message) {
        new Notice(message);
      }
    });

    this.rootEl.empty();
    this.renderSignedOut("기존 로그인 정보를 지웠습니다. ChatGPT로 다시 로그인하세요.");
  }

  private async sendWithContext(userInput: string, selectionOnly: boolean, dailyReview: boolean): Promise<void> {
    const trimmed = userInput.trim();
    if (!trimmed) {
      return;
    }

    if (this.chatMessageCount >= this.settings.maxChatMessages) {
      await this.rolloverChat();
    }

    this.inputEl.value = "";
    await this.ensureChatSession(trimmed);
    this.addMessage("나", trimmed);
    await this.persistMessage("나", trimmed);
    this.showThinking();

    const prompt = await this.vaultContext.buildContextualPrompt(trimmed, selectionOnly, dailyReview);
    if (!prompt) {
      this.hideThinking();
      return;
    }

    try {
      this.codex.sendPrompt(prompt);
    } catch (error) {
      this.hideThinking();
      const message = error instanceof Error ? error.message : String(error);
      this.addMessage("시스템", message);
    }
  }

  private async sendPrompt(prompt: string, label: string): Promise<void> {
    if (this.chatMessageCount >= this.settings.maxChatMessages) {
      await this.rolloverChat();
    }

    await this.ensureChatSession(label);
    this.addMessage("나", label);
    await this.persistMessage("나", label);
    this.showThinking();

    try {
      this.codex.sendPrompt(prompt);
    } catch (error) {
      this.hideThinking();
      const message = error instanceof Error ? error.message : String(error);
      this.addMessage("시스템", message);
    }
  }

  private async ensureChatSession(firstMessage: string): Promise<void> {
    if (!this.currentChatPath) {
      this.currentChatPath = await this.vaultContext.createChatSession(firstMessage);
      this.chatMessageCount = 0;
      new Notice("새 채팅 기록을 만들었습니다.");
    }
  }

  private async persistMessage(role: MessageRole, text: string): Promise<void> {
    if (!this.currentChatPath) {
      return;
    }

    await this.vaultContext.appendChatMessage(this.currentChatPath, role, text);
    this.chatMessageCount += 1;
  }

  private async rolloverChat(): Promise<void> {
    this.addMessage("시스템", "채팅이 길어져 새 채팅으로 넘어갑니다. 이전 기록은 저장되어 있습니다.", false);
    this.currentChatPath = null;
    this.chatMessageCount = 0;
    this.codex.stop();
  }

  private startNewChat(): void {
    this.currentChatPath = null;
    this.chatMessageCount = 0;
    this.codex.stop();
    this.messagesEl.empty();
    this.addMessage("시스템", "새 채팅으로 전환했습니다. 이전 기록은 저장되어 있습니다.", false);
  }

  private openMultiNoteModal(): void {
    new MultiNoteSummaryModal(this, this.vaultContext).open();
  }

  private openChatHistoryModal(): void {
    new ChatHistoryModal(this, this.vaultContext).open();
  }

  async summarizeFiles(files: TFile[]): Promise<void> {
    if (files.length === 0) {
      new Notice("요약할 노트를 선택하세요.");
      return;
    }

    const prompt = await this.vaultContext.buildMultiNoteSummaryPrompt(files);
    await this.sendPrompt(prompt, `${files.length}개 노트 요약`);
  }

  async loadChat(file: TFile): Promise<void> {
    const content = await this.vaultContext.readFile(file);
    this.currentChatPath = file.path;
    const entries = this.parseChatEntries(content);
    this.chatMessageCount = entries.length;
    this.messagesEl.empty();

    for (const entry of entries) {
      this.addMessage(entry.role, entry.text, false);
    }

    new Notice(`채팅을 불러왔습니다: ${file.basename}`);
  }

  private parseChatEntries(content: string): ChatEntry[] {
    const entries: ChatEntry[] = [];
    const regex = /^### (나|Codex|시스템)(?: · .*?)?\n\n([\s\S]*?)(?=^### |\s*$)/gmu;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      entries.push({
        role: match[1] as MessageRole,
        text: match[2].trim(),
      });
    }

    return entries;
  }

  private handleCodexEvent(event: CodexEvent): void {
    if (event.type === "message") {
      this.updateTokenUsage(event.payload);

      if (!this.shouldShowProtocolMessage(event.payload)) {
        return;
      }

      const text = this.extractText(event.payload);
      this.hideThinking();
      if (this.isUnauthorizedPayload(event.payload)) {
        this.addMessage("시스템", text);
        this.codex.stop();
        return;
      }

      this.lastAssistantText = text;
      this.addMessage("Codex", text);
      this.persistMessage("Codex", text).catch(console.error);
      return;
    }

    if (event.type === "stderr") {
      const text = String(event.payload);
      if (/access token could not be refreshed|unauthorized|token_expired|authentication token is expired/i.test(text)) {
        this.hideThinking();
        this.addMessage("시스템", "Codex 로그인 토큰을 갱신하지 못했습니다. '다시 로그인'을 눌러 다시 로그인하세요.");
        this.codex.stop();
      }
      return;
    }

    if (event.type === "error") {
      this.hideThinking();
      const error = event.payload instanceof Error ? event.payload.message : String(event.payload);
      this.addMessage("시스템", `Codex 실행 오류: ${error}`);
      return;
    }

    if (event.type === "exit") {
      this.hideThinking();
    }
  }

  private extractText(payload: unknown): string {
    if (this.isUnauthorizedPayload(payload)) {
      return "Codex 로그인 토큰을 갱신하지 못했습니다. '다시 로그인'을 눌러 다시 로그인하세요.";
    }

    if (typeof payload === "string") {
      return payload;
    }

    if (payload && typeof payload === "object") {
      const notificationText = this.extractNotificationText(payload as Record<string, unknown>);
      if (notificationText) {
        return notificationText;
      }
    }

    return JSON.stringify(payload, null, 2);
  }

  private shouldShowProtocolMessage(payload: unknown): boolean {
    if (this.isUnauthorizedPayload(payload)) {
      return true;
    }

    if (!payload || typeof payload !== "object") {
      return typeof payload === "string" && payload.trim().length > 0;
    }

    const method = (payload as Record<string, unknown>).method;
    if (typeof method !== "string") {
      return false;
    }

    if (method === "error" || method === "warning" || method === "guardianWarning") {
      return true;
    }

    if (method === "item/completed" || method === "rawResponseItem/completed" || method === "turn/completed") {
      return this.extractNotificationText(payload as Record<string, unknown>) !== null;
    }

    return false;
  }

  private extractNotificationText(record: Record<string, unknown>): string | null {
    const method = record.method;
    const params = record.params;
    if (typeof method !== "string" || !params || typeof params !== "object") {
      return null;
    }

    const paramsRecord = params as Record<string, unknown>;

    if (method === "item/completed") {
      const item = paramsRecord.item;
      if (item && typeof item === "object") {
        const itemRecord = item as Record<string, unknown>;
        if (itemRecord.type === "agentMessage" && typeof itemRecord.text === "string") {
          return itemRecord.text;
        }
      }
    }

    if (method === "rawResponseItem/completed") {
      return this.extractRawResponseText(paramsRecord.item);
    }

    if (method === "turn/completed") {
      const turn = paramsRecord.turn;
      if (turn && typeof turn === "object") {
        const turnRecord = turn as Record<string, unknown>;
        if (turnRecord.status === "failed") {
          const error = turnRecord.error;
          if (error && typeof error === "object") {
            const message = (error as Record<string, unknown>).message;
            return typeof message === "string" ? message : "Codex 요청이 실패했습니다.";
          }

          return "Codex 요청이 실패했습니다.";
        }
      }
    }

    if ((method === "error" || method === "warning" || method === "guardianWarning") && typeof paramsRecord.message === "string") {
      return paramsRecord.message;
    }

    return null;
  }

  private extractRawResponseText(item: unknown): string | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      return null;
    }

    const parts = content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }

        const partRecord = part as Record<string, unknown>;
        return partRecord.type === "output_text" && typeof partRecord.text === "string" ? partRecord.text : "";
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join("\n") : null;
  }

  private isUnauthorizedPayload(payload: unknown): boolean {
    return !!payload && typeof payload === "object" && /access token could not be refreshed|unauthorized|token_expired|authentication token is expired/i.test(JSON.stringify(payload));
  }

  private showThinking(): void {
    this.hideThinking();
    this.thinkingEl = this.messagesEl.createDiv({ cls: "pca-thinking" });
    this.thinkingEl.createDiv({ cls: "pca-spinner" });
    this.thinkingEl.createEl("span", { text: "생각 중..." });
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight });
  }

  private hideThinking(): void {
    this.thinkingEl?.remove();
    this.thinkingEl = null;
  }

  private updateTokenUsage(payload: unknown): void {
    if (!this.tokenUsageEl || !payload || typeof payload !== "object") {
      return;
    }

    const record = payload as Record<string, unknown>;
    if (record.method !== "thread/tokenUsage/updated") {
      return;
    }

    const params = record.params;
    const tokenUsage = params && typeof params === "object" ? (params as Record<string, unknown>).tokenUsage : null;
    if (!tokenUsage || typeof tokenUsage !== "object") {
      return;
    }

    const usageRecord = tokenUsage as Record<string, unknown>;
    const total = this.readTotalTokens(usageRecord.total);
    const last = this.readTotalTokens(usageRecord.last);
    const contextWindow = typeof usageRecord.modelContextWindow === "number" ? usageRecord.modelContextWindow : null;
    const remaining = contextWindow !== null ? Math.max(contextWindow - total, 0) : null;

    this.setTokenUsageText([
      `총 ${this.formatNumber(total)}`,
      `이번 ${this.formatNumber(last)}`,
      remaining === null ? "남은 컨텍스트 알 수 없음" : `남은 ${this.formatNumber(remaining)}`,
    ].join(" · "));
  }

  private setTokenUsageText(text: string): void {
    if (!this.tokenUsageEl) {
      return;
    }

    this.tokenUsageEl.empty();
    this.tokenUsageEl.createEl("span", { cls: "pca-token-label", text: "토큰" });
    this.tokenUsageEl.createEl("span", { cls: "pca-token-value", text });
  }

  private readTotalTokens(value: unknown): number {
    if (!value || typeof value !== "object") {
      return 0;
    }

    const totalTokens = (value as Record<string, unknown>).totalTokens;
    return typeof totalTokens === "number" ? totalTokens : 0;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  private addMessage(role: MessageRole, text: string, persist = true): void {
    const message = this.messagesEl.createDiv({ cls: `pca-message pca-message-${this.roleClass(role)}` });
    message.createEl("strong", { cls: "pca-role", text: role });
    const body = message.createDiv({ cls: "pca-message-body" });
    if (role === "Codex") {
      MarkdownRenderer.render(this.app, text, body, "", this);
    } else {
      body.setText(text);
    }
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight });

    if (persist && role === "시스템") {
      this.persistMessage(role, text).catch(console.error);
    }
  }

  private roleClass(role: MessageRole): string {
    if (role === "나") {
      return "user";
    }

    return role === "Codex" ? "assistant" : "system";
  }

  private async saveDailyReview(): Promise<void> {
    if (!this.lastAssistantText.trim()) {
      new Notice("저장할 Codex 답변이 없습니다.");
      return;
    }

    const markdown = [
      `# Daily Review ${window.moment().format("YYYY-MM-DD")}`,
      "",
      this.lastAssistantText,
      "",
    ].join("\n");

    const path = await this.vaultContext.saveDailyReview(markdown);
    new Notice(`저장됨: ${path}`);
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      new Notice("설치 명령을 복사했습니다.");
    } catch {
      new Notice("복사하지 못했습니다. 명령어를 직접 선택해서 복사하세요.");
    }
  }

  private openExternalUrl(url: string): void {
    try {
      const electron = require("electron") as { shell?: { openExternal: (url: string) => Promise<void> } };
      electron.shell?.openExternal(url);
    } catch {
      new Notice(url);
    }
  }
}

class MultiNoteSummaryModal extends Modal {
  private selected = new Set<string>();
  private listEl!: HTMLElement;
  private query = "";

  constructor(
    private readonly assistantView: AssistantView,
    private readonly vaultContext: VaultContext,
  ) {
    super(assistantView.app);
  }

  onOpen(): void {
    this.titleEl.setText("여러 노트 요약");
    this.contentEl.addClass("pca-note-modal");

    const input = this.contentEl.createEl("input", {
      cls: "pca-note-search",
      placeholder: "노트 이름으로 검색",
    });
    input.oninput = () => {
      this.query = input.value.toLowerCase();
      this.renderList();
    };

    this.listEl = this.contentEl.createDiv({ cls: "pca-note-list" });
    this.renderList();

    const footer = this.contentEl.createDiv({ cls: "pca-note-modal-footer" });
    const summarize = footer.createEl("button", { text: "선택한 노트 요약" });
    summarize.onclick = async () => {
      const files = this.vaultContext.getMarkdownFiles().filter((file) => this.selected.has(file.path));
      this.close();
      await this.assistantView.summarizeFiles(files);
    };
  }

  private renderList(): void {
    this.listEl.empty();
    const files = this.vaultContext
      .getMarkdownFiles()
      .filter((file) => file.path.toLowerCase().includes(this.query))
      .slice(0, 80);

    for (const file of files) {
      const row = this.listEl.createEl("label", { cls: "pca-note-row" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selected.has(file.path);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selected.add(file.path);
        } else {
          this.selected.delete(file.path);
        }
      };
      row.createEl("span", { text: file.path });
    }
  }
}

class ChatHistoryModal extends Modal {
  private listEl!: HTMLElement;
  private query = "";

  constructor(
    private readonly assistantView: AssistantView,
    private readonly vaultContext: VaultContext,
  ) {
    super(assistantView.app);
  }

  onOpen(): void {
    this.titleEl.setText("채팅 불러오기");
    this.contentEl.addClass("pca-note-modal");

    const input = this.contentEl.createEl("input", {
      cls: "pca-note-search",
      placeholder: "채팅 제목으로 검색",
    });
    input.oninput = () => {
      this.query = input.value.toLowerCase();
      this.renderList();
    };

    this.listEl = this.contentEl.createDiv({ cls: "pca-note-list" });
    this.renderList();
  }

  private renderList(): void {
    this.listEl.empty();
    const files = this.vaultContext
      .getChatHistoryFiles()
      .filter((file) => file.basename.toLowerCase().includes(this.query))
      .slice(0, 80);

    for (const file of files) {
      const row = this.listEl.createEl("button", { cls: "pca-chat-row", text: file.basename });
      row.onclick = async () => {
        this.close();
        await this.assistantView.loadChat(file);
      };
    }
  }
}
