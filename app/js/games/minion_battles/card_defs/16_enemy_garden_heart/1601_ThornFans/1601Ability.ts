/**
 * Thorn Fans - Thornspitter node. It aims at a player, then spits two quick fans of three slow thorns, a beat
 * apart. The slow thorns leave room to walk between them; the answer to the attack is to move, not to tank it.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { TargetDef } from '../../../abilities/targeting';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { TerrainType } from '../../../terrain/TerrainType';
import type { CardDef } from '../../types';
import {
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

/** Aim offsets (degrees) of one fan, centred on the aim: `[-spread, 0, +spread]` for three. */
export function thornFanOffsets(size: number = THORN_FAN_SIZE, spreadDeg: number = THORN_FAN_SPREAD_DEG): number[] {
    return Array.from({ length: size }, (_, i) => (i - (size - 1) / 2) * spreadDeg);
}

function buildTimings(): AbilityTimingInterval[] {
    const timings: AbilityTimingInterval[] = [
        { id: 'aim', start: 0, end: THORN_AIM_SEC, abilityPhase: AbilityPhase.Windup },
    ];
    let t = THORN_AIM_SEC;
    for (let fan = 0; fan < THORN_FAN_COUNT; fan++) {
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
                    .withBaseDamage(THORN_DAMAGE)
                    .withRadius(THORN_RADIUS)
                    .withAimOffset(deg)
                    .withCollidesWithTerrain([TerrainType.Rock]),
            })),
        });
        t = end + (fan < THORN_FAN_COUNT - 1 ? THORN_FAN_GAP_SEC : 0);
        if (fan < THORN_FAN_COUNT - 1) {
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
    abilityTimings: buildTimings(),
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
        ];
    },
});

export const ThornFansCard_1601: CardDef = { abilityId: THORN_FANS_ABILITY_ID };
