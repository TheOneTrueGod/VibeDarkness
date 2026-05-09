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
- **`logToLobbyLogBattleSync` (client)** uses **`VITE_LOBBY_LOG_BATTLE_SYNC`** (same tokens; legacy **`true`** / **`1`** = floor **`log`**). **Unset defaults to `info`** (second most noisy).
- **Server** (`AppendOrderHandler`) uses **`LOBBY_LOG_BATTLE_SYNC`** with the **same** semantics (unset → **`info`**; **`off`** silences server battle-append logs). PHP does not read Vite’s `.env` automatically — set **`LOBBY_LOG_BATTLE_SYNC`** in the PHP process environment.

If **both** general and battle-sync floors are **`off`**, you may still see **no** file until a line is written server-side; with server floor **`off`**, nothing is written there either.

If **on-disk data and existing log lines are not enough** to pin down the failure, **propose new lobby-log events** to add for the next occurrence: what field(s) to record (tick, `gameId`, `playerId`, `rejectedReason`, host vs client, etc.), **where to emit** them (e.g. `app/js/lobbyLog.ts` / `logToLobbyLog`, `AppendLobbyLogHandler`, battle handlers, `BattleNet`), and why each field helps. Treat that as part of the deliverable alongside hypotheses.

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

1. Confirm **`gameId`** (from **`game_<instanceId>.json`**, heartbeat URLs, or `lobby_log.jsonl`).
2. Under **`games/<gameId>/`** (or legacy path): compare **tail of `fingerprints.jsonl`** (last completed fingerprint index vs heartbeat **`hostTick`**), **`orders.jsonl`** (`atTick` vs **`waitingForOrders.atTick`**), newest **`snapshots/`** **`state.waitingForOrders`**, snapshot envelope **`tick`**, vs local **`gameTick`** on the browser.
3. Correlate with **`lobby_log.jsonl`** around the incident window.
4. If the symptom is multiplayer-only, reason about **host-canonical** state vs optimistic non-host simulation (game-sync skill).

## What to deliver to the user

Every lobby-debug response must include:

1. **A concise summary** of what went wrong (what the on-disk evidence shows, what each side likely believed, where the pipeline broke).

2. **Proposed solutions** — not only one-liners: for each meaningful approach outline **pros**, **cons**, and **risk** (e.g. data loss, masking desyncs). For **lobby-scoped** changes, old lobbies need not be preserved (see **Ephemeral lobbies** above); long-lived player/campaign data is still governed by `AGENTS.md`.

3. **Prefer root-level fixes** over quick patches where they differ: patches that silence symptoms or blindly force state can unblock a session but may hide deterministic bugs or corrupt replays — call that tradeoff explicitly. Root fixes usually tighten invariants (when to POST orders, when to resync, server validation clarity, observability).

Do not mutate production storage unless the user asks to apply a corrective change after agreeing to tradeoffs.
