/**
 * Repo-wide JS constants (committed). Edit here instead of `.env` for these values.
 *
 * Battle-sync lobby_log floor on the client (`logToLobbyLogBattleSync`).
 * Same tokens as `LOBBY_LOG_BATTLE_SYNC` in global_constants.php: log, info, warn, error, critical, off.
 * Empty string falls back to `info` in lobbyLog.ts (matches former “unset” default).
 */

/** @type {'off' | 'log' | 'info' | 'warn' | 'error' | 'critical'} */
export const LOBBY_LOG_BATTLE_SYNC = 'info';

/**
 * After a desync recovery resync, resume simulation automatically without extra UI.
 * When false, Battle UI may show a continue affordance (see BattleNet / sync box).
 */
export const BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC = false;

/** Foreground periodic battle heartbeat cadence (`BattleNet` GET /heartbeat). */
export const HEARTBEAT_POLL_INTERVAL_MS = 500;

/** Background tab heartbeat cadence (battery / idle tabs). Still polls; `visibilitychange` forces an immediate poll. */
export const HEARTBEAT_POLL_INTERVAL_HIDDEN_MS = 10_000;

/**
 * Foreground heartbeat when host/client are idle for active sync (sim running smoothly, no deferrals).
 * Keeps eventual peer order merges without pegging CPU at HEARTBEAT_POLL_INTERVAL_MS.
 */
export const HEARTBEAT_POLL_IDLE_MS = 3000;
