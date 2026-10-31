/**
 * How each deployable visual is drawn, folded in flight (`open` 0) and placed (`open` 1).
 * A `DeployableDef.visual` names one of these. Local +x is the deployable's facing; the caller
 * sets the position and rotation.
 */
import type { Graphics } from 'pixi.js';
import { getThemeById } from '../../themes/abilityTheme';
import type { PlacedDeployable } from '../fieldObjects/FieldObjectManager';
import type { DeployableDef } from '../fieldObjects/deployableDefs';
import { burstAttackPush, rangedAttackPull } from '../animation/actorAnimation';
import { paintTurret, TURRET_PIP_COLOR, TURRET_PIP_EMPTY_COLOR } from './turretDeployDraw';
import { turretOpenAmount } from './turretDeployPose';
import {
    REPAIR_POST_ARC_COUNT,
    REPAIR_POST_ARC_SPAN,
    REPAIR_POST_ARC_WIDTH,
    repairPostArcAngle,
    repairPostOpenAmount,
    repairPostPipOffset,
    repairPostShape,
} from './repairPostPose';

export const DEPLOYABLE_VISUAL_TURRET = 'turret';
export const DEPLOYABLE_VISUAL_REPAIR_POST = 'repair_post';

export interface DeployablePaintState {
    /** 0 folded, 1 fully placed. */
    open: number;
    chargesFilled: number;
    /** Pips drawn: the def's `charges`. */
    charges: number;
    /** The owner's body colour. */
    ownerColor: number;
    /** 0 to 1 from the deployable's attack clip (barrel pull, arc burst). */
    actionAmount: number;
    /** Wall-clock seconds, for motion that keeps going while the battle is paused. */
    wallSeconds: number;
}

export interface DeployablePainter {
    paint(g: Graphics, state: DeployablePaintState): void;
    /** Open amount of a placed deployable. */
    openAmount(spawnedAtGameTime: number, gameTime: number): number;
    /** The clip amount this visual reacts to. */
    actionAmount(deployable: PlacedDeployable, gameTime: number): number;
}

/** Repair Post roles: arcs = Armory primary, loaded / empty pips match the turret's. */
const REPAIR_POST_ARC_COLOR = getThemeById('armory').primaryNum;
const REPAIR_POST_CORE_OUTLINE_COLOR = 0x000000;
const REPAIR_POST_CORE_OUTLINE_WIDTH = 1;
const REPAIR_POST_ALPHA = 0.95;

export function paintRepairPost(g: Graphics, state: DeployablePaintState): void {
    const shape = repairPostShape(state.open, state.actionAmount);
    g.clear();
    for (let i = 0; i < REPAIR_POST_ARC_COUNT; i++) {
        const mid = repairPostArcAngle(i, state.wallSeconds);
        const start = mid - REPAIR_POST_ARC_SPAN / 2;
        g.moveTo(Math.cos(start) * shape.arcRadius, Math.sin(start) * shape.arcRadius);
        g.arc(0, 0, shape.arcRadius, start, start + REPAIR_POST_ARC_SPAN);
        g.stroke({ color: REPAIR_POST_ARC_COLOR, width: REPAIR_POST_ARC_WIDTH, alpha: REPAIR_POST_ALPHA, cap: 'round' });
    }
    g.circle(0, 0, shape.coreRadius);
    g.fill({ color: state.ownerColor, alpha: REPAIR_POST_ALPHA });
    g.stroke({ color: REPAIR_POST_CORE_OUTLINE_COLOR, width: REPAIR_POST_CORE_OUTLINE_WIDTH });
    for (let i = 0; i < state.charges; i++) {
        const pip = repairPostPipOffset(state.open, i, state.charges);
        g.circle(pip.x, pip.y, shape.pipRadius);
        g.fill({ color: i < state.chargesFilled ? TURRET_PIP_COLOR : TURRET_PIP_EMPTY_COLOR, alpha: REPAIR_POST_ALPHA });
    }
}

const PAINTERS: Record<string, DeployablePainter> = {
    [DEPLOYABLE_VISUAL_TURRET]: {
        paint: (g, state) => paintTurret(g, state.open, state.chargesFilled, state.charges, state.ownerColor, state.actionAmount),
        openAmount: turretOpenAmount,
        actionAmount: (deployable, gameTime) => rangedAttackPull(deployable.animation, gameTime),
    },
    [DEPLOYABLE_VISUAL_REPAIR_POST]: {
        paint: paintRepairPost,
        openAmount: repairPostOpenAmount,
        actionAmount: (deployable, gameTime) => burstAttackPush(deployable.animation, gameTime),
    },
};

export function getDeployablePainter(def: Pick<DeployableDef, 'visual'> | undefined): DeployablePainter | undefined {
    return def ? PAINTERS[def.visual] : undefined;
}

/** Seconds on the wall clock, for spin that ignores the battle clock. */
export function deployableWallSeconds(): number {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}
