import { AssistantSettings } from "../settings/AssistantSettings";
import { CodexEvent, CodexEventHandler, RpcMessage, RpcNotification, RpcRequest } from "./CodexTypes";
import { CodexProcess } from "./CodexProcess";

export class CodexClient {
  private process: CodexProcess;
  private nextId = 1;
  private handlers = new Set<CodexEventHandler>();
  private initialized = false;
  private threadId: string | null = null;
  private pendingPrompt: string | null = null;
  private pendingThreadStartId: number | null = null;

  constructor(settings: AssistantSettings) {
    this.process = new CodexProcess(
      settings.codexCommand,
      settings.codexArgs,
      (event) => this.emit(event),
    );
  }

  get isRunning(): boolean {
    return this.process.isRunning;
  }

  onEvent(handler: CodexEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    this.process.start();
    this.initialize();
  }

  stop(): void {
    this.process.stop();
    this.initialized = false;
    this.threadId = null;
    this.pendingPrompt = null;
    this.pendingThreadStartId = null;
  }

  send(method: string, params?: unknown): number {
    const request: RpcRequest = {
      id: this.nextId++,
      method,
      params,
    };

    this.process.send(request);
    return request.id;
  }

  notify(method: string, params?: unknown): void {
    const notification: RpcNotification = { method, params };
    this.process.send(notification);
  }

  sendPrompt(prompt: string): void {
    if (!this.isRunning) {
      this.start();
    }

    if (this.threadId) {
      this.startTurn(prompt);
      return;
    }

    this.pendingPrompt = prompt;
    this.pendingThreadStartId = this.send("thread/start", {});
  }

  private emit(event: CodexEvent): void {
    if (event.type === "message") {
      this.handleProtocolMessage(event.payload);
    }

    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private initialize(): void {
    if (this.initialized) {
      return;
    }

    this.send("initialize", {
      clientInfo: {
        name: "obsidian_codex_assistant",
        title: "Obsidian Codex Assistant",
        version: "0.1.0",
      },
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

  private handleProtocolMessage(payload: string | RpcMessage | Error | number | null): void {
    if (!payload || typeof payload !== "object" || payload instanceof Error) {
      return;
    }

    const message = payload as Record<string, unknown>;
    if (message.id !== this.pendingThreadStartId || !message.result || typeof message.result !== "object") {
      return;
    }

    const result = message.result as Record<string, unknown>;
    const thread = result.thread;
    if (!thread || typeof thread !== "object") {
      return;
    }

    const id = (thread as Record<string, unknown>).id;
    if (typeof id !== "string") {
      return;
    }

    this.threadId = id;
    this.pendingThreadStartId = null;

    const prompt = this.pendingPrompt;
    this.pendingPrompt = null;
    if (prompt) {
      this.startTurn(prompt);
    }
  }

  private startTurn(prompt: string): void {
    if (!this.threadId) {
      throw new Error("Codex thread가 아직 준비되지 않았습니다.");
    }

    this.send("turn/start", {
      threadId: this.threadId,
      input: [
        {
          type: "text",
          text: prompt,
        },
      ],
    });
  }
}
