/**
 * Reusable helpers and presets for ability targeting previews.
 *
 * Use these to avoid duplicating canvas/graphics logic across abilities.
 */

import type { IAbilityPreviewGraphics } from './Ability';
import type { Unit } from '../objects/Unit';
import type { ResolvedTarget } from '../engine/types';
import { getUnitAtPosition } from './targeting';
import { areEnemies } from '../engine/teams';

/** Result of clamping a target position to max range from caster. */
export interface ClampedRangeResult {
    endX: number;
    endY: number;
    dist: number;
    dirX: number;
    dirY: number;
}

/**
 * Clamp a direction (from caster to target) to max distance.
 * Returns the end point and normalized direction.
 */
export function clampToMaxRange(
    caster: { x: number; y: number },
    target: { x: number; y: number },
    maxDistance: number,
): ClampedRangeResult {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lineLength = Math.min(dist || maxDistance, maxDistance);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;
    return {
        endX: caster.x + dirX * lineLength,
        endY: caster.y + dirY * lineLength,
        dist,
        dirX,
        dirY,
    };
}

const DEFAULT_LINE_STROKE = { color: 0xc0c0c0, width: 2, alpha: 0.6 };

/**
 * Draw a line from caster to target, clamped to max distance.
 */
export function drawClampedLine(
    gr: IAbilityPreviewGraphics,
    caster: { x: number; y: number },
    target: { x: number; y: number },
    maxDistance: number,
    stroke: { color: number; width: number; alpha?: number } = DEFAULT_LINE_STROKE,
): void {
    const { endX, endY } = clampToMaxRange(caster, target, maxDistance);
    gr.moveTo(caster.x, caster.y);
    gr.lineTo(endX, endY);
    gr.stroke(stroke);
}

/**
 * Draw range rings (min optional, max required) around a center point.
 */
export function drawRangeRings(
    gr: IAbilityPreviewGraphics,
    centerX: number,
    centerY: number,
    minRadius: number,
    maxRadius: number,
    options?: { fillAlpha?: number; strokeColor?: number; strokeAlpha?: number },
): void {
    const fillAlpha = options?.fillAlpha ?? 0.15;
    const strokeColor = options?.strokeColor ?? 0xc86464;
    const strokeAlpha = options?.strokeAlpha ?? 0.7;

    gr.circle(centerX, centerY, maxRadius);
    if (fillAlpha > 0) {
        gr.fill({ color: 0xd3d3d3, alpha: fillAlpha });
    }
    if (minRadius > 0) {
        gr.circle(centerX, centerY, minRadius);
        gr.stroke({ color: strokeColor, width: 2, alpha: strokeAlpha * 0.85 });
    }
    gr.circle(centerX, centerY, maxRadius);
    gr.stroke({ color: strokeColor, width: 2, alpha: strokeAlpha });
}

const DEFAULT_CROSSHAIR_STROKE = { color: 0xff6464, width: 2, alpha: 0.95 };

/**
 * Draw a crosshair at (x, y).
 */
export function drawCrosshair(
    gr: IAbilityPreviewGraphics,
    x: number,
    y: number,
    size: number = 16,
    stroke: { color: number; width: number; alpha?: number } = DEFAULT_CROSSHAIR_STROKE,
): void {
    gr.moveTo(x - size, y);
    gr.lineTo(x + size, y);
    gr.moveTo(x, y - size);
    gr.lineTo(x, y + size);
    gr.stroke(stroke);
}

/** Signature for renderTargetingPreview used by presets. */
export type RenderTargetingPreviewFn = (
    gr: IAbilityPreviewGraphics,
    caster: Unit,
    currentTargets: ResolvedTarget[],
    mouseWorld: { x: number; y: number },
    units: Unit[],
) => void;

/**
 * Preset: Pixel-target ability with max range. Draws a clamped line from caster to mouse.
 * Use for abilities that target a point within maxDistance (e.g. Throw Knife, Dodge).
 */
export function createPixelTargetPreview(maxDistance: number): RenderTargetingPreviewFn {
    return (gr, caster, _currentTargets, mouseWorld, _units) => {
        gr.clear();
        drawClampedLine(gr, caster, mouseWorld, maxDistance);
    };
}

/** Options for createArcTargetPreview. Arc is drawn from caster toward mouse direction. */
export interface ArcTargetPreviewOptions {
    /** Arc angle in degrees (e.g. 120 for a 120° wedge). */
    arcDeg: number;
    /** Inner radius offset from caster.radius (default 0). */
    innerOffset?: number;
    /** Outer radius = caster.radius + outerThickness (default 5). */
    outerThickness?: number;
    /** Arc path segments (default 24). */
    segments?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeWidth?: number;
    strokeAlpha?: number;
}

const DEFAULT_ARC_FILL = { color: 0x6b8e6b, alpha: 0.7 };
const DEFAULT_ARC_STROKE = { color: 0x4a6b4a, width: 2, alpha: 0.9 };

/**
 * Preset: Direction (pixel) target drawn as an arc wedge from caster toward mouse.
 * Arc looks like the "active" shield/block preview: inner/outer radii, filled and stroked.
 * Use for abilities that target a direction and show a blocking arc (e.g. Raise Shield).
 */
export function createArcTargetPreview(options: ArcTargetPreviewOptions): RenderTargetingPreviewFn {
    const arcDeg = options.arcDeg;
    const arcRad = (arcDeg * Math.PI) / 180;
    const halfArcRad = arcRad / 2;
    const innerOffset = options.innerOffset ?? 0;
    const outerThickness = options.outerThickness ?? 5;
    const segments = options.segments ?? 24;
    const fillColor = options.fillColor ?? DEFAULT_ARC_FILL.color;
    const fillAlpha = options.fillAlpha ?? DEFAULT_ARC_FILL.alpha;
    const strokeColor = options.strokeColor ?? DEFAULT_ARC_STROKE.color;
    const strokeWidth = options.strokeWidth ?? DEFAULT_ARC_STROKE.width;
    const strokeAlpha = options.strokeAlpha ?? DEFAULT_ARC_STROKE.alpha;

    return (gr, caster, _currentTargets, mouseWorld, _units) => {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const centerAngle = Math.atan2(dy, dx);
        const startAngle = centerAngle - halfArcRad;
        const endAngle = centerAngle + halfArcRad;
        const innerR = caster.radius + innerOffset;
        const outerR = caster.radius + outerThickness;

        gr.clear();
        gr.moveTo(
            caster.x + outerR * Math.cos(startAngle),
            caster.y + outerR * Math.sin(startAngle),
        );
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const a = startAngle + t * arcRad;
            gr.lineTo(caster.x + outerR * Math.cos(a), caster.y + outerR * Math.sin(a));
        }
        for (let i = segments - 1; i >= 0; i--) {
            const t = i / segments;
            const a = startAngle + t * arcRad;
            gr.lineTo(caster.x + innerR * Math.cos(a), caster.y + innerR * Math.sin(a));
        }
        gr.lineTo(
            caster.x + outerR * Math.cos(startAngle),
            caster.y + outerR * Math.sin(startAngle),
        );
        gr.fill({ color: fillColor, alpha: fillAlpha });
        gr.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
    };
}

/** Options for createUnitTargetPreview. */
export interface UnitTargetPreviewOptions {
    getMinRange: (caster: Unit) => number;
    getMaxRange: (caster: Unit) => number;
}

/**
 * Preset: Unit-target ability with min/max range. Draws range rings, line to mouse,
 * and a crosshair on the unit under the cursor when it's a valid enemy target in range.
 */
export function createUnitTargetPreview(options: UnitTargetPreviewOptions): RenderTargetingPreviewFn {
    const { getMinRange, getMaxRange } = options;
    return (gr, caster, _currentTargets, mouseWorld, units) => {
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);

        gr.clear();
        drawRangeRings(gr, caster.x, caster.y, minR, maxR);

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(mouseWorld.x, mouseWorld.y);
        gr.stroke({ color: 0xc8c8c8, width: 2, alpha: 0.6 });

        const unitUnderMouse = getUnitAtPosition(mouseWorld, units);
        if (unitUnderMouse && areEnemies(caster.teamId, unitUnderMouse.teamId)) {
            const { dist } = clampToMaxRange(caster, unitUnderMouse, maxR);
            if (dist >= minR && dist <= maxR) {
                drawCrosshair(gr, unitUnderMouse.x, unitUnderMouse.y);
            }
        }
    };
}
