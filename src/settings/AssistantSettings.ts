export interface AssistantSettings {
  codexCommand: string;
  codexArgs: string[];
  assistantFolder: string;
  dailyFolder: string;
  dailyReviewFolder: string;
  chatHistoryFolder: string;
  maxChatMessages: number;
  themePreset: "jupiter" | "nebula" | "midnight";
  accentColor: string;
}

export const DEFAULT_SETTINGS: AssistantSettings = {
  codexCommand: "codex",
  codexArgs: ["app-server", "--stdio"],
  assistantFolder: "Assistant",
  dailyFolder: "Daily",
  dailyReviewFolder: "Assistant/Daily Review",
  chatHistoryFolder: "Assistant/Chats",
  maxChatMessages: 30,
  themePreset: "jupiter",
  accentColor: "#f7c56b",
};
