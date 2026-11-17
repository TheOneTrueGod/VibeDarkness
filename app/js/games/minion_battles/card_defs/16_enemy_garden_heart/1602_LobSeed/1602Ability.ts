/**
 * Lob Seed - Pod Mortar node. It lobs a seed at a player's position. The seed lands after the windup and becomes a
 * fused body (`pod_seed`): a small destructible unit that grows for a few seconds, shows its blast in red for the last
 * 1.5 s, then bursts. The party can run, React, or kill the seed first (no burst). The seed's fuse, telegraph and
 * burst belong to the `fusedBody` component; this ability only places it.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { getPixelTargetPosition } from '../../../abilities/targetHelpers';
import type { TargetDef } from '../../../abilities/targeting';
import { spawnFusedBody } from '../../../game/units/components/fusedBodySpawn';
import type { CardDef } from '../../types';
import {
    LOB_SEED_ABILITY_ID,
    LOB_SEED_COOLDOWN_SEC,
    LOB_SEED_MAX_RANGE,
    LOB_SEED_MIN_RANGE,
    LOB_SEED_WINDUP_SEC,
    POD_SEED_ID,
} from '../gardenHeartConstants';
import IMAGE from './lobSeed.svg?raw';

const LAND_END = LOB_SEED_WINDUP_SEC + 1 / 60;

/** Place the seed where the lob was aimed (the engine already clamps the aim to `maxRange`). */
function landSeed(ctx: CastBehaviourTickContext): void {
    const point = getPixelTargetPosition(ctx.allTargets, 0);
    if (!point) return;
    spawnFusedBody(ctx.engine as unknown as Parameters<typeof spawnFusedBody>[0], {
        characterId: POD_SEED_ID,
        x: point.x,
        y: point.y,
        teamId: ctx.caster.teamId,
    });
}

export const LobSeedAbility_1602: AbilityStatic = defineAbility({
    id: LOB_SEED_ABILITY_ID,
    name: 'Lob Seed',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: LOB_SEED_WINDUP_SEC,
    abilityTimings: [
        { id: 'lob', start: 0, end: LOB_SEED_WINDUP_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'land',
            start: LOB_SEED_WINDUP_SEC,
            end: LAND_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(landSeed) }],
        },
        { id: 'cooldown', start: LAND_END, end: LAND_END + LOB_SEED_COOLDOWN_SEC, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: { minRange: LOB_SEED_MIN_RANGE, maxRange: LOB_SEED_MAX_RANGE, maxUsesPerRound: 1, priority: 10 },
    getRange: () => ({ minRange: LOB_SEED_MIN_RANGE, maxRange: LOB_SEED_MAX_RANGE }),
    getTooltipText(): string[] {
        return [
            'Lobs a seed at a target. After 5 seconds it bursts, showing its blast in red for the last 1.5 seconds',
            'Destroy the seed before it bursts and the burst never comes',
        ];
    },
});

export const LobSeedCard_1602: CardDef = { abilityId: LOB_SEED_ABILITY_ID };
