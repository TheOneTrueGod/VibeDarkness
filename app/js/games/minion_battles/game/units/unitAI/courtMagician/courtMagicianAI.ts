/**
 * Court Magician AI rules, kept pure so tests can drive them directly.
 *
 * Contact: a player within `CONTACT_RANGE_PX` starts a contact window. He lets them get their hits in,
 * then Blinks away once the window has lasted `CONTACT_GRACE_SEC` or he has lost
 * `CONTACT_HP_LOSS_FRACTION` of his max HP since it started, whichever comes first (and never twice
 * within `BLINK_COOLDOWN_SEC`). The window resets if nobody has been close for `CONTACT_RESET_SEC`.
 * Retreats land up to `RETREAT_RADIUS_PX` from his home, as far from the nearest player as possible.
 */

import type { Unit } from '../../Unit';
import type { CourtMagicianAITreeContext } from './context';
import { rotationAbilityIds, type AbilityRotationDef } from '../abilityRotation';
import {
    CRYSTAL_VOLLEY_ABILITY_ID,
    REARRANGE_ABILITY_ID,
    SHARD_NOVA_ABILITY_ID,
} from '../../../../card_defs/14_enemy_court_magician/courtMagicianConstants';

/**
 * His attack order, replayed each half round: Rearrange, then Shard Nova and Crystal Volley in a random
 * order. His first round always goes Nova then Volley so the party learns the pattern first. A half he
 * only reaches late (the Crystal Laser ran into it) is skipped. The laser and Blink are not part of it.
 */
export const COURT_MAGICIAN_ROTATION: AbilityRotationDef = {
    windowsPerRound: 2,
    steps: [{ abilityId: REARRANGE_ABILITY_ID }, { anyOrder: [SHARD_NOVA_ABILITY_ID, CRYSTAL_VOLLEY_ABILITY_ID] }],
    firstRoundSteps: [
        { abilityId: REARRANGE_ABILITY_ID },
        { abilityId: SHARD_NOVA_ABILITY_ID },
        { abilityId: CRYSTAL_VOLLEY_ABILITY_ID },
    ],
    skipWindowIfEnteredAfter: 0.5,
};

export const COURT_MAGICIAN_ROTATION_IDS: readonly string[] = rotationAbilityIds(COURT_MAGICIAN_ROTATION);

export const CONTACT_RANGE_PX = 110;
export const CONTACT_GRACE_SEC = 3;
export const CONTACT_HP_LOSS_FRACTION = 0.06;
export const CONTACT_RESET_SEC = 1.5;
export const BLINK_COOLDOWN_SEC = 4;
export const RETREAT_RADIUS_PX = 230;
/** A retreat must move him at least this far. */
export const RETREAT_MIN_HOP_PX = 160;

/** Update the contact window from this tick's nearest-player distance. Mutates `ctx`. */
export function updateContact(
    ctx: CourtMagicianAITreeContext,
    unit: Pick<Unit, 'hp'>,
    nearestDist: number,
    now: number,
): void {
    if (nearestDist <= CONTACT_RANGE_PX) {
        if (ctx.contactSince === undefined) {
            ctx.contactSince = now;
            ctx.hpAtContact = unit.hp;
        }
        ctx.lastContactAt = now;
        return;
    }
    if (ctx.contactSince !== undefined && now - (ctx.lastContactAt ?? now) > CONTACT_RESET_SEC) {
        clearContact(ctx);
    }
}

export function clearContact(ctx: CourtMagicianAITreeContext): void {
    ctx.contactSince = undefined;
    ctx.hpAtContact = undefined;
    ctx.lastContactAt = undefined;
}

/** True when the party has had its turn up close and he should Blink away now. */
export function shouldBlink(
    ctx: CourtMagicianAITreeContext,
    unit: Pick<Unit, 'hp' | 'maxHp'>,
    now: number,
): boolean {
    if (ctx.contactSince === undefined) return false;
    if (ctx.nextBlinkAt !== undefined && now < ctx.nextBlinkAt) return false;
    const lost = (ctx.hpAtContact ?? unit.hp) - unit.hp;
    return now - ctx.contactSince >= CONTACT_GRACE_SEC || lost >= unit.maxHp * CONTACT_HP_LOSS_FRACTION;
}
