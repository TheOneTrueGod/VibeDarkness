/**
 * Helpers for checking whether an attack can be blocked by a blocking ability
 * (e.g. Raise Shield) and for notifying the attacking ability via onAttackBlocked.
 */

import type { Unit } from '../objects/Unit';
import type { ActiveAbility } from '../engine/types';
import { getAbility } from './AbilityRegistry';
import type { AbilityStatic } from './Ability';
import type { AttackBlockedInfo } from './Ability';

export interface BlockingArc {
    abilityId: string;
    ability: AbilityStatic;
    arcStartAngle: number;
    arcEndAngle: number;
}

/** Normalize angle to [-PI, PI]. */
function normalizeAngle(a: number): number {
    let r = a;
    while (r > Math.PI) r -= 2 * Math.PI;
    while (r < -Math.PI) r += 2 * Math.PI;
    return r;
}

/**
 * Returns the blocking arc for the unit at the given game time, if any.
 * The first active ability that provides a block (getBlockingArc) wins.
 */
export function getBlockingArcForUnit(unit: Unit, gameTime: number): BlockingArc | null {
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability?.getBlockingArc) continue;

        const currentTime = gameTime - active.startTime;
        const arc = ability.getBlockingArc(unit, active, currentTime);
        if (arc) {
            return {
                abilityId: ability.id,
                ability,
                arcStartAngle: arc.arcStartAngle,
                arcEndAngle: arc.arcEndAngle,
            };
        }
    }
    return null;
}

/**
 * Returns true if the given angle (radians) lies inside the arc [arcStart, arcEnd].
 * Handles wrap-around (e.g. arc from 150° to -150°).
 */
export function isAngleInArc(angle: number, arcStart: number, arcEnd: number): boolean {
    const a = normalizeAngle(angle);
    const s = normalizeAngle(arcStart);
    const e = normalizeAngle(arcEnd);

    if (s <= e) {
        return a >= s && a <= e;
    }
    // Arc crosses -PI/PI boundary
    return a >= s || a <= e;
}

/**
 * Angle from defender toward the attack source (radians, [-PI, PI]).
 * This is the direction the attack is "coming from" from the defender's perspective.
 */
export function getAttackAngleFromDefender(
    defenderX: number,
    defenderY: number,
    sourceX: number,
    sourceY: number,
): number {
    return Math.atan2(sourceY - defenderY, sourceX - defenderX);
}

/**
 * Returns true if the defender has an active blocking ability and the attack
 * from (attackSourceX, attackSourceY) falls within the block arc.
 * Use this before applying damage to decide whether the attack is blocked.
 */
export function canAttackBeBlocked(
    defender: Unit,
    attackSourceX: number,
    attackSourceY: number,
    gameTime: number,
): boolean {
    const block = getBlockingArcForUnit(defender, gameTime);
    if (!block) return false;

    const angle = getAttackAngleFromDefender(defender.x, defender.y, attackSourceX, attackSourceY);
    return isAngleInArc(angle, block.arcStartAngle, block.arcEndAngle);
}

/**
 * Call the attacking ability's onAttackBlocked callback and the blocking ability's
 * onBlockSuccess callback (if any). Pass the block when you have it so the blocker
 * can react (e.g. draw a card).
 */
export function executeBlock(
    engine: unknown,
    defender: Unit,
    attackInfo: AttackBlockedInfo,
    attackingAbilityId: string,
    block?: BlockingArc | null,
): void {
    const ability = getAbility(attackingAbilityId);
    ability?.onAttackBlocked(engine, defender, attackInfo);
    if (block?.ability.onBlockSuccess) {
        block.ability.onBlockSuccess(engine, defender);
    }
}
