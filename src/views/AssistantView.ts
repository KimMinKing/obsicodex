import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { CodexAuth } from "../codex/CodexAuth";
import { CodexClient } from "../codex/CodexClient";
import { CodexEvent } from "../codex/CodexTypes";
import { VaultContext } from "../context/VaultContext";
import { ApprovalManager } from "../security/ApprovalManager";

export const ASSISTANT_VIEW_TYPE = "personal-codex-assistant-view";

type MessageRole = "나" | "Codex" | "시스템";

export class AssistantView extends ItemView {
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private rootEl!: HTMLElement;
  private lastAssistantText = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly codex: CodexClient,
    private readonly auth: CodexAuth,
    private readonly vaultContext: VaultContext,
    private readonly approvals: ApprovalManager,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return ASSISTANT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Codex Assistant";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("personal-codex-assistant");
    this.rootEl = container as HTMLElement;

    await this.render();
    this.codex.onEvent((event) => this.handleCodexEvent(event));
  }

  private async render(): Promise<void> {
    this.rootEl.empty();
    this.rootEl.addClass("personal-codex-assistant");

    const authStatus = await this.auth.checkStatus();
    if (!authStatus.signedIn) {
      this.renderSignedOut(authStatus.output, authStatus.available);
      return;
    }

    this.renderChat();
  }

  private renderHeader(subtitle: string): void {
    const header = this.rootEl.createDiv({ cls: "pca-header" });
    const mark = header.createDiv({ cls: "pca-orbit-mark" });
    mark.createDiv({ cls: "pca-orbit-core" });

    const titleWrap = header.createDiv({ cls: "pca-title-wrap" });
    titleWrap.createEl("h2", { text: "Personal Codex Assistant" });
    titleWrap.createEl("p", { text: subtitle });
  }

  private renderSignedOut(output: string, available: boolean): void {
    this.renderHeader("ChatGPT 계정으로 Codex를 연결하세요.");

    const messages = this.rootEl.createDiv({ cls: "pca-messages pca-auth-panel" });
    messages.createEl("strong", { cls: "pca-role", text: "로그인 필요" });
    messages.createEl("div", {
      text: available
        ? "브라우저에서 ChatGPT 로그인을 완료하면 이후에는 로컬 Codex 세션을 재사용합니다."
        : "Codex CLI를 찾을 수 없습니다. Codex CLI 설치 또는 PATH 설정이 필요합니다.",
    });

    if (output) {
      messages.createEl("pre", { text: output });
    }

    const toolbar = this.rootEl.createDiv({ cls: "pca-toolbar" });
    const loginButton = toolbar.createEl("button", { text: "ChatGPT로 로그인" });
    loginButton.disabled = !available;
    loginButton.onclick = () => this.startLogin(loginButton);

    const refreshButton = toolbar.createEl("button", { text: "상태 다시 확인" });
    refreshButton.onclick = () => this.render();

    this.statusEl = this.rootEl.createEl("div", {
      cls: "pca-status",
      text: available ? "로그인 대기 중" : "Codex CLI 없음",
    });
  }

  private renderChat(): void {
    this.renderHeader("노트와 목표를 읽고 다음 행동을 정리합니다.");

    const toolbar = this.rootEl.createDiv({ cls: "pca-toolbar" });
    this.createToolbarButton(toolbar, "로그인 상태", async () => {
      const status = await this.auth.checkStatus();
      this.addMessage("시스템", status.signedIn ? "Codex 로그인 상태입니다." : "Codex 로그인이 필요합니다.");
    });
    this.createToolbarButton(toolbar, "다시 로그인", () => {
      this.relogin();
    });
    this.createToolbarButton(toolbar, "현재 노트 요약", () => {
      this.sendWithContext("현재 노트를 간결하게 요약해줘.", false, false);
    });
    this.createToolbarButton(toolbar, "오늘 정리", () => {
      this.sendWithContext("오늘 기록을 바탕으로 해야 할 일, 일정, 우선순위를 정리해줘.", false, true);
    });
    this.createToolbarButton(toolbar, "선택 영역 다듬기", () => {
      this.sendWithContext("선택 영역을 더 자연스럽고 명확한 문장으로 고쳐줘. 원문을 직접 수정하지 말고 제안문만 보여줘.", true, false);
    });
    this.createToolbarButton(toolbar, "답변 저장", () => {
      this.saveDailyReview();
    });

    const contextRow = this.rootEl.createDiv({ cls: "pca-context-row" });
    contextRow.createEl("span", {
      cls: "pca-status",
      text: this.approvals.explainReadOnlyMode(),
    });

    this.messagesEl = this.rootEl.createDiv({ cls: "pca-messages" });
    this.addMessage("시스템", "Codex 연결 전입니다. 질문을 보내면 app-server 실행을 시도합니다.");

    const compose = this.rootEl.createDiv({ cls: "pca-compose" });
    this.inputEl = compose.createEl("textarea", {
      placeholder: "Codex에게 요청하세요. 현재 노트를 함께 보냅니다.",
    });

    const sendButton = compose.createEl("button", { text: "전송" });
    sendButton.onclick = () => this.sendWithContext(this.inputEl.value, false, false);

    this.statusEl = this.rootEl.createEl("div", {
      cls: "pca-status",
      text: "대기 중",
    });
  }

  private createToolbarButton(parent: HTMLElement, text: string, onClick: () => void): void {
    const button = parent.createEl("button", { text });
    button.onclick = onClick;
  }

  private async startLogin(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    this.statusEl.setText("브라우저 로그인 시작 중...");

    const code = await this.auth.login((message) => {
      if (message) {
        this.statusEl.setText(message);
      }
    });

    if (code === 0) {
      this.statusEl.setText("로그인 완료. 화면을 전환합니다.");
      await this.render();
      return;
    }

    button.disabled = false;
    this.statusEl.setText("로그인이 완료되지 않았습니다. 브라우저 창이 열렸는지 확인한 뒤 상태를 다시 확인하세요.");
  }

  private async relogin(): Promise<void> {
    this.codex.stop();
    this.addMessage("시스템", "저장된 Codex 로그인 정보를 지우고 다시 로그인합니다.");
    this.statusEl.setText("Codex 로그아웃 중...");

    await this.auth.logout((message) => {
      if (message) {
        this.statusEl.setText(message);
      }
    });

    this.rootEl.empty();
    this.renderSignedOut("기존 로그인 정보를 지웠습니다. ChatGPT로 다시 로그인하세요.", true);
  }

  private async sendWithContext(userInput: string, selectionOnly: boolean, dailyReview: boolean): Promise<void> {
    const trimmed = userInput.trim();
    if (!trimmed) {
      return;
    }

    this.inputEl.value = "";
    this.addMessage("나", trimmed);
    this.statusEl.setText("문맥 수집 중...");

    const prompt = await this.vaultContext.buildContextualPrompt(trimmed, selectionOnly, dailyReview);
    if (!prompt) {
      this.statusEl.setText("열려 있는 노트 없음");
      return;
    }

    try {
      this.statusEl.setText("Codex에 전송 중...");
      this.codex.sendPrompt(prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addMessage("시스템", message);
      this.statusEl.setText("전송 실패");
    }
  }

  private handleCodexEvent(event: CodexEvent): void {
    if (event.type === "message") {
      if (!this.shouldShowProtocolMessage(event.payload)) {
        return;
      }

      const text = this.extractText(event.payload);
      if (this.isUnauthorizedPayload(event.payload)) {
        this.addMessage("시스템", text);
        this.statusEl.setText("다시 로그인이 필요합니다.");
        this.codex.stop();
        return;
      }

      this.lastAssistantText = text;
      this.addMessage("Codex", text);
      this.statusEl.setText("응답 수신");
      return;
    }

    if (event.type === "stderr") {
      const text = String(event.payload);
      if (/access token could not be refreshed|unauthorized|token_expired|authentication token is expired/i.test(text)) {
        this.addMessage("시스템", "Codex 로그인 토큰을 갱신하지 못했습니다. 상단의 '다시 로그인'을 눌러 다시 로그인하세요.");
        this.statusEl.setText("다시 로그인이 필요합니다.");
        this.codex.stop();
        return;
      }

      this.addMessage("시스템", text);
      this.statusEl.setText("Codex 로그 수신");
      return;
    }

    if (event.type === "error") {
      const error = event.payload instanceof Error ? event.payload.message : String(event.payload);
      this.addMessage("시스템", `Codex 실행 오류: ${error}`);
      this.statusEl.setText("Codex 실행 실패");
      return;
    }

    if (event.type === "exit") {
      this.addMessage("시스템", `Codex app-server 종료: ${event.payload ?? "unknown"}`);
      this.statusEl.setText("Codex 종료");
    }
  }

  private extractText(payload: unknown): string {
    if (this.isUnauthorizedPayload(payload)) {
      return "Codex 로그인 토큰을 갱신하지 못했습니다. 상단의 '다시 로그인'을 눌러 다시 로그인하세요.";
    }

    if (typeof payload === "string") {
      return payload;
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const notificationText = this.extractNotificationText(record);
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

    const record = payload as Record<string, unknown>;
    const method = record.method;
    if (typeof method !== "string") {
      return false;
    }

    if (method === "error" || method === "warning" || method === "guardianWarning") {
      return true;
    }

    if (method === "item/completed" || method === "rawResponseItem/completed") {
      return this.extractNotificationText(record) !== null;
    }

    if (method === "turn/completed") {
      return this.extractNotificationText(record) !== null;
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

      return null;
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

    const itemRecord = item as Record<string, unknown>;
    const content = itemRecord.content;
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
    if (!payload || typeof payload !== "object") {
      return false;
    }

    return /access token could not be refreshed|unauthorized|token_expired|authentication token is expired/i.test(JSON.stringify(payload));
  }

  private addMessage(role: MessageRole, text: string): void {
    const message = this.messagesEl.createDiv({ cls: `pca-message pca-message-${this.roleClass(role)}` });
    message.createEl("strong", { cls: "pca-role", text: role });
    message.createEl("div", { cls: "pca-message-body", text });
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight });
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
}
