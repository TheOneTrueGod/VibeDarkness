export const INITIAL_STATE_RETRY_DELAY_MS = 500;
export const INITIAL_STATE_MAX_RETRIES = 20;

/**
 * Non-host, ahead of host tail, fingerprints agree: show "waiting for host" only after this many
 * unchanged-tail polls (~2s each).
 */
export const BATTLE_NET_T1_WAITING_POLLS = 10;
/** Same situation: initiate resync after this many polls. */
export const BATTLE_NET_T2_RESYNC_POLLS = 20;

/**
 * Battle overlay (non-host): heartbeat polls spent **paused for parallel orders** while status is
 * `waiting_for_host` before the top-left sync card appears. Aliases {@link BATTLE_NET_T1_WAITING_POLLS}.
 */
export const BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS = BATTLE_NET_T1_WAITING_POLLS;
/**
 * Same stall: assume a desync and run full `BattleNet.requestResync` recovery.
 * Aliases {@link BATTLE_NET_T2_RESYNC_POLLS}.
 */
export const BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS = BATTLE_NET_T2_RESYNC_POLLS;

/**
 * Non-host: while sync is `waiting_for_host` **and** the engine is paused for parallel orders,
 * if heartbeat material (`hostTick` + `hostFingerprint`) is unchanged for this long, force full resync
 * (host likely stuck applying merged orders).
 */
export const BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS = 15_000;

/** Anchor tick stuck (`hostPaused` + host tail equals last proven sync tick): show bottom-centre "waiting for host". */
export const HOST_ANCHOR_WAIT_SHOW_MS = 2000;
/** Same situation: suspected failure — force hard resync. */
export const HOST_ANCHOR_RESYNC_MS = 10_000;

/** Host completed tick minus local engine tick — above this, treat as catching up; lock order UI. */
export const BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD = 10;
export const BATTLE_NET_MAX_DEFERRED_ORDERS = 32;
export const BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS = 5;

/**
 * Non-host stuck-paused detector: minimum `hostTick - engineTick` gap that counts as
 * "host has advanced past us while we're paused for parallel orders". Smaller gaps are
 * treated as normal optimistic playahead / catch-up windows.
 */
export const BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP = 2;
/**
 * Non-host stuck-paused detector: consecutive polls (~500ms each) where the host moved
 * (material change or new order records) but local `engineTick` did not advance — at this
 * count we force a full order rescan to unblock the local parallel-order pause.
 */
export const BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS = 3;
/**
 * Non-host stuck-paused detector: additional polls after the catch-up rescan where the
 * client is still paused and behind — at this point assume order recovery alone cannot
 * unblock us and escalate to `requestResync('stuck-paused-host-ahead')`.
 */
export const BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS = 2;

/** Max wait for a best-effort ITS reset/replay/commit order refresh (`BattleNet.pollOnce`). */
export const ITS_PRE_ACTION_POLL_TIMEOUT_MS = 3000;
