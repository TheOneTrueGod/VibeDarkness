/**
 * Runner Vine - Creeper node. After a windup a slow runner vine grows from the Creeper toward a player and lays dark
 * thorns on each tile it crosses (4 to 6 tiles, rolled per cast), then pulls back. The thorns stay until they wear
 * out or are walked on, so the trail is area denial, not a hit. The growing is the generic `GroundTrail` cast behaviour.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { Effect } from '../../../game/effects/Effect';
import type { TargetDef } from '../../../abilities/targeting';
import { DARK_THORN_EFFECT_TYPE } from '../../../game/terrainEffects/terrainEffectDefs';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import type { CardDef } from '../../types';
import {
    NIGHTBLOOM_SECONDARY,
    RUNNER_VINE_ABILITY_ID,
    RUNNER_VINE_AI_RANGE,
    RUNNER_VINE_COOLDOWN_SEC,
    RUNNER_VINE_GROW_SEC,
    RUNNER_VINE_MAX_TILES,
    RUNNER_VINE_MIN_TILES,
    RUNNER_VINE_RETRACT_SEC,
    RUNNER_VINE_THORN_LIFETIME_SEC,
    RUNNER_VINE_WINDUP_SEC,
} from '../gardenHeartConstants';
import IMAGE from './runnerVine.svg?raw';

/** Slow multiplier stored on each laid thorn tile (same slow as Thorn Stomp's thorns). */
const THORN_SLOW_MULT = 0.52;

const GROW_END = RUNNER_VINE_WINDUP_SEC + RUNNER_VINE_GROW_SEC;
const RETRACT_END = GROW_END + RUNNER_VINE_RETRACT_SEC;

export const RunnerVineAbility_1604: AbilityStatic = defineAbility({
    id: RUNNER_VINE_ABILITY_ID,
    name: 'Runner Vine',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: RUNNER_VINE_WINDUP_SEC,
    abilityTimings: [
        { id: 'windup', start: 0, end: RUNNER_VINE_WINDUP_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'grow',
            start: RUNNER_VINE_WINDUP_SEC,
            end: GROW_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.GroundTrail({
                        effectType: DARK_THORN_EFFECT_TYPE,
                        tiles: (ctx) => ctx.engine.generateRandomInteger(RUNNER_VINE_MIN_TILES, RUNNER_VINE_MAX_TILES),
                        lifetimeSec: RUNNER_VINE_THORN_LIFETIME_SEC,
                        params: { slowMult: THORN_SLOW_MULT },
                        idPrefix: 'runnervine',
                        onTile: (ctx, tile) => {
                            ctx.engine.addEffect(
                                new Effect({
                                    x: (tile.col + 0.5) * CELL_SIZE,
                                    y: (tile.row + 0.5) * CELL_SIZE,
                                    duration: 0.5,
                                    effectType: 'Pulse',
                                    effectData: { colors: [NIGHTBLOOM_SECONDARY] },
                                }),
                            );
                        },
                    }),
                },
            ],
        },
        // The vine pulls back (render-only); the thorns it laid stay.
        { id: 'retract', start: GROW_END, end: RETRACT_END, abilityPhase: AbilityPhase.Windup },
        { id: 'cooldown', start: RETRACT_END, end: RETRACT_END + RUNNER_VINE_COOLDOWN_SEC, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: RUNNER_VINE_AI_RANGE, maxUsesPerRound: 1, priority: 8 },
    getRange: () => ({ minRange: 0, maxRange: RUNNER_VINE_AI_RANGE }),
    getTooltipText(): string[] {
        return [
            `A runner vine grows ${RUNNER_VINE_MIN_TILES} to ${RUNNER_VINE_MAX_TILES} tiles toward a target, laying dark thorns as it goes, then pulls back`,
            'The thorns stay until they wear out',
        ];
    },
});

export const RunnerVineCard_1604: CardDef = { abilityId: RUNNER_VINE_ABILITY_ID };
