/**
 * ai_terrain_interrupt — Verify that InterruptSystem marks `terrain_changed_near_path`
 * on a unit when a `terrain_stone_damaged` event fires near its plan waypoints, and
 * that the mark causes the hunt unit to re-acquire a plan (new holdUntilTick) within
 * one AI cycle.
 *
 * Setup:
 *  - One hunt unit with a manually injected tactical plan whose `pathWaypoints`
 *    include a cell adjacent to (5, 3).
 *  - `invalidateOn` includes `terrain_changed_near_path` so shouldReplan() will
 *    return true when the interrupt fires.
 *  - A `terrain_stone_damaged` event is emitted at (5, 3) in buildEngine.
 *  - After a few ticks the unit must have a *new* tactical plan (different
 *    `holdUntilTick`) — proving the interrupt invalidated the old plan and the
 *    seek node wrote a fresh one.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { createPlan } from '../../../game/units/unitAI/plans/planUtils';
import { TerrainType } from '../../../terrain/TerrainType';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Player (target) at left.
const PLAYER_POS = { x: 2 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
// Hunter at right — can see the player.
const HUNTER_POS = { x: 7 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

// The waypoint we'll plant into the plan — adjacent to the terrain event cell.
// InterruptSystem uses Chebyshev distance <= 2, so waypoint at (5, 3) is
// exactly on (5, 3) and the event fires at (5, 3) — guaranteed within radius.
const WAYPOINT = { col: 5, row: 3 };
// Terrain event cell — same cell as the waypoint.
const TERRAIN_EVENT_COL = 5;
const TERRAIN_EVENT_ROW = 3;

export const aiTerrainInterruptScenario: ScenarioDefinition = {
    id: 'ai_terrain_interrupt',
    title: 'AI terrain interrupt: stone-damaged event near plan waypoint triggers replan',
    category: 'general',
    generalSection: 'AI',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [],
        });

        const hunter = createUnitFromSpawnConfig(
            {
                id: 'ai_terrain_interrupt_hunter',
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

        // Inject a tactical plan with a path waypoint near the terrain event cell.
        // Use a very long holdUntilTick so it would not naturally expire during the test.
        const OLD_HOLD_UNTIL = 9999;
        hunter.tacticalPlan = createPlan(
            { type: 'chase_target', targetUnitId: player.id },
            {
                baseTicks: OLD_HOLD_UNTIL,
                moveJitter: 0,
                maxJitterTicks: 0,
                invalidateOn: new Set(['terrain_changed_near_path', 'target_died'] as const),
                currentTick: 0,
                path: [WAYPOINT],
            },
        );
        // Freeze the holdUntilTick to a known value so we can detect a change.
        hunter.tacticalPlan.holdUntilTick = OLD_HOLD_UNTIL;

        // Emit the terrain event directly — this fires InterruptSystem's listener
        // and marks `terrain_changed_near_path` on the hunter.
        engine.eventBus.emit('terrain_stone_damaged', {
            col: TERRAIN_EVENT_COL,
            row: TERRAIN_EVENT_ROW,
            worldX: TERRAIN_EVENT_COL * 40 + 20,
            worldY: TERRAIN_EVENT_ROW * 40 + 20,
            previousHealth: 100,
            health: 80,
            maxHealth: 100,
            previousTerrainType: TerrainType.Rock,
            terrainType: TerrainType.Rock,
        });

        // Keep player non-idle.
        for (const tick of [90, 180, 270]) {
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
        const hunter = engine.getUnit('ai_terrain_interrupt_hunter');
        if (!hunter) return false;
        // After the interrupt fires and at least one AI tick runs, hunt_seek
        // should have written a new plan with a different (lower) holdUntilTick.
        // We consider success when the plan has a hold value well below 9999.
        const plan = hunter.tacticalPlan;
        if (plan === null) {
            // Plan was cleared — also indicates replan happened.
            return engine.gameTick > 0;
        }
        return plan.holdUntilTick < 9000 && engine.gameTick > 0;
    },

    failureMessage(engine) {
        const hunter = engine.getUnit('ai_terrain_interrupt_hunter');
        const plan = hunter?.tacticalPlan;
        return (
            `tick=${engine.gameTick} plan=${plan ? `holdUntilTick=${plan.holdUntilTick} type=${plan.data.type}` : 'null'} ` +
            `pendingInterrupts=[${[...(hunter?.pendingInterrupts ?? [])].join(',')}]`
        );
    },
};
