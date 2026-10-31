/**
 * Annulus around the caster. The pointer does not move it.
 * A unit is inside when its circle overlaps the outer disk and is not entirely
 * inside the inner hole. Inner and outer may be fixed or read from the caster.
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { filterCombatHitTargets } from '../abilities/combatTargetFilter';
import { areEnemies } from '../game/teams';
import type { CircleAoEPreviewStyle } from './CircleAoEHitboxSpec';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export type RingRadiusSource = number | ((caster?: HitboxPreviewCaster) => number);

function resolveRingRadius(source: RingRadiusSource, caster?: HitboxPreviewCaster): number {
    return typeof source === 'function' ? source(caster) : source;
}

/** True when `unit`'s circle overlaps the annulus and is not wholly inside the hole. */
export function unitOverlapsRing(
    unit: Pick<Unit, 'x' | 'y' | 'radius'>,
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
): boolean {
    if (outerRadius <= innerRadius) return false;
    const dist = Math.hypot(unit.x - cx, unit.y - cy);
    const overlapsOuter = dist <= outerRadius + unit.radius;
    const outsideInnerHole = dist + unit.radius > innerRadius;
    return overlapsOuter && outsideInnerHole;
}

export class RingHitboxSpec extends HitboxSpec {
    readonly innerRadius: RingRadiusSource;
    readonly outerRadius: RingRadiusSource;
    private readonly _numTargets: number;
    private readonly previewStyle: Required<CircleAoEPreviewStyle>;

    constructor(
        innerRadius: RingRadiusSource,
        outerRadius: RingRadiusSource,
        numTargets: number,
        previewStyle?: CircleAoEPreviewStyle,
    ) {
        super();
        this.innerRadius = innerRadius;
        this.outerRadius = outerRadius;
        this._numTargets = numTargets;
        this.previewStyle = {
            color: previewStyle?.color ?? 0xc0c0c0,
            lineWidth: previewStyle?.lineWidth ?? 2,
            lineAlpha: previewStyle?.lineAlpha ?? 0,
            fillAlpha: previewStyle?.fillAlpha ?? 0.15,
            strokeAlpha: previewStyle?.strokeAlpha ?? 0.5,
            showCrosshair: previewStyle?.showCrosshair ?? false,
        };
    }

    /** Outer radius when it is a constant. Lock-on tether uses this as the reach. */
    get maxRange(): number {
        return typeof this.outerRadius === 'number' ? this.outerRadius : 0;
    }

    override get numTargets(): number {
        return this._numTargets;
    }

    innerFor(caster?: HitboxPreviewCaster): number {
        return resolveRingRadius(this.innerRadius, caster);
    }

    outerFor(caster?: HitboxPreviewCaster): number {
        return resolveRingRadius(this.outerRadius, caster);
    }

    private unitsInRing(
        center: { x: number; y: number },
        units: Unit[],
        excludeId: string | undefined,
        innerRadius: number,
        outerRadius: number,
    ): Unit[] {
        const result: Unit[] = [];
        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (excludeId != null && unit.id === excludeId) continue;
            if (unitOverlapsRing(unit, center.x, center.y, innerRadius, outerRadius)) {
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
        _mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const style = this.previewStyle;
        const inner = this.innerFor(caster);
        const outer = this.outerFor(caster);
        if (outer > inner) {
            const mid = (inner + outer) / 2;
            const band = outer - inner;
            gr.circle(caster.x, caster.y, mid);
            gr.stroke({ color: style.color, width: band, alpha: style.fillAlpha });
            gr.circle(caster.x, caster.y, outer);
            gr.stroke({ color: style.color, width: style.lineWidth, alpha: style.strokeAlpha });
            gr.circle(caster.x, caster.y, inner);
            gr.stroke({ color: style.color, width: style.lineWidth, alpha: style.strokeAlpha });
        }
        return this.unitsInRing(caster, units, undefined, inner, outer);
    }

    resolveTargets(
        caster: Unit,
        _aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        return this.unitsInRing(
            caster,
            units,
            caster.id,
            this.innerFor(caster),
            this.outerFor(caster),
        );
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        _aimX: number,
        _aimY: number,
    ): Unit[] {
        const inner = this.innerFor(caster);
        const outer = this.outerFor(caster);
        const result: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;
            if (!areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (unitOverlapsRing(unit, caster.x, caster.y, inner, outer)) {
                result.push(unit);
            }
        }
        result.sort((a, b) => {
            const da = (a.x - caster.x) ** 2 + (a.y - caster.y) ** 2;
            const db = (b.x - caster.x) ** 2 + (b.y - caster.y) ** 2;
            return da - db;
        });
        return filterCombatHitTargets(result, engine.gameTime);
    }
}

/** Ring select hitbox. `maxRange` is the constant outer radius. */
export function ringHitbox(options: {
    innerRadius: RingRadiusSource;
    outerRadius: RingRadiusSource;
    numTargets: number;
    previewStyle?: CircleAoEPreviewStyle;
}): RingHitboxSpec {
    return new RingHitboxSpec(
        options.innerRadius,
        options.outerRadius,
        options.numTargets,
        options.previewStyle,
    );
}
