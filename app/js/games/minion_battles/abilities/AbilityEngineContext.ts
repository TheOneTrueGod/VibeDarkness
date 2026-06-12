import type { Unit } from '../game/units/Unit';
import type { Effect } from '../game/effects/Effect';
import type { EventBus } from '../game/EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { Projectile } from '../game/projectiles/Projectile';
import type { SpawnSource, ResolvedTarget } from '../game/types';

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
    gameTick?: number;
    roundNumber?: number;
    eventBus: EventBus;
    generateRandomInteger(min: number, max: number): number;
    requestHitPause?(frames: number): void;
    terrainManager?: TerrainManager | null;
    addUnit?(unit: Unit, spawnSource?: SpawnSource): void;
    /** The local player's id — used by tooltip helpers that have no caster. */
    localPlayerId?: string;
    /** Look up which research nodes a player has unlocked in a given tree. */
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    /** Interrupt a unit mid-cast and refund any queued abilities. */
    interruptUnitAndRefundAbilities?(unit: Unit): void;
    /** Order queue — available on the full GameEngine, optional for test stubs. */
    state?: {
        orderMgr: {
            queueOrder(
                atTick: number,
                order: { unitId: string; abilityId: string; targets: ResolvedTarget[] },
            ): void;
        };
    };
}
