/**
 * Spirit Flurry — four dash strikes on one locked-on enemy in quick succession, each from a new angle.
 * Follows a Sic 'em pounce: when Pounce (0702) hits, the spirit locks on to that enemy and casts this.
 *
 * Pet-only: no aiSettings and no card. Restored only by Pounce granting a commandCharge.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import type { TargetDef } from '../../../abilities/targeting';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { themedSlashTrail } from '../../../game/effects/slashTrail';
import { SPIRIT_STRIKE_DAMAGE, SPIRIT_STRIKE_DASH_SECONDS } from '../0710_SpiritStrike/0710Ability';

export const SPIRIT_FLURRY_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}11`;
/** Seconds from one strike to the next (four strikes over about a second). */
export const SPIRIT_FLURRY_STRIKE_INTERVAL = 0.25;
/** Each strike comes in at this angle to the previous dash (degrees), so the four cross the target. */
export const SPIRIT_FLURRY_ANGLES = [0, 125, -110, 60] as const;
const COOLDOWN_SECONDS = 0.1;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const trail = themedSlashTrail('command');

const STRIKES: AbilityTimingInterval[] = SPIRIT_FLURRY_ANGLES.map((angle, i) => ({
    id: `strike${i + 1}`,
    start: i * SPIRIT_FLURRY_STRIKE_INTERVAL,
    end: (i + 1) * SPIRIT_FLURRY_STRIKE_INTERVAL,
    abilityPhase: AbilityPhase.Active,
    doNotRefund: true,
    castBehaviours: [
        {
            timingStart: 'start',
            timingEnd: SPIRIT_STRIKE_DASH_SECONDS,
            behaviour: CastBehaviours.DashStrike()
                .withDamage(SPIRIT_STRIKE_DAMAGE)
                .withAngleOffset(angle)
                .withSlashTrail(trail),
        },
    ],
}));

const FLURRY_END = SPIRIT_FLURRY_ANGLES.length * SPIRIT_FLURRY_STRIKE_INTERVAL;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    ...STRIKES,
    { id: 'cooldown', start: FLURRY_END, end: FLURRY_END + COOLDOWN_SECONDS, abilityPhase: AbilityPhase.Cooldown },
];

export const SpiritFlurryAbility: AbilityStatic = defineAbility({
    id: SPIRIT_FLURRY_ABILITY_ID,
    name: 'Spirit Flurry',
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
        return [`Dash through the locked-on enemy {${SPIRIT_FLURRY_ANGLES.length}} times, {${SPIRIT_STRIKE_DAMAGE}} damage each.`];
    },
});
