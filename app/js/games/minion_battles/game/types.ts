/**
 * Engine-level types for the battle system.
 */

import type { EnemySpawnDef } from '../storylines/types';
import type { SerializedStoneTileMutation } from '../terrain/TerrainGrid';

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
        return { waiters, atTick };
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
    /** Runtime terrain mutations (rock durability/state transitions). */
    terrainStoneMutations?: SerializedStoneTileMutation[];
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
    /** Stored per-tile light levels (quadrant-organized). */
    lightTileGrid?: { w: number; h: number; q: number[][] } | null;
    /** Active bramble slow zones. */
    bramblePatches?: Record<string, unknown>[];
    /** Map POIs (nest sites, etc.) used for networked lanternite spawning. */
    mapPOIs?: import('../terrain/segmentSchema').MapSegmentPOI[];
    /** Serialized effect emitters (runtime-only factories not included; short-lived, safe to drop on reconnect). */
    effectEmitters?: Record<string, unknown>[];
    /** Value of the global generateGameObjectId counter at snapshot time. Restored on load so replayed effects/projectiles get identical IDs. */
    nextObjectId?: number;
}

/** Optional args when hydrating {@link GameEngine} from JSON (e.g. server checkpoint `synchash`). */
export interface GameEngineFromJSONOpts {
    checkpointRuntimeFingerprintHex?: string | null;
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

/** An order submitted by a player (or AI) for a unit's turn. */
export interface BattleOrder {
    unitId: string;
    abilityId: string;
    targets: ResolvedTarget[];
    /** Grid-cell path for movement (from pathfinding). Null clears movement. */
    movePath?: { col: number; row: number }[] | null;
    /**
     * Named targets from per-timing `SelectTargetDef` entries (new-style abilities).
     * Keyed by `SelectTargetDef.label`. NOT serialized into checkpoints — runtime only.
     * Coexists with `targets[]` for backward compatibility.
     */
    targetsByLabel?: Record<string, ResolvedTarget>;
}

/** An order scheduled to be applied at a specific game tick. */
export interface OrderAtTick {
    gameTick: number;
    order: BattleOrder;
}

/** A resolved target from the targeting system. */
export interface ResolvedTarget {
    type: 'player' | 'unit' | 'pixel';
    unitId?: string;
    playerId?: string;
    position?: { x: number; y: number };
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
    /** Set by one-shot abilities when their effect has fired (prevents duplicate triggers). */
    fired?: boolean;
    /**
     * Ability-specific snapshot set once in `beginActiveCast` (e.g. charge lunge vectors).
     * Prefer this over inferring setup from `doCardEffect` phase boundaries. Serialized with checkpoints.
     */
    castPayload?: unknown;
    /** Per-behaviour per-cast runtime state. Keyed by `${intervalId}_${behaviourIndex}`. NOT serialized. */
    castBehaviourPayloads?: Record<string, unknown>;
    /**
     * Named targets collected via per-timing `SelectTargetDef` entries, keyed by
     * `SelectTargetDef.label`. Coexists with (and never replaces) `targets[]`.
     * NOT serialized.
     */
    targetsByLabel?: Record<string, ResolvedTarget>;
    /** Guards legacy evade-break firing to once per cast. NOT serialized. */
    evadeFired?: boolean;
}
