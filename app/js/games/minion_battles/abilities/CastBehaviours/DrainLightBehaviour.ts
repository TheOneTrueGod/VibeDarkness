/**
 * DrainLight: the caster drinks one light.
 *
 * - At setup it picks the nearest lit light (special tile or free light source, never `DarkLight`, within
 *   `range` px when given) and stores it in the behaviour payload (plain JSON), so a save/load mid-window keeps
 *   the same light.
 * - From setup, a render-only stream effect flows from the light to the caster for the window.
 * - On the window's last tick it drains `amount` from the picked light. If another drinker put that light out
 *   meanwhile, it drains the nearest lit one instead. A light drained to 0 is out for good.
 * - Does nothing when no light is lit. An interrupted cast drains nothing.
 */

import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { Effect } from '../../game/effects/Effect';
import { LIGHT_STREAM_EFFECT_TYPE, type LightStreamEffectData } from '../../game/effects/lightStream';
import {
    drainPickedLight,
    findNearestLitLight,
    type DrainLightTarget,
    type LightDrainEngine,
} from '../lightDrain';

export interface DrainLightConfig {
    /** Light strength removed per drain. */
    amount: number;
    target: 'nearestLit';
    /** Only lights within this many px of the caster; absent = any range. */
    range?: number;
    /** Stream colour. */
    stream?: { color: number };
}

const DEFAULT_STREAM_COLOR = 0xe9d5ff;

interface DrainLightPayload {
    picked: DrainLightTarget | null;
}

export class DrainLightBehaviour implements CastBehaviour {
    constructor(private readonly config: DrainLightConfig) {}

    onSetup(ctx: CastBehaviourSetupContext): void {
        const eng = ctx.engine as unknown as LightDrainEngine;
        const picked = findNearestLitLight(eng, ctx.caster, this.config.range);
        const payload: DrainLightPayload = { picked };
        ctx.setBehaviourPayload(payload);
        if (!picked) return;
        const data: LightStreamEffectData = {
            toX: ctx.caster.x,
            toY: ctx.caster.y,
            color: this.config.stream?.color ?? DEFAULT_STREAM_COLOR,
        };
        ctx.engine.addEffect(
            new Effect({
                x: picked.x,
                y: picked.y,
                duration: ctx.windowSeconds ?? 0.8,
                effectType: LIGHT_STREAM_EFFECT_TYPE,
                effectData: data,
            }),
        );
    }

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isLastTick) return;
        const payload = ctx.behaviourPayload as DrainLightPayload | undefined;
        if (!payload?.picked) return;
        const eng = ctx.engine as unknown as LightDrainEngine;
        if (drainPickedLight(eng, payload.picked, this.config.amount) !== null) return;
        const next = findNearestLitLight(eng, ctx.caster, this.config.range);
        if (next) drainPickedLight(eng, next, this.config.amount);
    }
}
