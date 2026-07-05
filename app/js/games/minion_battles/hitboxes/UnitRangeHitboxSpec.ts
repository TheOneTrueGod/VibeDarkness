/**
 * UnitRangeHitboxSpec — pick a unit under the cursor within caster min/max range.
 *
 * Preview: range rings, aim line, crosshair on a valid unit. Lock-on resolves the
 * unit whose circle contains the aim point when caster-to-unit-center distance is in range.
 * Team filtering is left to `SelectTargetDef.filter` / callers.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { getUnitAtPosition } from '../abilities/targeting';
import { drawCrosshair, drawRangeRings } from '../abilities/previewHelpers';

const UNIT_RANGE_AIM_LINE_STROKE = { color: 0xc8c8c8, width: 2, alpha: 0.6 };

export class UnitRangeHitboxSpec extends HitboxSpec {
    readonly maxRange: number;
    readonly minRange: number;

    constructor(maxRange: number, minRange = 0) {
        super();
        this.maxRange = maxRange;
        this.minRange = minRange;
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
        const unit = getUnitAtPosition(aimPoint, units);
        if (!unit || unit.id === caster.id) return [];
        if (!this.unitCenterDistanceInRange(caster, unit)) return [];
        return [unit];
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        gr.clear();
        drawRangeRings(gr, caster.x, caster.y, this.minRange, this.maxRange);

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(mouseWorld.x, mouseWorld.y);
        gr.stroke(UNIT_RANGE_AIM_LINE_STROKE);

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

/** Factory for unit-pick select steps (center-to-center range, no radius padding). */
export function unitRangeHitbox(maxRange: number, minRange = 0): UnitRangeHitboxSpec {
    return new UnitRangeHitboxSpec(maxRange, minRange);
}
