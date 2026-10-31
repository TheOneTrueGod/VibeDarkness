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

/**
 * When true, the second and later missions of a quest do not reject players
 * outside the frozen party. The party is still recorded on the lobby.
 * Set false to restore that reservation. Admins can still bypass it per join.
 */
const ALLOW_JOIN_MID_QUEST = true;

/** First quest slot index (0 = opening mission) that records a quest party. */
const QUEST_PARTY_RESERVATION_MIN_SLOT_INDEX = 1;

/** Cap for lobbies that are not reserved for a quest party. */
const OPEN_LOBBY_MAX_PLAYERS = 8;

/** Join error when a later quest lobby is reserved and the joiner is not on the roster. */
const QUEST_PARTY_LOBBY_RESERVED_ERROR = 'This lobby is reserved for the quest party';
