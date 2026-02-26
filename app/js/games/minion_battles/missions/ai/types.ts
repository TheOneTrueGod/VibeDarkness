/**
 * AI controller types for unit AI behavior.
 * Controllers are stateless; all persistent data lives in game state (units, serialized).
 */

import type { Unit } from '../../objects/Unit';
import type { BattleOrder } from '../../engine/types';
import type { SpecialTile } from '../../objects/SpecialTile';

/** Read-only context passed to AI controllers. Engine provides implementation. */
export interface AIContext {
    gameTick: number;
    getUnit(id: string): Unit | undefined;
    getUnits(): Unit[];
    getSpecialTiles(): SpecialTile[];
    getAliveDefendPoints(): SpecialTile[];
    terrainManager: { grid: { worldToGrid: (x: number, y: number) => { col: number; row: number }; gridToWorld: (col: number, row: number) => { x: number; y: number } }; findGridPath: (fromCol: number, fromRow: number, toCol: number, toRow: number) => { col: number; row: number }[] | null } | null;
    queueOrder(atTick: number, order: BattleOrder): void;
    emitTurnEnd(unitId: string): void;
    generateRandomInteger(min: number, max: number): number;
    WORLD_WIDTH: number;
    WORLD_HEIGHT: number;
    /** True if the line between two world positions does not pass through obstructed terrain (e.g. rock). */
    hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean;
}

/**
 * Stateless AI controller for a mission. All state is on units or in serialized game state.
 * Implementations should reuse logic from utils where possible.
 */
export interface UnitAIController {
    /** Execute one AI turn for the unit. Queue order(s) and emit turn_end. */
    executeTurn(unit: Unit, context: AIContext): void;
    /**
     * Optional: called when gameTick % unit.pathfindingRetriggerOffset === 0 for AI units.
     * Use to refresh path to current target (e.g. move toward enemy or defend point).
     */
    onPathfindingRetrigger?(unit: Unit, context: AIContext): void;
}
