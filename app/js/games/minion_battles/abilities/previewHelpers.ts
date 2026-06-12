/**
 * Reusable helpers and presets for ability targeting previews.
 *
 * Use these to avoid duplicating canvas/graphics logic across abilities.
 *
 * Preview helper choice (must match runtime movement):
 * | Runtime movement | Preview helper |
 * |------------------|----------------|
 * | Caster `DashBehaviour` | `createMovementTargetPreview(max, step)` |
 * | Pet-sourced dash (Sic 'em → Pounce) | `createPetSourcedMovementPreview(...)` |
 * | Straight pixel clamp (projectiles, no terrain) | `createPixelTargetPreview(max)` |
 *
 * Rule: if runtime uses `computeForcedDisplacement` / `applyForcedDisplacementToward`,
 * preview must use `resolveTerrainAwareMovementDisplacement` (or a preset built on it).
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from './Ability';
import type { Unit } from '../game/units/Unit';
import type { ResolvedTarget } from '../game/types';
import { getUnitAtPosition } from './targeting';
import { areEnemies } from '../game/teams';
import { getDistanceBasedInaccuracy } from './gunInaccuracy';
import { computeForcedDisplacement, type ForcedDisplacement } from '../game/forceMove';
import type { TerrainManager } from '../terrain/TerrainManager';
import { resolveAbilitySourceUnits } from './abilitySourceUnits';

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
 * Filled pill shape along a world segment — same cross-section as {@link ThickLineHitbox.renderTargetingPreview}
 * (`lineThickness` = full width perpendicular to the segment; matches thick-line hit checks).
 */
export function drawThickLineSegmentCapsule(
    gr: IAbilityPreviewGraphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    lineThickness: number,
    style: {
        fillColor: number;
        fillAlpha: number;
        strokeColor: number;
        strokeAlpha: number;
        strokeWidth: number;
    },
): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    const half = lineThickness / 2;
    const perpX = (-dy / len) * half;
    const perpY = (dx / len) * half;
    gr.moveTo(x0 + perpX, y0 + perpY);
    gr.lineTo(x0 - perpX, y0 - perpY);
    gr.lineTo(x1 - perpX, y1 - perpY);
    gr.lineTo(x1 + perpX, y1 + perpY);
    gr.lineTo(x0 + perpX, y0 + perpY);
    gr.fill({ color: style.fillColor, alpha: style.fillAlpha });
    gr.stroke({ color: style.strokeColor, width: style.strokeWidth, alpha: style.strokeAlpha });
}

/** Multiply RGB channels for a darker preview stroke. */
function dimPreviewColor(color: number, factor: number): number {
    const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
    const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
    const b = Math.min(255, Math.round((color & 0xff) * factor));
    return (r << 16) | (g << 8) | b;
}

/** Inner timing stroke: between full tint and outer dim — readable but calmer than base colour. */
const CHARGE_TIMING_INNER_DIM = 0.78;

/**
 * Charge-style capsule telegraph: soft fill, outer border uses the dimmed hue with alpha ramp,
 * inner timing ring is **stroke only**, stretched along the segment from the caster toward the far end as `elapsed` approaches `prefireTime`.
 */
export function drawChargeCapsuleTimingTelegraph(
    gr: IAbilityPreviewGraphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    lineThickness: number,
    elapsed: number,
    prefireTime: number,
    color: number,
    style?: {
        fillAlpha?: number;
        /** Outer stroke alpha at cast start (should be slightly above `fillAlpha`). */
        outerStrokeAlphaStart?: number;
        outerStrokeAlphaEnd?: number;
        innerStrokeWidth?: number;
        outerStrokeWidth?: number;
    },
): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;

    const half = lineThickness / 2;
    const perpX = (-dy / len) * half;
    const perpY = (dx / len) * half;

    const corners = [
        { x: x0 + perpX, y: y0 + perpY },
        { x: x0 - perpX, y: y0 - perpY },
        { x: x1 - perpX, y: y1 - perpY },
        { x: x1 + perpX, y: y1 + perpY },
    ];

    const fillAlpha = style?.fillAlpha ?? 0.28;
    const outerStart = style?.outerStrokeAlphaStart ?? fillAlpha + 0.1;
    const outerEnd = style?.outerStrokeAlphaEnd ?? 0.88;
    const innerW = style?.innerStrokeWidth ?? 2;
    const outerW = style?.outerStrokeWidth ?? 2;

    const expandT = prefireTime > 0 ? Math.min(1, elapsed / prefireTime) : 1;
    const outerStrokeAlpha = outerStart + (outerEnd - outerStart) * expandT;

    const fillC = corners[0]!;
    gr.moveTo(fillC.x, fillC.y);
    for (let i = 1; i < 4; i++) {
        const p = corners[i]!;
        gr.lineTo(p.x, p.y);
    }
    gr.lineTo(fillC.x, fillC.y);
    gr.fill({ color, alpha: fillAlpha });

    const o0 = corners[0]!;
    gr.moveTo(o0.x, o0.y);
    for (let i = 1; i < 4; i++) {
        const p = corners[i]!;
        gr.lineTo(p.x, p.y);
    }
    gr.lineTo(o0.x, o0.y);
    const borderDim = dimPreviewColor(color, 0.52);
    gr.stroke({ color: borderDim, width: outerW, alpha: outerStrokeAlpha });

    if (expandT > 1e-4) {
        const fx = x0 + expandT * (x1 - x0);
        const fy = y0 + expandT * (y1 - y0);
        const nearLx = x0 + perpX;
        const nearLy = y0 + perpY;
        const nearRx = x0 - perpX;
        const nearRy = y0 - perpY;
        const farLx = fx + perpX;
        const farLy = fy + perpY;
        const farRx = fx - perpX;
        const farRy = fy - perpY;

        gr.moveTo(nearLx, nearLy);
        gr.lineTo(farLx, farLy);
        gr.lineTo(farRx, farRy);
        gr.lineTo(nearRx, nearRy);
        gr.lineTo(nearLx, nearLy);
        const timingColor = dimPreviewColor(color, CHARGE_TIMING_INNER_DIM);
        gr.stroke({ color: timingColor, width: innerW, alpha: 0.92 });
    }
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
    gameState?: unknown,
) => void;

/** Read terrain from the engine passed as `gameState` in preview callbacks. */
export function getTerrainManagerFromGameState(gameState?: unknown): TerrainManager | null {
    if (!gameState || typeof gameState !== 'object' || !('terrainManager' in gameState)) {
        return null;
    }
    return (gameState as { terrainManager?: TerrainManager | null }).terrainManager ?? null;
}

/**
 * Terrain-aware displacement toward a pixel target — same math as `DashBehaviour` /
 * `applyForcedDisplacementToward`. Use for previews and windup endpoint calculation.
 */
export function resolveTerrainAwareMovementDisplacement(
    originX: number,
    originY: number,
    towardX: number,
    towardY: number,
    maxDistance: number,
    gameState?: unknown,
    collisionStep: number = 4,
): ForcedDisplacement {
    return computeForcedDisplacement(
        originX,
        originY,
        towardX,
        towardY,
        maxDistance,
        { terrainManager: getTerrainManagerFromGameState(gameState), step: collisionStep },
    );
}

export interface TerrainAwareMovementLineStyle {
    lineStroke: { color: number; width: number; alpha?: number };
    endpointRingStroke?: { color: number; width: number; alpha?: number };
    endpointRadiusScale?: number;
}

const DEFAULT_MOVEMENT_LINE_STROKE = { color: 0xc0c0c0, width: 2, alpha: 0.6 };

/**
 * Draw a terrain-aware dash line from origin toward target. Returns endpoint and distance moved.
 */
export function drawTerrainAwareMovementLine(
    gr: IAbilityPreviewGraphics,
    originX: number,
    originY: number,
    towardX: number,
    towardY: number,
    maxDistance: number,
    options: {
        gameState?: unknown;
        collisionStep?: number;
        style?: Partial<TerrainAwareMovementLineStyle>;
        endpointRadius?: number;
    } = {},
): ForcedDisplacement & { endX: number; endY: number } {
    const { dx, dy, distance } = resolveTerrainAwareMovementDisplacement(
        originX,
        originY,
        towardX,
        towardY,
        maxDistance,
        options.gameState,
        options.collisionStep ?? 4,
    );
    if (distance <= 0) {
        return { dx: 0, dy: 0, distance: 0, endX: originX, endY: originY };
    }
    const endX = originX + dx;
    const endY = originY + dy;
    const lineStroke = options.style?.lineStroke ?? DEFAULT_MOVEMENT_LINE_STROKE;
    gr.moveTo(originX, originY);
    gr.lineTo(endX, endY);
    gr.stroke(lineStroke);

    const ringRadius = options.endpointRadius ?? 0;
    if (ringRadius > 0) {
        const ringStroke = options.style?.endpointRingStroke ?? {
            color: lineStroke.color,
            width: 2,
            alpha: 0.8,
        };
        gr.circle(endX, endY, ringRadius);
        gr.stroke(ringStroke);
    }

    return { dx, dy, distance, endX, endY };
}

/** Draw a faint X at the caster when a pet-sourced command has no living pets. */
export function drawNoPetSourceFizzle(
    gr: IAbilityPreviewGraphics,
    caster: Unit,
): void {
    gr.moveTo(caster.x - 8, caster.y - 8);
    gr.lineTo(caster.x + 8, caster.y + 8);
    gr.moveTo(caster.x + 8, caster.y - 8);
    gr.lineTo(caster.x - 8, caster.y + 8);
    gr.stroke({ color: 0x888888, width: 2, alpha: 0.5 });
}

export interface PetSourcedMovementPreviewOptions {
    maxDistance: number;
    collisionStep?: number;
    style?: Partial<TerrainAwareMovementLineStyle>;
}

/**
 * Preset: command card that orders a pet dash (e.g. Sic 'em → Pounce).
 * Origin = `resolveAbilitySourceUnits` (nearest pet to aim point), not the caster.
 * Path = terrain-aware displacement matching the delegate ability's `DashBehaviour`.
 */
export function createPetSourcedMovementPreview(
    ability: Pick<AbilityStatic, 'abilitySource'> & {
        abilitySource: { type: 'pet'; selector: 'nearest' | 'all' };
    },
    options: PetSourcedMovementPreviewOptions,
): RenderTargetingPreviewFn {
    const collisionStep = options.collisionStep ?? 4;
    return (gr, caster, _currentTargets, mouseWorld, units, gameState) => {
        gr.clear();
        const sourcePets = resolveAbilitySourceUnits(ability, caster, units, mouseWorld);
        const pet = sourcePets[0];
        if (!pet) {
            drawNoPetSourceFizzle(gr, caster);
            return;
        }
        drawTerrainAwareMovementLine(
            gr,
            pet.x,
            pet.y,
            mouseWorld.x,
            mouseWorld.y,
            options.maxDistance,
            {
                gameState,
                collisionStep,
                style: options.style,
                endpointRadius: pet.radius * (options.style?.endpointRadiusScale ?? 1.1),
            },
        );
    };
}

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
 * Preset: Terrain-aware pixel-target preview for dash/movement abilities.
 * Uses computeForcedDisplacement to show the actual reachable endpoint after terrain collision,
 * matching how DashBehaviour resolves movement at runtime.
 */
export function createMovementTargetPreview(
    maxDistance: number,
    collisionStep: number = 4,
): RenderTargetingPreviewFn {
    return (gr, caster, _currentTargets, mouseWorld, _units, gameState) => {
        gr.clear();
        drawTerrainAwareMovementLine(
            gr,
            caster.x,
            caster.y,
            mouseWorld.x,
            mouseWorld.y,
            maxDistance,
            { gameState, collisionStep },
        );
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
    options: {
        fillColor?: number;
        fillAlpha?: number;
        strokeColor?: number;
        strokeAlpha?: number;
        strokeWidth?: number;
        /** When true, only fill is drawn (no outline). */
        omitStroke?: boolean;
    } = {},
): void {
    const fillColor = options.fillColor ?? 0xff0000;
    const fillAlpha = options.fillAlpha ?? 0.2;
    const strokeColor = options.strokeColor ?? 0xff0000;
    const strokeAlpha = options.strokeAlpha ?? 0.45;
    const strokeWidth = options.strokeWidth ?? 2;
    const omitStroke = options.omitStroke ?? false;
    const startAngle = angleRad - halfAngleRad;
    const endAngle = angleRad + halfAngleRad;
    gr.moveTo(centerX + Math.cos(startAngle) * maxR, centerY + Math.sin(startAngle) * maxR);
    gr.lineTo(centerX + Math.cos(endAngle) * maxR, centerY + Math.sin(endAngle) * maxR);
    gr.lineTo(centerX + Math.cos(endAngle) * minR, centerY + Math.sin(endAngle) * minR);
    gr.lineTo(centerX + Math.cos(startAngle) * minR, centerY + Math.sin(startAngle) * minR);
    gr.lineTo(centerX + Math.cos(startAngle) * maxR, centerY + Math.sin(startAngle) * maxR);
    gr.fill({ color: fillColor, alpha: fillAlpha });
    if (!omitStroke && strokeWidth > 0) {
        gr.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
    }
}

/** Faint red for enemy projected-hitbox outline before the strike. */
const ENEMY_HITBOX_TELEGRAPH_BORDER_FAINT = 0.14;

/** Alpha for the expanding inner fill (cone / quad) before it reaches full footprint. */
const ENEMY_HITBOX_TELEGRAPH_EXPAND_FILL = 0.38;

/**
 * Progress 0→1 from cast start to `prefireTime` (expanding inner shape); stays at 1 after.
 */
export function enemyHitboxTelegraphExpandT(elapsed: number, prefireTime: number): number {
    if (prefireTime <= 0) return 1;
    return Math.min(1, elapsed / prefireTime);
}

/**
 * Outer border alpha: faint early, ramps to 1 at `prefireTime`, stays 1 until `holdFullRedUntil`,
 * then eases back to a readable faint outline for any remaining cast time.
 */
export function enemyHitboxTelegraphBorderAlpha(
    elapsed: number,
    prefireTime: number,
    holdFullRedUntil: number,
): number {
    if (prefireTime <= 0) return 1;
    if (elapsed < prefireTime) {
        const t = elapsed / prefireTime;
        return ENEMY_HITBOX_TELEGRAPH_BORDER_FAINT + (1 - ENEMY_HITBOX_TELEGRAPH_BORDER_FAINT) * t;
    }
    if (elapsed < holdFullRedUntil) return 1;
    return 0.22;
}

export interface EnemyConeTelegraphOptions {
    /** Color for fills and strokes (default red). */
    color?: number;
    /** Seconds after prefire where the border stays fully red (e.g. impact flash). */
    holdFullRedUntilOffset?: number;
    /** Extra fill alpha on the full-size slice during the hold window (melee “flash”). */
    flashFillBoost?: number;
}

/**
 * Enemy cone / annular-sector telegraph: faint full outline, vibrant fill expanding from the
 * middle radius to the final ring, border alpha hits 1 when damage fires, then stays red until
 * `holdFullRedUntilOffset` after prefire.
 */
export function drawEnemyConeHitboxTelegraph(
    gr: IAbilityPreviewGraphics,
    centerX: number,
    centerY: number,
    angleRad: number,
    halfAngleRad: number,
    minR: number,
    maxR: number,
    elapsed: number,
    prefireTime: number,
    options?: EnemyConeTelegraphOptions,
): void {
    const color = options?.color ?? 0xff0000;
    const holdEnd = prefireTime + (options?.holdFullRedUntilOffset ?? 0);
    const expandT = enemyHitboxTelegraphExpandT(elapsed, prefireTime);
    const borderA = enemyHitboxTelegraphBorderAlpha(elapsed, prefireTime, holdEnd);
    const midR = (minR + maxR) / 2;
    const innerE = midR + (minR - midR) * expandT;
    const outerE = midR + (maxR - midR) * expandT;

    drawConeSlice(gr, centerX, centerY, angleRad, halfAngleRad, innerE, outerE, {
        fillColor: color,
        fillAlpha: ENEMY_HITBOX_TELEGRAPH_EXPAND_FILL,
        strokeColor: color,
        strokeAlpha: 0,
        omitStroke: true,
    });

    const inHold = elapsed >= prefireTime && elapsed < holdEnd;
    const flashBoost = inHold ? (options?.flashFillBoost ?? 0) : 0;
    drawConeSlice(gr, centerX, centerY, angleRad, halfAngleRad, minR, maxR, {
        fillColor: color,
        fillAlpha: 0.08 + flashBoost,
        strokeColor: color,
        strokeAlpha: borderA,
        strokeWidth: 2,
    });
}

/**
 * Convex quad telegraph (e.g. hitbox in world space): expand from center to final corners,
 * same border rules as {@link drawEnemyConeHitboxTelegraph}.
 */
export function drawEnemyConvexQuadHitboxTelegraph(
    gr: IAbilityPreviewGraphics,
    corners: readonly { x: number; y: number }[],
    centerX: number,
    centerY: number,
    elapsed: number,
    prefireTime: number,
    options?: { color?: number; holdFullRedUntilOffset?: number },
): void {
    if (corners.length < 4) return;
    const color = options?.color ?? 0xff0000;
    const holdEnd = prefireTime + (options?.holdFullRedUntilOffset ?? 0);
    const expandT = enemyHitboxTelegraphExpandT(elapsed, prefireTime);
    const borderA = enemyHitboxTelegraphBorderAlpha(elapsed, prefireTime, holdEnd);

    const ex = corners.map((c) => ({
        x: centerX + (c.x - centerX) * expandT,
        y: centerY + (c.y - centerY) * expandT,
    }));

    gr.moveTo(ex[0]!.x, ex[0]!.y);
    for (let i = 1; i < ex.length; i++) {
        gr.lineTo(ex[i]!.x, ex[i]!.y);
    }
    gr.lineTo(ex[0]!.x, ex[0]!.y);
    gr.fill({ color: color, alpha: ENEMY_HITBOX_TELEGRAPH_EXPAND_FILL });

    gr.moveTo(corners[0]!.x, corners[0]!.y);
    for (let i = 1; i < corners.length; i++) {
        gr.lineTo(corners[i]!.x, corners[i]!.y);
    }
    gr.lineTo(corners[0]!.x, corners[0]!.y);
    gr.fill({ color: color, alpha: 0.1 });
    gr.stroke({ color: color, width: 2, alpha: borderA });
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
