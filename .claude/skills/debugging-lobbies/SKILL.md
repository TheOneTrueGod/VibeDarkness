---
name: debugging-lobbies
description: Instructions for diagnosing lobby issues from on-disk storage, /lobby_debug HTTP tools, or desyncDebug npm scripts. Covers local vs production, battle artifacts, and how to summarize failures with tradeoffs.
---

# Debugging lobbies

Use this skill whenever the user asks to **debug a lobby** or investigate behaviour for a specific lobby code.

## Local vs production

**Ask which environment** when the user does not say (e.g. "debug lobby F22344" with no context).

| Environment | Where data lives | How to investigate |
|-------------|------------------|-------------------|
| **Local** | `storage/lobbies/<CODE>/` on disk; PHP at `http://localhost:8000` (`npm run php`, `APP_ENV=development`) | **`/lobby_debug/*` HTTP API** (no token), **desyncDebug npm scripts**, or read files directly |
| **Production** | Server storage at `https://darkness.jprevoe.com` | **`/lobby_debug/*` HTTP API** with `X-Lobby-Debug-Token` (server `LOBBY_DEBUG_TOKEN`) or admin session. Do not assume local `storage/` has the lobby |

Wrong-environment lookups return 404 with a hint to check local vs production.

## lobby_debug HTTP API (preferred for agents)

Base path: `GET` or `POST` `/lobby_debug/{method}` with `lobby=<CODE>` (query or JSON body). Start with `/lobby_debug` for the method catalog.

| Method | Purpose |
|--------|---------|
| **`overview`** | Players, `gameId`, which artifacts exist — start here |
| **`get_players`** | Player ids/names/host from `lobby_state.json` |
| **`get_lobby_log`** | Filter `lobby_log.jsonl` (`from`, `to`, `keyword`, `severity`) |
| **`get_fingerprints`** | `fingerprints.jsonl` in tick range |
| **`get_orders`** | `applied` / `pending` / `log` file in tick range |
| **`get_snapshots`** | Load snapshot JSON for `ticks` (comma-separated, max 5) |
| **`list_snapshots`** | Available host snapshot tick numbers |
| **`get_user_state_index`** | Per-player `user_state` file coverage |
| **`get_user_state`** | Per-player entries (`player`, `fromTick`, `toTick`) |
| **`detect_desyncs`** | Auto-find fingerprint mismatch events + bundled context |
| **`diff_snapshot`** | Host snapshot vs client state dump in log (`tick`, `vsLogTick`) |
| **`get_game`** | `game_<instanceId>.json` payload |

Responses include **`hint`** fields when data is missing or filters match nothing. Production requires auth (see **Local vs production**).

Legacy dev endpoint (still available): `GET /api/lobbies/{lobbyId}/user-state/{userId}?fromTick=&toTick=` — same caps as `get_user_state`.

## Storage root (local disk)

From the repo root: **`storage/lobbies/<LOBBY_CODE>/`**. Battle artifacts live **directly under the lobby dir** (see `backend/BattleStorage.php`): `fingerprints.jsonl`, `applied_orders.jsonl`, `snapshots/<tick>.json`, `lobby_log.jsonl`, `user_state/<playerId>/`.

## Lobby logs

**`lobby_log.jsonl`** — structured client/server log. Often empty when `VITE_LOBBY_LOG_THRESHOLD` is unset (`off`) or `LOBBY_LOG_BATTLE_SYNC` is `off` — see `global_constants.js` / `global_constants.php` and Debug Console → Debug Toggles.

## User state logs

When **"Log user state to server"** is enabled (Debug Console), clients write JSONL to `user_state/<PLAYER_ID>/user_state_NNN.md` (100 ticks per file). Prefer **`get_user_state`** / **`get_user_state_index`** over raw file reads.

## desyncDebug scripts (local repo only)

Run via **`npm run <script> -- <flags>`** when you have local disk access. Prefer **`/lobby_debug`** for production or when PHP is already running.

| Script | What it does | When to use |
|--------|-------------|-------------|
| **`desyncDebug-getTick`** | Per-tick `game_state` from user_state; `--field`, `--player`, `--full` | Richest local per-tick view |
| **`desyncDebug-diffTick`** | Deep-diff two players at one tick | Pinpoint diverging fields |
| **`desyncDebug-getFingerprints`** | `fingerprints.jsonl` in range | Fingerprint agreement |
| **`desyncDebug-getLobbyLog`** | Filtered `lobby_log.jsonl` | Desync/resync/rejection events |
| **`desyncDebug-desyncs`** | Auto-detect desyncs + bundle context | Start when user_state absent |
| **`desyncDebug-diffSnapshot`** | Host snapshot vs client log state | Phantom desync check |
| **`desyncDebug-getOrders`** | Orders in range (`--file pending\|log`) | Correlate orders with divergence |
| **`desyncDebug-getCombatEvents`** | Death/spawn/VFX timing from snapshots | Visual flash timing |

## Investigation workflow

1. Confirm environment (**local vs production**). Call **`overview`** (or list local `storage/lobbies/<CODE>/`).
2. Confirm **`gameId`** (`get_game`, overview, or lobby log).
3. **Primary:** `get_user_state` when `user_state/` exists. Otherwise **`detect_desyncs`**, then fingerprints/orders/log.
4. Report each hypothesis as a **bolded title** + one sentence (confirmed / ruled out / inconclusive).
5. If evidence is insufficient, propose **new lobby-log fields** for the next repro.

For sync pipeline behaviour, see **game-sync-data-flow** skill (`BattleNet.ts`, `AppendOrderHandler.php`, `GetHeartbeatHandler.php`).

## What to deliver

1. **Concise summary** — what evidence shows, what each side likely believed, where the pipeline broke.
2. **Proposed solutions** with **pros**, **cons**, and **risk** per approach.
3. **Prefer root fixes** over symptom patches; call out tradeoffs explicitly.

Lobby storage is **ephemeral** (lobby-scoped only). Do not mutate production storage unless the user agrees after tradeoffs.
