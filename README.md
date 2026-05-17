# VibeDarkness

A multiplayer game lobby platform built around **Minion Battles**, a turn-based campaign combat game.

## Stack

- **Frontend:** TypeScript, React, Pixi.js, Tailwind CSS, Vite
- **Backend:** PHP (Symfony routing), file-based persistence
- **Tests:** Vitest

## Architecture

```
app/js/
├── App.tsx / main.tsx          # React entry point
├── LobbyClient.ts              # HTTP polling client
├── components/                 # Lobby list, login, debug console, etc.
└── games/minion_battles/
    ├── game/                   # GameEngine, units, abilities, terrain, pathfinding
    │   └── battlenet/          # Multiplayer sync (polling, snapshots, desync recovery)
    ├── abilities/              # Ability logic and targeting
    ├── card_defs/              # Card definitions and decks
    ├── character_defs/         # Playable characters and items
    ├── hitboxes/               # Collision detection
    ├── buffs/                  # Status effects
    ├── storylines/             # Campaign missions and terrain segments
    └── ui/                     # Battle UI and character editor

backend/
├── Http/Handlers/              # REST endpoints (lobbies, battles, campaigns, accounts, sync)
├── Game/                       # Game state adapters
├── BattleStorage/              # Battle checkpoint persistence
├── LobbyManager / CampaignManager
└── Character / PlayerAccount / Lobby
```

## Multiplayer

Uses HTTP polling — no WebSockets required. `BattleNet` handles order submission, heartbeats, and snapshot-based desync recovery across clients.

## Setup

```bash
npm install
composer install
```

Run both servers in parallel:

```bash
npm run php    # PHP API on localhost:8000
npm run dev    # Vite dev server on localhost:5173 (proxies API calls)
```

## Testing

```bash
npm test
```

## Production Build

```bash
npm run build
php -S localhost:8000 index.php
```

After deploying the battle storage refactor, run this one-time migration:

```bash
php backend/scripts/migrate_battle_storage.php
```
