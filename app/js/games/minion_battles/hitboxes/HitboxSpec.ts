/**
 * HitboxSpec - Abstract class that is the single source of truth for a hitbox.
 *
 * Owns rendering (renderTargetingPreview), lock-on candidate resolution (resolveTargets),
 * and hit resolution (resolveHits). This prevents preview range and hit-detection range
 * from drifting apart.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { ThickLineHitbox } from './ThickLineHitbox';
import { resolveHitbox } from '../abilities/hitboxDef';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';

export abstract class HitboxSpec {
    /** Effective max range in px (already includes any unit-radius padding). */
    abstract get maxRange(): number;

    /**
     * Maximum number of targets this hitbox delivers to the damage system (default 1).
     * `MeleeAttackBehaviour` caps `hitUnits` at this value before invoking `withDamage`.
     * Override in subclasses that are designed to hit multiple targets simultaneously.
     */
    get numTargets(): number { return 1; }

    /**
     * Render the targeting overlay for the in-progress target selection.
     * Returns the units that would be highlighted — callers do not need to re-query.
     */
    abstract renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[];

    /**
     * Resolve which units are in the hitbox at click/commit time (lock-on candidates).
     * Same geometry as renderTargetingPreview — guaranteed not to drift.
     */
    abstract resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[];

    /**
     * Resolve actual hits at impact time.
     * lockOnId: if provided, that unit gets guaranteed-hit treatment (priority + tether).
     */
    abstract resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[];
}

// ---------------------------------------------------------------------------
// MeleeLineHitboxSpec
// ---------------------------------------------------------------------------

/**
 * HitboxSpec implementation for melee-line (thick-line) abilities.
 *
 * The stored `maxRange` already includes `DEFAULT_UNIT_RADIUS` padding so that
 * callers never have to add it manually.
 */
export class MeleeLineHitboxSpec extends HitboxSpec {
    readonly maxRange: number;
    readonly lineThickness: number;

    constructor(maxRange: number, lineThickness: number) {
        super();
        this.maxRange = maxRange;
        this.lineThickness = lineThickness;
    }

    /**
     * Project a target point to exactly `maxRange` from the caster in the aim direction.
     * Melee line attacks always swing the full arc regardless of how close the aim is.
     */
    private _projectToMax(
        caster: { x: number; y: number },
        target: { x: number; y: number },
    ): { x: number; y: number } {
        const dx = target.x - caster.x;
        const dy = target.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-6) return { x: caster.x + this.maxRange, y: caster.y };
        const scale = this.maxRange / dist;
        return { x: caster.x + dx * scale, y: caster.y + dy * scale };
    }

    /**
     * Render a thick-line preview from caster toward mouse, always at full maxRange.
     * Returns all units whose center lies within the line's hit area.
     */
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const aimAtMax = this._projectToMax(caster, mouseWorld);
        ThickLineHitbox.renderTargetingPreview(gr, caster, aimAtMax, this.maxRange, this.lineThickness);
        return this._getUnitsInLine(caster, aimAtMax.x, aimAtMax.y, units);
    }

    /**
     * Resolve lock-on candidates using the same geometry as renderTargetingPreview.
     * Always projects to full maxRange so the candidate area matches the preview.
     * Does NOT filter by team — callers apply `SelectTargetDef.filter` as needed.
     * Always excludes the caster itself.
     */
    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const aimAtMax = this._projectToMax(caster, aimPoint);
        return this._getUnitsInLine(caster, aimAtMax.x, aimAtMax.y, units).filter(u => u.id !== caster.id);
    }

    /**
     * Resolve actual hits at impact time via the existing `resolveHitbox` dispatcher.
     * Always projects the aim to full maxRange so close clicks still sweep the full arc.
     * If lockOnId is provided the priority unit must be in range for any hits to land.
     */
    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
        const aimAtMax = this._projectToMax(caster, { x: aimX, y: aimY });
        // maxRange already includes DEFAULT_UNIT_RADIUS, but resolveHitbox's meleeLine
        // shape does NOT add it — so subtract it back to get the bare geometry range.
        const geometryRange = this.maxRange - DEFAULT_UNIT_RADIUS;
        return resolveHitbox(
            { shape: 'meleeLine', range: geometryRange, thickness: this.lineThickness },
            {
                engine,
                caster,
                originX: caster.x,
                originY: caster.y,
                aimX: aimAtMax.x,
                aimY: aimAtMax.y,
                priorityUnitId: lockOnId,
            },
        );
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Return all non-caster alive units whose center is within `lineThickness` of the
     * segment from `caster` to `(endX, endY)`.  No team filter applied.
     */
    private _getUnitsInLine(
        caster: { x: number; y: number },
        endX: number,
        endY: number,
        units: Unit[],
    ): Unit[] {
        const result: Unit[] = [];
        const x0 = caster.x;
        const y0 = caster.y;
        const dx = endX - x0;
        const dy = endY - y0;
        const lenSq = dx * dx + dy * dy;

        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            // Skip self — use radius check so we don't need a Unit reference on caster.
            // We check by position equality for HitboxPreviewCaster callers.
            const dist = pointToSegmentDistance(x0, y0, endX, endY, dx, dy, lenSq, unit.x, unit.y);
            if (dist <= unit.radius + this.lineThickness) {
                result.push(unit);
            }
        }
        return result;
    }
}

/** Minimum distance from point (px, py) to segment (x0,y0)-(x1,y1). */
function pointToSegmentDistance(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    dx: number,
    dy: number,
    lenSq: number,
    px: number,
    py: number,
): number {
    if (lenSq === 0) {
        return Math.sqrt((px - x0) ** 2 + (py - y0) ** 2);
    }
    let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
}

// ---------------------------------------------------------------------------
// Factory (melee line)
// ---------------------------------------------------------------------------

/**
 * Create a `MeleeLineHitboxSpec` for a melee line ability.
 *
 * `maxRange` is the logical reach of the attack *before* unit-radius padding.
 * `DEFAULT_UNIT_RADIUS` is added automatically so callers never forget it.
 *
 * @param maxRange     Logical reach in px (exclusive of target unit radius).
 * @param thickness    Half-width of the strike area in px.
 */
export function meleeLineHitbox(maxRange: number, thickness: number): MeleeLineHitboxSpec {
    return new MeleeLineHitboxSpec(maxRange + DEFAULT_UNIT_RADIUS, thickness);
}

// ---------------------------------------------------------------------------
// PerpendicularSwingHitboxSpec
// ---------------------------------------------------------------------------

/**
 * HitboxSpec for perpendicular-swing melee abilities (e.g. Swing Stick, Swing Sword).
 *
 * The hitbox is a thick bar placed PERPENDICULAR to the aim direction, centred at
 * `maxRange` (or the clamped click distance) from the caster. Unlike a forward melee
 * line, the bar sweeps sideways across the aim point.
 *
 * `maxRange` already includes `DEFAULT_UNIT_RADIUS` padding (added by the factory).
 */
export class PerpendicularSwingHitboxSpec extends HitboxSpec {
    /** Distance from caster to bar centre (includes DEFAULT_UNIT_RADIUS). */
    readonly maxRange: number;
    /** Full length of the perpendicular bar (px). */
    readonly swingLength: number;
    /** Hitbox band thickness — how wide the hit area is along the aim axis (px). */
    readonly thickness: number;
    private readonly _numTargets: number;

    override get numTargets(): number { return this._numTargets; }

    constructor(maxRange: number, swingLength: number, thickness: number, numTargets: number = 1) {
        super();
        this.maxRange = maxRange;
        this.swingLength = swingLength;
        this.thickness = thickness;
        this._numTargets = numTargets;
    }

    /**
     * Compute left/right endpoints of the perpendicular bar for a given aim direction.
     * The bar centre is clamped to [0, maxRange] from the caster.
     */
    getEndpoints(
        caster: { x: number; y: number },
        aimX: number,
        aimY: number,
    ): {
        leftX: number; leftY: number;
        rightX: number; rightY: number;
        centerX: number; centerY: number;
        aimDirX: number; aimDirY: number;
    } {
        const dx = aimX - caster.x;
        const dy = aimY - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const aimDirX = dist > 1e-6 ? dx / dist : 1;
        const aimDirY = dist > 1e-6 ? dy / dist : 0;
        const clampedDist = dist > 1e-6 ? Math.min(this.maxRange, dist) : this.maxRange;
        const centerX = caster.x + aimDirX * clampedDist;
        const centerY = caster.y + aimDirY * clampedDist;
        const half = this.swingLength / 2;
        const perpX = -aimDirY * half;
        const perpY =  aimDirX * half;
        return {
            leftX: centerX - perpX,
            leftY: centerY - perpY,
            rightX: centerX + perpX,
            rightY: centerY + perpY,
            centerX,
            centerY,
            aimDirX,
            aimDirY,
        };
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const ep = this.getEndpoints(caster, mouseWorld.x, mouseWorld.y);
        const half = this.thickness / 2;
        // Offset corners along the aim direction to give the bar its depth.
        const offX = ep.aimDirX * half;
        const offY = ep.aimDirY * half;
        gr.clear();
        gr.moveTo(ep.leftX + offX, ep.leftY + offY);
        gr.lineTo(ep.leftX - offX, ep.leftY - offY);
        gr.lineTo(ep.rightX - offX, ep.rightY - offY);
        gr.lineTo(ep.rightX + offX, ep.rightY + offY);
        gr.lineTo(ep.leftX + offX, ep.leftY + offY);
        gr.fill({ color: 0xa0a0a0, alpha: 0.5 });
        gr.stroke({ color: 0x505050, width: 2, alpha: 0.9 });
        return this._getUnitsInBar(caster, mouseWorld.x, mouseWorld.y, units);
    }

    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        return this._getUnitsInBar(caster, aimPoint.x, aimPoint.y, units)
            .filter(u => u.id !== caster.id);
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
        const ep = this.getEndpoints(caster, aimX, aimY);
        const hits = ThickLineHitbox.getUnitsInHitbox(
            engine,
            caster,
            ep.leftX, ep.leftY,
            ep.rightX, ep.rightY,
            this.thickness / 2,
        );
        if (lockOnId) {
            const priorityIdx = hits.findIndex(u => u.id === lockOnId);
            if (priorityIdx === -1) return [];
            if (priorityIdx !== 0) {
                const [priorityUnit] = hits.splice(priorityIdx, 1);
                hits.unshift(priorityUnit!);
            }
        }
        return hits;
    }

    // -----------------------------------------------------------------------

    private _getUnitsInBar(
        caster: { x: number; y: number },
        aimX: number,
        aimY: number,
        units: Unit[],
    ): Unit[] {
        const ep = this.getEndpoints(caster, aimX, aimY);
        const bdx = ep.rightX - ep.leftX;
        const bdy = ep.rightY - ep.leftY;
        const lenSq = bdx * bdx + bdy * bdy;
        const result: Unit[] = [];
        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            const dist = pointToSegmentDistance(
                ep.leftX, ep.leftY, ep.rightX, ep.rightY,
                bdx, bdy, lenSq,
                unit.x, unit.y,
            );
            if (dist <= unit.radius + this.thickness / 2) {
                result.push(unit);
            }
        }
        return result;
    }
}

// ---------------------------------------------------------------------------
// Factory (perpendicular swing)
// ---------------------------------------------------------------------------

/**
 * Create a `PerpendicularSwingHitboxSpec` for a sweep/swing melee ability.
 *
 * `swingRange` is the distance from caster to bar centre *before* unit-radius padding.
 * `DEFAULT_UNIT_RADIUS` is added automatically.
 *
 * @param swingRange   Distance from caster to bar centre in px (exclusive of unit radius).
 * @param swingLength  Full length of the perpendicular bar in px.
 * @param thickness    Hit band thickness along the aim axis in px.
 */
export function perpendicularSwingHitbox(
    swingRange: number,
    swingLength: number,
    thickness: number,
    numTargets: number = 1,
): PerpendicularSwingHitboxSpec {
    return new PerpendicularSwingHitboxSpec(swingRange + DEFAULT_UNIT_RADIUS, swingLength, thickness, numTargets);
}
