/**
 * SquareTileAreaHitboxSpec — ground-only square tile-area select hitbox.
 *
 * The player clicks a point; it is tile-snapped and Chebyshev-clamped to
 * `maxTileOffset` tiles from the caster (via `abilities/tileAreaHelpers`), and a
 * (2*areaHalfTiles+1)^2 grid-aligned square is drawn there. It never produces a
 * unit lock-on — the committed order is the pixel (`allowMiss: true` on the
 * SelectTargetDef). The ability re-derives the region from that pixel with the
 * same snap helper, so preview and effect can't drift.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import {
    snapSquareTileAreaCenter,
    squareTileAreaWorldRect,
} from '../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export interface SquareTileAreaPreviewStyle {
    color?: number;
    lineWidth?: number;
    fillAlpha?: number;
    strokeAlpha?: number;
    /** Draw the internal tile grid lines. Default true. */
    gridLines?: boolean;
}

export class SquareTileAreaHitboxSpec extends HitboxSpec {
    /** Chebyshev tile distance the region center may sit from the caster tile. */
    readonly maxTileOffset: number;
    /** Half-extent of the region in tiles (1 => 3x3). */
    readonly areaHalfTiles: number;
    /**
     * Nominal px tether for the select step / `defineAbility` range derivation.
     * The authoritative limit is `maxTileOffset`, re-applied by the shared snap
     * helper in the preview and in `doCardEffect`. Kept loose so the targeting
     * tool's radial clamp never trims a legit far-corner pick onto a different
     * tile than the drawn square.
     */
    readonly castRange: number;
    private readonly style: Required<SquareTileAreaPreviewStyle>;

    constructor(opts?: {
        maxTileOffset?: number;
        areaHalfTiles?: number;
        castRange?: number;
        previewStyle?: SquareTileAreaPreviewStyle;
    }) {
        super();
        this.maxTileOffset = opts?.maxTileOffset ?? 2;
        this.areaHalfTiles = opts?.areaHalfTiles ?? 1;
        this.castRange = opts?.castRange ?? 180;
        this.style = {
            color: opts?.previewStyle?.color ?? 0xb45309,
            lineWidth: opts?.previewStyle?.lineWidth ?? 2,
            fillAlpha: opts?.previewStyle?.fillAlpha ?? 0.14,
            strokeAlpha: opts?.previewStyle?.strokeAlpha ?? 0.6,
            gridLines: opts?.previewStyle?.gridLines ?? true,
        };
    }

    /** Nominal tether only — see `castRange` docs. */
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
        const center = snapSquareTileAreaCenter(
            caster.x,
            caster.y,
            mouseWorld.x,
            mouseWorld.y,
            this.maxTileOffset,
        );
        const rect = squareTileAreaWorldRect(center, this.areaHalfTiles);
        const { color, lineWidth, fillAlpha, strokeAlpha, gridLines } = this.style;

        gr.clear();

        // Outer square — re-issue the path for each paint (mirrors CircleAoEHitboxSpec).
        const outline = (): void => {
            gr.moveTo(rect.minX, rect.minY);
            gr.lineTo(rect.maxX, rect.minY);
            gr.lineTo(rect.maxX, rect.maxY);
            gr.lineTo(rect.minX, rect.maxY);
            gr.lineTo(rect.minX, rect.minY);
        };
        outline();
        gr.fill({ color, alpha: fillAlpha });
        outline();
        gr.stroke({ color, width: lineWidth, alpha: strokeAlpha });

        if (gridLines) {
            const span = this.areaHalfTiles * 2 + 1;
            for (let i = 1; i < span; i++) {
                const x = rect.minX + i * CELL_SIZE;
                gr.moveTo(x, rect.minY);
                gr.lineTo(x, rect.maxY);
                const y = rect.minY + i * CELL_SIZE;
                gr.moveTo(rect.minX, y);
                gr.lineTo(rect.maxX, y);
            }
            gr.stroke({ color, width: 1, alpha: strokeAlpha * 0.5 });
        }

        return [];
    }

    resolveTargets(
        _caster: Unit,
        _aimPoint: { x: number; y: number },
        _units: Unit[],
    ): Unit[] {
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

export function squareTileAreaHitbox(opts?: {
    maxTileOffset?: number;
    areaHalfTiles?: number;
    castRange?: number;
    previewStyle?: SquareTileAreaPreviewStyle;
}): SquareTileAreaHitboxSpec {
    return new SquareTileAreaHitboxSpec(opts);
}
