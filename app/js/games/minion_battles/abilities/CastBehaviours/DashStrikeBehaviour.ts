/**
 * DashStrikeBehaviour - blink beside a unit target, then dash in a straight line through it, hitting only
 * that target once and leaving a slash trail behind.
 *
 * On setup the caster blinks to a point just outside the target (on the side its approach comes from) and
 * the line runs through the target's centre to the same distance past it. During the window the caster
 * moves along the line (fast, easing out); the hit lands as it crosses the target. The slash trail
 * (`SpiritSlash`, `effect_defs/spiritSlashEffects.ts`) is drawn from the start along the dash and fades.
 *
 * Reusable: put one on an interval for a single strike (Spirit Strike, 0710) or several in sequence with
 * different `angleOffsetDeg` for a flurry (Spirit Flurry, 0711). The approach direction comes from
 * `withApproachFrom` (default: from the caster's own position), rotated by `angleOffsetDeg`.
 *
 * Terrain: the blink and the far end are pulled in toward the target until passable, so the caster never
 * ends inside rock. Needs a `unit` target, unless `withAreaTargeting` is set.
 *
 * Area targeting (`withAreaTargeting(radius)`): when the cast target is a point, or the locked-on unit is
 * gone, each strike picks the enemy nearest the point (or where the unit was) within `radius`, and hits only
 * it. With nobody there it still dashes through the point, hitting nothing. A living unit target is kept.
 */
import type { Unit } from '../../game/units/Unit';
import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { computeForcedDisplacement } from '../../game/forceMove';
import { tryDamageOrBlock } from '../blockingHelpers';
import { createSlashTrail, type SlashTrailColors } from '../../game/effects/slashTrail';
import { areEnemies } from '../../game/teams';

interface DashStrikePayload {
    /** The one unit this strike hits; null for a strike through an empty area. */
    targetUnitId: string | null;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    hit: boolean;
}

type ApproachFn = (caster: Unit, target: Unit, ctx: CastBehaviourSetupContext) => { x: number; y: number } | null;

/** Share of the window by which the dash reaches the far end (the rest is a short settle). */
const DASH_SHARE = 0.85;

export class DashStrikeBehaviour implements CastBehaviour {
    readonly keepsUnitTargetsBeyondRange = true;

    private _damage = 3;
    private _overshootPx = 24;
    private _angleOffsetDeg = 0;
    private _approach: ApproachFn | null = null;
    private _attackType: 'melee' | 'charging' = 'melee';
    private _trail: SlashTrailColors | null = null;
    /** Radius (px) round the anchor point in which a strike picks its own enemy; null = unit targets only. */
    private _areaRadius: number | null = null;

    withDamage(damage: number): this {
        this._damage = damage;
        return this;
    }

    /** How far past the target's edge (px) the blink starts and the dash ends. */
    withOvershoot(px: number): this {
        this._overshootPx = px;
        return this;
    }

    /** Rotate the approach direction (degrees), e.g. to vary the angle of each strike in a flurry. */
    withAngleOffset(deg: number): this {
        this._angleOffsetDeg = deg;
        return this;
    }

    /** Where the strike comes from (the dash runs from this side of the target to the far side). */
    withApproachFrom(fn: ApproachFn): this {
        this._approach = fn;
        return this;
    }

    withAttackType(type: 'melee' | 'charging'): this {
        this._attackType = type;
        return this;
    }

    /**
     * Strike whatever enemy is nearest the target point (or a lost unit target's position) within `radiusPx`,
     * one per strike, or dash through the empty point. See the file comment.
     */
    withAreaTargeting(radiusPx: number): this {
        this._areaRadius = radiusPx;
        return this;
    }

    /** Leave a slash trail in these colours. */
    withSlashTrail(colors: SlashTrailColors): this {
        this._trail = colors;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        ctx.setBehaviourPayload(null);
        const resolved = this.resolveStrikeTarget(ctx);
        if (!resolved) return;
        const target = resolved.unit ?? { id: null, x: resolved.point.x, y: resolved.point.y, radius: 0 };

        const approached = resolved.unit ? this._approach?.(ctx.caster, resolved.unit, ctx) : null;
        const from = approached ?? { x: ctx.caster.x, y: ctx.caster.y };
        let dx = target.x - from.x;
        let dy = target.y - from.y;
        let len = Math.hypot(dx, dy);
        if (len < 1e-6) {
            dx = 1;
            dy = 0;
            len = 1;
        }
        const rad = (this._angleOffsetDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dirX = (dx / len) * cos - (dy / len) * sin;
        const dirY = (dx / len) * sin + (dy / len) * cos;
        const reach = target.radius + ctx.caster.radius + this._overshootPx;

        const start = this.passablePoint(ctx, target, -dirX, -dirY, reach);
        const end = this.passablePoint(ctx, target, dirX, dirY, reach);

        ctx.caster.clearMovement();
        ctx.caster.x = start.x;
        ctx.caster.y = start.y;

        const payload: DashStrikePayload = {
            targetUnitId: target.id,
            startX: start.x,
            startY: start.y,
            endX: end.x,
            endY: end.y,
            hit: false,
        };
        ctx.setBehaviourPayload(payload);

        if (this._trail) {
            const seconds = ctx.windowSeconds ?? 0.15;
            ctx.engine.addEffect(createSlashTrail(start, end, seconds * DASH_SHARE, this._trail));
        }
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as DashStrikePayload | null;
        if (!payload) return;
        ctx.caster.claimAbilityMovement();
        ctx.caster.invalidateMovementPath();
        const p = Math.min(1, ctx.windowProgress / DASH_SHARE);
        const eased = 1 - (1 - p) * (1 - p);
        ctx.caster.x = payload.startX + (payload.endX - payload.startX) * eased;
        ctx.caster.y = payload.startY + (payload.endY - payload.startY) * eased;

        if (payload.hit) return;
        if (payload.targetUnitId === null) return;
        const target = ctx.engine.getUnit(payload.targetUnitId);
        if (!target || !target.isAlive()) {
            payload.hit = true;
            ctx.setBehaviourPayload(payload);
            return;
        }
        // Land the hit once the caster has crossed the target's centre (projected on the dash line).
        const lx = payload.endX - payload.startX;
        const ly = payload.endY - payload.startY;
        const lineLenSq = lx * lx + ly * ly || 1;
        const along = ((target.x - payload.startX) * lx + (target.y - payload.startY) * ly) / lineLenSq;
        if (eased < Math.min(1, along) && !ctx.isLastTick) return;
        payload.hit = true;
        ctx.setBehaviourPayload(payload);
        tryDamageOrBlock(target, {
            engine: ctx.engine,
            gameTime: ctx.engine.gameTime,
            eventBus: ctx.engine.eventBus,
            attackerX: payload.startX,
            attackerY: payload.startY,
            attackerId: ctx.caster.id,
            abilityId: ctx.abilityId,
            damage: this._damage,
            attackType: this._attackType,
        });
    }

    /**
     * The unit this strike goes through, or just a point (area targeting with nobody there). Null = no strike.
     */
    private resolveStrikeTarget(ctx: CastBehaviourSetupContext): { unit: Unit | null; point: { x: number; y: number } } | null {
        const t = ctx.target;
        let anchor: { x: number; y: number } | null = null;
        if (t.type === 'unit' && t.unitId) {
            const locked = ctx.engine.getUnit(t.unitId);
            if (locked?.isAlive()) return { unit: locked, point: { x: locked.x, y: locked.y } };
            if (locked) anchor = { x: locked.x, y: locked.y };
        } else if (t.type === 'pixel' && t.position) {
            anchor = t.position;
        }
        if (this._areaRadius === null || !anchor) return null;
        return { unit: this.nearestEnemyInArea(ctx, anchor, this._areaRadius), point: anchor };
    }

    /** The living enemy whose edge is nearest `point`, within `radius` of it. */
    private nearestEnemyInArea(ctx: CastBehaviourSetupContext, point: { x: number; y: number }, radius: number): Unit | null {
        let best: Unit | null = null;
        let bestDist = Infinity;
        for (const unit of ctx.engine.units) {
            if (!unit.active || !unit.isAlive() || unit.id === ctx.caster.id) continue;
            if (!areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            const dist = Math.hypot(unit.x - point.x, unit.y - point.y) - unit.radius;
            if (dist > radius || dist >= bestDist) continue;
            best = unit;
            bestDist = dist;
        }
        return best;
    }

    /** A point `reach` px from the target along (dirX, dirY), pulled in toward the target until passable. */
    private passablePoint(
        ctx: CastBehaviourSetupContext,
        target: { x: number; y: number },
        dirX: number,
        dirY: number,
        reach: number,
    ): { x: number; y: number } {
        const { dx, dy } = computeForcedDisplacement(
            target.x,
            target.y,
            target.x + dirX * reach,
            target.y + dirY * reach,
            reach,
            { terrainManager: ctx.engine.terrainManager ?? null, step: 4 },
        );
        return { x: target.x + dx, y: target.y + dy };
    }
}
