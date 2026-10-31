/**
 * A folded deployable in flight. The renderer spins it from `rotationSpeed`. The def id rides in
 * `expireData.defId`, so one projectile type draws every deployable with its own painter.
 */
import { Graphics } from 'pixi.js';
import { turretHullColor } from '../../effect_defs/turretDeployDraw';
import { deployableWallSeconds, getDeployablePainter } from '../../effect_defs/deployablePainters';
import { getDeployableDef } from '../../fieldObjects/deployableDefs';
import type { IProjectileDef } from './types';

const FOLDED = 0;

export const foldedDeployableDef: IProjectileDef = {
    createVisual(): Graphics {
        return new Graphics();
    },
    updateVisual(visual, proj, _gameTime, getUnit): void {
        const g = visual as Graphics;
        const defId = proj.expireData?.defId;
        const def = typeof defId === 'string' ? getDeployableDef(defId) : undefined;
        const painter = getDeployablePainter(def);
        if (!def || !painter) {
            g.clear();
            return;
        }
        painter.paint(g, {
            open: FOLDED,
            chargesFilled: def.charges,
            charges: def.charges,
            ownerColor: turretHullColor(getUnit?.(proj.sourceUnitId)),
            actionAmount: 0,
            wallSeconds: deployableWallSeconds(),
        });
    },
};
