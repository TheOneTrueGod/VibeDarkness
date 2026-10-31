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

/**
 * When true, the second and later missions of a quest do not reject players
 * outside the frozen party. The party is still recorded on the lobby.
 * Set false to restore that reservation. Admins can still bypass it per join.
 */
export const ALLOW_JOIN_MID_QUEST = true;

/** First quest slot index (0 = opening mission) that records a quest party. */
export const QUEST_PARTY_RESERVATION_MIN_SLOT_INDEX = 1;

/** Cap for lobbies that are not reserved for a quest party. */
export const OPEN_LOBBY_MAX_PLAYERS = 8;

/** Join error when a later quest lobby is reserved and the joiner is not on the roster. */
export const QUEST_PARTY_LOBBY_RESERVED_ERROR = 'This lobby is reserved for the quest party';

/** Foreground periodic battle heartbeat cadence (`BattleNet` GET /heartbeat). */
export const HEARTBEAT_POLL_INTERVAL_MS = 500;

/** Background tab heartbeat cadence (battery / idle tabs). Still polls; `visibilitychange` forces an immediate poll. */
export const HEARTBEAT_POLL_INTERVAL_HIDDEN_MS = 10_000;

/**
 * Foreground heartbeat when host/client are idle for active sync (sim running smoothly, no deferrals).
 * Keeps eventual peer order merges without pegging CPU at HEARTBEAT_POLL_INTERVAL_MS.
 */
export const HEARTBEAT_POLL_IDLE_MS = 3000;
