/**
 * EngineContext - Minimal interface that managers use to reference the engine
 * without a direct dependency on the full GameEngine class.
 *
 * GameEngine implements this interface and passes itself (as EngineContext)
 * to each manager's constructor.
 */

import type { EventBus } from './EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { Unit } from './units/Unit';
import type { Effect } from './effects/Effect';
import type { Projectile } from './projectiles/Projectile';
import type { SpecialTile } from './specialTiles/SpecialTile';
import type { LightSource } from './LightGrid';

export interface EngineContext {
    gameTime: number;
    gameTick: number;
    roundNumber: number;

    readonly eventBus: EventBus;
    terrainManager: TerrainManager | null;

    lightLevelEnabled: boolean;
    globalLightLevel: number;
    aiControllerId: string | null;

    generateRandomNumber(): number;
    generateRandomInteger(min: number, max: number): number;

    getWorldWidth(): number;
    getWorldHeight(): number;

    readonly units: Unit[];
    readonly effects: Effect[];
    readonly specialTiles: SpecialTile[];

    addUnit(unit: Unit): void;
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    getUnit(id: string): Unit | undefined;
    getAllies(caster: Unit): Unit[];
    damageSpecialTile(tileId: string, amount: number): boolean;
    getCrystalProtectedSet(): Set<string>;
    getCrystalProtectionMap(): Map<string, number>;

    getAllLightSources(): LightSource[];
}
