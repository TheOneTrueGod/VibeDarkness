/**
 * Repo-wide JS constants (committed). Edit here instead of `.env` for these values.
 *
 * Battle-sync lobby_log floor on the client (`logToLobbyLogBattleSync`).
 * Same tokens as `LOBBY_LOG_BATTLE_SYNC` in global_constants.php: log, info, warn, error, critical, off.
 * Empty string falls back to `info` in lobbyLog.ts (matches former “unset” default).
 */

/** @type {'off' | 'log' | 'info' | 'warn' | 'error' | 'critical'} */
export const LOBBY_LOG_BATTLE_SYNC = 'info';
