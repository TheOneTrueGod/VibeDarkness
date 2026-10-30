/**
 * Folded turret in flight. The renderer spins it from `rotationSpeed`.
 * The sentry drawn after arrival uses the same painter at an open amount.
 */
import { Graphics } from 'pixi.js';
import { TURRET_SHOT_COUNT } from '../../../card_defs/10_armory_core/armoryConstants';
import { paintTurret } from '../../effect_defs/turretDeployDraw';
import type { IProjectileDef } from './types';

const FOLDED = 0;

export const foldedTurretDef: IProjectileDef = {
    createVisual(): Graphics {
        return new Graphics();
    },
    updateVisual(visual): void {
        paintTurret(visual as Graphics, FOLDED, TURRET_SHOT_COUNT);
    },
};
