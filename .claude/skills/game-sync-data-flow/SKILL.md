---
name: game-sync-data-flow
description: Describes Minion Battles multiplayer battle sync — lobby-scoped PHP storage (`pending_orders` vs `applied_orders`), HTTP handlers, and `BattleNet` / `LobbyClient` heartbeat + merge flow. Use when working on battle sync, checkpoints, order submission, polling, desync recovery, or `BattleNet`.
---

# Game Sync Data Flow

## Architecture overview

Battle networking is implemented in **`BattleNet`** ([`BattleNet.ts`](app/js/games/minion_battles/game/battlenet/BattleNet.ts)) with **`HostBattleNet`** / **`ClientBattleNet`** façade classes (`createBattleNet(...)`) instantiated from **`BattlePhase`**. **`GameSyncContext`** only polls lobby JSON + lobby messages (~500 ms during non-battle phases); it does **not** own battle checkpoints or heartbeat I/O anymore.

| Layer | Responsibility |
|-------|----------------|
| **BattleNet** (base) | Sequential **500 ms** heartbeat polling when started; fingerprint flush (host); order deferral/resync logic; merges extended heartbeat payloads for debug bridge. |
| **HostBattleNet** / **ClientBattleNet** | Thin subclasses (same behaviour today; hooks for role-specific policy). Construct via **`createBattleNet`**. |
| **BattleSession** | Owns **`GameEngine`**, wires **`setOnCheckpoint`**, **`setOnTickComplete`**, **`setOnParallelBatchResolved`** → **`mergeAppliedOrdersForBatch`** on host when parallel batch clears. |
| **BattlePhase** | React shell: creates session + **`createBattleNet`**, wires UI to sync events (`sync-status`, `host-anchor-wait`, etc.). |
| **GameEngine** | Deterministic simulation; **`tryResumeParallel`** clears parallel wait → **`onParallelBatchResolved(batchAtTick)`**. |
| **LobbyClient** | HTTP: heartbeat (optional `gameTick`), **`appendBattleOrder`** (.pending line), **`getBattleOrdersRange`** (merged + `pendingOrders`/`appliedOrders` split), **`mergeBattleAppliedOrders`**, checkpoints, fingerprints. |

## On-disk layout (`storage/lobbies/<LobbyId>/`)

Normative overview: [docs/game-sync-plan.md](docs/game-sync-plan.md).

| Path | Purpose |
|------|---------|
| `lobby_state.json` | Persisted **`Lobby`** (was flat `<LobbyId>.json`). |
| `lobby_log.jsonl` | Debug / structured lobby log (`LobbyLogStorage`). |
| `game_<gameId>.json` | Mission / MinionBattles lobby payload metadata (equipment, phases, selections). |
| `pending_orders.jsonl` | In-flight **`POST …/orders`** rows (finalize + `basisFingerprint`; unique per **`playerId` + unit + atTick** via last-write-wins compaction on read). |
| `applied_orders.jsonl` | Canonical merged rows (**`POST …/orders/merge-applied`**, host). |
| `snapshots/<tick>.json` | Pause checkpoints (**`tick`**, **`state`**, optional **`synchash`**). |
| `initial_state.json` | Tick‑0 deterministic baseline (`BattleStorage::saveInitialState`). |
| `fingerprints.jsonl` | Completed-tick fingerprints + **`paused`** (**`BattleStorage::appendFingerprints`**), used with snapshots for **`resolveLastCompletedTickAndFingerprint`**. |

`BattleStorage::getGameDir($lobbyId, $gameId)` returns the **lobby directory**; URL **`gameId`** must match **`Lobby::getGameId()`** (`isBattleRouteForActiveGame` guard on handlers).

## Battle tick glossary

| Term | Meaning |
|------|---------|
| **`serverTick`** | Authoritative last **completed** sim tick (**`hostTick`** on heartbeat after clamp vs parallel batch). Same idea as fingerprints tail at steady state. |
| **`clientTick`** | Local **`BattleSession.getEngineTick()`** / **`engine.gameTick`**. |
| **`orderBatchAtTick`** | **`waitingForOrders.atTick`** while paused for parallel orders. Orders **`POST`** use this **`atTick`**. Alias **`pausedAtTick** when set. |

Snapshot envelope **`tick`** is **not** interchangeable with **`orderBatchAtTick`**.

## Orders: pending vs applied

1. **Clients / host append** pending: **`AppendOrderHandler`** → **`BattleStorage::appendOrder`** writes **`pending_orders.jsonl`**, returns **`pendingLineId`**, stores optional **`basisFingerprint`** (authoritative **`hostFingerprint`** at accept time).

2. **Host**, when **`GameEngine`** satisfies a parallel batch (`tryResumeParallel`), **`BattleSession`** calls **`BattleNet.mergeAppliedOrdersForBatch(batchAtTick)`** → **`mergeBattleAppliedOrders`** (**`MergeAppliedOrdersHandler`**) moves **finalized** rows for that tick into **`applied_orders.jsonl`** (with retries; failures → **`requestResync('merge-applied-failed')`**).

3. **`GET …/orders`** returns **`orders`** (applied overlay pending for the same `(playerId, unitId, atTick)` keys) plus raw **`pendingOrders`** / **`appliedOrders`**.

## Heartbeat (**`GET …/heartbeat`**)

Keeps **`hostTick`**, **`hostFingerprint`**, **`orderBatchAtTick`**, **`expectingFromPlayerIds`**, **`ordersRecordCount`**, **`heartbeatSeq`** (mtime max of snapshots / fingerprints / order files).

Adds **minimal-plan** aliases: **`latestServerGameTick`**, **`latestServerGameHash`**, optional **`gameTick`/`gameHash`** echo (when `gameTick` query param set), **`pendingOrders`** (recent window), **`appliedOrdersAtTick`**.

Optional **`includePastApplied=1`** with numeric **`?gameTick=N`**: when **`N < hostTick`**, the response may include **`pastAppliedActions`** — the **`applied`** slice from **`BattleStorage::getOrdersRangeSplit`** for **`sinceTick = N + 1`** (same rows as **`appliedOrders`** on **`GET …/orders`** for that range). **`BattleNet`** (non-host) sets this flag when the local engine is behind the last observed host tail **or** when **`nonHostPastAppliedHeartbeatLatch`** is on (set after a poll observes post-merge **`engineTick < hostTick`** while **`BattleSession.isPausedForOrderSync()`**, cleared when **`engineTick >= hostTick`** and the engine is not paused for order sync, on **`hostTick`** edge/null, or at desync recovery entry). **`BattleSession.applyRemoteOrders`** dedupes each row by wire **`idHash`** or **`hashOrderId(playerId, atTick, order)`** so duplicate delivery from heartbeat past-applied, **`GET …/orders`**, optimistic submit, or recovery replay does not double-**`queueOrder`**. **`BattleNet`** merges **`appliedOrderIdHashes`** from the session apply result so skipped rows do not orphan pre-registered hashes. Implemented via **`BattleStorage::getAppliedOrdersRangeForWire`** so the applied list matches the orders endpoint.

Also exposes optional **`fingerprintTailTick`** / **`fingerprintTailFingerprint`** (max tick row in `fingerprints.jsonl` before clamp) for diagnostics; **`hostTick`** may trail that tail while the latest snapshot’s **`waitingForOrders.atTick`** lags. **`BattleNet`** tracks **`hostTick|hostFingerprint`** between polls to detect **material** heartbeat changes, and a composite **pause-plane key** (`hostPaused`, **`hostTick`**, fingerprint, **`orderBatchAtTick`**, **`expectingFromPlayerIds`**) between polls: when the local engine runs **ahead** of the clamped server tail while the heartbeat is still **paused**, sync stays **`waiting_for_host`** (no immediate resync); when the pause plane **changes**, **`reconcileNonHostPausePlaneTransition`** re-checks the fingerprint at **`hostTick`** and may **`requestResync('pause-plane-transition-hash-mismatch')`** or return to **`synced`** if the host cleared pause and hashes agree (see **`docs/game-sync-plan.md`** optimistic playahead subsection).

Poll interval: **`HEARTBEAT_POLL_INTERVAL_MS = 500`** (foreground).

## Checkpoint save

Host **`saveBattleSnapshot`** → **`SaveSnapshotHandler`**: persists snapshot with optional **`checkpointFingerprint`** as **`synchash`**, **`appendFingerprints`**, then **`prunePendingOrdersAfterSnapshot`** keeps only **`completedTick + 1`** pending rows whose **`basisFingerprint`** matches **`synchash`** on **`completedTick`** when both present.

## Key files

| File | Role |
|------|------|
| [`app/js/games/minion_battles/game/battlenet/BattleNet.ts`](app/js/games/minion_battles/game/battlenet/BattleNet.ts) | Heartbeat poll, merges, **`HostBattleNet`/`ClientBattleNet`**, **`createBattleNet`** |
| [`app/js/LobbyClient.ts`](app/js/LobbyClient.ts) | Wire methods + **`HeartbeatResponse`** extended fields |
| [`app/js/contexts/GameSyncContext.tsx`](app/js/contexts/GameSyncContext.tsx) | Lobby/message polling only (battle sync is **`BattleNet`**) |
| [`backend/BattleStorage.php`](backend/BattleStorage.php) | Lobby-scoped paths, **`getOrdersRangeSplit`**, **`getAppliedOrdersRangeForWire`** (applied slice = **`GET …/orders`** `appliedOrders`), **`mergeFinalizedPendingForBatch`**, **`prunePendingOrdersAfterSnapshot`** |
| [`backend/Http/Handlers/Battle/MergeAppliedOrdersHandler.php`](backend/Http/Handlers/Battle/MergeAppliedOrdersHandler.php) | Host merge endpoint |
| [`backend/Http/Handlers/Battle/GetHeartbeatHandler.php`](backend/Http/Handlers/Battle/GetHeartbeatHandler.php) | Minimal + legacy heartbeat fields |
| [`backend/Http/Handlers/Battle/SaveSnapshotHandler.php`](backend/Http/Handlers/Battle/SaveSnapshotHandler.php) | Snapshot + synchash + prune |
| [`backend/LobbyManager.php`](backend/LobbyManager.php) | **`lobby_state.json`**, **`getGameStateData`** merges latest **`BattleStorage`** snapshot with mission **`game_<id>.json`**. |

## Client UX constants

[`global_constants.js`](global_constants.js) / **[`global_constants.php`](global_constants.php)**: **`BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC`** (paired with **`BattleSyncStatus`** reload affordance).

## Common pitfalls

- **`merge-applied`** must succeed before authoritative playback lines exist for non-hosts merging **applied** replay; failures trigger host resync.
- **`fingerprints.jsonl`** can still briefly race **`snapshots/`** — **`AppendOrderHandler`** **`maxAllowedTick`** slack unchanged.
- **Host migration mid-battle** still **`TODO`** (log at **critical** if instrumented callers detect host id churn).
