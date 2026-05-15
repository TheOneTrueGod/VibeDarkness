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
 * When true after a successful full desync recovery, order submission stays blocked until the user
 * clicks Continue in the battle sync banner (`synced_pending_ack`).
 * When false (default), the sim resumes immediately and an informational banner shows Okay + auto-dismiss.
 */
export const BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK = false;

/** Auto-dismiss delay for the informational resync banner when {@link BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK} is false. */
export const BATTLE_RESYNC_INFORM_AUTO_DISMISS_MS = 10_000;

/**
 * @deprecated Use {@link BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK} instead — this is `!BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK`.
 * Kept so older imports/docs keep compiling.
 */
export const BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC = !BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK;

/** Foreground periodic battle heartbeat cadence (`BattleNet` GET /heartbeat). */
export const HEARTBEAT_POLL_INTERVAL_MS = 500;

/** Background tab heartbeat cadence (battery / idle tabs). Still polls; `visibilitychange` forces an immediate poll. */
export const HEARTBEAT_POLL_INTERVAL_HIDDEN_MS = 10_000;

/**
 * Foreground heartbeat when host/client are idle for active sync (sim running smoothly, no deferrals).
 * Keeps eventual peer order merges without pegging CPU at HEARTBEAT_POLL_INTERVAL_MS.
 */
export const HEARTBEAT_POLL_IDLE_MS = 3000;
