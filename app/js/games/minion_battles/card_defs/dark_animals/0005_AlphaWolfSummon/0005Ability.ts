/**
 * AlphaWolfSummon - Alpha Wolf boss ability.
 * After ~0.65s windup, emits a pulse effect and spawns 2 wolves.
 * Wolves immediately target closest enemy and queue a DarkWolfBite attack.
 * Max 1 use per round.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import { type CardDef } from '../../types';
import { Effect } from '../../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { areEnemies } from '../../../game/teams';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { buildResolvedTargets } from '../../../game/units/unitAI/utils';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import type { EventBus } from '../../../game/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}05`;
const PREFIRE_TIME = 0.65;
const HOWL_SHOCK_INTERVAL = 0.2;
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
    addUnit(unit: Unit, spawnSource?: import('../../../game/types').SpawnSource): void;
    addEffect(effect: Effect): void;
    state: { orderMgr: { queueOrder(atTick: number, order: { unitId: string; abilityId: string; targets: ResolvedTarget[] }): void } };
    gameTick: number;
    gameTime: number;
    eventBus: EventBus;
    allocateObjectId?(prefix?: string): string;
}

const SUMMON_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#2d2d2d" stroke="#1a1a1a"/>
  <path d="M20 28 L28 32 L20 36 M44 28 L36 32 L44 36" stroke="#fff" stroke-width="2" fill="none"/>
  <circle cx="24" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
  <circle cx="40" cy="24" r="4" fill="#5d4e37" opacity="0.8"/>
</svg>`;

export const AlphaWolfSummonAbility: AbilityStatic = {
    image: SUMMON_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        {
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
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 0.1,
            abilityPhase: AbilityPhase.Active,
        },
        {
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
        _active?: ActiveAbility,
    ): void {
        const eng = engine as GameEngineLike;

        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;

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

            const wolf = createUnitFromSpawnConfig(config, eng.eventBus, eng);
            eng.addUnit(wolf, 'abilitySpawn');

            // Instant burst at the summon position to replace the skipped spawn animation.
            for (let p = 0; p < 10; p++) {
                const angle = Math.random() * 2 * Math.PI;
                const speed = 80 + Math.random() * 100;
                eng.addEffect(new Effect({
                    x: spawnX + (Math.random() - 0.5) * 12,
                    y: spawnY + (Math.random() - 0.5) * 12,
                    duration: 0.45 + Math.random() * 0.15,
                    effectType: 'ParticleImage',
                    effectData: {
                        imageKey: 'darkBlob',
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        scale: 0.4 + Math.random() * 0.35,
                        tint: 0x9933cc,
                    },
                }));
            }

            const closest = enemies.reduce<Unit | null>((best, e) => {
                const d = distance(wolf.x, wolf.y, e.x, e.y);
                if (!best) return e;
                return distance(wolf.x, wolf.y, best.x, best.y) < d ? best : e;
            }, null);

            if (closest && biteAbility) {
                wolf.aiContext = { aiTree: 'alphaWolfBoss' as const, targetUnitId: closest.id };
                const resolvedTargets = buildResolvedTargets(biteAbility, closest);
                eng.state.orderMgr.queueOrder(eng.gameTick + 1, {
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
    abilityId: CARD_ID,
};
