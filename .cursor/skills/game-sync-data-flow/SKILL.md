---
name: game-sync-data-flow
description: Describes the multiplayer game state synchronization system for Minion Battles. Covers how checkpoints, orders, and polling flow between host and non-host clients via GameSyncContext. Use when working on battle sync, order submission, checkpoint saves, polling, desync recovery, or the GameSyncContext.
---

# Game Sync Data Flow

## Architecture Overview

All lobby game-state and message polling is centralized in `GameSyncContext` (`app/js/contexts/GameSyncContext.tsx`). A single polling interval runs `pollTick`, which decides what to fetch (full lobby state, minimal battle state, or lobby messages). `BattlePhase` owns the `GameEngine` and registers `BattleCallbacks` so the context can read the engine and deliver remote orders; it does not start/stop polling.

| Layer | Responsibility |
|-------|---------------|
| **GameSyncContext** | Network I/O: checkpoint saves, order submission, battle callbacks registration, resync requests. Full/minimal/message polling in one loop. Sync verification (non-host). |
| **BattlePhase** | Engine lifecycle, UI, targeting. Registers callbacks for engine snapshot access and order delivery. |
| **GameEngine** | Deterministic simulation. Fires checkpoint and waiting-for-orders events. Knows nothing about networking. |
| **App.tsx** | Passes message polling callback and initial message ID into `GameSyncProvider`. |

## Battle tick glossary (`serverTick`, `clientTick`, wire fields)

| Term | Meaning |
|------|---------|
| **`serverTick`** | Authoritative **last fully completed** simulation tick on the PHP battle store — exposed on the heartbeat as **`hostTick`** (after the same clamp as order append). Same index as the **verification fingerprint** (`fingerprints.jsonl` tail at steady state). **Not** the parallel order-batch tick. UI may label this “Host tick” / “Server tick”. |
| **`clientTick`** | This browser’s **last fully completed** tick: `BattleSession.getEngineTick()` / `engine.gameTick`. When synced after a checkpoint/heartbeat pause, **`clientTick === serverTick`**; drift drives behind-host / resync UX. Debug bridge exposes **`clientTick`** (+ legacy **`engineTick`**). |
| **`hostTick`** (JSON) | Wire field = **`serverTick`**. Derived via **`BattleStorage::resolveLastCompletedTickAndFingerprint`**, shared by **`AppendOrderHandler`** and **`GetHeartbeatHandler`**. |
| **`orderBatchAtTick`** (JSON) | Present when paused for **`waitingForOrders`**: **`waitingForOrders.atTick`** (orders POST with this **`atTick`**). Nullable when sim is advancing. Legacy alias: **`pausedAtTick`** duplicates this when paused — **not** the snapshot envelope **`tick`**. |

Checkpoint JSON still stores **`tick`** (= envelope / last completed at save). Do not confuse envelope **`tick`** with **`waitingForOrders.atTick`**.

## Unified poll loop

- **Lobby messages**: periodically fetches messages (unless in flight), then processes them in App. Game phase changes trigger a full-state refetch.
- **Full state**: on resync requests, visibility regain, game ID changes; phase-based cadence varies (e.g. character/story phases poll frequently; battle transitions poll until engine registers).
- **Battle (minimal)**: only when phase is `battle`, callbacks are registered, and the engine is waiting for another player's orders. Host and non-host use minimal state for orders; non-host also runs sync verification.

Minion Battles no longer has an in-game `mission_select` phase. Mission identity is set up before the game session starts via `selectedMissionId`.

## Key Rule: Host Is Canonical

The host's `GameEngine` is the single source of truth. Minimal polling is for pulling other players' orders, not for correcting state.

## Data Flow: Host

1. Engine runs → player unit can act → checkpoint event fires → `saveCheckpoint()` POSTs full state + synchash
2. `pauseForOrders(unit)`:
   - **Host's turn**: submit order + save checkpoint locally
   - **Other player's turn**: poll minimal state for orders → deliver to engine → resume

## Data Flow: Non-Host Client

Same as host for local turn. When waiting on another player, minimal state polling includes tick/hash checks, with full resync on mismatch or falling behind.

## Key Files

| File | Role |
|------|------|
| `app/js/contexts/GameSyncContext.tsx` | Unified poll loop, battle callbacks, checkpoints/orders |
| `app/js/contexts/SyncContextControllers/` | Base, host, and client sync controller logic |
| `app/js/games/minion_battles/ui/pages/BattlePhase.tsx` | Registers battle callbacks |
| `app/js/games/minion_battles/game/GameEngine.ts` | Simulation, checkpoint and waiting-for-orders events |
| `app/js/games/minion_battles/game/BattleNet.ts` | Battle heartbeat polling, fingerprint alignment, deferral, recovery |
| `app/js/LobbyClient.ts` | HTTP API (`getBattleHeartbeat`, orders, checkpoints) |
| `app/js/utils/synchash.ts` | Client synchash |
| `backend/BattleStorage.php` | **`resolveLastCompletedTickAndFingerprint`** + snapshots / fingerprints |
| `backend/Http/Handlers/Battle/GetHeartbeatHandler.php` | Heartbeat (**`hostTick`**, **`orderBatchAtTick`**) |
| `backend/Http/Handlers/Battle/AppendOrderHandler.php` | Order windows vs last completed vs batch **`atTick`** |
| `backend/GameCheckpointFiles.php` | Server-side checkpoint storage and synchash |
| `backend/Http/Handlers/SaveGameStateSnapshotHandler.php` | Saves checkpoint snapshots |
| `backend/Http/Handlers/SaveGameOrdersHandler.php` | Saves orders; preserves synchash |

## Checkpoint / fingerprint skew

Fingerprints advance on **completed** ticks. While paused with **`waitingForOrders.atTick` = T**, `resolveLastCompletedTickAndFingerprint` clamps **`hostTick`** to **`min(fpTail, T - 1)`** so **`AppendOrderHandler`**/`heartbeat` never treat the batch **`T`** as already finished.

Snapshot **`state.waitingForOrders`** vs **`fingerprints.jsonl`** can race briefly (`maxAllowedTick = max(lastCompleted + 1, pauseAtTick)` keeps append acceptance stable). Checkpoint **envelope** **`tick`** is last completed **at persist time**, not interchangeable with **`orderBatchAtTick`**. See **`BattleStorage::saveSnapshot`**.

## API and Types

See `GameSyncContext.tsx` for the full context API and the `BattleCallbacks` type.

## Checkpoint Tick Alignment

Orders and polling use aligned checkpoint ticks. See `GameSyncContext.tsx` for the alignment formula and checkpoint interval constant.

## Common Pitfalls

- **`SaveGameOrdersHandler` must preserve `synchash`** when appending orders to an existing checkpoint file.
- **`gameSyncRef`** in BattlePhase: engine mount effect uses `[]` deps; use refs for latest context where needed.
- **`gameId` in GameSyncContext** uses `externalGameId ?? gameState?.gameId` so sync methods work before the first full fetch completes.
