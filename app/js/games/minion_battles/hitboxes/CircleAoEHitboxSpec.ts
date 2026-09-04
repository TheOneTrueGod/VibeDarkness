/**
 * Ground-targeted circle AoE: cast-range clamp + impact circle at clamped aim.
 * Lock-on candidates / hits are units whose collision circle overlaps the AoE
 * disk (not the cast ring). Overlap uses aoeRadius + unit.radius.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../abilities/previewHelpers';
import { CircleHitbox, unitOverlapsCircle } from './CircleHitbox';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export interface CircleAoEPreviewStyle {
    color?: number;
    lineWidth?: number;
    lineAlpha?: number;
    fillAlpha?: number;
    strokeAlpha?: number;
    showCrosshair?: boolean;
}

export class CircleAoEHitboxSpec extends HitboxSpec {
    readonly castRange: number;
    readonly aoeRadius: number;
    private readonly _numTargets: number;
    private readonly previewStyle: Required<CircleAoEPreviewStyle>;

    constructor(
        castRange: number,
        aoeRadius: number,
        numTargets: number,
        previewStyle?: CircleAoEPreviewStyle,
    ) {
        super();
        this.castRange = castRange;
        this.aoeRadius = aoeRadius;
        this._numTargets = numTargets;
        this.previewStyle = {
            color: previewStyle?.color ?? 0xc0c0c0,
            lineWidth: previewStyle?.lineWidth ?? 2,
            lineAlpha: previewStyle?.lineAlpha ?? 0.7,
            fillAlpha: previewStyle?.fillAlpha ?? 0.15,
            strokeAlpha: previewStyle?.strokeAlpha ?? 0.5,
            showCrosshair: previewStyle?.showCrosshair ?? true,
        };
    }

    /** Cast range — clamp / lock-on tether baseline for the select step. */
    get maxRange(): number {
        return this.castRange;
    }

    override get numTargets(): number {
        return this._numTargets;
    }

    private clampAim(
        caster: { x: number; y: number },
        aim: { x: number; y: number },
    ): { x: number; y: number } {
        const clamped = clampToMaxRange(caster, aim, this.castRange);
        return { x: clamped.endX, y: clamped.endY };
    }

    private unitsInAoe(
        center: { x: number; y: number },
        units: Unit[],
        excludeId?: string,
    ): Unit[] {
        const result: Unit[] = [];
        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (excludeId != null && unit.id === excludeId) continue;
            // Match CircleHitbox combat geometry (disk overlaps unit circle).
            if (unitOverlapsCircle(unit, center.x, center.y, this.aoeRadius)) {
                result.push(unit);
            }
        }
        result.sort((a, b) => {
            const da = (a.x - center.x) ** 2 + (a.y - center.y) ** 2;
            const db = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
            return da - db;
        });
        return result;
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const style = this.previewStyle;
        const impact = this.clampAim(caster, mouseWorld);
        drawClampedLine(gr, caster, mouseWorld, this.castRange, {
            color: style.color,
            width: style.lineWidth,
            alpha: style.lineAlpha,
        });
        if (style.showCrosshair) {
            drawCrosshair(gr, impact.x, impact.y, 10, {
                color: style.color,
                width: style.lineWidth,
                alpha: 0.95,
            });
        }
        gr.circle(impact.x, impact.y, this.aoeRadius);
        gr.fill({ color: style.color, alpha: style.fillAlpha });
        gr.circle(impact.x, impact.y, this.aoeRadius);
        gr.stroke({ color: style.color, width: style.lineWidth, alpha: style.strokeAlpha });
        return this.unitsInAoe(impact, units);
    }

    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const impact = this.clampAim(caster, aimPoint);
        return this.unitsInAoe(impact, units, caster.id);
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
    ): Unit[] {
        const impact = this.clampAim(caster, { x: aimX, y: aimY });
        return CircleHitbox.getUnitsInHitbox(
            engine,
            caster,
            impact.x,
            impact.y,
            this.aoeRadius,
        );
    }
}

/**
 * Ground AoE select hitbox: `maxRange` is cast range; candidates/hits use `aoeRadius`
 * at the clamped aim point.
 */
export function circleAoEHitbox(options: {
    castRange: number;
    aoeRadius: number;
    numTargets: number;
    previewStyle?: CircleAoEPreviewStyle;
}): CircleAoEHitboxSpec {
    return new CircleAoEHitboxSpec(
        options.castRange,
        options.aoeRadius,
        options.numTargets,
        options.previewStyle,
    );
}
