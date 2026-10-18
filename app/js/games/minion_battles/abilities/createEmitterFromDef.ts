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
import type { PauseBehaviour } from '../game/effects/pauseBehaviour';

/** Ability-timing emitters keep emitting while paused unless the def says otherwise. */
function resolveEmitterPauseBehaviour(def: AbilityTimingEmitterDef): PauseBehaviour {
    if (def.pauseBehaviour) return def.pauseBehaviour;
    if (def.mode === 'continuous' && def.emitWhilePaused === false) return 'hold';
    return 'continue';
}

/**
 * Resolve the effectType and effectData for an emitter def, applying spriteEffectId shorthand
 * when present: spriteEffectId sets effectType='SpriteEffect' and injects defId into effectData.
 */
function resolveEmitterEffectFields(def: AbilityTimingEmitterDef): { effectType: string; effectData: Record<string, unknown> } {
    if (def.spriteEffectId) {
        return {
            effectType: 'SpriteEffect',
            effectData: { defId: def.spriteEffectId, ...def.effectData },
        };
    }
    return {
        effectType: (def as { effectType?: string }).effectType ?? '',
        effectData: def.effectData ? { ...def.effectData } : {},
    };
}

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
        const { effectType, effectData } = resolveEmitterEffectFields(def);
        return new OneShotEmitter({
            x: config.x,
            y: config.y,
            attachedToUnitId: config.attachedToUnitId,
            timeDomain: def.timeDomain,
            ownerActorId: config.attachedToUnitId,
            pauseBehaviour: resolveEmitterPauseBehaviour(def),
            factory: (emitter) => {
                const effects: Effect[] = [];
                for (let i = 0; i < count; i++) {
                    effects.push(new Effect({
                        x: emitter.x,
                        y: emitter.y,
                        duration: def.effectDuration ?? 1,
                        effectType,
                        effectData: { ...effectData },
                        effectProperties: def.effectProperties,
                        timeDomain: def.timeDomain,
                        ownerActorId: config.attachedToUnitId,
                    }));
                }
                return effects;
            },
        });
    }

    if (def.mode === 'interval') {
        const { effectType, effectData } = resolveEmitterEffectFields(def);
        return new IntervalEmitter({
            x: config.x,
            y: config.y,
            attachedToUnitId: config.attachedToUnitId,
            lifetime: config.lifetime,
            intervalSeconds: def.intervalSeconds,
            fireImmediately: def.fireImmediately,
            timeDomain: def.timeDomain,
            ownerActorId: config.attachedToUnitId,
            pauseBehaviour: resolveEmitterPauseBehaviour(def),
            factory: (emitter) => [
                new Effect({
                    x: emitter.x,
                    y: emitter.y,
                    duration: def.effectDuration ?? 1,
                    effectType,
                    effectRadius: def.effectRadius,
                    effectData: { ...effectData },
                    effectProperties: def.effectProperties,
                    timeDomain: def.timeDomain,
                    ownerActorId: config.attachedToUnitId,
                }),
            ],
        });
    }

    // mode === 'continuous'
    const { effectType, effectData } = resolveEmitterEffectFields(def);
    return new ContinuousEmitter({
        x: config.x,
        y: config.y,
        attachedToUnitId: config.attachedToUnitId,
        lifetime: config.lifetime,
        pauseBehaviour: resolveEmitterPauseBehaviour(def),
        emitIntervalFrames: def.emitIntervalFrames ?? 1,
        factory: (emitter: ContinuousEmitter, _posSnapshot: Map<string, Vec2>) => [
            new Effect({
                x: emitter.x,
                y: emitter.y,
                duration: def.effectDuration ?? 1,
                effectType,
                effectData: { ...effectData },
                effectProperties: def.effectProperties,
                timeDomain: def.timeDomain,
                ownerActorId: config.attachedToUnitId,
            }),
        ],
        timeDomain: def.timeDomain,
        ownerActorId: config.attachedToUnitId,
    });
}
