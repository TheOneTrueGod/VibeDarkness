/**
 * Cone wedge from a caster with an inner radius cut-off (donut-sector).
 * Used when an ability needs a forward cone that does not include the near arc
 * (e.g. Imbued Bat light burst starting past the hammer swing centre).
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { pointInCone } from '../abilities/coneGeometry';
import { areEnemies } from '../game/teams';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

function drawTruncatedConePreview(
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
    },
): void {
    const fillColor = options.fillColor ?? 0xffe066;
    const fillAlpha = options.fillAlpha ?? 0.2;
    const strokeColor = options.strokeColor ?? 0xffd700;
    const strokeAlpha = options.strokeAlpha ?? 0.55;
    const strokeWidth = options.strokeWidth ?? 1.5;
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

export type TruncatedConeMinRadiusResolver = (
    caster: { x: number; y: number },
    aimX: number,
    aimY: number,
) => number;

export interface TruncatedConeGeometry {
    dirX: number;
    dirY: number;
    centerAngle: number;
    minR: number;
    maxR: number;
    halfArcRad: number;
}

export class TruncatedConeHitboxSpec extends HitboxSpec {
    private readonly _numTargets: number;

    constructor(
        private readonly outerR: number,
        private readonly halfArcRad: number,
        private readonly resolveMinR: TruncatedConeMinRadiusResolver,
        numTargets: number = 6,
    ) {
        super();
        this._numTargets = numTargets;
    }

    get maxRange(): number { return this.outerR; }

    override get numTargets(): number { return this._numTargets; }

    getGeometry(
        caster: { x: number; y: number },
        aimX: number,
        aimY: number,
    ): TruncatedConeGeometry {
        const dx = aimX - caster.x;
        const dy = aimY - caster.y;
        const dist = Math.hypot(dx, dy);
        const dirX = dist > 1e-6 ? dx / dist : 1;
        const dirY = dist > 1e-6 ? dy / dist : 0;
        return {
            dirX,
            dirY,
            centerAngle: Math.atan2(dirY, dirX),
            minR: this.resolveMinR(caster, aimX, aimY),
            maxR: this.outerR,
            halfArcRad: this.halfArcRad,
        };
    }

    private unitsInCone(
        caster: { x: number; y: number; id?: string; teamId?: string },
        aimX: number,
        aimY: number,
        units: Unit[],
        enemiesOnly: boolean,
    ): Unit[] {
        const { dirX, dirY, minR, maxR, halfArcRad } = this.getGeometry(caster, aimX, aimY);
        return units.filter((u) => {
            if (u.id === caster.id || !u.isAlive()) return false;
            if (enemiesOnly && caster.teamId != null && !areEnemies(caster.teamId, u.teamId)) return false;
            return pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, minR, maxR, halfArcRad);
        });
    }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
        options?: {
            fillColor?: number;
            fillAlpha?: number;
            strokeColor?: number;
            strokeAlpha?: number;
            strokeWidth?: number;
        },
    ): Unit[] {
        const { centerAngle, minR, maxR, halfArcRad } = this.getGeometry(caster, mouseWorld.x, mouseWorld.y);
        drawTruncatedConePreview(gr, caster.x, caster.y, centerAngle, halfArcRad, minR, maxR, {
            fillColor: options?.fillColor ?? 0xffe066,
            fillAlpha: options?.fillAlpha ?? 0.2,
            strokeColor: options?.strokeColor ?? 0xffd700,
            strokeAlpha: options?.strokeAlpha ?? 0.55,
            strokeWidth: options?.strokeWidth ?? 1.5,
        });
        return this.unitsInCone(caster, mouseWorld.x, mouseWorld.y, units, false);
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        return this.unitsInCone(caster, aimPoint.x, aimPoint.y, units, false)
            .filter((u) => u.id !== caster.id);
    }

    resolveHits(engine: HitboxEngineContext, caster: Unit, aimX: number, aimY: number): Unit[] {
        const hits = this.unitsInCone(caster, aimX, aimY, engine.units, true);
        hits.sort((a, b) =>
            Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y),
        );
        return hits.slice(0, this._numTargets);
    }
}
