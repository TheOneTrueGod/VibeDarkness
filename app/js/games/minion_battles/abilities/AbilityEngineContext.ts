import type { Unit } from '../objects/Unit';
import type { Effect } from '../objects/Effect';
import type { EventBus } from '../game/EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';

/**
 * Shared engine context for ability implementations.
 * Replaces per-file `GameEngineLike` interfaces with a single shared type.
 * Abilities needing extra engine methods can extend via intersection.
 */
export interface AbilityEngineContext {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    generateRandomInteger(min: number, max: number): number;
    terrainManager?: TerrainManager | null;
}
