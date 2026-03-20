---
name: game-sync-data-flow
description: Describes the multiplayer game state synchronization system for Minion Battles. Covers how checkpoints, orders, and polling flow between host and non-host clients via GameSyncContext. Use when working on battle sync, order submission, checkpoint saves, polling, desync recovery, or the GameSyncContext.
---

# Game Sync Data Flow

## Architecture Overview

All battle-phase network I/O is centralized in `GameSyncContext` (`app/js/contexts/GameSyncContext.tsx`). `BattlePhase` owns the `GameEngine` and provides callbacks; it never makes sync network calls directly.

| Layer | Responsibility |
|-------|---------------|
| **GameSyncContext** | Network I/O: `saveCheckpoint`, `submitOrder`, `startOrderPolling`, `stopOrderPolling`. Sync verification (non-host). Manages polling lifecycle. |
| **BattlePhase** | Engine lifecycle, UI state, targeting. Calls GameSyncContext methods. Provides `OrderPollingCallbacks` for order delivery. |
| **GameEngine** | Deterministic simulation. Fires `onCheckpoint` and `onWaitingForOrders` callbacks. Knows nothing about networking. |

## Key Rule: Host Is Canonical

The host's `GameEngine` is the single source of truth. The host **never** enters `waiting_for_host` status and **never** does sync verification against the server. The server is just a relay for the host's state.

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
    │       │
    │       ▼
    │   Show card hand, let host interact
    │       │
    │       ▼
    │   Host submits order
    │       ├── engine.applyOrder(order)  [local]
    │       ├── GameSyncContext.submitOrder()
    │       │   ► POST /orders/{checkpointTick}
    │       ├── GameSyncContext.saveCheckpoint()
    │       │   ► POST /snapshots (updated state)
    │       └── engine resumes ──► back to top
    │
    └── unit.ownerId !== localPlayerId (another player's turn)
            │
            ▼
      GameSyncContext.startOrderPolling(checkpointTick, callbacks)
            │
            ▼
      Every 1s: GET /orders/{checkpointTick}
            │
            ├── No new orders ──► retry
            │
            └── Orders found (gameTick > engine.gameTick)
                    │
                    ▼
              callbacks.onOrdersReceived(orders)
                ├── engine.queueOrder() for each
                ├── engine.resumeAfterOrders()
                └── polling stops ──► back to top
```

## Data Flow: Non-Host Client

```
Engine running (not paused)
    │
    ▼
Player unit can act ──► onCheckpoint fires
    │                       │
    │                       ▼
    │                 GameSyncContext.saveCheckpoint()
    │                 ► Internally guards: isHost === false → no-op
    │
    ▼
pauseForOrders(unit)
    │
    ├── unit.ownerId === localPlayerId (client's turn)
    │       │
    │       ▼
    │   Show card hand, let client interact
    │       │
    │       ▼
    │   Client submits order
    │       ├── engine.applyOrder(order)  [local]
    │       ├── GameSyncContext.submitOrder()
    │       │   ► POST /orders/{checkpointTick}
    │       └── engine resumes ──► back to top
    │
    └── unit.ownerId !== localPlayerId (another player's turn)
            │
            ▼
      GameSyncContext.startOrderPolling(checkpointTick, callbacks)
            │
            ▼
      Every 1s: GET /minimal?checkpointGameTick=...
            │
            ▼
      Sync verification:
            │
            ├── serverTick > clientTick
            │   ► Client fell behind → fetchFullState() → resync
            │
            ├── serverTick < clientTick
            │   ► Host hasn't caught up → syncStatus='waiting_for_host'
            │   ► Retry (shown in UI after 3 consecutive waits)
            │
            ├── serverTick === clientTick, synchash mismatch
            │   ► Desync detected → fetchFullState() → resync
            │
            └── serverTick === clientTick, synchash matches
                ├── Orders found → callbacks.onOrdersReceived()
                │   ► engine.queueOrder() + resumeAfterOrders()
                │   ► Polling stops → back to top
                └── No orders → retry
```

## Key Files

| File | Role |
|------|------|
| `app/js/contexts/GameSyncContext.tsx` | All battle sync network I/O and polling |
| `app/js/games/minion_battles/phases/BattlePhase.tsx` | Engine lifecycle, provides `OrderPollingCallbacks` |
| `app/js/games/minion_battles/engine/GameEngine.ts` | Deterministic simulation, fires `onCheckpoint` / `onWaitingForOrders` |
| `app/js/LobbyClient.ts` | HTTP API client methods |
| `app/js/utils/synchash.ts` | Client-side SHA-256 synchash computation |
| `backend/GameStateSync.php` | Server-side synchash computation (must match client) |
| `backend/Http/Handlers/SaveGameStateSnapshotHandler.php` | Host saves checkpoint (computes synchash) |
| `backend/Http/Handlers/SaveGameOrdersHandler.php` | Any player appends order to checkpoint file |
| `backend/Http/Handlers/GetGameMinimalStateHandler.php` | Returns gameTick + synchash + orders |
| `backend/Http/Handlers/GetGameOrdersHandler.php` | Returns orders from a checkpoint file |

## GameSyncContext API

```typescript
saveCheckpoint(gameTick, state, orders)   // Host-only (guarded internally)
submitOrder(checkpointGameTick, atTick, order)
startOrderPolling(checkpointGameTick, callbacks: OrderPollingCallbacks)
stopOrderPolling()
```

`OrderPollingCallbacks`:
- `getEngineSnapshot()` → `{ gameTick, state }` — used for sync hash comparison (non-host only)
- `onOrdersReceived(orders)` — BattlePhase applies orders to engine and updates UI

## Checkpoint Tick Alignment

Orders and polling use aligned checkpoint ticks: `Math.floor(tick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL` where `CHECKPOINT_INTERVAL = 10`. Host checkpoint saves use the actual `gameTick` (not aligned). These are different files on the server.

## Synchash

Both client (`app/js/utils/synchash.ts`) and server (`backend/GameStateSync.php`) compute SHA-256 over a canonical subset of game state: `gameTick`, `units`, `projectiles`, `effects`, `specialTiles`, `cards`, `orders`. Keys are sorted recursively. These implementations **must stay in sync**.

## Common Pitfalls

- **Host must never call `processMinimalResult`** — the host IS canonical; comparing against server state is meaningless.
- **`SaveGameOrdersHandler` must preserve `synchash`** when appending orders to an existing checkpoint file.
- **`gameSyncRef`** in BattlePhase: engine callbacks are created in a mount effect (`[]` deps) and would capture stale context. Use `gameSyncRef.current?.` to always access the latest GameSyncContext.
- **`gameId` in GameSyncContext** uses `externalGameId ?? gameState?.gameId` so sync methods work immediately, before the first `fetchFullState` completes.
