/**
 * UnitRangeHitboxSpec — pick a unit near the cursor within caster min/max range.
 *
 * Preview: range rings and crosshair on the proposed target. Lock-on resolves the
 * closest living unit whose center lies within `UNIT_RANGE_PICK_CURSOR_EXTRA` + unit.radius
 * of the aim point, when caster-to-unit-center distance is in range.
 * Team filtering is left to `SelectTargetDef.filter` / callers.
 *
 * Excludes the caster by default (matches every other hitbox's convention), unless
 * `includeCaster` is set — needed by self-targetable `filter: 'ally'` abilities
 * (e.g. Blood Mend) since caster-to-caster distance is always 0 and would otherwise
 * never be reachable through the click UI.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { drawCrosshair, drawRangeRings } from '../abilities/previewHelpers';

/** Extra px beyond a unit's radius within which a cursor pick can snap to that unit. */
export const UNIT_RANGE_PICK_CURSOR_EXTRA = 50;

export class UnitRangeHitboxSpec extends HitboxSpec {
    readonly maxRange: number;
    readonly minRange: number;
    readonly includeCaster: boolean;

    constructor(maxRange: number, minRange = 0, includeCaster = false) {
        super();
        this.maxRange = maxRange;
        this.minRange = minRange;
        this.includeCaster = includeCaster;
    }

    private unitCenterDistanceInRange(
        caster: { x: number; y: number },
        unit: Unit,
    ): boolean {
        const dist = Math.hypot(unit.x - caster.x, unit.y - caster.y);
        return dist >= this.minRange && dist <= this.maxRange;
    }

    private resolveUnitAtAim(
        caster: Pick<Unit, 'id' | 'x' | 'y'>,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        let best: Unit | null = null;
        let bestDistSq = Infinity;

        for (const unit of units) {
            if (!unit.isAlive()) continue;
            if (unit.id === caster.id && !this.includeCaster) continue;
            if (!this.unitCenterDistanceInRange(caster, unit)) continue;

            const dx = unit.x - aimPoint.x;
            const dy = unit.y - aimPoint.y;
            const distSq = dx * dx + dy * dy;
            const pickRadius = UNIT_RANGE_PICK_CURSOR_EXTRA + unit.radius;
            if (distSq > pickRadius * pickRadius) continue;

            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = unit;
            }
        }

        return best ? [best] : [];
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        gr.clear();
        drawRangeRings(gr, caster.x, caster.y, this.minRange, this.maxRange);

        const candidates = this.resolveUnitAtAim(caster as Unit, mouseWorld, units);
        const primary = candidates[0];
        if (primary) {
            drawCrosshair(gr, primary.x, primary.y);
        }
        return candidates;
    }

    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        return this.resolveUnitAtAim(caster, aimPoint, units);
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
    ): Unit[] {
        return this.resolveUnitAtAim(caster, { x: aimX, y: aimY }, engine.units);
    }
}

/**
 * Factory for unit-pick select steps (center-to-center range, generous cursor snap).
 * `includeCaster` lets the caster select themselves — only meaningful for
 * `filter: 'ally'` / `'any'` SelectTargetDefs (a `filter: 'enemy'` caster can
 * never pass the team check anyway).
 */
export function unitRangeHitbox(maxRange: number, minRange = 0, includeCaster = false): UnitRangeHitboxSpec {
    return new UnitRangeHitboxSpec(maxRange, minRange, includeCaster);
}
