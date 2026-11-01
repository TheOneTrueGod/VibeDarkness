/**
 * ArcSweep — a whirlwind around the caster. Over its window it lays down `segments` arc segments
 * one after another, each `segmentSeconds` apart, turning around the caster. Each segment is both
 * a fading effect (`ArcSegmentFade`: `colorFrom` to `colorTo`, `alphaFrom` to `alphaTo` over
 * `segmentLifetime`) and a hitbox (`ArcSegmentHitbox`), so units are struck as the drawn arc reaches
 * them. A unit is struck at most once per origin, and each origin strikes at most `maxTargets`.
 *
 * The caster's sweep follows the caster. With `echo`, the caster's tokens of that type are read and
 * destroyed on the first tick, and the same sweep turns around each of their positions.
 * `onStart` runs after that read, so a token it drops does not echo.
 *
 * The window should be `sweepSeconds(config)` long. Segments count from the first tick, one per
 * `segmentSeconds`; any still unfired on the last tick all fire then.
 * State lives in the behaviour payload (plain JSON), so checkpoints mid-sweep resume it.
 */

import type { Unit } from '../../game/units/Unit';
import type { HitboxEngineContext } from '../../hitboxes/Hitbox';
import { getUnitsInArcSegment, type ArcSegment } from '../../hitboxes/ArcSegmentHitbox';
import { Effect } from '../../game/effects/Effect';
import { ARC_SEGMENT_EFFECT_TYPE } from '../../game/effect_defs/arcSegmentEffects';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import { landAreaStrike, type AreaStrikeSpec } from '../areaStrike';
import { consumeEchoTokens, findEchoTokens, type EchoSpec } from '../echo/echo';

export interface ArcSweepVisual {
    colorFrom: number;
    colorTo: number;
    /** Default 0.9. */
    alphaFrom?: number;
    /** Default 0. */
    alphaTo?: number;
}

export interface ArcSweepConfig {
    /** Inner edge around the caster. A function reads the caster (e.g. to clear its body). */
    innerRadius: number | ((caster: Unit) => number);
    /** Inner edge around an echo token, which has no body to clear. Default 0. */
    echoInnerRadius?: number;
    outerRadius: number;
    /** Segments in the whole sweep. */
    segments: number;
    /** Full turns the sweep makes. Default 1. */
    turns?: number;
    /** Seconds between segments. */
    segmentSeconds: number;
    /** Seconds each segment stays drawn. */
    segmentLifetime: number;
    /** 1 turns clockwise on screen, -1 the other way. Default 1. */
    direction?: 1 | -1;
    /** Radians of the first segment's leading edge. Default 0 (screen right). */
    startAngle?: number;
    /** Units each origin can strike. Omitted: no cap. */
    maxTargets?: number;
    strike: AreaStrikeSpec;
    visual: ArcSweepVisual;
    echo?: EchoSpec;
    onStart?: (ctx: CastBehaviourTickContext) => void;
}

interface SweepOrigin {
    /** Follows the caster; otherwise the fixed `x`/`y`. */
    followCaster: boolean;
    x: number;
    y: number;
    hitIds: string[];
}

interface ArcSweepPayload {
    fired: number;
    /** Window seconds at the first tick. Segments count from here, so a late first tick does not bunch them. */
    startElapsed: number;
    origins: SweepOrigin[];
}

/**
 * Spare steps at the end of the window. The first tick of a window can cover more than one step
 * (a tick split at the window edge), and the sweep counts from that tick, so it needs the room.
 */
export const ARC_SWEEP_SLACK_STEPS = 2;

/** Window length for `config`: one step per segment plus {@link ARC_SWEEP_SLACK_STEPS}. */
export function sweepSeconds(config: Pick<ArcSweepConfig, 'segments' | 'segmentSeconds'>): number {
    return (config.segments + ARC_SWEEP_SLACK_STEPS) * config.segmentSeconds;
}

/** Geometry of segment `index` around `origin`. */
export function arcSweepSegment(
    config: ArcSweepConfig,
    caster: Unit,
    origin: { x: number; y: number },
    index: number,
    isEcho = false,
): ArcSegment {
    const step = ((Math.PI * 2 * (config.turns ?? 1)) / config.segments) * (config.direction ?? 1);
    const inner = isEcho
        ? (config.echoInnerRadius ?? 0)
        : typeof config.innerRadius === 'function' ? config.innerRadius(caster) : config.innerRadius;
    return {
        x: origin.x,
        y: origin.y,
        innerRadius: inner,
        outerRadius: config.outerRadius,
        startAngle: (config.startAngle ?? 0) + step * index,
        sweepAngle: step,
    };
}

export class ArcSweepBehaviour implements CastBehaviour {
    constructor(private readonly config: ArcSweepConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        const elapsed = ctx.windowProgress * sweepSeconds(this.config);
        let payload = ctx.behaviourPayload as ArcSweepPayload | undefined;
        if (!payload) {
            payload = this.start(ctx, elapsed);
        }
        const steps = (elapsed - payload.startElapsed) / this.config.segmentSeconds;
        const due = ctx.isLastTick
            ? this.config.segments
            : Math.min(this.config.segments, Math.floor(steps + 1e-6) + 1);
        for (let index = payload.fired; index < due; index++) {
            for (const origin of payload.origins) this.fireSegment(ctx, origin, index);
        }
        payload.fired = Math.max(payload.fired, due);
        ctx.setBehaviourPayload(payload);
    }

    private start(ctx: CastBehaviourTickContext, elapsed: number): ArcSweepPayload {
        const tokens = this.config.echo ? findEchoTokens(ctx.engine, ctx.caster, this.config.echo) : [];
        consumeEchoTokens(ctx.engine, tokens);
        this.config.onStart?.(ctx);
        return {
            fired: 0,
            startElapsed: elapsed,
            origins: [
                { followCaster: true, x: ctx.caster.x, y: ctx.caster.y, hitIds: [] },
                ...tokens.map((token) => ({ followCaster: false, x: token.x, y: token.y, hitIds: [] })),
            ],
        };
    }

    private fireSegment(ctx: CastBehaviourTickContext, origin: SweepOrigin, index: number): void {
        const at = origin.followCaster ? { x: ctx.caster.x, y: ctx.caster.y } : { x: origin.x, y: origin.y };
        const segment = arcSweepSegment(this.config, ctx.caster, at, index, !origin.followCaster);
        const visual = this.config.visual;
        ctx.engine.addEffect(new Effect({
            x: at.x,
            y: at.y,
            duration: this.config.segmentLifetime,
            effectType: ARC_SEGMENT_EFFECT_TYPE,
            // Game time, so a pause freezes the whole whirl rather than fading its tail.
            timeDomain: 'world',
            effectData: {
                innerRadius: segment.innerRadius,
                outerRadius: segment.outerRadius,
                startAngle: segment.startAngle,
                sweepAngle: segment.sweepAngle,
                colorFrom: visual.colorFrom,
                colorTo: visual.colorTo,
                alphaFrom: visual.alphaFrom ?? 0.9,
                alphaTo: visual.alphaTo ?? 0,
            },
        }));

        const cap = this.config.maxTargets ?? Infinity;
        if (origin.hitIds.length >= cap) return;
        const candidates = getUnitsInArcSegment(ctx.engine as unknown as HitboxEngineContext, ctx.caster, segment)
            .filter((unit) => !origin.hitIds.includes(unit.id))
            .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y) || (a.id < b.id ? -1 : 1));
        for (const unit of candidates) {
            if (origin.hitIds.length >= cap) break;
            origin.hitIds.push(unit.id);
            landAreaStrike(ctx.engine, ctx.caster, ctx.abilityId, at, unit, this.config.strike);
        }
    }
}

export function arcSweep(config: ArcSweepConfig): ArcSweepBehaviour {
    return new ArcSweepBehaviour(config);
}
