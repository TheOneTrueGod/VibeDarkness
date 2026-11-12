/**
 * OrientedRectHitbox — a rectangle centred on the (range-clamped) aim point, aimed along caster -> aim.
 *
 * `length` runs along the aim direction and `width` across it. The click picks the centre: it is
 * clamped to `maxRange` from the caster, and the rectangle turns to face away from the caster. A
 * zero-length aim (the click is on the caster) keeps the centre on the caster and faces the caster's
 * `facing` (radians), or +x when the caster has none (units have no stored facing today; deployables do).
 *
 * One geometry serves every consumer, so preview, hit and ground effect cannot drift:
 * - `renderTargetingPreview` / `renderInvalidPreview`: the telegraph.
 * - `resolveTargets` / `resolveHits`: units whose collision circle overlaps the rectangle.
 * - `resolveCells`: tiles whose centre lies inside it (for ground hazards placed under the hit).
 * - `getRect`: the world-space corners, centre and axes (for renderers and active-cast previews).
 *
 * Factory: `orientedRectAtPointHitbox({ length, width, maxRange })`.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { areEnemies } from '../game/teams';
import { filterCombatHitTargets } from '../abilities/combatTargetFilter';
import { drawClampedLine } from '../abilities/previewHelpers';
import { TELEGRAPH_STYLES, type TelegraphStyle } from '../abilities/telegraphStyles';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { TileCoord } from '../abilities/tileAreaHelpers';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { drawInvalidPickCross } from './invalidPickPreview';

/** A caster-like origin. `facing` (radians) is the fallback direction for a zero-length aim. */
export interface OrientedRectOrigin {
    x: number;
    y: number;
    facing?: number;
}

export interface OrientedRectAtPointConfig {
    /** Extent along the aim direction (px). */
    length: number;
    /** Extent across the aim direction (px). */
    width: number;
    /** Farthest the centre may sit from the caster (px). */
    maxRange: number;
    /** Max units delivered per resolve (default 99: everything inside). */
    numTargets?: number;
    /** Telegraph palette. Defaults to `TELEGRAPH_STYLES.danger`; any field may be overridden. */
    style?: Partial<TelegraphStyle>;
}

/** World-space rectangle: centre, unit axes, half extents and corners (winding order). */
export interface OrientedRect {
    centerX: number;
    centerY: number;
    /** Unit vector along the length (caster -> centre). */
    dirX: number;
    dirY: number;
    /** Half the length (along `dir`). */
    halfLength: number;
    /** Half the width (across `dir`). */
    halfWidth: number;
    /** Back-left, front-left, front-right, back-right (consistent winding). */
    corners: readonly [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

/** Aim fallback when neither the aim nor the caster gives a direction. */
const DEFAULT_DIR = { x: 1, y: 0 };
const AIM_EPSILON = 1e-6;

/** Build the rectangle for a caster aiming at `aim` (centre clamped to `maxRange`). */
export function orientedRectAt(
    caster: OrientedRectOrigin,
    aim: { x: number; y: number },
    length: number,
    width: number,
    maxRange: number,
): OrientedRect {
    const dx = aim.x - caster.x;
    const dy = aim.y - caster.y;
    const dist = Math.hypot(dx, dy);
    let dirX: number;
    let dirY: number;
    if (dist > AIM_EPSILON) {
        dirX = dx / dist;
        dirY = dy / dist;
    } else if (caster.facing != null && Number.isFinite(caster.facing)) {
        dirX = Math.cos(caster.facing);
        dirY = Math.sin(caster.facing);
    } else {
        dirX = DEFAULT_DIR.x;
        dirY = DEFAULT_DIR.y;
    }
    const centreDist = Math.min(dist, Math.max(0, maxRange));
    const centerX = caster.x + dirX * centreDist;
    const centerY = caster.y + dirY * centreDist;
    const halfLength = length / 2;
    const halfWidth = width / 2;
    // Across-axis (screen space, y down): dir (1,0) -> (0,1).
    const acrossX = -dirY;
    const acrossY = dirX;
    const corner = (along: number, across: number) => ({
        x: centerX + dirX * along + acrossX * across,
        y: centerY + dirY * along + acrossY * across,
    });
    return {
        centerX,
        centerY,
        dirX,
        dirY,
        halfLength,
        halfWidth,
        corners: [
            corner(-halfLength, -halfWidth),
            corner(halfLength, -halfWidth),
            corner(halfLength, halfWidth),
            corner(-halfLength, halfWidth),
        ],
    };
}

/** `(px, py)` in the rectangle's local frame: `along` the length, `across` the width. */
function toLocal(rect: OrientedRect, px: number, py: number): { along: number; across: number } {
    const rx = px - rect.centerX;
    const ry = py - rect.centerY;
    return {
        along: rx * rect.dirX + ry * rect.dirY,
        across: -rx * rect.dirY + ry * rect.dirX,
    };
}

/** True when the point lies inside the rectangle (edges included). */
export function pointInOrientedRect(rect: OrientedRect, px: number, py: number): boolean {
    const { along, across } = toLocal(rect, px, py);
    return Math.abs(along) <= rect.halfLength + 1e-9 && Math.abs(across) <= rect.halfWidth + 1e-9;
}

/** True when `unit`'s collision circle overlaps the rectangle. */
export function unitOverlapsOrientedRect(
    rect: OrientedRect,
    unit: Pick<Unit, 'x' | 'y' | 'radius'>,
): boolean {
    const { along, across } = toLocal(rect, unit.x, unit.y);
    const outAlong = Math.max(0, Math.abs(along) - rect.halfLength);
    const outAcross = Math.max(0, Math.abs(across) - rect.halfWidth);
    return outAlong * outAlong + outAcross * outAcross <= unit.radius * unit.radius + 1e-9;
}

/**
 * Tiles whose centre lies inside the rectangle, row-major. Not bounds-filtered: callers with grid
 * access skip out-of-bounds cells.
 */
export function cellsInOrientedRect(rect: OrientedRect): TileCoord[] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of rect.corners) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
    }
    const cells: TileCoord[] = [];
    const rowMin = Math.floor(minY / CELL_SIZE);
    const rowMax = Math.floor(maxY / CELL_SIZE);
    const colMin = Math.floor(minX / CELL_SIZE);
    const colMax = Math.floor(maxX / CELL_SIZE);
    for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
            if (pointInOrientedRect(rect, (col + 0.5) * CELL_SIZE, (row + 0.5) * CELL_SIZE)) {
                cells.push({ col, row });
            }
        }
    }
    return cells;
}

function drawRect(gr: IAbilityPreviewGraphics, rect: OrientedRect, style: TelegraphStyle): void {
    const [a, b, c, d] = rect.corners;
    gr.moveTo(a.x, a.y);
    gr.lineTo(b.x, b.y);
    gr.lineTo(c.x, c.y);
    gr.lineTo(d.x, d.y);
    gr.lineTo(a.x, a.y);
    gr.fill({ color: style.color, alpha: style.fillAlpha });
    gr.stroke({ color: style.color, width: style.lineWidth, alpha: style.strokeAlpha });
}

export class OrientedRectHitboxSpec extends HitboxSpec {
    readonly length: number;
    readonly width: number;
    /** Farthest the rectangle's centre may sit from the caster (the select step's clamp). */
    readonly maxRange: number;
    private readonly _numTargets: number;
    private readonly style: TelegraphStyle;

    override get numTargets(): number { return this._numTargets; }

    constructor(config: OrientedRectAtPointConfig) {
        super();
        this.length = config.length;
        this.width = config.width;
        this.maxRange = config.maxRange;
        this._numTargets = config.numTargets ?? 99;
        this.style = { ...TELEGRAPH_STYLES.danger, ...config.style };
    }

    /** The world-space rectangle for a caster aiming at `aim`. */
    getRect(caster: OrientedRectOrigin, aim: { x: number; y: number }): OrientedRect {
        return orientedRectAt(caster, aim, this.length, this.width, this.maxRange);
    }

    /** Tiles whose centre lies inside the rectangle (the ground-hazard footprint). */
    resolveCells(caster: OrientedRectOrigin, aim: { x: number; y: number }): TileCoord[] {
        return cellsInOrientedRect(this.getRect(caster, aim));
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const rect = this.getRect(caster, mouseWorld);
        // A centre on the caster has no line to draw (and clampToMaxRange would push it to +x).
        if (Math.hypot(rect.centerX - caster.x, rect.centerY - caster.y) > AIM_EPSILON) {
            drawClampedLine(gr, caster, { x: rect.centerX, y: rect.centerY }, this.maxRange, {
                color: this.style.color,
                width: 1.5,
                alpha: this.style.strokeAlpha * 0.6,
            });
        }
        drawRect(gr, rect, this.style);
        return this.unitsInRect(rect, units);
    }

    /** Greys the rectangle the pick would cover and draws a cross on its centre. */
    override renderInvalidPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        aim: { x: number; y: number },
    ): void {
        const rect = this.getRect(caster, aim);
        drawRect(gr, rect, TELEGRAPH_STYLES.invalid);
        drawInvalidPickCross(gr, rect.centerX, rect.centerY);
    }

    /** Lock-on candidates: units overlapping the rectangle, caster excluded. No team filter. */
    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        return this.unitsInRect(this.getRect(caster, aimPoint), units).filter((u) => u.id !== caster.id);
    }

    /** Enemies of the caster overlapping the rectangle, nearest the centre first, combat-filtered. */
    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[] {
        const rect = this.getRect(caster, { x: aimX, y: aimY });
        const inside: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;
            if (unit.id === caster.id || !areEnemies(caster.teamId, unit.teamId)) continue;
            if (unitOverlapsOrientedRect(rect, unit)) inside.push(unit);
        }
        const hits = filterCombatHitTargets(inside, engine.gameTime);
        sortNearestCentre(hits, rect);
        if (lockOnId) {
            const idx = hits.findIndex((u) => u.id === lockOnId);
            if (idx > 0) hits.unshift(...hits.splice(idx, 1));
        }
        return hits;
    }

    /** Active, alive units overlapping the rectangle, nearest the centre first. No team filter. */
    private unitsInRect(rect: OrientedRect, units: Unit[]): Unit[] {
        const result = units.filter((u) => u.active && u.isAlive() && unitOverlapsOrientedRect(rect, u));
        sortNearestCentre(result, rect);
        return result;
    }
}

function sortNearestCentre(units: Unit[], rect: OrientedRect): void {
    units.sort(
        (a, b) =>
            (a.x - rect.centerX) ** 2 + (a.y - rect.centerY) ** 2
            - ((b.x - rect.centerX) ** 2 + (b.y - rect.centerY) ** 2),
    );
}

/** A rectangle centred on the aim point (clamped to `maxRange`), aimed along caster -> aim. */
export function orientedRectAtPointHitbox(config: OrientedRectAtPointConfig): OrientedRectHitboxSpec {
    return new OrientedRectHitboxSpec(config);
}
