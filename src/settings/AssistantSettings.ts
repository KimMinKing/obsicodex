export interface AssistantSettings {
  codexCommand: string;
  codexArgs: string[];
  assistantFolder: string;
  dailyFolder: string;
  dailyReviewFolder: string;
  chatHistoryFolder: string;
  maxChatMessages: number;
}

export const DEFAULT_SETTINGS: AssistantSettings = {
  codexCommand: "codex",
  codexArgs: ["app-server", "--stdio"],
  assistantFolder: "Assistant",
  dailyFolder: "Daily",
  dailyReviewFolder: "Assistant/Daily Review",
  chatHistoryFolder: "Assistant/Chats",
  maxChatMessages: 30,
};
