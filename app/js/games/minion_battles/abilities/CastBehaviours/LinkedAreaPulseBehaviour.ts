/**
 * LinkedAreaPulseBehaviour - pulses damage over a "linked area": a circle round the caster, a circle round
 * a linked unit (e.g. the caster's spirit), and a band joining them. Each pulse hits every enemy inside the
 * area once, however many of the three parts it touches.
 *
 * Pulses are spread evenly over the window, at `(k + 0.5) / pulses`. With `withField`, a
 * `LinkedAreaField` effect (`effect_defs/linkedAreaEffects.ts`) plays over the window: a field of slow
 * motes across the area, and a large burst at each pulse, on the same shares the damage uses. Both ends
 * follow the live positions of the caster and the linked unit.
 *
 * First user: Spirit Storm (0713). Reusable for any "between us" area (tethers, beams with ends).
 */
import type { Unit } from '../../game/units/Unit';
import type {
    CastBehaviour,
    CastBehaviourBaseContext,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { tryDamageOrBlock } from '../blockingHelpers';
import { areEnemies } from '../../game/teams';
import { createLinkedAreaField, type LinkedAreaFieldColors } from '../../game/effects/linkedAreaField';

export interface Point {
    x: number;
    y: number;
}

/** Two circles of `radius` at `a` and `b` (b may be missing) joined by a band `lineHalfWidth` either side. */
export interface LinkedArea {
    a: Point;
    b: Point | null;
    radius: number;
    lineHalfWidth: number;
}

/** Distance from `p` to the segment a-b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq)) : 0;
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** True when a body of `bodyRadius` at `p` touches the linked area. */
export function linkedAreaTouches(area: LinkedArea, p: Point, bodyRadius = 0): boolean {
    if (Math.hypot(p.x - area.a.x, p.y - area.a.y) <= area.radius + bodyRadius) return true;
    if (!area.b) return false;
    if (Math.hypot(p.x - area.b.x, p.y - area.b.y) <= area.radius + bodyRadius) return true;
    return distanceToSegment(p, area.a, area.b) <= area.lineHalfWidth + bodyRadius;
}

/** Share of the window at which pulse `k` of `count` lands. */
export function linkedAreaPulseShare(k: number, count: number): number {
    return (k + 0.5) / count;
}

type LinkFn = (ctx: CastBehaviourBaseContext) => Unit | null;

interface PulsePayload {
    fired: number;
}

export class LinkedAreaPulseBehaviour implements CastBehaviour {
    private _link: LinkFn = () => null;
    private _radius = 60;
    private _lineHalfWidth = 14;
    private _pulses = 4;
    private _damage = 4;
    private _field: LinkedAreaFieldColors | null = null;

    /** The unit at the far end of the area (null = caster circle only). */
    withLink(fn: LinkFn): this {
        this._link = fn;
        return this;
    }

    withRadius(px: number): this {
        this._radius = px;
        return this;
    }

    /** Full width of the band joining the two circles. */
    withLineWidth(px: number): this {
        this._lineHalfWidth = px / 2;
        return this;
    }

    withPulses(count: number): this {
        this._pulses = Math.max(1, Math.floor(count));
        return this;
    }

    withDamage(damage: number): this {
        this._damage = damage;
        return this;
    }

    /** Play the field-and-burst effect in these colours. */
    withField(colors: LinkedAreaFieldColors): this {
        this._field = colors;
        return this;
    }

    get pulses(): number {
        return this._pulses;
    }

    /** The area right now, from the caster and the live linked unit. */
    resolveArea(ctx: CastBehaviourBaseContext): LinkedArea {
        const link = this._link(ctx);
        return {
            a: { x: ctx.caster.x, y: ctx.caster.y },
            b: link?.isAlive() ? { x: link.x, y: link.y } : null,
            radius: this._radius,
            lineHalfWidth: this._lineHalfWidth,
        };
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        ctx.setBehaviourPayload({ fired: 0 } satisfies PulsePayload);
        if (!this._field) return;
        const link = this._link(ctx);
        const shares = Array.from({ length: this._pulses }, (_, k) => linkedAreaPulseShare(k, this._pulses));
        ctx.engine.addEffect(
            createLinkedAreaField({
                caster: ctx.caster,
                link,
                radius: this._radius,
                lineHalfWidth: this._lineHalfWidth,
                seconds: ctx.windowSeconds ?? 1.6,
                pulseShares: shares,
                colors: this._field,
            }),
        );
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = (ctx.behaviourPayload as PulsePayload | null) ?? { fired: 0 };
        while (payload.fired < this._pulses && ctx.windowProgress >= linkedAreaPulseShare(payload.fired, this._pulses)) {
            this.firePulse(ctx);
            payload.fired++;
        }
        ctx.setBehaviourPayload(payload);
    }

    /** One pulse: every enemy touching the area takes damage once. */
    private firePulse(ctx: CastBehaviourTickContext): void {
        const area = this.resolveArea(ctx);
        for (const unit of ctx.engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;
            if (!areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            if (!linkedAreaTouches(area, unit, unit.radius)) continue;
            tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage: this._damage,
                attackType: 'melee',
            });
        }
    }
}
