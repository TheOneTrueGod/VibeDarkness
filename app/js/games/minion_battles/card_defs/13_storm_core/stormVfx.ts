/**
 * Storm Core visual language, shared by every 13xx card so the tree reads as one family:
 * electric-cyan bolts with a white-hot core, storm-blue mass, and small spark bursts on every hit.
 * Spawners only add visual Effects (never engine RNG); colours come from the Storm theme.
 */
import type { VisualEffectDef } from '../../game/effects/visualEffectDef';
import { Effect } from '../../game/effects/Effect';
import {
    LIGHTNING_BOLT_EFFECT_TYPE,
    STORM_SPARK_EFFECT_TYPE,
    type LightningBoltEffectData,
    type StormSparkEffectData,
} from '../../game/effect_defs/stormEffects';
import { STORM_CORE_WHITE, STORM_PRIMARY, STORM_SECONDARY } from './stormConstants';

interface EffectSink {
    addEffect?(effect: Effect): void;
}

type Point = { x: number; y: number };

export interface StormBoltOpts {
    delay?: number;
    duration?: number;
    width?: number;
    forks?: number;
    fromUnitId?: string;
    toUnitId?: string;
    jitter?: number;
    maxJitterPx?: number;
}

export function spawnStormBolt(engine: EffectSink, from: Point, to: Point, opts: StormBoltOpts = {}): void {
    const data: LightningBoltEffectData = {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        color: STORM_SECONDARY,
        coreColor: STORM_CORE_WHITE,
        width: opts.width ?? 2,
        forks: opts.forks ?? 2,
        ...(opts.fromUnitId ? { fromUnitId: opts.fromUnitId } : {}),
        ...(opts.toUnitId ? { toUnitId: opts.toUnitId } : {}),
        ...(opts.jitter !== undefined ? { jitter: opts.jitter } : {}),
        ...(opts.maxJitterPx !== undefined ? { maxJitterPx: opts.maxJitterPx } : {}),
    };
    engine.addEffect?.(new Effect({
        x: from.x,
        y: from.y,
        duration: opts.duration ?? 0.3,
        effectType: LIGHTNING_BOLT_EFFECT_TYPE,
        ...(opts.delay ? { delay: opts.delay } : {}),
        effectData: { ...data },
    }));
}

export interface StormSparkOpts {
    radius?: number;
    count?: number;
    delay?: number;
    duration?: number;
}

export function spawnStormSpark(engine: EffectSink, at: Point, opts: StormSparkOpts = {}): void {
    const data: StormSparkEffectData = {
        color: STORM_SECONDARY,
        coreColor: STORM_CORE_WHITE,
        radius: opts.radius ?? 18,
        count: opts.count ?? 6,
    };
    engine.addEffect?.(new Effect({
        x: at.x,
        y: at.y,
        duration: opts.duration ?? 0.28,
        effectType: STORM_SPARK_EFFECT_TYPE,
        ...(opts.delay ? { delay: opts.delay } : {}),
        effectData: { ...data },
    }));
}

/** Storm-blue shock ring (the shared `Explosion` def) for area hits. */
export function spawnStormRing(
    engine: EffectSink,
    at: Point,
    radius: number,
    direction: 'expand' | 'contract',
    duration: number,
): void {
    engine.addEffect?.(new Effect({
        x: at.x,
        y: at.y,
        duration,
        effectType: 'Explosion',
        effectRadius: radius,
        effectProperties: direction === 'expand'
            ? { radius, color: STORM_PRIMARY, direction: 'expand' }
            : { direction: 'contract', shape: 'ring', color: STORM_SECONDARY, radius, endRadius: 6 },
    }));
}

/** Hit burst for projectile impacts (`onProjectileHit`). */
export function stormSparkOnHit(radius = 18, count = 7): VisualEffectDef {
    return {
        type: 'effect',
        effectType: STORM_SPARK_EFFECT_TYPE,
        effectData: { color: STORM_SECONDARY, coreColor: STORM_CORE_WHITE, radius, count },
        duration: 0.28,
        position: 'target',
    };
}

