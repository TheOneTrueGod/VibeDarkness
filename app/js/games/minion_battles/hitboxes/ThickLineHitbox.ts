/**
 * ThickLineHitbox - Line segment with thickness.
 *
 * Returns all enemy units whose center is within (unit radius + line thickness)
 * of the line segment from (x0, y0) to (x1, y1).
 * Overrides renderPreview to draw range ring + thick line (lighter fill, darker stroke).
 */

import type { Unit } from '../objects/Unit';
import { Hitbox, type HitboxEngineContext, type HitboxPreviewCaster } from './Hitbox';
import { areEnemies } from '../game/teams';
import { clampToMaxRange } from '../abilities/previewHelpers';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';

/** Minimum distance from point (px, py) to segment (x0,y0)-(x1,y1). */
function pointToSegmentDistance(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    px: number,
    py: number,
): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return Math.sqrt((px - x0) ** 2 + (py - y0) ** 2);
    }
    let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
}

export abstract class ThickLineHitbox extends Hitbox {
    /**
     * Draw thick line from caster to clamped target on Pixi Graphics (for renderTargetingPreview).
     */
    static renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        maxRange: number,
        lineThickness: number,
    ): void {
        const { endX, endY } = clampToMaxRange(caster, mouseWorld, maxRange);
        const dx = endX - caster.x;
        const dy = endY - caster.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        gr.clear();
        if (len === 0) return;
        const half = lineThickness / 2;
        const perpX = (-dy / len) * half;
        const perpY = (dx / len) * half;
        const x0 = caster.x;
        const y0 = caster.y;
        gr.moveTo(x0 + perpX, y0 + perpY);
        gr.lineTo(x0 - perpX, y0 - perpY);
        gr.lineTo(endX - perpX, endY - perpY);
        gr.lineTo(endX + perpX, endY + perpY);
        gr.lineTo(x0 + perpX, y0 + perpY);
        gr.fill({ color: 0xa0a0a0, alpha: 0.5 });
        gr.stroke({ color: 0x505050, width: 2, alpha: 0.9 });
    }

    /**
     * Return all enemy units (relative to caster) that intersect the thick line:
     * segment from (x0, y0) to (x1, y1), with effective radius per unit =
     * unit.radius + lineThickness.
     */
    static getUnitsInHitbox(
        engine: HitboxEngineContext,
        caster: Unit,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        lineThickness: number,
    ): Unit[] {
        const result: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (!areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;

            const dist = pointToSegmentDistance(x0, y0, x1, y1, unit.x, unit.y);
            if (dist <= unit.radius + lineThickness) {
                result.push(unit);
            }
        }
        return result;
    }
}
