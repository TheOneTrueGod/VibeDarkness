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
index.php (HTTP API)        app/js/main.js (entry point)
backend/LobbyManager        app/js/LobbyClient.js (HTTP)
backend/Lobby               app/js/ChatManager.js
backend/Player              app/js/GameCanvas.js
backend/Message             app/js/EventEmitter.js
backend/MessageTypes        app/js/UI.js
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
- Frontend state lives in `GameApp` class in `main.js`

### Adding a new message type (for polling)
1. Add type to backend message log in the appropriate handler (e.g. `Lobby::addMessage`, or in `index.php` for new POST types)
2. Handle the type in `main.js` in `applyMessage()`

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
| `app/js/main.js` | Application orchestration, polling, applyMessage |
| `app/js/LobbyClient.js` | HTTP API client (getMessages, sendMessage, getLobbyState) |
| `app/js/ChatManager.js` | Chat UI and message rendering |
| `app/js/GameCanvas.js` | Click tracking and marker display |
| `app/js/UI.js` | Screen transitions, player list, toasts |

## Common Tasks

### Adding game state
1. Add property to `Lobby.php`
2. Include in `getGameState()` method
3. Update frontend in `loadGameState()` in `main.js`
4. If it should sync via messages, add a message type and handle in `applyMessage()`

### Adding UI components
1. Add HTML to `app/index.html`
2. Style in `app/css/style.css`
3. Create manager class extending `EventEmitter`
4. Initialize in `GameApp.setupUIComponents()`

## Testing Locally

```bash
composer install
php -S localhost:8000 index.php
```

Open multiple browser tabs to test multiplayer. No WebSocket server is required.
