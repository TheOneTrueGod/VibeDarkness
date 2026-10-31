/**
 * Shared drawing for the flying turret and the one left on the ground.
 * Local +x is the barrel. The caller sets the rotation.
 */
import { Graphics } from 'pixi.js';
import { getThemeById } from '../../themes/abilityTheme';
import type { Unit } from '../units/Unit';
import { getBodyColorForUnit, resolvePlayerBodyColor } from '../units/unit_defs/unitDef';
import { turretDotOffset, turretOpenShape } from './turretDeployPose';

/** Turret roles from the Armory theme: body = primary, barrel and loaded pip = secondary, empty pip = shade. */
const TURRET_THEME = getThemeById('armory');
/** Footprint fill (placement preview). The hull itself uses the owner's body colour. */
export const TURRET_BODY_COLOR = TURRET_THEME.primaryNum;
export const TURRET_BARREL_COLOR = TURRET_THEME.secondaryNum;
export const TURRET_PIP_COLOR = TURRET_THEME.secondaryNum;
export const TURRET_PIP_EMPTY_COLOR = TURRET_THEME.shadeNum;
/** Thin ring around the hull of the deployed turret and the folded projectile. */
export const TURRET_HULL_OUTLINE_COLOR = 0x000000;
export const TURRET_HULL_OUTLINE_WIDTH = 1;
/** Placed turret fill. */
export const TURRET_BODY_ALPHA = 0.9;
/** Corner radius of the barrel rectangle. */
export const TURRET_BARREL_CORNER = 1;

/** Hull fill. Matches the owner's token; a missing owner uses the default player body color. */
export function turretHullColor(owner: Unit | undefined): number {
    return owner ? getBodyColorForUnit(owner) : resolvePlayerBodyColor(undefined);
}

export function paintTurret(
    g: Graphics,
    open: number,
    shotsFilled: number,
    /** Pips drawn: the sentry def's `shotCount`. */
    shotCount: number,
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
    for (let i = 0; i < shotCount; i++) {
        const dot = turretDotOffset(open, i, shotCount);
        g.circle(dot.x, dot.y, shape.dotRadius);
        g.fill({ color: i < shotsFilled ? TURRET_PIP_COLOR : TURRET_PIP_EMPTY_COLOR, alpha: TURRET_BODY_ALPHA });
    }
}
