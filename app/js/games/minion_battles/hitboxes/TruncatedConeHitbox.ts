/**
 * Cone wedge from an origin with an optional inner radius cut-off (donut-sector).
 * Used when an ability needs a forward cone that does not include the near arc
 * (e.g. Imbued Bat light burst from the caster toward the bat swing).
 */

import type { Unit } from '../game/units/Unit';
import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { drawArcWedge } from '../abilities/previewHelpers';
import { pointInCone } from '../abilities/coneGeometry';
import { areEnemies } from '../game/teams';
import type { HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
import { HitboxSpec } from './HitboxSpec';

export type TruncatedConeMinRadiusResolver = (
    caster: { x: number; y: number },
    aimX: number,
    aimY: number,
) => number;

export type TruncatedConeOriginResolver = (
    caster: { x: number; y: number },
    aimX: number,
    aimY: number,
) => { x: number; y: number };

/** Optional aim direction when it differs from origin → click (e.g. toward the bat swing centre). */
export type TruncatedConeCenterAngleResolver = (
    caster: { x: number; y: number },
    aimX: number,
    aimY: number,
) => number;

export interface TruncatedConeGeometry {
    originX: number;
    originY: number;
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
        private readonly resolveOrigin?: TruncatedConeOriginResolver,
        private readonly resolveCenterAngle?: TruncatedConeCenterAngleResolver,
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
        const origin = this.resolveOrigin?.(caster, aimX, aimY) ?? caster;
        let centerAngle: number;
        let dirX: number;
        let dirY: number;
        if (this.resolveCenterAngle) {
            centerAngle = this.resolveCenterAngle(caster, aimX, aimY);
            dirX = Math.cos(centerAngle);
            dirY = Math.sin(centerAngle);
        } else {
            const dx = aimX - origin.x;
            const dy = aimY - origin.y;
            const dist = Math.hypot(dx, dy);
            dirX = dist > 1e-6 ? dx / dist : 1;
            dirY = dist > 1e-6 ? dy / dist : 0;
            centerAngle = Math.atan2(dirY, dirX);
        }
        return {
            originX: origin.x,
            originY: origin.y,
            dirX,
            dirY,
            centerAngle,
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
        const { originX, originY, dirX, dirY, minR, maxR, halfArcRad } = this.getGeometry(caster, aimX, aimY);
        return units.filter((u) => {
            if (u.id === caster.id || !u.isAlive()) return false;
            if (enemiesOnly && caster.teamId != null && !areEnemies(caster.teamId, u.teamId)) return false;
            return pointInCone(originX, originY, u.x, u.y, dirX, dirY, minR, maxR, halfArcRad);
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
        const { originX, originY, centerAngle, minR, maxR, halfArcRad } = this.getGeometry(
            caster,
            mouseWorld.x,
            mouseWorld.y,
        );
        drawArcWedge(gr, originX, originY, centerAngle, halfArcRad, minR, maxR, 24, {
            fillColor: options?.fillColor ?? 0xc9b456,
            fillAlpha: options?.fillAlpha ?? 0.18,
            strokeColor: options?.strokeColor ?? 0xa89440,
            strokeWidth: options?.strokeWidth ?? 2,
            strokeAlpha: options?.strokeAlpha ?? 0.48,
        });
        return this.unitsInCone(caster, mouseWorld.x, mouseWorld.y, units, false);
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        return this.unitsInCone(caster, aimPoint.x, aimPoint.y, units, false)
            .filter((u) => u.id !== caster.id);
    }

    resolveHits(engine: HitboxEngineContext, caster: Unit, aimX: number, aimY: number): Unit[] {
        const { originX, originY } = this.getGeometry(caster, aimX, aimY);
        const hits = this.unitsInCone(caster, aimX, aimY, engine.units, true);
        hits.sort((a, b) =>
            Math.hypot(a.x - originX, a.y - originY) - Math.hypot(b.x - originX, b.y - originY),
        );
        return hits.slice(0, this._numTargets);
    }
}
