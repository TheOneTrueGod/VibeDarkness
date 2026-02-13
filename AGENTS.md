# AGENTS.md - Multiplayer Game Lobby

This document describes the codebase for AI agents working on this project.

## Project Overview

A real-time multiplayer game lobby system with:
- PHP backend (HTTP only; no WebSockets)
- Vanilla JavaScript frontend (no frameworks)
- HTTP API for lobby management and message polling
- Clients poll `getMessages` every second; chat and clicks are sent via HTTP POST

## Architecture

```
Backend (PHP 8.1+)          Frontend (Vanilla JS)
─────────────────           ─────────────────────
index.php (HTTP API)        app/js/main.ts (bootstrap → app/js-out/main.js)
backend/LobbyManager        app/js/GameApp.ts (orchestration)
backend/Lobby               app/js/MessageHandler.ts (poll message handling)
backend/Player              app/js/LobbyClient.ts (HTTP)
backend/Message             app/js/ChatManager.ts, GameCanvas.ts, UI.ts
backend/MessageTypes        app/js/MessageTypes.ts (MessageType constants, MessageSchema, Message, Messages)
                           app/js/types.ts (shared interfaces)
```

## Key Patterns

### Message System (HTTP polling)
- Messages are stored on the server in each lobby's message log (with `messageId`).
- Clients call `GET /api/lobbies/{id}/messages?playerId=...&after=...` every second.
- If no `after`, returns last 10 messages; otherwise up to 10 messages after that id.
- To send: `POST /api/lobbies/{id}/messages` with `{ playerId, type, data }` (type: `chat` or `click`).

### State Management
- `LobbyManager` is a singleton managing all active lobbies
- `Lobby` stores players, chat history, clicks, and a message log
- `Player` tracks name, color, host status, last click (no connection object)
- Frontend state lives in `GameApp` class in `app/js/GameApp.ts`

### Adding a new message type (for polling)
1. Add the type to `app/js/MessageTypes.ts` (MessageType, MessageSchema) and to `backend/MessageTypes.php`
2. Add type to backend message log in the appropriate handler (e.g. `Lobby::addMessage`, or in `index.php` for new POST types)
3. Handle the type in `app/js/MessageHandler.ts` in `handlePollMessage()` using `MessageType.*` constants

## Coding Conventions

### PHP
- PSR-4 autoloading via Composer (`App\` namespace maps to `backend/`)
- PHP 8.1+ features: enums, match expressions, constructor promotion
- Type hints on all methods

### JavaScript
- No build step - plain ES6+ classes
- `EventEmitter` pattern for component communication
- Classes: `PascalCase`, methods/variables: `camelCase`
- All components extend `EventEmitter` for decoupling

## File Purposes

| File | Purpose |
|------|---------|
| `index.php` | HTTP API routes + static file serving |
| `backend/LobbyManager.php` | CRUD for lobbies; getMessages, addChatMessage, recordClick |
| `backend/Lobby.php` | Single lobby state (players, chat, messages) |
| `backend/Player.php` | Player state (no connection) |
| `backend/Message.php` | Message validation and construction |
| `backend/MessageTypes.php` | Enum of message types |
| `app/js/main.ts` | Bootstrap only: DOMContentLoaded, instantiate GameApp, assign to window.app |
| `app/js/GameApp.ts` | Application orchestration, polling, UI wiring, loadGameState |
| `app/js/MessageHandler.ts` | handlePollMessage(msg, context): chat, click, player_join, player_leave, host_changed (uses MessageType) |
| `app/js/MessageTypes.ts` | MessageType constants, MessageSchema, Message class, Messages factory; single source of truth for message types |
| `app/js/types.ts` | Shared interfaces: LobbyState, PlayerState, AccountState, GameStatePayload, PollMessagePayload |
| `app/js/LobbyClient.ts` | HTTP API client (getMessages, sendMessage, getLobbyState) |
| `app/js/ChatManager.ts` | Chat UI and message rendering |
| `app/js/GameCanvas.ts` | Click tracking and marker display |
| `app/js/UI.ts` | Screen transitions, player list, toasts |

## Common Tasks

### Adding game state
1. Add property to `Lobby.php`
2. Include in `getGameState()` method
3. Update frontend in `loadGameState()` in `GameApp.ts`
4. If it should sync via messages, add a message type and handle in `handlePollMessage()` in `MessageHandler.ts`

### Adding UI components
1. Add HTML to `app/index.html`
2. Style in `app/css/style.css`
3. Create manager class extending `EventEmitter`
4. Initialize in `GameApp.setupUIComponents()`

## Project Skills

| Skill | When to use |
|-------|-------------|
| **working-on-minion-battles** | When working on anything called minion battles; work primarily in `app/js/games/minion_battles/`. See `.cursor/skills/working-on-minion-battles/SKILL.md`. |

## Testing Locally

```bash
composer install
npm install
npm run build    # or npm run watch for auto-recompile on change
php -S localhost:8000 index.php
```

Open multiple browser tabs to test multiplayer. No WebSocket server is required. Frontend source is TypeScript in `app/js/*.ts`; compiled output goes to `app/js-out/`.
