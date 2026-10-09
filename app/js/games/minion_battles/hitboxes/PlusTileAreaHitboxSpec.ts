/**
 * PlusTileAreaHitboxSpec — ground-only plus-sign (centre + 4 orthogonal neighbours) tile select hitbox.
 *
 * Same contract as {@link SquareTileAreaHitboxSpec}: the click is tile-snapped and Chebyshev-clamped
 * to `maxTileOffset` tiles from the caster (via `abilities/tileAreaHelpers`), never locks on to a
 * unit, and the ability re-derives its cells from the committed pixel with the same helper so the
 * preview and effect can't drift. The telegraph is a high-transparency fill per tile with a solid
 * outline around the plus's perimeter.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { snapSquareTileAreaCenter, drawPlusTileArea } from '../abilities/tileAreaHelpers';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export interface PlusTileAreaPreviewStyle {
    color?: number;
    lineWidth?: number;
    fillAlpha?: number;
    strokeAlpha?: number;
}

export class PlusTileAreaHitboxSpec extends HitboxSpec {
    /** Chebyshev tile distance the plus's centre may sit from the caster tile. */
    readonly maxTileOffset: number;
    /** Nominal px tether for the select step (see SquareTileAreaHitboxSpec.castRange). */
    readonly castRange: number;
    private readonly style: Required<PlusTileAreaPreviewStyle>;

    constructor(opts?: { maxTileOffset?: number; castRange?: number; previewStyle?: PlusTileAreaPreviewStyle }) {
        super();
        this.maxTileOffset = opts?.maxTileOffset ?? 4;
        this.castRange = opts?.castRange ?? 220;
        this.style = {
            color: opts?.previewStyle?.color ?? 0xff2a2a,
            lineWidth: opts?.previewStyle?.lineWidth ?? 2,
            fillAlpha: opts?.previewStyle?.fillAlpha ?? 0.12,
            strokeAlpha: opts?.previewStyle?.strokeAlpha ?? 0.9,
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
        const center = snapSquareTileAreaCenter(caster.x, caster.y, mouseWorld.x, mouseWorld.y, this.maxTileOffset);
        gr.clear();
        drawPlusTileArea(gr, center, this.style);
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

export function plusTileAreaHitbox(opts?: {
    maxTileOffset?: number;
    castRange?: number;
    previewStyle?: PlusTileAreaPreviewStyle;
}): PlusTileAreaHitboxSpec {
    return new PlusTileAreaHitboxSpec(opts);
}
