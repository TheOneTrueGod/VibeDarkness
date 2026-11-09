/**
 * Spirit Strike — the spirit animal's answer to its owner's weapon hits (a pet reaction, see
 * `game/units/petReactions.ts`). The spirit blinks to the near side of the hit enemy (the side facing its
 * owner) and dashes straight through it, leaving a slash, dealing {3} damage to that enemy only.
 *
 * Pet-only: no aiSettings and no card. Restored only by the reaction granting a commandCharge.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import type { TargetDef } from '../../../abilities/targeting';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { petStateOf } from '../../../game/units/components/petComponent';
import { themedSlashTrail } from '../../../game/effects/slashTrail';
import type { Unit } from '../../../game/units/Unit';
import type { CastBehaviourSetupContext } from '../../../abilities/castBehaviourTypes';

export const SPIRIT_STRIKE_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}10`;
export const SPIRIT_STRIKE_DAMAGE = 3;
/** Seconds of the blink-and-dash. */
export const SPIRIT_STRIKE_DASH_SECONDS = 0.12;
const COOLDOWN_SECONDS = 0.08;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

/** Approach from the pet's owner, so the strike comes from the player's side of the enemy. */
export function approachFromPetOwner(caster: Unit, _target: Unit, ctx: CastBehaviourSetupContext): { x: number; y: number } | null {
    const ownerId = petStateOf(caster).ownerUnitId;
    const owner = ownerId ? ctx.engine.getUnit(ownerId) : undefined;
    return owner ? { x: owner.x, y: owner.y } : null;
}

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'strike',
        start: 0,
        end: SPIRIT_STRIKE_DASH_SECONDS,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: CastBehaviours.DashStrike()
                    .withDamage(SPIRIT_STRIKE_DAMAGE)
                    .withApproachFrom(approachFromPetOwner)
                    .withSlashTrail(themedSlashTrail('command')),
            },
        ],
    },
    {
        id: 'cooldown',
        start: SPIRIT_STRIKE_DASH_SECONDS,
        end: SPIRIT_STRIKE_DASH_SECONDS + COOLDOWN_SECONDS,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

export const SpiritStrikeAbility: AbilityStatic = defineAbility({
    id: SPIRIT_STRIKE_ABILITY_ID,
    name: 'Spirit Strike',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    abilityTimings: ABILITY_TIMINGS,
    getRange: () => ({ minRange: 0, maxRange: 100000 }),
    getTooltipText(): string[] {
        return [`When you hit an enemy with a weapon, your spirit dashes through it for {${SPIRIT_STRIKE_DAMAGE}} damage.`];
    },
});
