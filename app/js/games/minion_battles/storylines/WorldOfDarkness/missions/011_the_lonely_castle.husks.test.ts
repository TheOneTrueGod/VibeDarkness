/**
 * The Lonely Castle's Husks: the former residents pace their routes in the gate yard and courtyard,
 * asleep while the party is far away, leaving miasma behind them as they walk.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { MIASMA_EFFECT_TYPE } from '../../../game/terrainEffects/terrainEffectDefs';
import type { SentryPatrolAITreeContext } from '../../../game/units/unitAI/sentryPatrol/context';
import { HUSK_ROUTES, THE_LONELY_CASTLE } from './011_the_lonely_castle';

registerWorldOfDarknessSegments();

const SEGMENT_SIZE = 22;

function initMission(seed = 7): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrainManager = new TerrainManager(THE_LONELY_CASTLE.createTerrain());
    const composed = THE_LONELY_CASTLE.composeMap();
    THE_LONELY_CASTLE.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(THE_LONELY_CASTLE.battleObjectives ?? []);
    return engine;
}

function step(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

const husks = (engine: GameEngine) => engine.units.filter((u) => u.characterId === 'husk');

describe('The Lonely Castle (011) Husks', () => {
    it('routes start and end on walkable castle ground', () => {
        const terrain = THE_LONELY_CASTLE.createTerrain();
        for (const route of HUSK_ROUTES) {
            for (const cell of [route.from, route.to]) {
                const col = route.slot.tileCol * SEGMENT_SIZE + cell.col;
                const row = route.slot.tileRow * SEGMENT_SIZE + cell.row;
                expect(TERRAIN_PROPERTIES[terrain.get(col, row)].passable).toBe(true);
            }
        }
    });

    it('places one sleeping sentry Husk per route, with a two-point patrol', () => {
        const engine = initMission();
        const all = husks(engine);
        expect(all).toHaveLength(HUSK_ROUTES.length);
        for (const h of all) {
            expect(h.unitAITreeId).toBe('sentryPatrol');
            const ctx = h.aiContext as SentryPatrolAITreeContext;
            expect(ctx.waypoints).toHaveLength(2);
            expect(engine.terrainManager!.isPassable(h.x, h.y)).toBe(true);
        }
        engine.destroy();
    });

    it('keeps the Husks asleep while the party is in the cave, pacing and leaving miasma', () => {
        const engine = initMission();
        const start = husks(engine).map((h) => ({ x: h.x, y: h.y }));
        let guard = 0;
        while (engine.gameTime < 8 && guard++ < 3000) step(engine, 1);

        const all = husks(engine);
        for (const h of all) {
            expect((h.aiContext as SentryPatrolAITreeContext).aiState).not.toBe('sentryPatrol_hostile');
        }
        const moved = all.filter((h, i) => Math.hypot(h.x - start[i]!.x, h.y - start[i]!.y) > CELL_SIZE);
        expect(moved.length).toBeGreaterThan(0);
        const gas = [...engine.terrainLayers.allEffects.values()].filter((r) => r.effectType === MIASMA_EFFECT_TYPE);
        expect(gas.length).toBeGreaterThan(0);
        engine.destroy();
    });
});
