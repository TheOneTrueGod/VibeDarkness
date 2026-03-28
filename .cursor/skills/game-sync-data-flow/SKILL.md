---
name: game-sync-data-flow
description: Describes the multiplayer game state synchronization system for Minion Battles. Covers how checkpoints, orders, and polling flow between host and non-host clients via GameSyncContext. Use when working on battle sync, order submission, checkpoint saves, polling, desync recovery, or the GameSyncContext.
---

# Game Sync Data Flow

## Architecture Overview

All lobby game-state and message polling is centralized in `GameSyncContext` (`app/js/contexts/GameSyncContext.tsx`). A single **500ms** `setInterval` runs `pollTick`, which decides what to fetch (full lobby state, minimal battle state, or lobby messages). `BattlePhase` owns the `GameEngine` and registers `BattleCallbacks` so the context can read the engine and deliver remote orders; it does not start/stop polling.

| Layer | Responsibility |
|-------|---------------|
| **GameSyncContext** | Network I/O: `saveCheckpoint`, `submitOrder`, `registerBattleCallbacks`, `requestResync`. Full/minimal/message polling in one loop. Sync verification (non-host). |
| **BattlePhase** | Engine lifecycle, UI, targeting. Registers `BattleCallbacks` (`getEngineSnapshot`, `onOrdersReceived`). |
| **GameEngine** | Deterministic simulation. Fires `onCheckpoint` and `onWaitingForOrders`. Knows nothing about networking. |
| **App.tsx** | Passes `onPollMessages` and `initialLastMessageId` into `GameSyncProvider`; seeds `pollMessagesReady` after `startInLobby`. |

## Unified poll loop (500ms)

- **Lobby messages**: every **5th** tick (~2.5s), `GET /messages` (unless in flight), then `onPollMessages` in App. `GAME_PHASE_CHANGED` in that batch sets an internal full-state refetch flag.
- **Full state** (`GET /lobby state`): on `requestResync`, visibility regain, `externalGameId` change; phase-based cadence (e.g. character/story every tick if not in flight; mission_select ~5s; battle transitional ~1s until engine registers).
- **Battle (minimal)**: only when phase is `battle`, `BattleCallbacks` registered, engine is **waiting for another player’s orders** (not local turn). Host and non-host use `getGameMinimalState` for orders; non-host also runs synchash / tick checks.

## Key Rule: Host Is Canonical

The host's `GameEngine` is the single source of truth. The host **never** enters `waiting_for_host` for synchash mismatch the same way as clients; minimal polling is for **pulling other players’ orders**.

## Data Flow: Host

```
Engine running (not paused)
    │
    ▼
Player unit can act ──► onCheckpoint fires
    │                       │
    │                       ▼
    │                 GameSyncContext.saveCheckpoint()
    │                 ► POST /snapshots (full state + synchash)
    │
    ▼
pauseForOrders(unit)
    │
    ├── unit.ownerId === localPlayerId (host's turn)
    │       └── submit order + saveCheckpoint (local engine) …
    │
    └── unit.ownerId !== localPlayerId (another player's turn)
            └── Unified poll: GET /minimal (checkpoint) when waiting
                ► orders → onOrdersReceived → queueOrder + resumeAfterOrders
```

## Data Flow: Non-Host Client

Same as host for local turn. When waiting on another player, unified poll uses **minimal state**: tick/hash checks, `waiting_for_host` when server is behind, full resync when behind or synchash mismatch.

## Key Files

| File | Role |
|------|------|
| `app/js/contexts/GameSyncContext.tsx` | Unified poll loop, battle callbacks, checkpoints/orders |
| `app/js/games/minion_battles/phases/BattlePhase.tsx` | Registers `BattleCallbacks` |
| `app/js/games/minion_battles/engine/GameEngine.ts` | Simulation, `onCheckpoint` / `onWaitingForOrders` |
| `app/js/LobbyClient.ts` | HTTP API (`getLobbyState`, `getMessages`, `getGameMinimalState`, …) |
| `app/js/utils/synchash.ts` | Client synchash |
| `backend/GameStateSync.php` | Server synchash (must match client) |

## GameSyncContext API

```typescript
saveCheckpoint(gameTick, state, orders)   // Host-only (guarded internally)
submitOrder(checkpointGameTick, atTick, order)
registerBattleCallbacks(callbacks: BattleCallbacks | null)
requestResync()   // UI / internal: next poll tick may GET full lobby state
```

`BattleCallbacks`:

- `getEngineSnapshot()` → `{ gameTick, state, waitingForOrders } | null`
- `onOrdersReceived(orders)` — BattlePhase applies orders and resumes the engine

## Checkpoint Tick Alignment

Orders and polling use aligned checkpoint ticks: `Math.floor(tick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL` where `CHECKPOINT_INTERVAL = 10`. Host checkpoint saves use the actual `gameTick` (not aligned).

## Common Pitfalls

- **`SaveGameOrdersHandler` must preserve `synchash`** when appending orders to an existing checkpoint file.
- **`gameSyncRef`** in BattlePhase: engine mount effect uses `[]` deps; use refs for latest context where needed.
- **`gameId` in GameSyncContext** uses `externalGameId ?? gameState?.gameId` so sync methods work before the first full fetch completes.
