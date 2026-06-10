import { Effect } from '../effects/Effect';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { DeathEffect } from './DeathEffect';
import { DARK_CREATURE_ICON_DEATH_DURATION_SECONDS } from './darkCreatureVisualConstants';
import { spawnDarkCreatureDeathParticle } from './spawnDarkCreatureDeathParticle';

/** Fast icon flash + upward purple particles; shared by small dark creatures. */
export class DarkCreatureIconDeathEffect extends DeathEffect {
    constructor(private readonly particleCount: number) {
        super();
    }

    doEffect(engine: GameEngine, unit: Unit): void {
        const characterSpriteKey = unit.characterId;
        const displayRadius = unit.radius;

        engine.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
                effectType: 'DarkCreatureIconDeath',
                effectData: { characterSpriteKey, displayRadius },
            }),
        );

        const budget = Math.max(0, Math.floor(this.particleCount));
        for (let i = 0; i < budget; i++) {
            spawnDarkCreatureDeathParticle(engine, unit, i, budget);
        }
    }
}
