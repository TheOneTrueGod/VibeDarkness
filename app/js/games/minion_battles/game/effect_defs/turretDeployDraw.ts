/**
 * Shared drawing for the flying turret and the one left on the ground.
 * Local +x is the barrel. The caller sets the rotation.
 */
import { Graphics } from 'pixi.js';
import {
    TURRET_BARREL_COLOR,
    TURRET_BARREL_CORNER,
    TURRET_BODY_ALPHA,
    TURRET_HULL_OUTLINE_COLOR,
    TURRET_HULL_OUTLINE_WIDTH,
    TURRET_PIP_COLOR,
    TURRET_PIP_EMPTY_COLOR,
    TURRET_SHOT_COUNT,
} from '../../card_defs/10_armory_core/armoryConstants';
import type { Unit } from '../units/Unit';
import { getBodyColorForUnit, resolvePlayerBodyColor } from '../units/unit_defs/unitDef';
import { turretDotOffset, turretOpenShape } from './turretDeployPose';

/** Hull fill. Matches the owner's token; a missing owner uses the default player body color. */
export function turretHullColor(owner: Unit | undefined): number {
    return owner ? getBodyColorForUnit(owner) : resolvePlayerBodyColor(undefined);
}

export function paintTurret(
    g: Graphics,
    open: number,
    shotsFilled: number,
    hullColor: number,
    barrelPull = 0,
): void {
    const shape = turretOpenShape(open);
    const barrelSlide = shape.barrelLength * barrelPull;
    g.clear();
    g.circle(0, 0, shape.bodyRadius);
    g.fill({ color: hullColor, alpha: TURRET_BODY_ALPHA });
    g.stroke({ color: TURRET_HULL_OUTLINE_COLOR, width: TURRET_HULL_OUTLINE_WIDTH });
    g.roundRect(
        shape.barrelInset - barrelSlide,
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
