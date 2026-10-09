/**
 * TileSelectHitboxSpec — ground-only single-tile select hitbox.
 *
 * The click is tile-snapped and the chosen tile is highlighted (translucent fill + outline, the
 * same red telegraph style as the plus-sign hitbox). It never produces a unit lock-on; the
 * committed order is the pixel, and the ability re-derives the tile with the same helpers.
 *
 * - `within`: any tile within `maxTileOffset` (Chebyshev) of the caster tile.
 * - `adjacentCardinal`: one of the four tiles orthogonally next to the caster, chosen by the
 *   dominant axis of the aim relative to the caster (so a click anywhere snaps to a side).
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { snapSquareTileAreaCenter, snapAdjacentCardinalTile, drawTileHighlight } from '../abilities/tileAreaHelpers';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export type TileSelectMode = 'within' | 'adjacentCardinal';

export interface TileSelectPreviewStyle {
    color?: number;
    lineWidth?: number;
    fillAlpha?: number;
    strokeAlpha?: number;
}

export class TileSelectHitboxSpec extends HitboxSpec {
    readonly mode: TileSelectMode;
    readonly maxTileOffset: number;
    readonly castRange: number;
    private readonly style: Required<TileSelectPreviewStyle>;

    constructor(opts: {
        mode: TileSelectMode;
        maxTileOffset?: number;
        castRange?: number;
        previewStyle?: TileSelectPreviewStyle;
    }) {
        super();
        this.mode = opts.mode;
        this.maxTileOffset = opts.maxTileOffset ?? 2;
        this.castRange = opts.castRange ?? 160;
        this.style = {
            color: opts.previewStyle?.color ?? 0xff2a2a,
            lineWidth: opts.previewStyle?.lineWidth ?? 2,
            fillAlpha: opts.previewStyle?.fillAlpha ?? 0.12,
            strokeAlpha: opts.previewStyle?.strokeAlpha ?? 0.9,
        };
    }

    get maxRange(): number {
        return this.castRange;
    }

    /** Ground-only: never a unit lock-on. */
    override get numTargets(): number {
        return 0;
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): Unit[] {
        gr.clear();
        const tile = this.mode === 'within'
            ? snapSquareTileAreaCenter(caster.x, caster.y, mouseWorld.x, mouseWorld.y, this.maxTileOffset)
            : snapAdjacentCardinalTile(caster.x, caster.y, mouseWorld.x, mouseWorld.y);
        if (tile) drawTileHighlight(gr, tile, this.style);
        return [];
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

export function tileSelectHitbox(opts: ConstructorParameters<typeof TileSelectHitboxSpec>[0]): TileSelectHitboxSpec {
    return new TileSelectHitboxSpec(opts);
}
