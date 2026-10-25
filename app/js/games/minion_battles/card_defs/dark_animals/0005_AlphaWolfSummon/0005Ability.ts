/**
 * AlphaWolfSummon - Alpha Wolf boss ability.
 * After ~0.65s windup, emits a pulse effect and spawns 2 wolves.
 * Wolves immediately target closest enemy and queue a DarkWolfBite attack.
 * Max 1 use per round.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { offsetsFromCaster } from '../../../abilities/CastBehaviours/SpawnUnitsBehaviour';
import type { Unit } from '../../../game/units/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import { type CardDef } from '../../types';
import { Effect } from '../../../game/effects/Effect';
import { spawnSpriteEffect } from '../../../abilities/effectHelpers';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { areEnemies } from '../../../game/teams';
import { buildResolvedTargets } from '../../../game/units/unitAI/utils';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import { enemySpawnDefToSpawnDefinition } from '../../../game/units/spawning/adapters';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}05`;
const PREFIRE_TIME = 0.65;
const HOWL_SHOCK_INTERVAL = 0.2;
const PULSE_DURATION = 0.8;
const WOLF_SPAWN_OFFSET = 35;
const DARK_WOLF_BITE_ID = '0003';

/** Wolves spawn at these offsets from the alpha. */
const WOLF_SPAWN_OFFSETS = [
    { dx: WOLF_SPAWN_OFFSET, dy: 0 },
    { dx: -WOLF_SPAWN_OFFSET * 0.7, dy: WOLF_SPAWN_OFFSET * 0.7 },
    { dx: -WOLF_SPAWN_OFFSET * 0.7, dy: -WOLF_SPAWN_OFFSET * 0.7 },
];

function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** A fresh wolf bursts out of the dark and immediately queues a bite at the closest enemy. */
function hatchWolf(eng: AbilityEngineContext, caster: Unit, wolf: Unit, at: { x: number; y: number }): void {
    const biteAbility = getAbility(DARK_WOLF_BITE_ID);
    if (!biteAbility) return;
    const enemies = eng.units.filter((u) => u.isAlive() && areEnemies(caster.teamId, u.teamId));

    // Instant burst at the summon position to replace the skipped spawn animation.
    for (let p = 0; p < 10; p++) {
        const angle = Math.random() * 2 * Math.PI;
        const speed = 80 + Math.random() * 100;
        const particleScale = (0.4 + Math.random() * 0.35) * 18;
        spawnSpriteEffect(
            eng,
            'darkBlobBurst',
            at.x + (Math.random() - 0.5) * 12,
            at.y + (Math.random() - 0.5) * 12,
            {
                scale: { from: particleScale, to: particleScale * 0.4 },
                rotation: Math.random() * Math.PI * 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
            },
        );
    }

    const closest = enemies.reduce<Unit | null>((best, e) => {
        const d = distance(wolf.x, wolf.y, e.x, e.y);
        if (!best) return e;
        return distance(wolf.x, wolf.y, best.x, best.y) < d ? best : e;
    }, null);

    if (closest) {
        wolf.aiContext = { aiTree: 'alphaWolfBoss' as const, targetUnitId: closest.id };
        const resolvedTargets = buildResolvedTargets(biteAbility, closest);
        eng.state?.orderMgr.queueOrder((eng.gameTick ?? 0) + 1, {
            unitId: wolf.id,
            abilityId: DARK_WOLF_BITE_ID,
            targets: resolvedTargets,
        });
    }
}

const SUMMON_IMAGE =`<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#2d2d2d" stroke="#1a1a1a"/>
  <path d="M20 28 L28 32 L20 36 M44 28 L36 32 L44 36" stroke="#fff" stroke-width="2" fill="none"/>
  <circle cx="24" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
  <circle cx="40" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
</svg>`;

export const AlphaWolfSummonAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Alpha Wolf Summon',
    image: SUMMON_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
            emitterDef: {
                mode: 'interval',
                intervalSeconds: HOWL_SHOCK_INTERVAL,
                effectType: 'HowlShockwave',
                effectData: { colors: [0xc4a574, 0x8b6914, 0x3d2914] },
                fireImmediately: true,
            },
        },
        {
            id: 'active',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 0.1,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        ctx.engine.addEffect(
                            new Effect({
                                x: ctx.caster.x,
                                y: ctx.caster.y,
                                duration: PULSE_DURATION,
                                effectType: 'Pulse',
                                effectData: { colors: [0x8b5a2b, 0x5d4e37, 0x2d2d2d] },
                            }),
                        );
                    }),
                },
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.SpawnUnits({
                        // Always AI-owned and non-controllable: do not inherit player control or Boss tag
                        // from a player-controlled alpha wolf.
                        template: (ctx) => ({
                            ...enemySpawnDefToSpawnDefinition(ENEMY_DARK_WOLF, 'ai'),
                            teamId: ctx.caster.teamId,
                            unitAITreeId: ctx.caster.unitAITreeId,
                            controllable: false,
                            unitTags: [],
                        }),
                        positions: (ctx) => (getAbility(DARK_WOLF_BITE_ID) ? offsetsFromCaster(WOLF_SPAWN_OFFSETS)(ctx) : []),
                        onSpawned: (ctx, wolf, _index, at) => hatchWolf(ctx.engine, ctx.caster, wolf, at),
                    }),
                },
            ],
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME + 0.1,
            end: PREFIRE_TIME + 3.1,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: 0,
        maxUsesPerRound: 1,
        priority: 20,
        ninjutsu: { ignore: true },
    },

    getTooltipText(_gameState?: unknown): string[] {
        return ['Summon 3 wolves that immediately attack the closest enemy.'];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: 0 };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

};

export const AlphaWolfSummonCard: CardDef = {
    abilityId: CARD_ID,
};
