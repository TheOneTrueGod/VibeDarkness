/**
 * The Castle Courtyard's Iron Warden: one sleeping sentry pacing the keep door between the nests,
 * which stays asleep while the party waits on the bridge.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import type { SentryPatrolAITreeContext } from '../../../game/units/unitAI/sentryPatrol/context';
import { THE_CASTLE_COURTYARD, WARDEN_NOTICE_RANGE_PX, WARDEN_ROUTE } from './012_the_castle_courtyard';

registerWorldOfDarknessSegments();

const SEGMENT_SIZE = 22;

function initMission(seed = 7): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrainManager = new TerrainManager(THE_CASTLE_COURTYARD.createTerrain());
    const composed = THE_CASTLE_COURTYARD.composeMap();
    THE_CASTLE_COURTYARD.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(THE_CASTLE_COURTYARD.battleObjectives ?? []);
    return engine;
}

const wardens = (engine: GameEngine) => engine.units.filter((u) => u.characterId === 'iron_warden');

describe('The Castle Courtyard (012) Iron Warden', () => {
    it('walks a route that starts and ends on walkable courtyard ground', () => {
        const terrain = THE_CASTLE_COURTYARD.createTerrain();
        for (const cell of [WARDEN_ROUTE.from, WARDEN_ROUTE.to]) {
            const col = WARDEN_ROUTE.slot.tileCol * SEGMENT_SIZE + cell.col;
            const row = WARDEN_ROUTE.slot.tileRow * SEGMENT_SIZE + cell.row;
            expect(TERRAIN_PROPERTIES[terrain.get(col, row)].passable).toBe(true);
        }
    });

    it('places one sleeping sentry Warden at the keep door with its full kit', () => {
        const engine = initMission();
        const all = wardens(engine);
        expect(all).toHaveLength(1);
        const w = all[0]!;
        expect(w.unitAITreeId).toBe('sentryPatrol');
        const ctx = w.aiContext as SentryPatrolAITreeContext;
        expect(ctx.waypoints).toHaveLength(2);
        expect(ctx.noticeRangePx).toBe(WARDEN_NOTICE_RANGE_PX);
        expect(w.abilities).toEqual(['1201', '1202', '1203']);
        expect(engine.terrainManager!.isPassable(w.x, w.y)).toBe(true);
        engine.destroy();
    });

    it('stays asleep while the party waits on the bridge', () => {
        const engine = initMission();
        let guard = 0;
        while (engine.gameTime < 8 && guard++ < 3000) {
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
        }
        const w = wardens(engine)[0]!;
        expect(w.isAlive()).toBe(true);
        expect((w.aiContext as SentryPatrolAITreeContext).aiState).not.toBe('sentryPatrol_hostile');
        engine.destroy();
    });
});
