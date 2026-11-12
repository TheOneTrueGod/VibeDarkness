/**
 * Spirit Flurry — four dash strikes on one locked-on enemy in quick succession, each from a new angle.
 * `repeatCountFlat` (Frenzied Flurry research) adds strikes inside the same total time.
 * Follows a Sic 'em pounce: when Pounce (0702) hits, the spirit locks on to that enemy and casts this. A pounce
 * that misses casts it on the landing point instead: each strike then goes through the enemy nearest that point
 * (within SPIRIT_FLURRY_AREA_RADIUS, one target per strike), or through the empty spot. Strikes also pick a
 * new enemy near a locked-on target that died mid-flurry.
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
import { getCasterAbilityModifier, getRepeatCount } from '../../../abilities/abilityModifierScales';

export const SPIRIT_FLURRY_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}11`;
/** Each strike comes in at this angle to the previous dash (degrees), so the four cross the target. */
export const SPIRIT_FLURRY_ANGLES = [0, 125, -110, 60] as const;
/** Angles for strikes past the base four (`repeatCountFlat`, e.g. Frenzied Flurry), cycled. */
const EXTRA_FLURRY_ANGLES = [-150, 95, -45, 160] as const;
/** The whole flurry takes this long however many strikes it has (extra strikes come faster). */
export const SPIRIT_FLURRY_SECONDS = 1.0;
/** Seconds from one strike to the next with the base four strikes. */
export const SPIRIT_FLURRY_STRIKE_INTERVAL = SPIRIT_FLURRY_SECONDS / SPIRIT_FLURRY_ANGLES.length;
const COOLDOWN_SECONDS = 0.1;
/** How far (px) from the flurry's point a strike looks for an enemy when it has no living locked-on target. */
export const SPIRIT_FLURRY_AREA_RADIUS = 60;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const trail = themedSlashTrail('command');

function flurryAngle(i: number): number {
    if (i < SPIRIT_FLURRY_ANGLES.length) return SPIRIT_FLURRY_ANGLES[i]!;
    return EXTRA_FLURRY_ANGLES[(i - SPIRIT_FLURRY_ANGLES.length) % EXTRA_FLURRY_ANGLES.length]!;
}

/** The flurry's timeline for `strikeCount` strikes spread evenly over `SPIRIT_FLURRY_SECONDS`. */
function buildFlurryTimings(strikeCount: number): AbilityTimingInterval[] {
    const interval = SPIRIT_FLURRY_SECONDS / strikeCount;
    const strikes: AbilityTimingInterval[] = Array.from({ length: strikeCount }, (_, i) => ({
        id: `strike${i + 1}`,
        start: i * interval,
        end: (i + 1) * interval,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: Math.min(SPIRIT_STRIKE_DASH_SECONDS, interval),
                behaviour: CastBehaviours.DashStrike()
                    .withDamage(SPIRIT_STRIKE_DAMAGE)
                    .withAngleOffset(flurryAngle(i))
                    .withAreaTargeting(SPIRIT_FLURRY_AREA_RADIUS)
                    .withSlashTrail(trail),
            },
        ],
    }));
    return [
        ...strikes,
        {
            id: 'cooldown',
            start: SPIRIT_FLURRY_SECONDS,
            end: SPIRIT_FLURRY_SECONDS + COOLDOWN_SECONDS,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ];
}

/** Built once per strike count, so every cast with the same count shares one timeline. */
const timingsByStrikeCount = new Map<number, AbilityTimingInterval[]>();
function flurryTimings(strikeCount: number): AbilityTimingInterval[] {
    let timings = timingsByStrikeCount.get(strikeCount);
    if (!timings) {
        timings = buildFlurryTimings(strikeCount);
        timingsByStrikeCount.set(strikeCount, timings);
    }
    return timings;
}

const ABILITY_TIMINGS = flurryTimings(SPIRIT_FLURRY_ANGLES.length);

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
    // Extra strikes (`repeatCountFlat`, Frenzied Flurry) fit into the same total time.
    getAbilityTimings(caster) {
        return flurryTimings(getRepeatCount(SPIRIT_FLURRY_ANGLES.length, getCasterAbilityModifier(caster, SPIRIT_FLURRY_ABILITY_ID)));
    },
    getRange: () => ({ minRange: 0, maxRange: 100000 }),
    getTooltipText(): string[] {
        return [`Dash through the locked-on enemy {${SPIRIT_FLURRY_ANGLES.length}} times, {${SPIRIT_STRIKE_DAMAGE}} damage each.`];
    },
});
