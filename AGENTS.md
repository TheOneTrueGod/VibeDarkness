# AGENTS.md - Multiplayer Game Lobby

This document describes the codebase for AI agents working on this project.

## Project Overview

A real-time multiplayer game lobby system with:
- PHP backend using Ratchet for WebSocket communication
- Vanilla JavaScript frontend (no frameworks)
- HTTP API for lobby management, WebSocket for real-time game communication
- Strongly typed message system mirrored between client and server

## Architecture

```
Backend (PHP 8.1+)          Frontend (Vanilla JS)
─────────────────           ─────────────────────
index.php (HTTP API)        app/js/main.js (entry point)
backend/server.php (WS)     app/js/WebSocketClient.js
backend/WebSocketHandler    app/js/LobbyClient.js (HTTP)
backend/LobbyManager        app/js/ChatManager.js
backend/Lobby               app/js/GameCanvas.js
backend/Player              app/js/MessageTypes.js
backend/Message             app/js/EventEmitter.js
backend/MessageTypes        app/js/UI.js
```

## Key Patterns

### Message System
Messages are strongly typed on both ends. When adding a new message type:

1. Add to `backend/MessageTypes.php` enum with required fields
2. Mirror in `app/js/MessageTypes.js` with matching schema
3. Handle in `backend/WebSocketHandler.php` `processMessage()` method
4. Listen in `app/js/main.js` via `wsClient.on('message:TYPE', ...)`

### State Management
- `LobbyManager` is a singleton managing all active lobbies
- `Lobby` stores players, chat history, and click positions
- `Player` tracks connection, reconnect token, and last click
- Frontend state lives in `GameApp` class in `main.js`

### Reconnection Flow
1. Player receives `reconnectToken` on join
2. Token stored in `sessionStorage`
3. On disconnect, `WebSocketClient` attempts reconnect with token
4. Server validates token and restores player connection

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
| `backend/server.php` | Starts Ratchet WebSocket server |
| `backend/WebSocketHandler.php` | Routes WS messages, manages connections |
| `backend/LobbyManager.php` | CRUD operations for lobbies |
| `backend/Lobby.php` | Single lobby state (players, chat, clicks) |
| `backend/Player.php` | Player state and WS connection |
| `backend/Message.php` | Message validation and construction |
| `backend/MessageTypes.php` | Enum of all message types |
| `app/js/main.js` | Application orchestration |
| `app/js/WebSocketClient.js` | WS connection with auto-reconnect |
| `app/js/LobbyClient.js` | HTTP API client |
| `app/js/ChatManager.js` | Chat UI and message rendering |
| `app/js/GameCanvas.js` | Click tracking and marker display |
| `app/js/MessageTypes.js` | Client-side message type definitions |

## Common Tasks

### Adding a new message type
See "Message System" above. Ensure both PHP enum and JS schema match exactly.

### Adding game state
1. Add property to `Lobby.php`
2. Include in `getGameState()` method
3. Handle sync in `STATE_RESPONSE` message
4. Update frontend state in `loadGameState()`

### Adding UI components
1. Add HTML to `app/index.html`
2. Style in `app/css/style.css`
3. Create manager class extending `EventEmitter`
4. Initialize in `GameApp.setupUIComponents()`

## Testing Locally

```bash
composer install
php backend/server.php          # Terminal 1 - WebSocket on :8080
php -S localhost:8000 index.php # Terminal 2 - HTTP on :8000
```

Open multiple browser tabs to test multiplayer functionality.
