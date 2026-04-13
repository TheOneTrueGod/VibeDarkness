/**
 * Reusable helpers and presets for ability targeting previews.
 *
 * Use these to avoid duplicating canvas/graphics logic across abilities.
 */

import type { IAbilityPreviewGraphics } from './Ability';
import type { Unit } from '../game/units/Unit';
import type { ResolvedTarget } from '../game/types';
import { getUnitAtPosition } from './targeting';
import { areEnemies } from '../game/teams';
import { getDistanceBasedInaccuracy } from './gunHelpers';

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

/**
 * Preset: Cone target preview with distance-based inaccuracy as half-angle.
 * Use for gun abilities (Pistol, SMG, Shotgun) that use getDistanceBasedInaccuracy.
 */
export function createConeTargetPreviewWithDistanceInaccuracy(
    maxDistance: number,
    baseInaccuracy: number,
    options?: { strokeColor?: number },
): RenderTargetingPreviewFn {
    return createConeTargetPreview({
        maxDistance,
        strokeColor: options?.strokeColor,
        getHalfAngle(caster, mouseWorld) {
            const dx = mouseWorld.x - caster.x;
            const dy = mouseWorld.y - caster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return getDistanceBasedInaccuracy(dist, baseInaccuracy);
        },
    });
}

/** Options for cone pixel target preview (for guns, shotguns, etc.). */
export interface ConeTargetPreviewOptions {
    /** Maximum distance from caster to preview end. */
    maxDistance: number;
    /** Total cone angle in radians (centered on mouse direction). Used when getHalfAngle is not provided. */
    coneAngleRad?: number;
    /**
     * Optional dynamic half-angle provider. When set, this is used instead of coneAngleRad / 2,
     * so callers can plug in distance-based inaccuracy (e.g. getDistanceBasedInaccuracy).
     */
    getHalfAngle?: (caster: Unit, mouseWorld: { x: number; y: number }) => number;
    /** Optional stroke color for cone boundary lines. */
    strokeColor?: number;
}

/**
 * Preset: Pixel target with a cone preview showing potential spread (used for SMG/shotgun).
 * Draws only the two boundary lines at +/- half cone angle (no center line).
 */
export function createConeTargetPreview(options: ConeTargetPreviewOptions): RenderTargetingPreviewFn {
    const { maxDistance, coneAngleRad = 0, getHalfAngle, strokeColor = 0xb0b0b0 } = options;
    return (gr, caster, _currentTargets, mouseWorld, _units) => {
        gr.clear();
        const { dirX, dirY } = clampToMaxRange(caster, mouseWorld, maxDistance);
        const halfAngle = getHalfAngle ? getHalfAngle(caster, mouseWorld) : coneAngleRad / 2;

        const baseAngle = Math.atan2(dirY, dirX);
        const leftAngle = baseAngle - halfAngle;
        const rightAngle = baseAngle + halfAngle;
        const leftEndX = caster.x + Math.cos(leftAngle) * maxDistance;
        const leftEndY = caster.y + Math.sin(leftAngle) * maxDistance;
        const rightEndX = caster.x + Math.cos(rightAngle) * maxDistance;
        const rightEndY = caster.y + Math.sin(rightAngle) * maxDistance;

        // Boundary lines only
        gr.moveTo(caster.x, caster.y);
        gr.lineTo(leftEndX, leftEndY);
        gr.moveTo(caster.x, caster.y);
        gr.lineTo(rightEndX, rightEndY);
        gr.stroke({ color: strokeColor, width: 1.5, alpha: 0.7 });
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

/**
 * Draw an arc wedge (inner/outer radius, half-angle) for active previews (e.g. Raise Shield).
 */
export function drawArcWedge(
    gr: IAbilityPreviewGraphics,
    centerX: number,
    centerY: number,
    centerAngleRad: number,
    halfArcRad: number,
    innerR: number,
    outerR: number,
    segments: number = 24,
    options: { fillColor?: number; fillAlpha?: number; strokeColor?: number; strokeWidth?: number; strokeAlpha?: number } = {},
): void {
    const fillColor = options.fillColor ?? 0x6b8e6b;
    const fillAlpha = options.fillAlpha ?? 0.7;
    const strokeColor = options.strokeColor ?? 0x4a6b4a;
    const strokeWidth = options.strokeWidth ?? 2;
    const strokeAlpha = options.strokeAlpha ?? 0.9;
    const startAngle = centerAngleRad - halfArcRad;
    const arcRad = halfArcRad * 2;
    gr.moveTo(centerX + outerR * Math.cos(startAngle), centerY + outerR * Math.sin(startAngle));
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const a = startAngle + t * arcRad;
        gr.lineTo(centerX + outerR * Math.cos(a), centerY + outerR * Math.sin(a));
    }
    for (let i = segments - 1; i >= 0; i--) {
        const t = i / segments;
        const a = startAngle + t * arcRad;
        gr.lineTo(centerX + innerR * Math.cos(a), centerY + innerR * Math.sin(a));
    }
    gr.lineTo(centerX + outerR * Math.cos(startAngle), centerY + outerR * Math.sin(startAngle));
    gr.fill({ color: fillColor, alpha: fillAlpha });
    gr.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
}

/**
 * Draw a cone slice (wedge between min and max radius) for active previews (e.g. enemy melee telegraph).
 */
export function drawConeSlice(
    gr: IAbilityPreviewGraphics,
    centerX: number,
    centerY: number,
    angleRad: number,
    halfAngleRad: number,
    minR: number,
    maxR: number,
    options: { fillColor?: number; fillAlpha?: number; strokeColor?: number; strokeAlpha?: number; strokeWidth?: number },
): void {
    const fillColor = options.fillColor ?? 0xff0000;
    const fillAlpha = options.fillAlpha ?? 0.2;
    const strokeColor = options.strokeColor ?? 0xff0000;
    const strokeAlpha = options.strokeAlpha ?? 0.45;
    const strokeWidth = options.strokeWidth ?? 2;
    const startAngle = angleRad - halfAngleRad;
    const endAngle = angleRad + halfAngleRad;
    gr.moveTo(centerX + Math.cos(startAngle) * maxR, centerY + Math.sin(startAngle) * maxR);
    gr.lineTo(centerX + Math.cos(endAngle) * maxR, centerY + Math.sin(endAngle) * maxR);
    gr.lineTo(centerX + Math.cos(endAngle) * minR, centerY + Math.sin(endAngle) * minR);
    gr.lineTo(centerX + Math.cos(startAngle) * minR, centerY + Math.sin(startAngle) * minR);
    gr.lineTo(centerX + Math.cos(startAngle) * maxR, centerY + Math.sin(startAngle) * maxR);
    gr.fill({ color: fillColor, alpha: fillAlpha });
    gr.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
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
