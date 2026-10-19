/**
 * AimFrameSegmentHitbox — a thin segment fixed in the caster's aim frame.
 *
 * The two endpoints are given as `{ forward, side }` offsets (px) from the caster centre:
 * `forward` runs along the aim direction, `side` to the caster's right of it (negative = left).
 * The click only sets the aim direction; the segment sits at the same caster-relative spot
 * however far away the click is, and rotates with the aim. Use it for slashes, claws and other
 * angled strikes (Bloody Claws builds its "/" and "\" claws from one spec and its `mirrored()`).
 *
 * Factory: `aimFrameSegmentHitbox({ from, to, halfThickness, numTargets })`.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { ThickLineHitbox } from './ThickLineHitbox';

export interface AimFramePoint {
    /** Px along the aim direction from the caster centre. */
    forward: number;
    /** Px to the caster's right of the aim direction (negative = left). */
    side: number;
}

export interface AimFrameSegmentConfig {
    from: AimFramePoint;
    to: AimFramePoint;
    /** Half the band width (px); a unit is hit when its edge is within this of the segment. */
    halfThickness: number;
    /** Max units delivered per resolve (default 1). */
    numTargets?: number;
}

interface WorldSegment {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

function aimDirection(caster: { x: number; y: number }, aim: { x: number; y: number }): { dirX: number; dirY: number } {
    const dx = aim.x - caster.x;
    const dy = aim.y - caster.y;
    const dist = Math.hypot(dx, dy);
    return dist > 1e-6 ? { dirX: dx / dist, dirY: dy / dist } : { dirX: 1, dirY: 0 };
}

function distanceToSegment(seg: WorldSegment, px: number, py: number): number {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - seg.x0) * dx + (py - seg.y0) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (seg.x0 + t * dx), py - (seg.y0 + t * dy));
}

export class AimFrameSegmentHitboxSpec extends HitboxSpec {
    readonly from: AimFramePoint;
    readonly to: AimFramePoint;
    readonly halfThickness: number;
    /** Farthest endpoint distance from the caster centre (drives lock-on range and AI reach). */
    readonly maxRange: number;
    private readonly _numTargets: number;

    override get numTargets(): number { return this._numTargets; }

    constructor(config: AimFrameSegmentConfig) {
        super();
        this.from = config.from;
        this.to = config.to;
        this.halfThickness = config.halfThickness;
        this._numTargets = config.numTargets ?? 1;
        this.maxRange = Math.max(
            Math.hypot(config.from.forward, config.from.side),
            Math.hypot(config.to.forward, config.to.side),
        );
    }

    /** The same segment reflected across the aim line (left <-> right). */
    mirrored(): AimFrameSegmentHitboxSpec {
        return new AimFrameSegmentHitboxSpec({
            from: { forward: this.from.forward, side: -this.from.side },
            to: { forward: this.to.forward, side: -this.to.side },
            halfThickness: this.halfThickness,
            numTargets: this._numTargets,
        });
    }

    /** World-space endpoints for a caster aiming at `aim`. */
    getSegment(caster: { x: number; y: number }, aim: { x: number; y: number }): WorldSegment {
        const { dirX, dirY } = aimDirection(caster, aim);
        // Right-hand perpendicular in screen space (y down): aim up (0,-1) -> right (1,0).
        const rightX = -dirY;
        const rightY = dirX;
        const toWorld = (p: AimFramePoint) => ({
            x: caster.x + dirX * p.forward + rightX * p.side,
            y: caster.y + dirY * p.forward + rightY * p.side,
        });
        const a = toWorld(this.from);
        const b = toWorld(this.to);
        return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const seg = this.getSegment(caster, mouseWorld);
        const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) || 1;
        const nx = (-(seg.y1 - seg.y0) / len) * this.halfThickness;
        const ny = ((seg.x1 - seg.x0) / len) * this.halfThickness;
        gr.moveTo(seg.x0 + nx, seg.y0 + ny);
        gr.lineTo(seg.x1 + nx, seg.y1 + ny);
        gr.lineTo(seg.x1 - nx, seg.y1 - ny);
        gr.lineTo(seg.x0 - nx, seg.y0 - ny);
        gr.lineTo(seg.x0 + nx, seg.y0 + ny);
        gr.fill({ color: 0xa0a0a0, alpha: 0.45 });
        gr.stroke({ color: 0x505050, width: 2, alpha: 0.9 });
        return this.unitsOnSegment(seg, units);
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        return this.unitsOnSegment(this.getSegment(caster, aimPoint), units).filter((u) => u.id !== caster.id);
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
        const seg = this.getSegment(caster, { x: aimX, y: aimY });
        const hits = ThickLineHitbox.getUnitsInHitbox(engine, caster, seg.x0, seg.y0, seg.x1, seg.y1, this.halfThickness);
        // Nearest the caster first, so the per-hitbox target cap keeps the closest units.
        hits.sort((a, b) => Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y));
        if (lockOnId) {
            const idx = hits.findIndex((u) => u.id === lockOnId);
            if (idx > 0) hits.unshift(...hits.splice(idx, 1));
        }
        return hits;
    }

    /** Units whose edge is within `halfThickness` of the segment. No team filter (callers filter). */
    private unitsOnSegment(seg: WorldSegment, units: Unit[]): Unit[] {
        return units.filter(
            (u) => u.active && u.isAlive() && distanceToSegment(seg, u.x, u.y) <= u.radius + this.halfThickness,
        );
    }
}

export function aimFrameSegmentHitbox(config: AimFrameSegmentConfig): AimFrameSegmentHitboxSpec {
    return new AimFrameSegmentHitboxSpec(config);
}
