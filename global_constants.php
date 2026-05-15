<?php

declare(strict_types=1);

/**
 * Repo-wide PHP constants (committed). Edit here instead of process env for these values.
 *
 * Battle-sync lobby_log floor on the server (AppendOrderHandler via BattleSyncLogThreshold).
 * Same tokens as LOBBY_LOG_BATTLE_SYNC in global_constants.js: log, info, warn, error, critical, off.
 */
const LOBBY_LOG_BATTLE_SYNC = 'info';

/** When true, client would block until user Continue after resync (see JS `BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK`). */
const BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK = false;

/**
 * @deprecated Inverse of {@see BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK} for legacy readers.
 * Was “auto resume without continue”; now expressed as “do not pause for ack”.
 */
const BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC = !BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK;
