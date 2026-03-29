/**
 * Engine-level types for the battle system.
 */

import type { TeamId } from './teams';
import type { AISettings } from '../objects/Unit';

/** Snapshot of engine timing state. */
export interface GameTime {
    /** Total elapsed game time in seconds (only advances when unpaused). */
    elapsed: number;
    /** Current round number (1-based). */
    roundNumber: number;
    /** Progress through the current round (0..1). */
    roundProgress: number;
}

/** Information about which unit the engine is waiting on. */
export interface WaitingForOrders {
    unitId: string;
    ownerId: string;
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
    effects: Record<string, unknown>[];
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
    /** Host-computed state hash from last snapshot (optional; restored on load for sync). */
    synchash?: string;
}

/** Serialized card instance. */
export interface SerializedCardInstance {
    instanceId?: string;
    cardDefId: string;
    abilityId: string;
    location: 'hand' | 'deck' | 'discard';
    /** Remaining uses before discard. Default 1 if omitted (legacy). */
    durability?: number;
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

/** Configuration for spawning a unit at battle start. */
export interface UnitSpawnConfig {
    characterId: string;
    name: string;
    hp: number;
    speed: number;
    position: { x: number; y: number };
    teamId: TeamId;
    ownerId: string; // playerId or 'ai'
    abilities: string[];
    /** AI behavior settings (range preferences, etc.). */
    aiSettings?: AISettings;
    /** Visual/collision radius. Omitted uses unit default for that character. */
    radius?: number;
}

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
}
