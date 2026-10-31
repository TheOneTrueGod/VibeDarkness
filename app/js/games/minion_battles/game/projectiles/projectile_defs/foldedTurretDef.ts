/**
 * Folded turret in flight. The renderer spins it from `rotationSpeed`.
 * The sentry drawn after arrival uses the same painter at an open amount.
 */
import { Graphics } from 'pixi.js';
import { paintTurret, turretHullColor } from '../../effect_defs/turretDeployDraw';
import { getSentryDefByDeliveryProjectileType } from '../../fieldObjects/sentryDefs';
import type { IProjectileDef } from './types';

/** Projectile def key for the folded turret. A sentry def names it as `deliveryProjectileType`. */
export const TURRET_DEPLOY_PROJECTILE_TYPE = 'folded_turret';

const FOLDED = 0;

export const foldedTurretDef: IProjectileDef = {
    createVisual(): Graphics {
        return new Graphics();
    },
    updateVisual(visual, proj, _gameTime, getUnit): void {
        const owner = getUnit?.(proj.sourceUnitId);
        const shotCount = getSentryDefByDeliveryProjectileType(proj.projectileType)?.shotCount ?? 0;
        paintTurret(visual as Graphics, FOLDED, shotCount, shotCount, turretHullColor(owner));
    },
};
