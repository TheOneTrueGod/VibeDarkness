/**
 * ConvexQuadHitbox — HitboxSpec subclass for the square-in-front melee shape.
 *
 * Geometry: an axis-aligned square of side `width` centred directly in front of
 * the caster at distance `caster.radius + reach` along the aim direction.
 * This matches the hand-rolled `getSquareInFront` logic in BeastClaw / AlphaWolfClaw
 * so targeting preview, lock-on resolution, and hit resolution share one geometry
 * and can never drift apart.
 *
 * Factory:
 *   convexQuadHitbox(reach, width, numTargets?)
 *
 * `reach`      — logical reach in px (exclusive of unit radius). `DEFAULT_UNIT_RADIUS`
 *                is added to produce `maxRange` (following `meleeLineHitbox` convention).
 *                At query time the live caster radius is used in the clamping, so the
 *                actual box position adjusts to the caster's real size.
 * `width`      — side length of the square (px).
 * `numTargets` — maximum simultaneous hits (default: all units in the quad).
 */

import { areEnemies } from '../game/teams';
import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';

// ---------------------------------------------------------------------------
// Geometry helpers (private to this module)
// ---------------------------------------------------------------------------

/** Result of getQuadInFront: four corners + centre + aim direction. */
interface QuadGeometry {
    corners: readonly { x: number; y: number }[];
    centerX: number;
    centerY: number;
    aimDirX: number;
    aimDirY: number;
}

/**
 * Compute the four corners of the square in front of the caster.
 *
 * The box centre sits at distance `(caster radius) + clampedReach` from the caster
 * along the aim direction, where `clampedReach` is clamped to `[0, reach + casterRadius]`.
 * The `reach + casterRadius` maximum mirrors the original BeastClaw/AlphaWolfClaw
 * `getMaxRange = BASE_MAX_RANGE + caster.radius` clamping so the geometry is
 * preserved exactly after migration.
 *
 * The radius used here is `DEFAULT_UNIT_RADIUS` for preview/targeting callers that
 * only have a `HitboxPreviewCaster`; actual hit resolution passes the live unit.
 */
function getQuadInFront(
    caster: { x: number; y: number; radius?: number },
    aim: { x: number; y: number },
    reach: number,
    width: number,
): QuadGeometry {
    const casterRadius = caster.radius ?? DEFAULT_UNIT_RADIUS;
    const dx = aim.x - caster.x;
    const dy = aim.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const aimDirX = dist > 0 ? dx / dist : 1;
    const aimDirY = dist > 0 ? dy / dist : 0;
    // Match the original clamping: maxClamp = reach + casterRadius so that clicking
    // at any distance >= maxClamp places the box at the far end of the hitbox range.
    const maxClamp = reach + casterRadius;
    const clampedDist = dist > 0 ? Math.min(maxClamp, dist) : maxClamp;
    const centerX = caster.x + aimDirX * (casterRadius + clampedDist);
    const centerY = caster.y + aimDirY * (casterRadius + clampedDist);
    const half = width / 2;
    const perpX = -aimDirY * half;
    const perpY =  aimDirX * half;
    const corners = [
        { x: centerX - aimDirX * half - perpX, y: centerY - aimDirY * half - perpY },
        { x: centerX - aimDirX * half + perpX, y: centerY - aimDirY * half + perpY },
        { x: centerX + aimDirX * half + perpX, y: centerY + aimDirY * half + perpY },
        { x: centerX + aimDirX * half - perpX, y: centerY + aimDirY * half - perpY },
    ];
    return { corners, centerX, centerY, aimDirX, aimDirY };
}

/**
 * Point-in-convex-polygon test (cross-product sign check).
 * Works for any convex polygon where corners are in consistent winding order.
 */
function pointInConvexQuad(
    px: number,
    py: number,
    q0: { x: number; y: number },
    q1: { x: number; y: number },
    q2: { x: number; y: number },
    q3: { x: number; y: number },
): boolean {
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        (a.x - px) * (b.y - py) - (b.x - px) * (a.y - py);
    const d0 = cross(q0, q1);
    const d1 = cross(q1, q2);
    const d2 = cross(q2, q3);
    const d3 = cross(q3, q0);
    return (d0 >= 0 && d1 >= 0 && d2 >= 0 && d3 >= 0) ||
           (d0 <= 0 && d1 <= 0 && d2 <= 0 && d3 <= 0);
}

/** Return all non-caster units whose centre lies inside the quad. No team filter applied. */
function getUnitsInQuad(
    units: Unit[],
    caster: { x: number; y: number },
    corners: readonly { x: number; y: number }[],
): Unit[] {
    const result: Unit[] = [];
    for (const unit of units) {
        if (!unit.active || !unit.isAlive()) continue;
        if (unit.x === caster.x && unit.y === caster.y && 'id' in caster) continue;
        if (pointInConvexQuad(unit.x, unit.y, corners[0]!, corners[1]!, corners[2]!, corners[3]!)) {
            result.push(unit);
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// HitboxSpec implementation
// ---------------------------------------------------------------------------

export class ConvexQuadHitboxSpec extends HitboxSpec {
    /**
     * `maxRange` = `reach + DEFAULT_UNIT_RADIUS` — unit-radius padding baked in,
     * following the same convention as `meleeLineHitbox`.  This value drives
     * `getRange`, `aiSettings.maxRange`, and lock-on range.
     */
    readonly maxRange: number;

    private readonly reach: number;
    private readonly width: number;
    private readonly _numTargets: number;

    override get numTargets(): number { return this._numTargets; }

    constructor(reach: number, width: number, numTargets: number) {
        super();
        this.reach = reach;
        this.width = width;
        this._numTargets = numTargets;
        // maxRange = reach + DEFAULT_UNIT_RADIUS (unit-radius padding baked in,
        // matching the convention of meleeLineHitbox).  This value drives getRange,
        // aiSettings.maxRange, and lock-on range; it intentionally does NOT include
        // the extra caster.radius offset in the box-centre computation — that offset
        // is applied at query time using the live caster radius.
        this.maxRange = reach + DEFAULT_UNIT_RADIUS;
    }

    /**
     * Render the quad targeting overlay and return the units that would be highlighted.
     */
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const { corners } = getQuadInFront(caster, mouseWorld, this.reach, this.width);
        gr.clear();
        gr.moveTo(corners[0]!.x, corners[0]!.y);
        gr.lineTo(corners[1]!.x, corners[1]!.y);
        gr.lineTo(corners[2]!.x, corners[2]!.y);
        gr.lineTo(corners[3]!.x, corners[3]!.y);
        gr.lineTo(corners[0]!.x, corners[0]!.y);
        gr.fill({ color: 0x8b7355, alpha: 0.25 });
        gr.stroke({ color: 0x5d4e37, width: 2, alpha: 0.7 });
        return getUnitsInQuad(units, caster, corners).filter(u => u.active && u.isAlive());
    }

    /**
     * Resolve lock-on candidates using the same geometry as renderTargetingPreview.
     * Does NOT filter by team — callers apply SelectTargetDef.filter as needed.
     * Always excludes the caster itself.
     */
    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const { corners } = getQuadInFront(caster, aimPoint, this.reach, this.width);
        return getUnitsInQuad(units, caster, corners)
            .filter(u => u.id !== caster.id);
    }

    /**
     * Resolve actual hits at impact time.
     * Filters by team (enemies of caster only) and respects spawning state.
     * If lockOnId is provided, the priority unit must be in the quad or no hits land.
     */
    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
        const { corners } = getQuadInFront(caster, { x: aimX, y: aimY }, this.reach, this.width);
        const hits: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isSpawning()) continue;
            if (!areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (pointInConvexQuad(unit.x, unit.y, corners[0]!, corners[1]!, corners[2]!, corners[3]!)) {
                hits.push(unit);
            }
        }

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

    /**
     * Expose the quad geometry for external rendering (e.g. renderActivePreview telegraphs).
     * Returns the same corners as resolveHits would compute.
     */
    getQuadGeometry(
        caster: { x: number; y: number; radius?: number },
        aim: { x: number; y: number },
    ): QuadGeometry {
        return getQuadInFront(caster, aim, this.reach, this.width);
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `ConvexQuadHitboxSpec` for a square-in-front melee ability.
 *
 * `reach`      — logical reach in px exclusive of unit radius (e.g. `10` for a
 *                short-range claw).  `DEFAULT_UNIT_RADIUS` is added to produce
 *                `maxRange` — the live caster radius is used at query time.
 * `width`      — side length of the square hitbox in px.
 * `numTargets` — maximum simultaneous hits (default: large number = hit all in quad).
 */
export function convexQuadHitbox(
    reach: number,
    width: number,
    numTargets: number = 99,
): ConvexQuadHitboxSpec {
    return new ConvexQuadHitboxSpec(reach, width, numTargets);
}
