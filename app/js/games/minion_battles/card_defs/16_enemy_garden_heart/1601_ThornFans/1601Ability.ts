/**
 * Thorn Fans - Thornspitter node. It aims at a player, then spits quick fans of five slow thorns, a beat apart. The
 * slow thorns leave room to walk between them; the answer to the attack is to move, not to tank it. Each wave is
 * turned a little from the last (`thornWaveTurn`): the waves step evenly across one gap between thorns, so the next
 * wave flies through the gaps the last one left and the party has to keep stepping between them.
 *
 * Waves escalate with the fight: the number of fans per cast comes from the `GARDEN_GROWTH_PHASE_VARIABLE` battle
 * variable (`THORN_FAN_WAVES_BY_PHASE`: 2 in phase 1 up to 5 in phase 4), which the Garden Heart sets as it regrows.
 * Unset (no Heart), it fires `THORN_FAN_COUNT`. The timeline is per cast (`getAbilityTimings`), so the cast is only as
 * long as its waves.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { TerrainType } from '../../../terrain/TerrainType';
import { THORN_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/thornDef';
import type { CardDef } from '../../types';
import { getBattleVariable } from '../../../game/battleVariables';
import {
    GARDEN_GROWTH_PHASE_VARIABLE,
    THORN_FAN_WAVES_BY_PHASE,
    THORN_AI_RANGE,
    THORN_AIM_SEC,
    THORN_COOLDOWN_SEC,
    THORN_DAMAGE,
    THORN_FAN_COUNT,
    THORN_FAN_GAP_SEC,
    THORN_FAN_SIZE,
    THORN_FAN_SPREAD_DEG,
    THORN_MAX_RANGE,
    THORN_RADIUS,
    THORN_SPEED,
    THORN_FANS_ABILITY_ID,
} from '../gardenHeartConstants';
import IMAGE from './thornFans.svg?raw';

/** Aim offsets (degrees) of one fan, evenly spread and centred on the aim (`[-spread, 0, +spread]` for three). */
export function thornFanOffsets(size: number = THORN_FAN_SIZE, spreadDeg: number = THORN_FAN_SPREAD_DEG): number[] {
    return Array.from({ length: size }, (_, i) => (i - (size - 1) / 2) * spreadDeg);
}

/**
 * Extra turn (degrees) of wave `wave` (0-based) of `waves`: the waves step across one gap between thorns in
 * `spread / waves` steps, centred on the aim, so no two waves share a lane. Two waves interleave exactly (the second
 * flies down the middle of the first's gaps). One wave: no turn.
 */
export function thornWaveTurn(wave: number, waves: number, spreadDeg: number = THORN_FAN_SPREAD_DEG): number {
    if (waves <= 1) return 0;
    return (wave - (waves - 1) / 2) * (spreadDeg / waves);
}

/** Fans per cast right now: from the growth-phase battle variable, else `THORN_FAN_COUNT`. */
export function thornFanWaves(gameState: unknown): number {
    return THORN_FAN_WAVES_BY_PHASE[getBattleVariable(gameState, GARDEN_GROWTH_PHASE_VARIABLE)] ?? THORN_FAN_COUNT;
}

/** Built once per wave count: the cast tick asks for the timings every tick. */
const TIMINGS_BY_WAVES = new Map<number, AbilityTimingInterval[]>();
function timingsFor(waves: number): AbilityTimingInterval[] {
    let timings = TIMINGS_BY_WAVES.get(waves);
    if (!timings) {
        timings = buildTimings(waves);
        TIMINGS_BY_WAVES.set(waves, timings);
    }
    return timings;
}

function buildTimings(fanCount: number): AbilityTimingInterval[] {
    const timings: AbilityTimingInterval[] = [
        { id: 'aim', start: 0, end: THORN_AIM_SEC, abilityPhase: AbilityPhase.Windup },
    ];
    let t = THORN_AIM_SEC;
    for (let fan = 0; fan < fanCount; fan++) {
        const end = t + 1 / 60;
        timings.push({
            id: `fan${fan + 1}`,
            start: t,
            end,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            timelineDanger: 'end',
            castBehaviours: thornFanOffsets().map((deg) => ({
                timingStart: 'start' as const,
                behaviour: CastBehaviours.ProjectileLaunch()
                    .withSpeed(THORN_SPEED)
                    .withMaxRange(THORN_MAX_RANGE)
                    .withTravelFullRange()
                    .withBaseDamage(THORN_DAMAGE)
                    .withRadius(THORN_RADIUS)
                    .withProjectileType(THORN_PROJECTILE_TYPE)
                    .withAimOffset(deg + thornWaveTurn(fan, fanCount))
                    .withCollidesWithTerrain([TerrainType.Rock]),
            })),
        });
        t = end + (fan < fanCount - 1 ? THORN_FAN_GAP_SEC : 0);
        if (fan < fanCount - 1) {
            timings.push({ id: `gap${fan + 1}`, start: end, end: t, abilityPhase: AbilityPhase.Windup });
        }
    }
    timings.push({ id: 'cooldown', start: t, end: t + THORN_COOLDOWN_SEC, abilityPhase: AbilityPhase.Cooldown });
    return timings;
}

export const ThornFansAbility_1601: AbilityStatic = defineAbility({
    id: THORN_FANS_ABILITY_ID,
    name: 'Thorn Fans',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: THORN_AIM_SEC,
    abilityTimings: timingsFor(THORN_FAN_COUNT),
    getAbilityTimings: (_caster, gameState) => timingsFor(thornFanWaves(gameState)),
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: THORN_AI_RANGE },
    getRange: () => ({ minRange: 0, maxRange: THORN_AI_RANGE }),
    getDamage: () => THORN_DAMAGE,
    onAttackBlocked(_engine, _defender, attackInfo) {
        deactivateProjectileOnBlock(attackInfo);
    },
    getTooltipText(): string[] {
        return [
            `Spits ${THORN_FAN_COUNT} quick fans of ${THORN_FAN_SIZE} slow thorns at a target, ${THORN_DAMAGE} damage each`,
            'More fans as the Garden Heart regrows (up to 5)',
        ];
    },
});

export const ThornFansCard_1601: CardDef = { abilityId: THORN_FANS_ABILITY_ID };
