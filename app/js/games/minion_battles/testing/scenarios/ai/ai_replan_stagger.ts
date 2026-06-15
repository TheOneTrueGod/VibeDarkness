/**
 * ai_replan_stagger — Verify that six hunt units spawned at the same tick end up
 * with distinct `holdUntilTick` values on their tactical plans, confirming that
 * moveJitter produces spread-out replan ticks rather than everyone replanning
 * together.
 *
 * We check for at least 3 distinct `holdUntilTick` values across 6 units.
 * With CHASE_PLAN_JITTER_TICKS = 10 and moveJitter uniformly spread across [0,1],
 * the expected number of distinct ticks is close to 10 — well above 3.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Player (target) in the middle so all hunters can see it.
const PLAYER_POS = { x: 5 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };

// Six hunters arranged in a ring, all within scan range (~200 px from player).
const HUNTER_SPAWNS: { id: string; x: number; y: number }[] = [
    { id: 'ai_stagger_0', x: 5 * CELL + CELL / 2, y: 1 * CELL + CELL / 2 },
    { id: 'ai_stagger_1', x: 8 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 },
    { id: 'ai_stagger_2', x: 9 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 },
    { id: 'ai_stagger_3', x: 6 * CELL + CELL / 2, y: 7 * CELL + CELL / 2 },
    { id: 'ai_stagger_4', x: 2 * CELL + CELL / 2, y: 7 * CELL + CELL / 2 },
    { id: 'ai_stagger_5', x: 1 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 },
];

const MIN_DISTINCT_HOLD_VALUES = 3;

export const aiReplanStaggerScenario: ScenarioDefinition = {
    id: 'ai_replan_stagger',
    title: 'AI replan stagger: 6 hunt units get distinct holdUntilTick values from moveJitter',
    category: 'general',
    generalSection: 'AI',
    maxDurationMs: 10000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [],
        });

        for (const { id, x, y } of HUNTER_SPAWNS) {
            const hunter = createUnitFromSpawnConfig(
                {
                    id,
                    characterId: 'swarmling',
                    name: 'Hunter',
                    x,
                    y,
                    teamId: 'enemy',
                    ownerId: 'ai',
                    abilities: [],
                    unitAITreeId: 'hunt',
                    aiSettings: { minRange: 0, maxRange: 60 },
                },
                engine.eventBus,
            );
            initializeAbilityRuntimeForUnit(hunter);
            engine.addUnit(hunter, 'initialGameSpawn');
        }

        // Keep player non-idle for 3 full rounds (3 × 90 ticks ≈ 4.5 s).
        for (const tick of [90, 180, 270, 360, 450]) {
            engine.state.orderMgr.queueOrder(tick, {
                unitId: player.id,
                abilityId: 'wait',
                targets: [],
            });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        // Wait until all six units have acquired a tactical plan.
        const hunters = HUNTER_SPAWNS.map(({ id }) => engine.getUnit(id)).filter(Boolean);
        const withPlan = hunters.filter((h) => h!.tacticalPlan?.data.type === 'chase_target');
        if (withPlan.length < HUNTER_SPAWNS.length) return false;

        // Collect distinct holdUntilTick values.
        const holdValues = new Set(withPlan.map((h) => h!.tacticalPlan!.holdUntilTick));
        return holdValues.size >= MIN_DISTINCT_HOLD_VALUES;
    },

    failureMessage(engine) {
        const hunters = HUNTER_SPAWNS.map(({ id }) => engine.getUnit(id));
        const planInfo = hunters
            .map((h) => {
                if (!h) return 'gone';
                const p = h.tacticalPlan;
                return p ? `jitter=${h.moveJitter.toFixed(3)} hold=${p.holdUntilTick}` : 'no-plan';
            })
            .join(' | ');
        const holdValues = new Set(
            hunters.filter((h) => h?.tacticalPlan).map((h) => h!.tacticalPlan!.holdUntilTick),
        );
        return `distinct holdUntilTick values=${holdValues.size} (need ${MIN_DISTINCT_HOLD_VALUES}) | ${planInfo}`;
    },
};
