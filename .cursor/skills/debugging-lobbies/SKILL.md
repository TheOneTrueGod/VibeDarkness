---
name: debugging-lobbies
description: Instructions for diagnosing lobby issues from on-disk storage and logs when the user asks to debug a lobby; covers paths, battle artifacts, and how to summarize failures and propose fixes with tradeoffs.
---

# Debugging lobbies

Use this skill whenever the user asks to **debug a lobby** or investigate behaviour for a specific lobby code.

## Storage root

From the repo root:

- **`storage/lobbies/<LOBBY_CODE>/`** — everything for one lobby (`<LOBBY_CODE>` is the short id shown in URLs/state, e.g. `F22344`).
- Optionally **`storage/lobbies/<LOBBY_CODE>.json`** may exist depending on persistence shape; authoritative layout details live in `backend/LobbyManager.php`.

Inside **`storage/lobbies/<LOBBY_CODE>/`** you will commonly find:

| Artifact | Purpose |
|---------|---------|
| **`game_<instanceId>.json`** | Lobby-visible **game payload** (phase, selections, IDs, pointers into battles). Naming and merge rules — `backend/LobbyManager.php`. |
| **`games/<gameId>/`** | **Minion Battles networked battle** bundle (canonical layout documented in **`backend/BattleStorage.php`** class docblock): `initial_state.json`, `orders.jsonl`, **`snapshots/<tick>.json`**, **`fingerprints.jsonl`**. |

**Legacy battles** may still appear as directories like **`game_<gameId>/`** with files such as **`game_<gameId>_<tick>.json`**; see `backend/BattleStorage.php` and `backend/scripts/migrate_battle_storage.php` for the migration narrative. Prefer the **`games/<gameId>/`** tree when both exist.

## Lobby logs

- **`storage/lobbies/<LOBBY_CODE>/lobby_log.jsonl`** — append-only structured log from clients/server (`backend/LobbyLogStorage.php`). Read recent lines for timestamps, ticks, rejection reasons (`rejectedReason` from battle APIs), deferral/resync messages, and `gameId`-scoped context.

Tail or search this file alongside battle files when diagnosing sync/order issues.

### Why this file is often empty

- **`logToLobbyLog` (client)** is gated by **`VITE_LOBBY_LOG_THRESHOLD`**; when **unset**, the default is **`off`** — no client POSTs from that path.
- **Severity floors** (noise: most → least): **`log`** → **`info`** → **`warn`** → **`error`** → **`critical`**; **`off`** disables. A line is recorded only if **line severity ≥ floor**.
- **`logToLobbyLogBattleSync` (client)** reads **`LOBBY_LOG_BATTLE_SYNC`** from **`global_constants.js`** (same tokens; legacy **`true`** / **`1`** = floor **`log`**). **Empty constant defaults to `info`** (second most noisy).
- **Server** (`AppendOrderHandler`) reads **`LOBBY_LOG_BATTLE_SYNC`** from **`global_constants.php`** (Composer autoload) with the **same** semantics (**`off`** silences server battle-append logs; empty / invalid → **`info`**).

If **both** general and battle-sync floors are **`off`**, you may still see **no** file until a line is written server-side; with server floor **`off`**, nothing is written there either.

If **on-disk data and existing log lines are not enough** to pin down the failure, **propose new lobby-log events** to add for the next occurrence: what field(s) to record (tick, `gameId`, `playerId`, `rejectedReason`, host vs client, etc.), **where to emit** them (e.g. `app/js/lobbyLog.ts` / `logToLobbyLog`, `AppendLobbyLogHandler`, battle handlers, `BattleNet`), and why each field helps. Treat that as part of the deliverable alongside hypotheses.

## User state logs

When the **"Log user state to server"** toggle is enabled in the Debug Console (Debug Toggles tab), each client writes per-tick snapshots to:

```
storage/lobbies/<LOBBY_CODE>/user_state/<PLAYER_ID>/user_state_NNN.md
```

`user_state_001.md` covers ticks 0–99, `user_state_002.md` covers 100–199, and so on. Each file is JSONL — one JSON object per line with this shape (open for future additions):

```json
{ "tick": 142, "game_state": { /* SerializedGameState */ }, "orders": [], "ts": 1717000000 }
```

**Prefer the read endpoint over grepping files directly.** The endpoint is faster to call and already handles multi-file spanning:

```
GET /api/lobbies/{lobbyId}/user-state/{userId}?fromTick=N&toTick=M
```

- Requires `APP_ENV=development` on the PHP server (returns HTTP 403 otherwise).
- Returns up to 20 entries in `[fromTick, toTick]` sorted by tick ascending.
- Max range per call: 2000 ticks. Query multiple ranges to cover longer windows.
- No player auth required — this is a debug-read endpoint for AIs and investigators.

To write entries the client POSTs to:

```
POST /api/lobbies/{lobbyId}/user-state/{userId}
Body: { "playerId": "...", "entries": [...] }
```

Entries are batched client-side (up to 20 per flush, with a 5-second debounce) and routed automatically to the correct `user_state_NNN.md` file by tick range.

## desyncDebug scripts

**Prefer these scripts over writing ad-hoc `node` commands.** Run them via `npm run <script> -- <flags>` from the repo root.

| Script | What it does | When to use |
|--------|-------------|-------------|
| **`desyncDebug-getTick`** | Extracts per-tick `game_state` snapshots from `user_state` logs for all players (or one), side-by-side; supports `--field <dotPath>` to zoom in and `--full` for raw JSON. | Start here — gives the clearest view of per-player state at any tick range. |
| **`desyncDebug-diffTick`** | Deep-diffs two players' `game_state` at a **single** tick and prints every diverging dot-path with A/B values. | Use when you know the approximate desync tick and want to pinpoint exactly which fields diverged. |
| **`desyncDebug-getFingerprints`** | Reads `fingerprints.jsonl` entries within a tick range. | Use to check fingerprint agreement before digging into full state, or when user-state logs are absent. |
| **`desyncDebug-getLobbyLog`** | Filters `lobby_log.jsonl` by tick range and/or `--keyword` (repeatable); shows all matching structured log events. | Use to surface desync/resync events, rejection reasons, and timestamps in the incident window. |
| **`desyncDebug-getOrders`** | Reads `applied_orders.jsonl` (or `--file pending`) within a tick range. | Use to correlate which orders were applied at specific ticks with observed state divergence. |

## Ephemeral lobbies

**Lobby storage and log shapes are ephemeral** — old lobbies are not a migration or compatibility commitment. When proposing code or format changes (new log fields, battle directory layout, handler behaviour), **do not** treat “existing lobbies on disk” as a reason to avoid a root fix. (This is **lobby-scoped** only; do not override project-wide backwards-compatibility rules for **Players, Campaigns**, or other long-lived data in `AGENTS.md`.)

## Sync and battle behaviour

For **why orders, fingerprints, checkpoints, or host/client ticks diverged**, open and follow:

- **`.cursor/skills/game-sync-data-flow/SKILL.md`**

Implementations worth opening during investigation:

- **`app/js/games/minion_battles/game/BattleNet.ts`** — client heartbeat, deferral, resync gates.
- **`backend/Http/Handlers/Battle/AppendOrderHandler.php`** — order acceptance windows (`tick_in_past`, `tick_ahead_of_host`, ownership).
- **`backend/Http/Handlers/Battle/GetHeartbeatHandler.php`** — heartbeat JSON: **`hostTick`** / **`hostFingerprint`** = **last completed** via **`BattleStorage::resolveLastCompletedTickAndFingerprint`**. **`orderBatchAtTick`** (and legacy **`pausedAtTick`** alias when paused) = **`waitingForOrders.atTick`** — **not** the snapshot envelope **`tick`** field.

## Investigation workflow

**Primary source: user state snapshots.** If `storage/lobbies/<LOBBY_CODE>/user_state/` exists with files for any player, start there — these snapshots contain full `SerializedGameState` per tick and are usually sufficient to pinpoint divergence. Only fall back to `fingerprints.jsonl`, `orders.jsonl`, or `lobby_log.jsonl` if the snapshots do not cover the incident window or lack the needed field.

If the user state logs don't contain enough detail to confirm or refute a hypothesis, **stop early** and tell the user what additional fields to log (what field(s), which tick range, which player) so the next occurrence captures it. Do not speculate past what the evidence supports.

1. Confirm **`gameId`** (from **`game_<instanceId>.json`**, heartbeat URLs, or `lobby_log.jsonl`).
2. Read user state snapshots for affected players around the incident window (use the GET endpoint or the files directly). Look for diverging `game_state` fields, unexpected order lists, or tick gaps.
3. Form hypotheses from what the snapshots show. For each hypothesis you check against the code, report it to the user immediately as a **bolded title** followed by one sentence describing what you found (confirmed, ruled out, or inconclusive).
4. Only if snapshots are missing or insufficient: fall back to **`fingerprints.jsonl`**, **`orders.jsonl`**, and **`lobby_log.jsonl`** (see field descriptions above).
5. If the symptom is multiplayer-only, reason about **host-canonical** state vs optimistic non-host simulation (game-sync skill).

## What to deliver to the user

Every lobby-debug response must include:

1. **A concise summary** of what went wrong (what the on-disk evidence shows, what each side likely believed, where the pipeline broke).

2. **Proposed solutions** — not only one-liners: for each meaningful approach outline **pros**, **cons**, and **risk** (e.g. data loss, masking desyncs). For **lobby-scoped** changes, old lobbies need not be preserved (see **Ephemeral lobbies** above); long-lived player/campaign data is still governed by `AGENTS.md`.

3. **Prefer root-level fixes** over quick patches where they differ: patches that silence symptoms or blindly force state can unblock a session but may hide deterministic bugs or corrupt replays — call that tradeoff explicitly. Root fixes usually tighten invariants (when to POST orders, when to resync, server validation clarity, observability).

Do not mutate production storage unless the user asks to apply a corrective change after agreeing to tradeoffs.
