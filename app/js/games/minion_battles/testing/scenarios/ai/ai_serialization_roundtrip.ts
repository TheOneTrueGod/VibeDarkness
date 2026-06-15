/**
 * ai_serialization_roundtrip — Verify that a hunt unit's active tactical plan
 * survives a toJSON / fromJSON round-trip.
 *
 * After the hunt unit acquires a `chase_target` tactical plan (within the first
 * round of the scenario), `assertPass` serialises the engine, restores it via
 * `GameEngine.fromJSON`, and checks that:
 *   1. The restored unit's `tacticalPlan` is non-null.
 *   2. The restored plan has the same `type` and `targetUnitId` as the live plan.
 *
 * The group layer is also checked if a group exists: its strategic plan type
 * must round-trip correctly.
 *
 * NOTE: `GameEngine.fromJSON` needs a TerrainManager to restore unit pathfinding;
 * we pass `null` for the terrain manager (same as the test in GameEngine.test.ts)
 * which is sufficient for checking plan data.
 */

import type { ScenarioDefinition } from '../../types';
import { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

const PLAYER_POS = { x: 2 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const HUNTER_POS = { x: 6 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

const HUNTER_ID = 'ai_serial_roundtrip_hunter';

export const aiSerializationRoundtripScenario: ScenarioDefinition = {
    id: 'ai_serialization_roundtrip',
    title: 'AI serialization round-trip: tactical plan survives toJSON / fromJSON',
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
                id: HUNTER_ID,
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

        // Keep player non-idle for 3 rounds.
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
        const hunter = engine.getUnit(HUNTER_ID);
        if (!hunter) return false;

        const livePlan = hunter.tacticalPlan;
        // Wait until the hunt unit has an active chase_target plan.
        if (!livePlan || livePlan.data.type !== 'chase_target') return false;
        const liveTargetId = livePlan.data.targetUnitId;
        if (!liveTargetId) return false;

        // Perform the round-trip: serialise the live engine, restore it.
        const saved = engine.toJSON();
        let restored: GameEngine | null = null;
        try {
            restored = GameEngine.fromJSON(saved, P, engine.terrainManager);

            const restoredHunter = restored.getUnit(HUNTER_ID);
            if (!restoredHunter) return false;

            const restoredPlan = restoredHunter.tacticalPlan;
            if (!restoredPlan) return false;

            if (restoredPlan.data.type !== livePlan.data.type) return false;
            if (restoredPlan.data.targetUnitId !== liveTargetId) return false;

            // Optional: if a group exists for the hunter, verify strategic plan type.
            const liveGroup = engine.state.groupManager.getGroupForUnit(HUNTER_ID);
            const restoredGroup = restored.state.groupManager.getGroupForUnit(HUNTER_ID);
            if (liveGroup && restoredGroup) {
                if (restoredGroup.strategicPlan.data.type !== liveGroup.strategicPlan.data.type) return false;
            }

            return true;
        } finally {
            restored?.destroy();
        }
    },

    failureMessage(engine) {
        const hunter = engine.getUnit(HUNTER_ID);
        const plan = hunter?.tacticalPlan;
        return (
            `tick=${engine.gameTick} plan=${plan ? `type=${plan.data.type} target=${plan.data.targetUnitId}` : 'null'} ` +
            `player=${engine.getLocalPlayerUnit()?.id ?? 'none'}`
        );
    },
};
