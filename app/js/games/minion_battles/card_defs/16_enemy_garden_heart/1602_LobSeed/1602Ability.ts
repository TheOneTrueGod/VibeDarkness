/**
 * Lob Seed - Pod Mortar node. After the windup it sends a seed burrowing out from itself toward a player's position:
 * a burrowing projectile (`BURROWING_PROJECTILE_TYPE`, churned earth and a moving mound, the same look as the Heart
 * travelling underground) that hits nothing on the way. Where it surfaces it grows a fused body (`pod_seed`): a small
 * destructible unit that shows its blast in red for the last 1.5 s, then bursts. The party can run, React, or kill the
 * seed first (no burst). The seed's fuse, telegraph and burst belong to the `fusedBody` component.
 *
 * Once launched the growth is independent of the Pod Mortar: if the node dies mid-flight the seed still surfaces
 * (`onProjectileExpiredWithoutCaster`), on the node's team.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { TargetDef } from '../../../abilities/targeting';
import type { Projectile } from '../../../game/projectiles/Projectile';
import { BURROWING_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/burrowingDef';
import { spawnFusedBody } from '../../../game/units/components/fusedBodySpawn';
import type { CardDef } from '../../types';
import {
    GARDEN_DIRT_COLOR,
    LOB_SEED_ABILITY_ID,
    LOB_SEED_BURROW_SPEED,
    LOB_SEED_COOLDOWN_SEC,
    LOB_SEED_MAX_RANGE,
    LOB_SEED_MIN_RANGE,
    LOB_SEED_WINDUP_SEC,
    POD_SEED_ID,
} from '../gardenHeartConstants';
import IMAGE from './lobSeed.svg?raw';

const LAUNCH_END = LOB_SEED_WINDUP_SEC + 1 / 60;

/** Grow the seed where the burrowing projectile surfaced, on the team that launched it. Needs no caster. */
export function growSeedAt(engine: unknown, projectile: Projectile): void {
    spawnFusedBody(engine as Parameters<typeof spawnFusedBody>[0], {
        characterId: POD_SEED_ID,
        x: projectile.x,
        y: projectile.y,
        teamId: projectile.sourceTeamId,
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
        { id: 'windup', start: 0, end: LOB_SEED_WINDUP_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'launch',
            start: LOB_SEED_WINDUP_SEC,
            end: LAUNCH_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withProjectileType(BURROWING_PROJECTILE_TYPE)
                .withSpeed(LOB_SEED_BURROW_SPEED)
                .withMaxRange(LOB_SEED_MAX_RANGE)
                .withTrailColor(GARDEN_DIRT_COLOR)
                .withPassThroughEnemies(),
        },
        { id: 'cooldown', start: LAUNCH_END, end: LAUNCH_END + LOB_SEED_COOLDOWN_SEC, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: { minRange: LOB_SEED_MIN_RANGE, maxRange: LOB_SEED_MAX_RANGE, maxUsesPerRound: 1, priority: 10 },
    getRange: () => ({ minRange: LOB_SEED_MIN_RANGE, maxRange: LOB_SEED_MAX_RANGE }),
    onProjectileExpired(engine: unknown, _caster, projectile: unknown): void {
        growSeedAt(engine, projectile as Projectile);
    },
    onProjectileExpiredWithoutCaster(engine: unknown, projectile: unknown): void {
        growSeedAt(engine, projectile as Projectile);
    },
    getTooltipText(): string[] {
        return [
            'Sends a seed burrowing toward a target. Where it surfaces it grows, then bursts after 5 seconds, showing its blast in red for the last 1.5 seconds',
            'Destroy the seed before it bursts and the burst never comes',
        ];
    },
});

export const LobSeedCard_1602: CardDef = { abilityId: LOB_SEED_ABILITY_ID };
