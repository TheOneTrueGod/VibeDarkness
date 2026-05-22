import type { Unit } from '../../game/units/Unit';
import type { HitboxEngineContext } from '../../hitboxes/Hitbox';
import { Effect } from '../../game/effects/Effect';
import type { HitboxDef } from '../hitboxDef';
import { resolveHitbox } from '../hitboxDef';
import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
    CastBehaviourInterruptContext,
    CastBehaviourBaseContext,
    CastBehaviourRenderContext,
} from '../castBehaviourTypes';

// ---- Easing (mirrored from meleeAnimationProfile.ts) ----

function easeOutCubic(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return 1 - (1 - clamped) ** 3;
}

function easeInOutQuad(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - ((-2 * clamped + 2) ** 2) / 2;
}

// ---- Direction helper ----

function dirFromTo(
    x0: number, y0: number,
    x1: number, y1: number,
): { dirX: number; dirY: number } {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return { dirX: 0, dirY: 0 };
    return { dirX: dx / len, dirY: dy / len };
}

// ---- Payload ----

interface MeleeAttackPayload {
    aimDirX: number;
    aimDirY: number;
    lockedUnitId: string | null;
    lockedPosition: { x: number; y: number } | null;
    interrupted: boolean;
    impactFired: boolean;
}

// ---- Behaviour class ----

export class MeleeAttackBehaviour implements CastBehaviour {
    private hitboxDef: HitboxDef | null = null;
    private impactEffectType: string = 'punch';
    private damageCallback: ((ctx: CastBehaviourTickContext, hitUnits: Unit[]) => void) | null = null;
    private impactAt: number = 0.4;
    private slideConfig = { forwardDistance: 12, backwardDistance: 0 };

    withHitbox(def: HitboxDef): this {
        this.hitboxDef = def;
        return this;
    }

    withImpact(effectType: string): this {
        this.impactEffectType = effectType;
        return this;
    }

    withDamage(fn: (ctx: CastBehaviourTickContext, hitUnits: Unit[]) => void): this {
        this.damageCallback = fn;
        return this;
    }

    withImpactAt(progress: number): this {
        this.impactAt = progress;
        return this;
    }

    withSlide(cfg: { forwardDistance: number; backwardDistance: number }): this {
        this.slideConfig = cfg;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const target = ctx.target;
        let aimDirX = 0;
        let aimDirY = 0;
        let lockedUnitId: string | null = null;

        if (target.type === 'unit' && target.unitId != null) {
            lockedUnitId = target.unitId;
            const targetUnit = ctx.engine.getUnit(target.unitId);
            const tx = targetUnit?.x ?? ctx.caster.x;
            const ty = targetUnit?.y ?? ctx.caster.y;
            const dir = dirFromTo(ctx.caster.x, ctx.caster.y, tx, ty);
            aimDirX = dir.dirX;
            aimDirY = dir.dirY;
        } else if (target.type === 'pixel' && target.position != null) {
            const dir = dirFromTo(ctx.caster.x, ctx.caster.y, target.position.x, target.position.y);
            aimDirX = dir.dirX;
            aimDirY = dir.dirY;
        }

        const payload: MeleeAttackPayload = {
            aimDirX,
            aimDirY,
            lockedUnitId,
            lockedPosition: null,
            interrupted: false,
            impactFired: false,
        };
        ctx.setBehaviourPayload(payload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload || payload.interrupted || payload.impactFired) return;

        const crossedImpact =
            ctx.prevWindowProgress < this.impactAt && ctx.windowProgress >= this.impactAt;
        if (!crossedImpact) return;

        ctx.setBehaviourPayload({ ...payload, impactFired: true });

        // Resolve aim point — locked position takes priority (unit dodged)
        let aimX: number;
        let aimY: number;
        if (payload.lockedPosition != null) {
            aimX = payload.lockedPosition.x;
            aimY = payload.lockedPosition.y;
        } else if (ctx.target.type === 'unit' && ctx.target.unitId != null) {
            const liveUnit = ctx.engine.getUnit(ctx.target.unitId);
            if (liveUnit) {
                aimX = liveUnit.x;
                aimY = liveUnit.y;
            } else {
                // Fallback: project aim direction
                const FALLBACK_DIST = 64;
                aimX = ctx.caster.x + payload.aimDirX * FALLBACK_DIST;
                aimY = ctx.caster.y + payload.aimDirY * FALLBACK_DIST;
            }
        } else if (ctx.target.type === 'pixel' && ctx.target.position != null) {
            aimX = ctx.target.position.x;
            aimY = ctx.target.position.y;
        } else {
            const FALLBACK_DIST = 64;
            aimX = ctx.caster.x + payload.aimDirX * FALLBACK_DIST;
            aimY = ctx.caster.y + payload.aimDirY * FALLBACK_DIST;
        }

        // Hit detection
        let hitUnits: Unit[] = [];
        if (this.hitboxDef != null) {
            hitUnits = resolveHitbox(this.hitboxDef, {
                engine: ctx.engine as unknown as HitboxEngineContext,
                caster: ctx.caster,
                originX: ctx.caster.x,
                originY: ctx.caster.y,
                aimX,
                aimY,
                priorityUnitId: payload.lockedUnitId ?? undefined,
            });
        }

        // Spawn impact VFX
        if (hitUnits.length > 0) {
            ctx.engine.addEffect(new Effect({
                x: hitUnits[0].x,
                y: hitUnits[0].y,
                duration: 0.2,
                effectType: this.impactEffectType,
                startX: ctx.caster.x,
                startY: ctx.caster.y,
            }));
        } else {
            ctx.engine.addEffect(new Effect({
                x: aimX,
                y: aimY,
                duration: 0.2,
                effectType: this.impactEffectType,
            }));
        }

        // Dodged floating text when unit evaded and hitbox missed
        if (payload.lockedPosition != null && hitUnits.length === 0) {
            ctx.engine.addEffect(new Effect({
                x: payload.lockedPosition.x,
                y: payload.lockedPosition.y,
                duration: 0.92,
                effectType: 'FloatingText',
                effectData: {
                    amount: 0,
                    color: 0xfacc15,
                    originX: payload.lockedPosition.x,
                    originY: payload.lockedPosition.y,
                    dirX: 0,
                    dirY: -1,
                    flightPx: 48,
                    arcPx: 36,
                },
            }));
        }

        // Apply damage
        if (hitUnits.length > 0 && this.damageCallback != null) {
            this.damageCallback(ctx, hitUnits);
        }

        // Hit pause
        ctx.engine.requestHitPause?.(3);
    }

    onInterrupt(ctx: CastBehaviourInterruptContext): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload) return;
        ctx.setBehaviourPayload({ ...payload, interrupted: true });
    }

    onTargetEvade(
        unitId: string,
        snapshot: { x: number; y: number },
        ctx: CastBehaviourBaseContext,
    ): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload) return;
        if (payload.lockedUnitId === unitId && payload.lockedPosition === null) {
            ctx.setBehaviourPayload({ ...payload, lockedPosition: snapshot });
        }
    }

    getCasterRenderOffset(ctx: CastBehaviourRenderContext): { x: number; y: number } | null {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload || payload.interrupted) return { x: 0, y: 0 };

        const p = ctx.windowProgress;

        if (p <= this.impactAt) {
            const t = this.impactAt > 0 ? p / this.impactAt : 1;
            const forward = easeOutCubic(t) * this.slideConfig.forwardDistance;
            return { x: payload.aimDirX * forward, y: payload.aimDirY * forward };
        }

        const remaining = 1 - this.impactAt;
        const t = remaining > 0 ? (p - this.impactAt) / remaining : 1;
        const back = easeInOutQuad(t) * this.slideConfig.backwardDistance;
        return { x: -payload.aimDirX * back, y: -payload.aimDirY * back };
    }
}
