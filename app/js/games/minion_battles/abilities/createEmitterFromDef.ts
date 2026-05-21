/**
 * createEmitterFromDef — factory that converts a declarative AbilityTimingEmitterDef
 * into a concrete EffectEmitter instance.
 *
 * The emitter position is seeded from the caster's position at instantiation time.
 * Pass attachedToUnitId so that the EffectEmitterManager can track the unit if needed.
 */

import { Effect } from '../game/effects/Effect';
import {
    OneShotEmitter,
    IntervalEmitter,
    ContinuousEmitter,
    type EffectEmitter,
    type Vec2,
} from '../game/effects/EffectEmitter';
import type { AbilityTimingEmitterDef } from './abilityTimings';

/**
 * Create an EffectEmitter from a declarative AbilityTimingEmitterDef.
 * The emitter's position is set to the caster's position at instantiation time.
 */
export function createEmitterFromDef(
    def: AbilityTimingEmitterDef,
    config: {
        x: number;
        y: number;
        attachedToUnitId?: string;
        /** Seconds; the timing window duration. Used as the emitter lifetime. */
        lifetime: number;
    },
): EffectEmitter {
    if (def.mode === 'instant') {
        const count = def.count ?? 1;
        return new OneShotEmitter({
            x: config.x,
            y: config.y,
            attachedToUnitId: config.attachedToUnitId,
            factory: (emitter) => {
                const effects: Effect[] = [];
                for (let i = 0; i < count; i++) {
                    effects.push(new Effect({
                        x: emitter.x,
                        y: emitter.y,
                        duration: 1,
                        effectType: def.effectType,
                        effectData: def.effectData ? { ...def.effectData } : {},
                    }));
                }
                return effects;
            },
        });
    }

    if (def.mode === 'interval') {
        return new IntervalEmitter({
            x: config.x,
            y: config.y,
            attachedToUnitId: config.attachedToUnitId,
            lifetime: config.lifetime,
            intervalSeconds: def.intervalSeconds,
            fireImmediately: def.fireImmediately,
            factory: (emitter) => [
                new Effect({
                    x: emitter.x,
                    y: emitter.y,
                    duration: 1,
                    effectType: def.effectType,
                    effectRadius: def.effectRadius,
                    effectData: def.effectData ? { ...def.effectData } : {},
                }),
            ],
        });
    }

    // mode === 'continuous'
    return new ContinuousEmitter({
        x: config.x,
        y: config.y,
        attachedToUnitId: config.attachedToUnitId,
        lifetime: config.lifetime,
        emitWhilePaused: def.emitWhilePaused ?? false,
        emitIntervalFrames: def.emitIntervalFrames ?? 1,
        factory: (emitter: ContinuousEmitter, _posSnapshot: Map<string, Vec2>) => [
            new Effect({
                x: emitter.x,
                y: emitter.y,
                duration: 1,
                effectType: def.effectType,
                effectData: def.effectData ? { ...def.effectData } : {},
            }),
        ],
    });
}
