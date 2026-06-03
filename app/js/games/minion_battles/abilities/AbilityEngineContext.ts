import type { Unit } from '../game/units/Unit';
import type { Effect } from '../game/effects/Effect';
import type { EventBus } from '../game/EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { Projectile } from '../game/projectiles/Projectile';

/**
 * Shared engine context for ability implementations.
 * Replaces per-file `GameEngineLike` interfaces with a single shared type.
 * Abilities needing extra engine methods can extend via intersection.
 */
export interface AbilityEngineContext {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    generateRandomInteger(min: number, max: number): number;
    requestHitPause?(frames: number): void;
    terrainManager?: TerrainManager | null;
}
