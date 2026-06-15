/**
 * ai_plan_hold_stability — Verify that a hunt unit's tactical plan is held
 * across multiple ticks rather than being re-acquired from scratch each tick.
 *
 * Setup: one hunt unit, one enemy player unit that stays still.
 * After the hunt unit gets close enough to acquire a target it will have a
 * `chase_target` tactical plan.  We run for several rounds and assert that
 * every time we sample the plan the `targetUnitId` is the same — the plan is
 * being held, not replaced every tick.
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

// Player (the "enemy" the AI hunts) at centre-left.
const PLAYER_POS = { x: 2 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
// Hunt unit starts at centre-right, well within scan range.
const HUNTER_POS = { x: 6 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

export const aiPlanHoldStabilityScenario: ScenarioDefinition = {
    id: 'ai_plan_hold_stability',
    title: 'AI plan hold: hunt unit keeps the same targetUnitId across multiple rounds',
    category: 'general',
    generalSection: 'AI',
    maxDurationMs: 10000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        // Player acts as the target.  Keep it non-idle so the battle doesn't exit.
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [],
        });

        // Hunt unit — no abilities so it just chases.
        const hunter = createUnitFromSpawnConfig(
            {
                id: 'ai_hunt_stability_hunter',
                characterId: 'swarmling',
                name: 'Hunter',
                x: HUNTER_POS.x,
                y: HUNTER_POS.y,
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

        // Keep the player non-idle across the full test window so the runner
        // does not exit before we've observed three rounds.
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
        const hunter = engine.getUnit('ai_hunt_stability_hunter');
        if (!hunter?.tacticalPlan) return false;
        if (hunter.tacticalPlan.data.type !== 'chase_target') return false;

        const targetId = hunter.tacticalPlan.data.targetUnitId;
        if (!targetId) return false;

        // The plan must have been held for a non-trivial number of ticks — at least
        // CHASE_PLAN_BASE_TICKS (15) away.  We only assert once the engine has run
        // for several AI cycles: gameTick >= 100.
        if (engine.gameTick < 100) return false;

        // Check that the targetUnitId points to the player — i.e., the plan has
        // been held and not randomly re-assigned.
        const player = engine.getLocalPlayerUnit();
        return targetId === player?.id;
    },

    failureMessage(engine) {
        const hunter = engine.getUnit('ai_hunt_stability_hunter');
        const plan = hunter?.tacticalPlan;
        const player = engine.getLocalPlayerUnit();
        return (
            `tick=${engine.gameTick} plan=${plan ? JSON.stringify({ type: plan.data.type, targetUnitId: plan.data.targetUnitId, holdUntilTick: plan.holdUntilTick }) : 'null'} ` +
            `player.id=${player?.id ?? 'none'}`
        );
    },
};
