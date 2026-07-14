import { App, MarkdownView, Notice, TFile } from "obsidian";
import { AssistantSettings } from "../settings/AssistantSettings";

export interface ActiveNoteContext {
  file: TFile;
  content: string;
  selection: string;
}

interface AssistantMemory {
  profile: string;
  preferences: string;
  goals: string;
  projects: string;
  routines: string;
}

export class VaultContext {
  constructor(
    private readonly app: App,
    private readonly settings: AssistantSettings,
  ) {}

  async getActiveNote(): Promise<ActiveNoteContext | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("열려 있는 노트가 없습니다.");
      return null;
    }

    const content = await this.app.vault.read(file);
    const selection = this.getSelection();

    return { file, content, selection };
  }

  getSelection(): string {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.editor.getSelection() ?? "";
  }

  async ensureAssistantFiles(): Promise<void> {
    await this.ensureFolder(this.settings.assistantFolder);
    await this.ensureFolder(this.settings.dailyReviewFolder);

    const files = [
      [
        "Profile.md",
        [
          "# Profile",
          "",
          "- 이름:",
          "- 현재 집중하는 일:",
          "- 중요하게 여기는 것:",
          "",
        ].join("\n"),
      ],
      [
        "Preferences.md",
        [
          "# Preferences",
          "",
          "## Assistant Tone",
          "- 한국어로 말한다.",
          "- 너무 딱딱한 보고서 말투보다, 내 상황을 이해한 개인 비서처럼 말한다.",
          "- 무조건 위로하지 말고, 해야 할 일을 현실적으로 정리한다.",
          "- 장황한 설명보다 바로 실행 가능한 다음 행동을 우선한다.",
          "- 내가 쓴 표현과 관심사를 최대한 반영한다.",
          "",
          "## Feedback Style",
          "- 우선순위가 흐려지면 명확하게 짚어준다.",
          "- 공부, 개발, 일정, 미룬 일을 구분해서 정리한다.",
          "- 할 일을 너무 많이 만들지 말고 오늘 실제로 할 수 있는 양으로 줄인다.",
          "",
        ].join("\n"),
      ],
      ["Goals.md", "# Goals\n\n"],
      ["Projects.md", "# Projects\n\n"],
      ["Routines.md", "# Routines\n\n"],
    ];

    for (const [name, content] of files) {
      const path = `${this.settings.assistantFolder}/${name}`;
      if (!this.app.vault.getAbstractFileByPath(path)) {
        await this.app.vault.create(path, content);
      }
    }
  }

  async saveDailyReview(markdown: string): Promise<string> {
    await this.ensureFolder(this.settings.dailyReviewFolder);

    const date = window.moment().format("YYYY-MM-DD");
    const path = `${this.settings.dailyReviewFolder}/${date}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, markdown);
    } else {
      await this.app.vault.create(path, markdown);
    }

    return path;
  }

  buildPrompt(userInput: string, mode: "active" | "selection" | "daily-review"): string {
    const base = [
      "너는 Obsidian 안에서 동작하는 개인 비서다.",
      "사용자의 노트, 목표, 선호를 바탕으로 답한다.",
      "말투는 인간적인 개인 비서에 가깝게 하되, 과장된 감정 표현이나 의미 없는 칭찬은 피한다.",
      "사용자가 쓴 표현, 반복되는 관심사, 미뤄진 일, 현재 에너지를 추론해서 반영한다.",
      "답변은 구체적이고 바로 실행 가능해야 한다.",
      "파일을 직접 수정하지 말고 제안만 한다.",
    ];

    if (mode === "daily-review") {
      return [
        ...base,
        "",
        "현재 노트에 적힌 일기, TODO, 공부 기록을 읽고 다음 형식으로 정리해라.",
        "단순 요약보다 사용자가 실제로 오늘 무엇을 하면 좋을지 판단해라.",
        "",
        "## 오늘 요약",
        "## 지금 신경 써야 할 것",
        "## 해야 할 일",
        "## 일정",
        "## 우선순위",
        "## 내일로 넘길 일",
        "",
        "사용자 요청:",
        userInput,
      ].join("\n");
    }

    if (mode === "selection") {
      return [
        ...base,
        "",
        "선택 영역을 사용자의 기존 문체와 의도를 살려 다듬어라.",
        "원문을 대신 써주기 전에, 어떤 방향으로 고쳤는지 짧게 말해라.",
        "",
        "사용자 요청:",
        userInput,
      ].join("\n");
    }

    return [
      ...base,
      "",
      "사용자 요청:",
      userInput,
    ].join("\n");
  }

  async buildContextualPrompt(userInput: string, includeSelectionOnly: boolean, dailyReview: boolean): Promise<string | null> {
    const active = await this.getActiveNote();
    if (!active) {
      return null;
    }

    const memory = await this.readAssistantMemory();
    const useSelection = includeSelectionOnly && active.selection.trim().length > 0;
    const source = useSelection ? active.selection : active.content;
    const label = useSelection ? "선택 영역" : "현재 노트";
    const instruction = this.buildPrompt(userInput, dailyReview ? "daily-review" : useSelection ? "selection" : "active");

    return [
      instruction,
      "",
      "개인 문맥:",
      this.formatMemory(memory),
      "",
      `첨부 문맥: ${label}`,
      `파일명: ${active.file.path}`,
      "",
      "이 노트의 문장과 단어 선택을 사용자의 현재 말투 샘플로 참고해라.",
      "",
      "```markdown",
      source,
      "```",
    ].join("\n");
  }

  private async readAssistantMemory(): Promise<AssistantMemory> {
    return {
      profile: await this.readOptionalFile(`${this.settings.assistantFolder}/Profile.md`),
      preferences: await this.readOptionalFile(`${this.settings.assistantFolder}/Preferences.md`),
      goals: await this.readOptionalFile(`${this.settings.assistantFolder}/Goals.md`),
      projects: await this.readOptionalFile(`${this.settings.assistantFolder}/Projects.md`),
      routines: await this.readOptionalFile(`${this.settings.assistantFolder}/Routines.md`),
    };
  }

  private async readOptionalFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return "";
    }

    return this.truncate(await this.app.vault.read(file), 3000);
  }

  private formatMemory(memory: AssistantMemory): string {
    return [
      "## Profile",
      memory.profile || "(비어 있음)",
      "",
      "## Preferences",
      memory.preferences || "(비어 있음)",
      "",
      "## Goals",
      memory.goals || "(비어 있음)",
      "",
      "## Projects",
      memory.projects || "(비어 있음)",
      "",
      "## Routines",
      memory.routines || "(비어 있음)",
    ].join("\n");
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}\n\n...(일부 생략됨)`;
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
