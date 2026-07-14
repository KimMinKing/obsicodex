# Obsidian Codex Assistant

Obsidian Codex Assistant is an Obsidian desktop plugin that connects to the local Codex CLI app server and helps you review notes, daily logs, todos, and study records inside Obsidian.

## Features

- Sidebar chat interface
- ChatGPT login flow through the local Codex CLI
- Current note context attachment
- Selection rewrite suggestions
- Daily review prompts for journals and todos
- Multi-note summary picker
- Chat history saved under `Assistant/Chats/`
- Saved chat reload and continue
- Assistant memory files under `Assistant/`
- Daily review saving to `Assistant/Daily Review/YYYY-MM-DD.md`

## Requirements

- Obsidian desktop
- Codex CLI installed locally
- Codex CLI logged in with ChatGPT

## User Setup

Install Codex CLI first, then sign in.

Windows:

```powershell
npm install -g @openai/codex
codex login
```

macOS / Linux:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex login
```

Check your installation:

```powershell
codex --version
codex login status
```

If Obsidian cannot find `codex`, restart Obsidian after installing the CLI. On Windows, the plugin also checks the default npm global path under `%APPDATA%\npm`.

## Development

```powershell
npm install
npm run build
```

For watch mode:

```powershell
npm run dev
```

## Manual Installation

Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/obsidian-codex-assistant/
```

Then enable the plugin from Obsidian's community plugin settings.

## Privacy and Security

This plugin runs only on Obsidian desktop because it launches the local Codex CLI. It sends the active note or selected text to Codex only when you press a command or send a message.
