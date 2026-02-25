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

/** Serialized special tile (e.g. DefendPoint with current HP). */
export interface SerializedSpecialTile {
    id: string;
    defId: string;
    col: number;
    row: number;
    hp: number;
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
}

/** Serialized card instance. */
export interface SerializedCardInstance {
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
}
