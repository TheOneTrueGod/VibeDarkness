/**
 * Shared drawing for the flying turret and the one left on the ground.
 * Local +x is the barrel. The caller sets the rotation.
 */
import { Graphics } from 'pixi.js';
import {
    TURRET_BARREL_COLOR,
    TURRET_BARREL_CORNER,
    TURRET_BODY_ALPHA,
    TURRET_HULL_COLOR,
    TURRET_PIP_COLOR,
    TURRET_PIP_EMPTY_COLOR,
    TURRET_SHOT_COUNT,
} from '../../card_defs/10_armory_core/armoryConstants';
import { turretDotOffset, turretOpenShape } from './turretDeployPose';

export function paintTurret(g: Graphics, open: number, shotsFilled: number): void {
    const shape = turretOpenShape(open);
    g.clear();
    g.circle(0, 0, shape.bodyRadius);
    g.fill({ color: TURRET_HULL_COLOR, alpha: TURRET_BODY_ALPHA });
    g.roundRect(
        shape.barrelInset,
        -shape.barrelWidth / 2,
        shape.barrelLength,
        shape.barrelWidth,
        TURRET_BARREL_CORNER,
    );
    g.fill({ color: TURRET_BARREL_COLOR, alpha: TURRET_BODY_ALPHA });
    for (let i = 0; i < TURRET_SHOT_COUNT; i++) {
        const dot = turretDotOffset(open, i, TURRET_SHOT_COUNT);
        g.circle(dot.x, dot.y, shape.dotRadius);
        g.fill({ color: i < shotsFilled ? TURRET_PIP_COLOR : TURRET_PIP_EMPTY_COLOR, alpha: TURRET_BODY_ALPHA });
    }
}
