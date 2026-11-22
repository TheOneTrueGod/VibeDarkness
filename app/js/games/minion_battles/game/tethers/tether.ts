/**
 * Stem tethers: a vine body between a node child and its parent (`nodeTree` component).
 *
 * The tether has no state of its own. It exists while the child carries `tetherMaxLength`, and its two ends are the
 * live positions of the parent and the child, so it follows them and serializes with the units. Everything here is
 * pure geometry plus lookups; the leash clamp and the conversion to Briar run from `nodeTreeHooks.ts`.
 *
 * What a living tether does
 * - Blocks WALKING along its whole length (`isTetherStepBlocked`, called by the movement tick). The two ends'
 *   own units are exempt, so a Bud is never trapped by its own stem.
 * - Does NOT block projectiles, beams or hitboxes (they never ask), and does not block forced movement
 *   (knockback, nudge, hover) which does not go through the walk step.
 * - Keeps the child within `tetherMaxLength` of the parent (the Bud's leash; `clampToLeash`).
 * - Exposes a sway for the renderer (`tetherVinePoints`, `tetherSwayPhase`).
 * - When the child dies it becomes Briar on the tiles it covered (`tetherCoveredTiles`).
 *
 * Known limit: the nav grid does not know about tethers, so a path planned through a living tether stalls
 * against it (the unit holds and slides along it, it does not re-route). Briar, once the tether is dead, is real
 * terrain and is routed around normally.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { Unit } from '../units/Unit';
import { effectiveLeashLength, peekNodeTreeState } from '../units/components/nodeTree';

/** Half the thickness of the blocking body, in px (added to the walker's own reach). */
export const TETHER_HALF_WIDTH = 6;

export interface TetherSegment {
    /** The child end (the unit that owns the tether). */
    childId: string;
    parentId: string;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    maxLength: number;
}

export interface TetherUnitLookup {
    readonly units: readonly Unit[];
    getUnit(id: string): Unit | undefined;
}

/** The segment for a child's tether, or undefined when it has none or either end is gone. */
export function getTetherSegment(lookup: Pick<TetherUnitLookup, 'getUnit'>, child: Unit): TetherSegment | undefined {
    const state = peekNodeTreeState(child);
    if (!state || state.parentId === null || state.tetherMaxLength === null) return undefined;
    if (!child.active || !child.isAlive()) return undefined;
    const parent = lookup.getUnit(state.parentId);
    if (!parent || !parent.active || !parent.isAlive()) return undefined;
    return {
        childId: child.id,
        parentId: parent.id,
        ax: parent.x,
        ay: parent.y,
        bx: child.x,
        by: child.y,
        maxLength: effectiveLeashLength(state) ?? state.tetherMaxLength,
    };
}

/** Every living tether in the battle. */
export function listLiveTethers(lookup: TetherUnitLookup): TetherSegment[] {
    const out: TetherSegment[] = [];
    for (const unit of lookup.units) {
        if (!unit.components.has('nodeTree')) continue;
        const seg = getTetherSegment(lookup, unit);
        if (seg) out.push(seg);
    }
    return out;
}

/** Distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** True when segment p0-p1 properly crosses segment a-b. */
export function segmentsCross(
    p0x: number, p0y: number, p1x: number, p1y: number,
    ax: number, ay: number, bx: number, by: number,
): boolean {
    const d1 = cross(p0x, p0y, p1x, p1y, ax, ay);
    const d2 = cross(p0x, p0y, p1x, p1y, bx, by);
    const d3 = cross(ax, ay, bx, by, p0x, p0y);
    const d4 = cross(ax, ay, bx, by, p1x, p1y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Would a walk step (x0,y0) -> (x1,y1) go through the tether? True when the step crosses it, or ends inside its
 * body having started outside (a walker already inside it, e.g. spawned on it, may move away).
 */
export function isStepBlockedByTether(
    seg: TetherSegment,
    walkerReach: number,
    x0: number, y0: number, x1: number, y1: number,
): boolean {
    if (x0 === x1 && y0 === y1) return false;
    if (segmentsCross(x0, y0, x1, y1, seg.ax, seg.ay, seg.bx, seg.by)) return true;
    const reach = TETHER_HALF_WIDTH + walkerReach;
    const before = distanceToSegment(x0, y0, seg.ax, seg.ay, seg.bx, seg.by);
    const after = distanceToSegment(x1, y1, seg.ax, seg.ay, seg.bx, seg.by);
    return after < reach && after < before;
}

/** Walk step through any living tether? The two units at the tether's ends are exempt. */
export function isTetherStepBlocked(
    lookup: TetherUnitLookup,
    walker: Unit,
    x0: number, y0: number, x1: number, y1: number,
): boolean {
    const reach = walker.radius * 0.5;
    for (const unit of lookup.units) {
        if (unit === walker || !unit.components.has('nodeTree')) continue;
        const seg = getTetherSegment(lookup, unit);
        if (!seg || seg.parentId === walker.id) continue;
        if (isStepBlockedByTether(seg, reach, x0, y0, x1, y1)) return true;
    }
    return false;
}

/**
 * The walk step to take toward (x1,y1): unchanged when clear, else its X-only or Y-only part (longer axis first) so
 * the walker slides along the vine. Null when blocked either way (the walker holds).
 */
export function slideAlongTethers(
    lookup: TetherUnitLookup,
    walker: Unit,
    x0: number, y0: number, x1: number, y1: number,
): { x: number; y: number } | null {
    if (!isTetherStepBlocked(lookup, walker, x0, y0, x1, y1)) return { x: x1, y: y1 };
    const xFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    const candidates = xFirst ? [[x1, y0], [x0, y1]] : [[x0, y1], [x1, y0]];
    for (const [x, y] of candidates) {
        if ((x !== x0 || y !== y0) && !isTetherStepBlocked(lookup, walker, x0, y0, x, y)) return { x, y };
    }
    return null;
}

/** The point at most `maxLength` from the parent along the line to (x,y): the leash clamp. */
export function clampToLeash(
    parentX: number, parentY: number, x: number, y: number, maxLength: number,
): { x: number; y: number } {
    const dx = x - parentX;
    const dy = y - parentY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxLength || dist === 0) return { x, y };
    const k = maxLength / dist;
    return { x: parentX + dx * k, y: parentY + dy * k };
}

/** Grid cells the straight tether covers (each once, in order from the parent end to the child end). */
export function tetherCoveredTiles(
    ax: number, ay: number, bx: number, by: number,
): { col: number; row: number }[] {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / (CELL_SIZE / 4)));
    const seen = new Set<string>();
    const out: { col: number; row: number }[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const col = Math.floor((ax + (bx - ax) * t) / CELL_SIZE);
        const row = Math.floor((ay + (by - ay) * t) / CELL_SIZE);
        const key = `${col},${row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ col, row });
    }
    return out;
}

/** Stable per-tether phase offset (radians) so neighbouring vines do not sway in step. Pure function of the id. */
export function tetherSwayPhase(childId: string): number {
    let h = 2166136261;
    for (let i = 0; i < childId.length; i++) {
        h ^= childId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 6283) / 1000;
}

/** Effect type of the render-only fade a Stem plays when its node withers instead of becoming Briar. */
export const STEM_WITHER_EFFECT_TYPE = 'StemWither';

/** Sway amplitude in px, and how many segments a vine is drawn with. */
export const TETHER_SWAY_AMPLITUDE = 7;
export const TETHER_SEGMENTS = 12;

/**
 * Vine polyline for the renderer: `segments + 1` points from the parent end to the child end, offset sideways by a
 * wave that travels from the parent to the child over `timeSec`. The ends do not move (the wave is pinned to 0 there).
 */
export function tetherVinePoints(
    seg: Pick<TetherSegment, 'ax' | 'ay' | 'bx' | 'by' | 'childId'>,
    timeSec: number,
    segments: number = TETHER_SEGMENTS,
): { x: number; y: number }[] {
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const phase = tetherSwayPhase(seg.childId);
    // Longer vines get more waves, capped so a short stem does not look frantic.
    const waves = Math.max(1, Math.min(4, len / 90));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const envelope = Math.sin(Math.PI * t);
        const offset = Math.sin(t * Math.PI * 2 * waves - timeSec * 2.4 + phase) * TETHER_SWAY_AMPLITUDE * envelope;
        points.push({ x: seg.ax + dx * t + nx * offset, y: seg.ay + dy * t + ny * offset });
    }
    return points;
}
