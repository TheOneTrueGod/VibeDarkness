<?php

declare(strict_types=1);

/**
 * Repo-wide PHP constants (committed). Edit here instead of process env for these values.
 *
 * Battle-sync lobby_log floor on the server (AppendOrderHandler via BattleSyncLogThreshold).
 * Same tokens as LOBBY_LOG_BATTLE_SYNC in global_constants.js: log, info, warn, error, critical, off.
 */
const LOBBY_LOG_BATTLE_SYNC = 'info';
