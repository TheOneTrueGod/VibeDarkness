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

/** Serialized game state for server sync. */
export interface SerializedGameState {
    gameTime: number;
    roundNumber: number;
    snapshotIndex: number;
    units: Record<string, unknown>[];
    projectiles: Record<string, unknown>[];
    effects: Record<string, unknown>[];
    cards: Record<string, SerializedCardInstance[]>;
    waitingForOrders: WaitingForOrders | null;
}

/** Serialized card instance. */
export interface SerializedCardInstance {
    cardDefId: string;
    abilityId: string;
    location: 'hand' | 'deck' | 'exile';
    exileRounds: number;
}

/** An order submitted by a player (or AI) for a unit's turn. */
export interface BattleOrder {
    unitId: string;
    abilityId: string;
    targets: ResolvedTarget[];
    /** Optional move target set by right-click; unit walks here at its speed. */
    moveTarget?: { x: number; y: number } | null;
    /** Pre-computed pathfinding waypoints for the move target. */
    moveWaypoints?: { x: number; y: number }[];
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
