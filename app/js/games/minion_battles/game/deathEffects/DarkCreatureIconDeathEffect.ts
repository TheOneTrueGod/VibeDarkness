import { Effect } from '../effects/Effect';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { DeathEffect } from './DeathEffect';
import { DARK_CREATURE_ICON_DEATH_DURATION_SECONDS } from './darkCreatureVisualConstants';
import { IntervalEmitter } from '../effects/EffectEmitter';

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
        if (budget <= 0) return;

        const r = displayRadius > 0 ? displayRadius : 12;
        const x = unit.x;
        const y = unit.y;

        engine.addEffectEmitter(new IntervalEmitter({
            x,
            y,
            lifetime: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
            intervalSeconds: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS / budget,
            factory: () => [
                new Effect({
                    x: x + (engine.generateRandomNumber() * 2 - 1) * r * 0.35,
                    y: y + (engine.generateRandomNumber() * 2 - 1) * r * 0.35,
                    duration: 0.25,
                    effectType: 'ParticleImage',
                    effectData: {
                        imageKey: 'darkBlob',
                        vx: (engine.generateRandomNumber() * 2 - 1) * 0.8 * 55,
                        vy: -150 - engine.generateRandomNumber() * 120,
                        scale: 0.55 + engine.generateRandomNumber() * 0.45,
                    },
                }),
            ],
        }));
    }
}
