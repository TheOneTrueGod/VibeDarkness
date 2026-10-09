/**
 * TileAreaHitboxSpec — ground-only tile-area select hitbox.
 *
 * One hitbox covers every tile-area select: an anchor tile picked by the player, plus a shape of
 * cell offsets around it. Ground-only: it never produces a unit lock-on. The committed order is the
 * pixel, and the ability derives its cells from that pixel with `resolveCells`, the same call the
 * preview uses, so preview and effect cannot drift.
 *
 * Anchors:
 * - `chebyshev`: the aim tile clamped to `maxTileOffset` tiles from the caster on each axis.
 * - `adjacentCardinal`: the caster-adjacent tile the aim points at, by dominant axis. Null when the
 *   aim sits exactly on the caster.
 *
 * Shapes (`tileShapes`): `single()`, `square(half)`, `plus()`. A custom shape is a list of offsets.
 * Cell order is shape order, so `plus()` puts the centre first.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import {
    snapSquareTileAreaCenter,
    snapAdjacentCardinalTile,
    worldToTile,
    tileCentre,
    type TileCoord,
} from '../abilities/tileAreaHelpers';
import { drawArrow, drawTileAreaTelegraph } from '../abilities/previewHelpers';
import { TELEGRAPH_STYLES, type TelegraphStyle } from '../abilities/telegraphStyles';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';
import { drawInvalidPickCross } from './invalidPickPreview';

/** Inset of the invalid cross from the anchor tile's edges, in px. */
const INVALID_TILE_CROSS_INSET = 6;

/** A cell offset from the anchor tile. */
export interface TileOffset {
    dCol: number;
    dRow: number;
}

export const tileShapes = {
    /** The anchor tile only. */
    single(): TileOffset[] {
        return [{ dCol: 0, dRow: 0 }];
    },
    /** A (2*half+1) x (2*half+1) block, row-major. */
    square(half: number): TileOffset[] {
        const offsets: TileOffset[] = [];
        for (let dRow = -half; dRow <= half; dRow++) {
            for (let dCol = -half; dCol <= half; dCol++) offsets.push({ dCol, dRow });
        }
        return offsets;
    },
    /** Centre, then north, east, south and west. The centre is always first. */
    plus(): TileOffset[] {
        return [
            { dCol: 0, dRow: 0 },
            { dCol: 0, dRow: -1 },
            { dCol: 1, dRow: 0 },
            { dCol: 0, dRow: 1 },
            { dCol: -1, dRow: 0 },
        ];
    },
};

export type TileAreaAnchor =
    | { kind: 'chebyshev'; maxTileOffset: number }
    | { kind: 'adjacentCardinal' };

export interface TileAreaHitboxOptions {
    anchor: TileAreaAnchor;
    shape: readonly TileOffset[];
    /** Nominal px tether for the select step and range derivation (see `castRange` docs below). */
    castRange: number;
    /** Telegraph palette. Defaults to `TELEGRAPH_STYLES.danger`; any field may be overridden. */
    style?: Partial<TelegraphStyle>;
    /** Stroke the internal boundaries between cells. Default false. */
    gridLines?: boolean;
    /** Draw an arrow from the caster toward the anchor tile. Requires an `adjacentCardinal` anchor. */
    directionArrow?: boolean;
}

export class TileAreaHitboxSpec extends HitboxSpec {
    readonly anchor: TileAreaAnchor;
    readonly shape: readonly TileOffset[];
    /**
     * Nominal px tether for the select step / `defineAbility` range derivation. The authoritative
     * limit is the anchor (`maxTileOffset`), re-applied by `resolveAnchor`. Kept loose so the
     * targeting tool's radial clamp never trims a legal far pick onto a different tile.
     */
    readonly castRange: number;
    readonly gridLines: boolean;
    readonly directionArrow: boolean;
    private readonly style: TelegraphStyle;

    constructor(opts: TileAreaHitboxOptions) {
        super();
        if (opts.shape.length === 0) throw new Error('TileAreaHitboxSpec: shape must have at least one cell');
        if (opts.directionArrow && opts.anchor.kind !== 'adjacentCardinal') {
            throw new Error('TileAreaHitboxSpec: directionArrow requires an adjacentCardinal anchor');
        }
        this.anchor = opts.anchor;
        this.shape = opts.shape.map((o) => ({ dCol: o.dCol, dRow: o.dRow }));
        this.castRange = opts.castRange;
        this.gridLines = opts.gridLines ?? false;
        this.directionArrow = opts.directionArrow ?? false;
        this.style = { ...TELEGRAPH_STYLES.danger, ...opts.style };
    }

    get maxRange(): number {
        return this.castRange;
    }

    /** Ground-only: never a unit lock-on. */
    override get numTargets(): number {
        return 0;
    }

    /**
     * The anchor tile for an aim point. Null only for an `adjacentCardinal` anchor aimed exactly at
     * the caster; a `chebyshev` anchor always exists.
     */
    resolveAnchor(caster: { x: number; y: number }, aim: { x: number; y: number }): TileCoord | null {
        if (this.anchor.kind === 'chebyshev') {
            return snapSquareTileAreaCenter(caster.x, caster.y, aim.x, aim.y, this.anchor.maxTileOffset);
        }
        return snapAdjacentCardinalTile(caster.x, caster.y, aim.x, aim.y);
    }

    /** The cells the shape covers around `anchor`. Not bounds-filtered: callers with grid access skip out-of-bounds cells. */
    cellsAround(anchor: TileCoord): TileCoord[] {
        return this.shape.map((o) => ({ col: anchor.col + o.dCol, row: anchor.row + o.dRow }));
    }

    /** Cells covered for an aim point, or an empty list when there is no anchor. */
    resolveCells(caster: { x: number; y: number }, aim: { x: number; y: number }): TileCoord[] {
        const anchor = this.resolveAnchor(caster, aim);
        return anchor ? this.cellsAround(anchor) : [];
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): Unit[] {
        gr.clear();
        const anchor = this.resolveAnchor(caster, mouseWorld);
        if (!anchor) return [];
        drawTileAreaTelegraph(gr, this.cellsAround(anchor), this.style, { gridLines: this.gridLines });
        if (this.directionArrow) {
            const from = worldToTile(caster.x, caster.y);
            drawArrow(gr, tileCentre(anchor), anchor.col - from.col, anchor.row - from.row, this.style.color);
        }
        return [];
    }

    /**
     * Greys the cells the pick would cover and draws one cross on the anchor tile. An aim with no
     * anchor (an adjacentCardinal aimed at the caster) gets the default cross at the aim point.
     */
    override renderInvalidPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        aim: { x: number; y: number },
    ): void {
        const anchor = this.resolveAnchor(caster, aim);
        if (!anchor) {
            drawInvalidPickCross(gr, aim.x, aim.y);
            return;
        }
        drawTileAreaTelegraph(gr, this.cellsAround(anchor), TELEGRAPH_STYLES.invalid);
        const centre = tileCentre(anchor);
        drawInvalidPickCross(gr, centre.x, centre.y, CELL_SIZE / 2 - INVALID_TILE_CROSS_INSET);
    }

    resolveTargets(_caster: Unit, _aimPoint: { x: number; y: number }, _units: Unit[]): Unit[] {
        return [];
    }

    resolveHits(
        _engine: HitboxEngineContext,
        _caster: Unit,
        _aimX: number,
        _aimY: number,
        _lockOnId?: string,
    ): Unit[] {
        return [];
    }
}

export function tileAreaHitbox(opts: TileAreaHitboxOptions): TileAreaHitboxSpec {
    return new TileAreaHitboxSpec(opts);
}
