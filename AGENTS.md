# AGENTS.md - Multiplayer Game Lobby

This document describes the codebase for AI agents working on this project.

## Project Overview

A real-time multiplayer game lobby system with:
- PHP backend (HTTP only; no WebSockets)
- React + Tailwind CSS frontend (TypeScript)
- Vite build toolchain
- HTTP API for lobby management and message polling
- Clients poll `getMessages` every second; chat and clicks are sent via HTTP POST

## Architecture

```
Backend (PHP 8.1+)            Frontend (React + Tailwind)
─────────────────              ─────────────────────────
index.php (HTTP API)           app/js/main.tsx (React entry point)
backend/LobbyManager           app/js/App.tsx (root component, state management)
backend/Lobby                  app/js/components/ (React UI components)
backend/Player                 app/js/contexts/ToastContext.tsx (toast notifications)
backend/Message                app/js/LobbyClient.ts (HTTP API client)
backend/MessageTypes           app/js/MessageTypes.ts (message constants)
                               app/js/types.ts (shared interfaces)
                               app/js/games/ (game modules as React components)
```

## Key Patterns

### Message System (HTTP polling)
- Messages are stored on the server in each lobby's message log (with `messageId`).
- Clients call `GET /api/lobbies/{id}/messages?playerId=...&after=...` every second.
- If no `after`, returns last 10 messages; otherwise up to 10 messages after that id.
- To send: `POST /api/lobbies/{id}/messages` with `{ playerId, type, data }` (type: `chat` or `click`).

### State Management
- `LobbyManager` is a singleton managing all active lobbies (backend)
- `Lobby` stores players, chat history, clicks, and a message log (backend)
- `Player` tracks name, color, host status, last click (no connection object)
- Frontend state lives in `App.tsx` using React `useState` hooks
- Polling is managed via `useEffect` with `setInterval`

### React Component Architecture
- `App.tsx` is the root component holding all lobby/game state
- `ToastProvider` wraps the app for toast notifications (via `useToast` hook)
- `LobbyScreen` handles lobby creation/joining
- `GameScreen` renders the game layout with header, central area, player list, chat
- Game modules (e.g. minion_battles) are loaded dynamically via `import()`
- Each game module exports a default React component receiving `GameComponentProps`

### Adding a new message type (for polling)
1. Add the type to `app/js/MessageTypes.ts` (MessageType, MessageSchema) and to `backend/MessageTypes.php`
2. Add type to backend message log in the appropriate handler
3. Handle the type in `App.tsx`'s `handlePollMessage` callback

## Coding Conventions

### PHP
- PSR-4 autoloading via Composer (`App\` namespace maps to `backend/`)
- PHP 8.1+ features: enums, match expressions, constructor promotion
- Type hints on all methods

### TypeScript / React
- Vite + React + Tailwind CSS
- Functional components with hooks (no class components)
- `PascalCase` for components, `camelCase` for functions/variables
- Tailwind utility classes for styling (no separate CSS except minimal custom styles in `app.css`)
- Game components receive lobby state as props (no `window.app` globals)
- Toast notifications via `useToast()` context hook

## File Purposes

| File | Purpose |
|------|---------|
| `index.php` | HTTP API routes + static file serving (dist/ for prod) |
| `index.html` | Vite entry HTML (root level) |
| `vite.config.ts` | Vite configuration with React plugin and API proxy |
| `tailwind.config.js` | Tailwind theme with custom dark colors |
| `backend/LobbyManager.php` | CRUD for lobbies; getMessages, addChatMessage, recordClick |
| `backend/Lobby.php` | Single lobby state (players, chat, messages) |
| `backend/Player.php` | Player state (no connection) |
| `backend/Message.php` | Message validation and construction |
| `backend/MessageTypes.php` | Enum of message types |
| `app/js/main.tsx` | React entry point: renders `<App />` into #root |
| `app/js/App.tsx` | Root component: all state, polling, lobby operations |
| `app/js/app.css` | Tailwind imports + minimal custom CSS |
| `app/js/contexts/ToastContext.tsx` | Toast notification provider and hook |
| `app/js/components/LobbyScreen.tsx` | Create/join lobby UI |
| `app/js/components/GameScreen.tsx` | In-lobby game layout, dynamic game loading |
| `app/js/components/Chat.tsx` | Chat sidebar with messages and input |
| `app/js/components/PlayerList.tsx` | Player list with colors and host badges |
| `app/js/components/GameCanvas.tsx` | Click canvas with markers |
| `app/js/components/GameList.tsx` | Game selection grid |
| `app/js/components/LobbyList.tsx` | Public lobby list |
| `app/js/components/ResourceDisplay.tsx` | Resource pills (fire/water/earth/air) |
| `app/js/components/DebugConsole.tsx` | Debug panel (tilde x3) |
| `app/js/LobbyClient.ts` | HTTP API client class |
| `app/js/MessageTypes.ts` | MessageType constants, Message class, Messages factory |
| `app/js/types.ts` | Shared interfaces: LobbyState, PlayerState, etc. |
| `app/js/games/list.ts` | Game registry (id, title, enabled) |
| `app/js/games/base.ts` | Base game class |
| `app/js/games/minion_battles/Game.tsx` | Minion Battles React component |
| `app/js/games/minion_battles/state.ts` | Minion Battles state types |
| `app/js/games/minion_battles/phases/MissionSelectPhase.tsx` | Mission voting phase |
| `app/js/games/minion_battles/phases/CharacterSelectPhase.tsx` | Character selection phase |

## Common Tasks

### Adding game state
1. Add property to `Lobby.php`
2. Include in `getGameState()` method
3. Update frontend state in `App.tsx` (in `loadGameState` or polling)
4. If it should sync via messages, add a message type and handle in `handlePollMessage`

### Adding UI components
1. Create React component in `app/js/components/`
2. Style with Tailwind utility classes
3. Import and use in parent component (`GameScreen.tsx`, `LobbyScreen.tsx`, etc.)

### Adding a new game
1. Create `app/js/games/<game_id>/Game.tsx` exporting a default React component
2. Component receives `GameComponentProps` (lobbyClient, lobbyId, gameId, playerId, isHost, players, gameData)
3. Register in `app/js/games/list.ts`

## Project Skills

| Skill | When to use |
|-------|-------------|
| **working-on-minion-battles** | When working on anything called minion battles; work primarily in `app/js/games/minion_battles/`. See `.cursor/skills/working-on-minion-battles/SKILL.md`. |

## Testing Locally

```bash
composer install
npm install
npm run dev          # Vite dev server (proxies /api to PHP)
php -S localhost:8000 index.php  # PHP API server (run in another terminal)
```

Open multiple browser tabs to test multiplayer. For production build:

```bash
npm run build        # Builds to dist/
php -S localhost:8000 index.php  # Serves both API and built frontend
```

Frontend source is TypeScript/TSX in `app/js/`; Vite bundles output to `dist/`.
