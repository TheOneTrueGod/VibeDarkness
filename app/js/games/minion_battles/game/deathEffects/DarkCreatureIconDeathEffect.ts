import { Effect } from '../effects/Effect';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { DeathEffect } from './DeathEffect';
import { DARK_CREATURE_ICON_DEATH_DURATION_SECONDS } from './darkCreatureVisualConstants';

/** Fast icon flash + upward purple particles; shared by small dark creatures. */
export class DarkCreatureIconDeathEffect extends DeathEffect {
    constructor(private readonly particleCount: number) {
        super();
    }

    doEffect(engine: GameEngine, unit: Unit): void {
        /** Battle textures are keyed by `characterId` for all current enemies. */
        const characterSpriteKey = unit.characterId;
        const displayRadius = unit.radius;
        engine.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
                effectType: 'DarkCreatureIconDeath',
                effectData: {
                    characterSpriteKey,
                    displayRadius,
                    particleBudget: Math.max(0, Math.floor(this.particleCount)),
                    particleSpawned: 0,
                    particleAccum: 0,
                },
            }),
        );
    }
}
