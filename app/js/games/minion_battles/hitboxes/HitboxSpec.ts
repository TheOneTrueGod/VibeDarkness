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
import { clampToMaxRange } from '../abilities/previewHelpers';
import { resolveHitbox } from '../abilities/hitboxDef';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';

export abstract class HitboxSpec {
    /** Effective max range in px (already includes any unit-radius padding). */
    abstract get maxRange(): number;

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
     * Render a thick-line preview from caster toward mouse (clamped to maxRange).
     * Returns all units whose center lies within the line's hit area.
     */
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        ThickLineHitbox.renderTargetingPreview(gr, caster, mouseWorld, this.maxRange, this.lineThickness);

        const { endX, endY } = clampToMaxRange(caster, mouseWorld, this.maxRange);
        return this._getUnitsInLine(caster, endX, endY, units);
    }

    /**
     * Resolve lock-on candidates using the same geometry as renderTargetingPreview.
     * Does NOT filter by team — callers apply `SelectTargetDef.filter` as needed.
     * Always excludes the caster itself.
     */
    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const { endX, endY } = clampToMaxRange(caster, aimPoint, this.maxRange);
        return this._getUnitsInLine(caster, endX, endY, units).filter(u => u.id !== caster.id);
    }

    /**
     * Resolve actual hits at impact time via the existing `resolveHitbox` dispatcher.
     * If lockOnId is provided the priority unit must be in range for any hits to land.
     */
    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
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
                aimX,
                aimY,
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
// Factory
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
