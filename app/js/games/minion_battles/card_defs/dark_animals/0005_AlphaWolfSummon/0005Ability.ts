/**
 * AlphaWolfSummon - Alpha Wolf boss ability.
 * After 0.5s windup, emits a pulse effect and spawns 2 wolves.
 * Wolves immediately target closest enemy and queue a DarkWolfBite attack.
 * Max 1 use per round.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import { Effect } from '../../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { areEnemies } from '../../../game/teams';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { buildResolvedTargets } from '../../../game/units/unitAI/utils';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import type { EventBus } from '../../../game/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}05`;
const PREFIRE_TIME = 0.5;
const PULSE_DURATION = 0.8;
const WOLF_SPAWN_OFFSET = 35;
const DARK_WOLF_BITE_ID = '0003';

function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addUnit(unit: Unit): void;
    addEffect(effect: Effect): void;
    queueOrder(atTick: number, order: { unitId: string; abilityId: string; targets: ResolvedTarget[] }): void;
    gameTick: number;
    gameTime: number;
    eventBus: EventBus;
}

const SUMMON_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#2d2d2d" stroke="#1a1a1a"/>
  <path d="M20 28 L28 32 L20 36 M44 28 L36 32 L44 36" stroke="#fff" stroke-width="2" fill="none"/>
  <circle cx="24" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
  <circle cx="40" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
</svg>`;

export const AlphaWolfSummonAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Summon',
    image: SUMMON_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'howl', start: 0, end: PREFIRE_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'summon',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 0.1,
            abilityPhase: AbilityPhase.Active,
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
    },

    getTooltipText(_gameState?: unknown): string[] {
        return ['Summon 2 wolves that immediately attack the closest enemy.'];
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

    doCardEffect(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void {
        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;
        
        const eng = engine as GameEngineLike;

        eng.addEffect(
            new Effect({
                x: caster.x,
                y: caster.y,
                duration: PULSE_DURATION,
                effectType: 'Pulse',
                effectData: { colors: [0x8b5a2b, 0x5d4e37, 0x2d2d2d] },
            }),
        );

        const biteAbility = getAbility(DARK_WOLF_BITE_ID);
        if (!biteAbility) return;

        const enemies = eng.units.filter((u) => u.isAlive() && areEnemies(caster.teamId, u.teamId));

        const spawnOffsets = [
            { dx: WOLF_SPAWN_OFFSET, dy: 0 },
            { dx: -WOLF_SPAWN_OFFSET * 0.7, dy: WOLF_SPAWN_OFFSET * 0.7 },
        ];

        for (let i = 0; i < 2; i++) {
            const off = spawnOffsets[i]!;
            const spawnX = caster.x + off.dx;
            const spawnY = caster.y + off.dy;

            const config = {
                ...ENEMY_DARK_WOLF,
                x: spawnX,
                y: spawnY,
                position: { x: spawnX, y: spawnY },
                teamId: caster.teamId,
                ownerId: caster.ownerId,
                unitAITreeId: caster.unitAITreeId,
            };

            const wolf = createUnitFromSpawnConfig(config, eng.eventBus);
            eng.addUnit(wolf);

            const closest = enemies.reduce<Unit | null>((best, e) => {
                const d = distance(wolf.x, wolf.y, e.x, e.y);
                if (!best) return e;
                return distance(wolf.x, wolf.y, best.x, best.y) < d ? best : e;
            }, null);

            if (closest && biteAbility) {
                wolf.aiContext = { aiTree: 'alphaWolfBoss' as const, targetUnitId: closest.id };
                const resolvedTargets = buildResolvedTargets(biteAbility, closest);
                eng.queueOrder(eng.gameTick + 1, {
                    unitId: wolf.id,
                    abilityId: DARK_WOLF_BITE_ID,
                    targets: resolvedTargets,
                });
            }
        }
    },

    onAttackBlocked(): void {
        // Summon has no direct attack.
    },
};

export const AlphaWolfSummonCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Summon',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
