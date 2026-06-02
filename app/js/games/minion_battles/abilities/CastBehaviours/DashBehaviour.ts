/**
 * DashBehaviour — movement CastBehaviour for dash/dodge abilities.
 *
 * Moves the caster toward a pixel target over the full timing window, terrain-aware.
 * Optional afterimage trail: spawned here (not via emitterDef) because the trail
 * velocity is perpendicular to the dash direction, requiring runtime direction data.
 */

import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { getDirectionFromTo } from '../targetHelpers';
import { applyForcedDisplacementToward } from '../effectHelpers';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../game/units/unit_defs/unitDef';
import { Effect } from '../../game/effects/Effect';

const AFTERIMAGE_DURATION = 6 / 60;
const AFTERIMAGE_INITIAL_ALPHA = 0.75;

interface DashPayload {
    targetX: number;
    targetY: number;
    maxDistance: number;
    // Afterimage state — null when afterimages are disabled.
    afterimage: {
        bodyColor: number;
        radius: number;
        characterSpriteKey?: string;
        perpX: number; // unit vector perpendicular to dash direction
        perpY: number;
        tickCount: number;
    } | null;
}

export class DashBehaviour implements CastBehaviour {
    private _maxDistance: number = 140;
    private _collisionStep: number = 4;
    private _afterimagesEnabled: boolean = false;
    private _afterimageEveryNTicks: number = 2;

    withMaxDistance(px: number): this {
        this._maxDistance = px;
        return this;
    }

    withCollisionStep(px: number): this {
        this._collisionStep = px;
        return this;
    }

    /** Spawn an afterimage trail during the dash. everyNTicks controls emission rate (default 2 = 15 Hz at 30 Hz physics). */
    withAfterimages(enabled = true, everyNTicks = 2): this {
        this._afterimagesEnabled = enabled;
        this._afterimageEveryNTicks = everyNTicks;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const target = ctx.target;
        if (target.type !== 'pixel' || !target.position) {
            ctx.setBehaviourPayload({ targetX: ctx.caster.x, targetY: ctx.caster.y, maxDistance: 0, afterimage: null });
            return;
        }

        const { x: targetX, y: targetY } = target.position;
        const { dirX, dirY, dist } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, targetX, targetY);
        const maxDistance = Math.min(this._maxDistance, dist);

        let afterimage: DashPayload['afterimage'] = null;
        if (this._afterimagesEnabled) {
            afterimage = {
                bodyColor: getBodyColorForUnit(ctx.caster),
                radius: ctx.caster.radius,
                characterSpriteKey: getCharacterSpriteKey(ctx.caster.characterId),
                perpX: -dirY, // 90° counterclockwise
                perpY: dirX,
                tickCount: 0,
            };
        }

        ctx.setBehaviourPayload({ targetX, targetY, maxDistance, afterimage } satisfies DashPayload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as DashPayload | null;
        if (!payload || payload.maxDistance <= 0) return;

        const { targetX, targetY, maxDistance } = payload;
        const distToTarget = Math.hypot(targetX - ctx.caster.x, targetY - ctx.caster.y);

        if (distToTarget > 0) {
            const progressDelta = ctx.windowProgress - ctx.prevWindowProgress;
            const moveThisTick = Math.min(progressDelta * maxDistance, distToTarget);
            if (moveThisTick > 0) {
                applyForcedDisplacementToward(ctx.engine, ctx.caster, targetX, targetY, moveThisTick, {
                    step: this._collisionStep,
                });
            }
        }

        if (payload.afterimage) {
            payload.afterimage.tickCount++;
            if (payload.afterimage.tickCount % this._afterimageEveryNTicks === 0) {
                this._spawnAfterimage(ctx, payload.afterimage);
            }
            ctx.setBehaviourPayload(payload);
        }
    }

    private _spawnAfterimage(ctx: CastBehaviourTickContext, ai: NonNullable<DashPayload['afterimage']>): void {
        // Random signed speed along the perpendicular axis — drift left or right of the path.
        const speed = (Math.random() - 0.5) * 50;
        const eng = ctx.engine as { addEffect(e: Effect): void };
        eng.addEffect(new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: AFTERIMAGE_DURATION,
            effectType: 'Afterimage',
            effectData: {
                bodyColor: ai.bodyColor,
                radius: ai.radius,
                characterSpriteKey: ai.characterSpriteKey,
                initialAlpha: AFTERIMAGE_INITIAL_ALPHA,
                vx: ai.perpX * speed,
                vy: ai.perpY * speed,
            },
        }));
    }
}
