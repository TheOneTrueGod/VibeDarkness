/**
 * Engine-level types for the battle system.
 */

import type { EnemySpawnDef } from '../storylines/types';
import type { LightTileGridJSON } from './lightTileGrid/LightTileGrid';

/**
 * Describes how a unit entered the battle, used to determine whether to play a spawn animation.
 * - `'darknessSpawn'`  — mid-battle wave or darkness spawn; plays the 0.5 s condensing animation.
 * - `'initialGameSpawn'` — placed at mission start; appears immediately with no animation.
 * - `'abilitySpawn'` — created by an ability; appears immediately; the ability provides its own VFX.
 * - `'nestSpawn'` — born from a lanternite nest; plays a 0.3 s grow-in scale animation.
 */
export type SpawnSource = 'darknessSpawn' | 'initialGameSpawn' | 'abilitySpawn' | 'nestSpawn';

/** Snapshot of engine timing state. */
export interface GameTime {
    /** Total elapsed game time in seconds (only advances when unpaused). */
    elapsed: number;
    /** Current round number (1-based). */
    roundNumber: number;
    /** Progress through the current round (0..1). */
    roundProgress: number;
}

/** One player-controlled unit that owes an order before the parallel batch can resume. */
export interface OrderWaiter {
    unitId: string;
    ownerId: string;
}

/**
 * Frozen set of units waiting for orders at this pause. All must queue orders at {@link atTick}
 * before the simulation unpauses.
 */
export interface WaitingForOrders {
    waiters: OrderWaiter[];
    /** Tick at which batch orders apply (usually `gameTick + 1` at pause time). */
    atTick: number;
    /**
     * Ephemeral: owners of player units whose casts were ended early by coop cooldown sync.
     * Omitted from checkpoints; used only for live UI (e.g. Teamwork burst).
     */
    teamworkCancelledOwnerIds?: string[];
}

/** Normalize checkpoint `waitingForOrders` (current shape or legacy `{ unitId, ownerId }`). */
export function normalizeWaitingForOrdersFromJSON(raw: unknown, gameTick: number): WaitingForOrders | null {
    if (raw == null) return null;
    if (typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const atFallback = gameTick + 1;
    if (Array.isArray(o.waiters)) {
        const waiters: OrderWaiter[] = [];
        for (const w of o.waiters) {
            if (w && typeof w === 'object') {
                const rec = w as Record<string, unknown>;
                if (typeof rec.unitId === 'string' && typeof rec.ownerId === 'string') {
                    waiters.push({ unitId: rec.unitId, ownerId: rec.ownerId });
                }
            }
        }
        if (waiters.length === 0) return null;
        const atTick = typeof o.atTick === 'number' ? o.atTick : atFallback;
        waiters.sort((a, b) =>
            a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
        );
        const result: WaitingForOrders = { waiters, atTick };
        return result;
    }
    if (typeof o.unitId === 'string' && typeof o.ownerId === 'string') {
        return {
            waiters: [{ unitId: o.unitId, ownerId: o.ownerId }],
            atTick: typeof o.atTick === 'number' ? o.atTick : atFallback,
        };
    }
    return null;
}

/** Serialized special tile (e.g. Campfire with current HP). */
export interface SerializedSpecialTile {
    id: string;
    defId: string;
    col: number;
    row: number;
    hp: number;
    /** If true, AI treats this as a defend point. */
    defendPoint?: boolean;
}

/** Serialized game state for server sync. */
export interface SerializedGameState {
    /** Deterministic RNG seed (host-generated before initial sync). */
    randomSeed?: number;
    /**
     * Human player-character roster size at mission start (not pets/summons).
     * Frozen for the whole battle. Omitted on legacy checkpoints — restored by counting
     * player characters present in the snapshot.
     */
    enemyScalingPlayerCount?: number;
    gameTime: number;
    gameTick: number;
    roundNumber: number;
    snapshotIndex: number;
    units: Record<string, unknown>[];
    projectiles: Record<string, unknown>[];
    cards: Record<string, SerializedCardInstance[]>;
    waitingForOrders: WaitingForOrders | null;
    /** Orders scheduled for future ticks (included in checkpoints). */
    orders?: OrderAtTick[];
    /** Special tiles (defend points, etc.) with runtime state. */
    specialTiles?: SerializedSpecialTile[];
    /** AI controller ID for enemy units (e.g. 'legacy', 'defensePoints'). Omitted => legacy. */
    aiControllerId?: string | null;
    /** Indices of one-shot level events that have already fired (spawn waves). Restored on load to avoid re-spawning. */
    firedEventIndices?: number[];
    /** Indices of victory checks that have emitted their first message. */
    victoryCheckFirstEmitDone?: number[];
    /** For continuousSpawn: event index -> gameTime of last spawn (keys as strings in JSON). */
    continuousSpawnLastSpawnedAt?: Record<string, number>;
    /** Player research trees available during battle logic (playerId -> treeId -> researched node ids). */
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
    /**
     * Legacy layout digest only (older saves). Omitted from fresh `GameEngine.toJSON()` output.
     * Server checkpoint runtime hash lives on the snapshot envelope as `synchash`.
     */
    initialFingerprint?: string;
    /** True while a cinematic/gameplay-freeze sequence is active (e.g. boss death story beat). */
    storyPauseActive?: boolean;
    /** Optional tag for the active story pause sequence. */
    storyPauseReason?: string | null;
    /** Absolute gameTime when story pause should auto-end, if any. */
    storyPauseEndsAt?: number | null;
    /** Battle objective completion / reveal state (optional). */
    objectives?: { completedIds: string[]; revealedIds: string[] };
    /** Persistent in-game light sources (thrown torches, etc.). */
    lightSources?: Record<string, unknown>[];
    /** Stored per-tile light levels (quadrant-organized; legacy `q` or channels-v1). */
    lightTileGrid?: LightTileGridJSON | null;
    /** Ground/air terrain effect overlays (bramble, etc.). Legacy rock floor effects migrate on load. */
    terrainEffects?: Record<string, unknown>[];
    /** Sparse authoritative floor tile overrides (rock damage, rubble, summoned rock). */
    floorTiles?: import('./TerrainLayerManager').SerializedFloorTileEntry[];
    /** Map POIs (nest sites, etc.) used for networked lanternite spawning. */
    mapPOIs?: import('../terrain/segmentSchema').MapSegmentPOI[];
    /** Map zones (named regions resolvable to grid tiles) used by spawn behaviours and future triggers. */
    mapZones?: import('../terrain/segmentSchema').MapSegmentZone[];
    /**
     * `MapNetworkManager`'s serialized form. Deliberately empty today (see
     * `MapNetworkManager.toJSON`'s doc comment) — node/edge structure is always rebuilt fresh from
     * segment data on restore, never from this field. Kept optional/present for checkpoint
     * back-compat with pre-this-plan snapshots that omit it entirely.
     */
    mapNetwork?: import('./managers/mapNetwork/types').SerializedMapNetwork;
    /** Serialized effect emitters (runtime-only factories not included; short-lived, safe to drop on reconnect). */
    effectEmitters?: Record<string, unknown>[];
    /** Value of the global generateGameObjectId counter at snapshot time. Restored on load so replayed effects/projectiles get identical IDs. */
    nextObjectId?: number;
    /** Serialized AI group blackboards (strategic plans, unit membership, brain scheduling). */
    groups?: import('./units/unitAI/groups/types').SerializedGroup[];
    /** Active world modifier instance states (per-lifetime counters, disabled flag, dynamic defs). */
    worldModifiers?: import('../worldModifiers/types').SerializedWorldModifierInstance[];
    /**
     * Active DarknessStrength instance crumbs for late spawns after resync.
     * Defs are reattached from the static registry on restore.
     */
    activeDarknessStrengths?: import('../../../darknessStrength/types').DarknessStrengthInstance[];
    /** Serialized ninjutsu pool configs and runtime state (budget, delay). */
    ninjutsuPools?: import('./ninjutsu/NinjutsuPool').SerializedNinjutsuPool[];
    /**
     * Player NPC control assignments (groupId → playerId). Defs are runtime-only and
     * re-registered from the mission after restore; only the assignment map is checkpointed.
     */
    npcControlAssignments?: Record<string, string>;
    /**
     * Carried only by in-memory preview snapshots taken by InteractiveTargetingSession so
     * restore does not reset the runtime fingerprint; server checkpoints pass it out-of-band
     * via opts.
     */
    checkpointRuntimeFingerprintHex?: string;
    /**
     * Debug-only nested JS timings for the last completed game tick (ms). Present only when
     * Debug Console → JS performance tracking is enabled. Not restored on load; ignored by
     * fingerprint logic.
     */
    performanceLog?: import('./performance/tickPerformanceTracker').PerformanceLog;
}

/** Optional args when hydrating {@link GameEngine} from JSON (e.g. server checkpoint `synchash`). */
export interface GameEngineFromJSONOpts {
    checkpointRuntimeFingerprintHex?: string | null;
    /**
     * Mission terrain segment IDs, used to rebuild `mapNetworkManager`'s graph via
     * `getMissionSegmentNetwork`. Checkpoint restore paths (`BattleSession.loadFromSnapshot`/
     * `restoreFromInMemorySnapshot`) call `GameEngine.fromJSON` directly without re-running
     * `mission.initializeGameState`, so the network graph — never itself serialized, see
     * `SerializedGameState.mapNetwork` — would otherwise come back empty. Omit only when no
     * mission context is available (e.g. unit tests constructing bare snapshots); the manager then
     * harmlessly stays empty, matching pre-this-plan behavior.
     */
    segmentIds?: string[];
}

/** Serialized card instance. */
export interface SerializedCardInstance {
    instanceId?: string;
    cardDefId: string;
    abilityId: string;
    location: 'hand' | 'deck' | 'discard';
    /** Rounds remaining in discard (rounds-based). */
    discardRoundsRemaining?: number;
    /** Game time when added to discard (seconds-based). */
    discardAddedAtTime?: number;
}

/** Zero-frame special action riding beside the primary ability on a BattleOrder. */
export interface BattleOrderSpecialAction {
    abilityId: string;
    targets: ResolvedTarget[];
    /**
     * Named targets from select defs. Runtime / ITS carry-through; same caveats as
     * {@link BattleOrder.targetsByLabel}.
     */
    targetsByLabel?: Record<string, ResolvedTarget>;
}

/** An order submitted by a player (or AI) for a unit's turn. */
export interface BattleOrder {
    unitId: string;
    abilityId: string;
    targets: ResolvedTarget[];
    /** Grid-cell path for movement (from pathfinding). Null clears movement. */
    movePath?: { col: number; row: number }[] | null;
    /** Unit ID to pursue; the unit will re-pathfind toward this target as it moves. */
    moveTargetUnitId?: string;
    /** Exact world-pixel destination (CTRL+right-click); unit stops here instead of the tile centre. */
    moveTargetPixel?: { x: number; y: number };
    /**
     * Named targets from per-timing `SelectTargetDef` entries (new-style abilities).
     * Keyed by `SelectTargetDef.label`. NOT serialized into checkpoints — runtime only.
     * Coexists with `targets[]` for backward compatibility.
     */
    targetsByLabel?: Record<string, ResolvedTarget>;
    /**
     * Per-label movement re-input collected during interactive preview.
     * Keyed by `SelectTargetDef.label`. Non-lunge: applied when that select interval
     * fires. Lunge: held until cooldown entry, then repathed from the post-lunge cell.
     * NOT serialized into checkpoints — runtime only.
     */
    movementByLabel?: Record<string, {
        movePath: { col: number; row: number }[];
        moveTargetUnitId?: string;
        moveTargetPixel?: { x: number; y: number };
    }>;
    /**
     * Optional zero-frame special (e.g. Order: Attack). Applied without occupying
     * `activeAbilities`; may coexist with a primary `abilityId` / wait.
     */
    specialAction?: BattleOrderSpecialAction;
    /** When true, this order ends the unit's turn and allows the parallel batch to resume. */
    endTurn?: boolean;
    /** Per-cast ability mode committed at order time (e.g. push/pull). Serialized with orders. */
    abilityMode?: string;
}

/** An order scheduled to be applied at a specific game tick. */
export interface OrderAtTick {
    gameTick: number;
    order: BattleOrder;
}

/** @deprecated Legacy ITS sentinel — no longer broadcast; kept for stale peer plans. */
export const GHOST_PLAN_SEQUENTIAL_TARGETING_REBROADCAST_MS = 1000;

/** @deprecated Legacy ITS sentinel TTL — see `isLegacySequentialTargetingSentinel`. */
export const GHOST_PLAN_SEQUENTIAL_TARGETING_STALE_MS = 5000;

/** A peer player's in-progress ability selection, shared via WebRTC for ghost preview rendering. */
export interface GhostPlanData {
    unitId: string;
    abilityId: string;
    currentTargets: ResolvedTarget[];
    mouseWorld: { x: number; y: number };
    /**
     * @deprecated Legacy sentinel (`sequentialTargeting: true`). No longer sent; receivers ignore
     * for render/hold. Peers plan independently while another client is in ITS playahead.
     */
    sequentialTargeting?: boolean;
    /** @deprecated Legacy sentinel timestamp. */
    sentAtMs?: number;
}

/**
 * @deprecated Legacy peer-blocking sentinel consumer — ignore sentinels for render only.
 * @see isLegacySequentialTargetingSentinel in `ghostPlanRenderPolicy.ts`
 */
export function isFreshSequentialTargetingSentinel(
    plan: GhostPlanData | null | undefined,
    firstSeenWithoutTimestampMs: number | undefined,
    nowMs: number = Date.now(),
): boolean {
    if (plan?.sequentialTargeting !== true) {
        return false;
    }
    if (plan.sentAtMs != null) {
        return nowMs - plan.sentAtMs <= GHOST_PLAN_SEQUENTIAL_TARGETING_STALE_MS;
    }
    if (firstSeenWithoutTimestampMs == null) {
        return true;
    }
    return nowMs - firstSeenWithoutTimestampMs <= GHOST_PLAN_SEQUENTIAL_TARGETING_STALE_MS;
}

/** A resolved target from the targeting system. */
export interface ResolvedTarget {
    type: 'player' | 'unit' | 'pixel';
    unitId?: string;
    playerId?: string;
    position?: { x: number; y: number };
    /**
     * When set on a unit lock-on, distinguishes primary select hitbox commits from
     * `SelectTargetDef.companionHitboxes` commits in `order.targets`.
     * Omitted / `'primary'` = primary; `'companion'` is ignored by MeleeAttack tether.
     */
    lockRole?: 'primary' | 'companion';
}

/** Enemy placement at battle start: mission `EnemySpawnDef` plus owner. Baseline hp/speed resolved from unit defs when omitted. */
export type UnitSpawnConfig = EnemySpawnDef & { ownerId: string };

/** An ability actively being executed by a unit (tracked for tick-based effects). */
export interface ActiveAbility {
    /** The ability being used. */
    abilityId: string;
    /** Game time when the ability was activated. */
    startTime: number;
    /** Resolved targets for this ability. */
    targets: ResolvedTarget[];
    /**
     * Set by one-shot abilities when their effect has fired (prevents duplicate triggers).
     * @legacy TODO: remove when doCardEffect abilities are ported to CastBehaviours
     */
    fired?: boolean;
    /**
     * Ability-specific snapshot set once in `beginActiveCast` (e.g. charge lunge vectors).
     * Prefer this over inferring setup from `doCardEffect` phase boundaries. Serialized with checkpoints.
     */
    castPayload?: unknown;
    /**
     * Committed per-cast mode from the BattleOrder (e.g. push/pull). Serialized with checkpoints
     * so mid-cast recovery preserves the mode behaviours read via ctx.abilityMode.
     */
    abilityMode?: string;
    /** Per-behaviour per-cast runtime state. Keyed by `${intervalId}_${behaviourIndex}`. NOT serialized. */
    castBehaviourPayloads?: Record<string, unknown>;
    /**
     * Named targets collected via per-timing `SelectTargetDef` entries, keyed by
     * `SelectTargetDef.label`. Coexists with (and never replaces) `targets[]`.
     * NOT serialized.
     */
    targetsByLabel?: Record<string, ResolvedTarget>;
    /**
     * Per-label movement re-input from `BattleOrder.movementByLabel`.
     * Non-lunge: applied when that select interval fires.
     * Lunge: applied (repathed) when cooldown begins. Serialized for mid-cast checkpoints.
     */
    movementByLabel?: Record<string, {
        movePath: { col: number; row: number }[];
        moveTargetUnitId?: string;
        moveTargetPixel?: { x: number; y: number };
    }>;
    /**
     * Guards legacy evade-break firing to once per cast. NOT serialized.
     * @legacy TODO: remove when all evade abilities use declarative evadeEffect intervals
     */
    evadeFired?: boolean;
    /**
     * Set by the conditionalCancel system when a condition fires on interval exit.
     * Prevents doCardEffect from running until the player resolves the decision.
     * Cleared when "wait" is chosen; ability is cancelled if an ability is chosen instead.
     * Serialized.
     */
    conditionalCancelPaused?: boolean;
    /**
     * One-shot cast behaviour setup keys already fired this cast (`${intervalId}_${bIdx}`).
     * Prevents duplicate onSetup when enteredTimingIds re-enters at prevElapsed === start.
     * NOT serialized.
     */
    setupFiredBehaviourKeys?: Set<string>;
    /**
     * Tag filter stored when conditionalCancelPaused is set — defines which abilities the player
     * may choose as a replacement. Undefined means any ability is valid. Serialized.
     */
    conditionalCancelTagFilter?: readonly string[];
    /**
     * Combo Cancel chain depth for this cast (starts at 1 on a fresh cast). Serialized.
     */
    comboCount?: number;
}
