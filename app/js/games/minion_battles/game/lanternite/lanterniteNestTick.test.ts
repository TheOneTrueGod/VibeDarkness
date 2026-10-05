import { describe, it, expect, beforeEach } from 'vitest';
import { processLanterniteNests } from './lanterniteNestTick';
import { LANTERNITE_CHARACTER_ID, LANTERNITE_NEST_CHARACTER_ID, prepareLanterniteNestForMissionStart } from './lanternitePulse';
import { spawnUnit, type SpawnUnitContext } from '../units/spawning/spawnUnit';
import { EventBus } from '../EventBus';
import { resetGameObjectIdCounter } from '../GameObject';
import type { Unit } from '../units/Unit';
import type { NetworkNode } from '../managers/mapNetwork/types';
import { lnet_guard } from '../units/unitAI/lanterniteNetwork/lnet_guard';
import { lnet_chase } from '../units/unitAI/lanterniteNetwork/lnet_chase';

/**
 * Networked lanternite expansion — regression coverage for quest_thorn_march (lobby A74362): the
 * second nest (nest_49_52) spawned only defenders while its sole neighbor nest_48_52 was held by a
 * swarm_nest, hit its maxLanternites cap, and then never sent a scout even after the swarm_nest died.
 */

const HOME = { id: 'nest_49_52', x: 1340, y: 1420 };
const NEXT = { id: 'nest_48_52', x: 380, y: 1220, radius: 64, tags: ['nest'], unitIds: [] } as unknown as NetworkNode;

const mapNetwork = {
    getNeighborIds: (id: string) => (id === HOME.id ? [NEXT.id] : id === NEXT.id ? [HOME.id] : []),
    getNode: (id: string) => (id === NEXT.id ? NEXT : undefined),
};

function makeCtx(units: Unit[], eventBus: EventBus): SpawnUnitContext {
    let seed = 1;
    return {
        units,
        eventBus,
        addUnit: (u) => units.push(u),
        terrainManager: null,
        lightLevelEnabled: false,
        aiControllerId: null,
        mapPOIs: [],
        getLightAt: () => null,
        getZoneById: () => undefined,
        generateRandomInteger: (min, max) => min + ((seed = (seed * 16807) % 2147483647) % (max - min + 1)),
    };
}

function spawnNest(ctx: SpawnUnitContext, poi: { id: string; x: number; y: number }): Unit {
    const [nest] = spawnUnit(ctx, {
        characterId: LANTERNITE_NEST_CHARACTER_ID,
        teamId: 'nature',
        abilities: [],
        aiSettings: { minRange: 0, maxRange: 0 },
        unitAITreeId: 'lanterniteNestIdle',
        placement: { kind: 'fixedWorld', x: poi.x, y: poi.y },
        aiHookup: {
            kind: 'lanterniteNest',
            homeNestPoiId: poi.id,
            nestConfig: {
                maxLanternites: 8,
                spawnCount: 3,
                spawnIntervalSec: 14,
                patrolDestination: { kind: 'world', x: poi.x, y: poi.y },
                networked: true,
                nestPoiId: poi.id,
                scoutConstructionSec: 12,
            },
        },
    });
    prepareLanterniteNestForMissionStart(nest, 0);
    return nest;
}

describe('processLanterniteNests — networked expansion', () => {
    let units: Unit[];
    let eventBus: EventBus;
    let ctx: SpawnUnitContext;
    const step = (gameTime: number) =>
        processLanterniteNests({
            gameTime,
            dt: 1,
            units,
            eventBus,
            addUnit: (u) => units.push(u),
            mapNetwork,
            generateRandomInteger: ctx.generateRandomInteger,
        });
    const kidsOf = (nest: Unit) =>
        units.filter(
            (u) =>
                u.characterId === LANTERNITE_CHARACTER_ID && u.isAlive() && u.lanterniteState.nestOwnerUnitId === nest.id,
        );
    const scoutsOf = (nest: Unit) => kidsOf(nest).filter((u) => u.lanterniteState.role === 'scout');

    beforeEach(() => {
        resetGameObjectIdCounter(1);
        units = [];
        eventBus = new EventBus();
        ctx = makeCtx(units, eventBus);
    });

    it('sends a scout to a neighbor held by a rival swarm nest (contested sites are still targets)', () => {
        const nest = spawnNest(ctx, HOME);
        const [swarmNest] = spawnUnit(ctx, {
            characterId: 'swarm_nest',
            teamId: 'enemy',
            abilities: [],
            placement: { kind: 'fixedWorld', x: NEXT.x, y: NEXT.y },
        });
        expect(swarmNest.isAlive()).toBe(true);

        for (let t = 0; t <= 20; t++) step(t);

        expect(scoutsOf(nest)).toHaveLength(1);
        expect(scoutsOf(nest)[0].lanterniteState.targetNestPoiId).toBe(NEXT.id);
    });

    it('does not send scouts to a neighbor that is already a lanternite nest home', () => {
        const nest = spawnNest(ctx, HOME);
        spawnNest(ctx, { id: NEXT.id, x: NEXT.x, y: NEXT.y });

        for (let t = 0; t <= 60; t++) step(t);

        expect(kidsOf(nest)).toHaveLength(8);
        expect(scoutsOf(nest)).toHaveLength(0);
    });

    it('promotes exactly one defender once the neighbor frees up while the nest is at its cap', () => {
        const nest = spawnNest(ctx, HOME);
        const neighborNest = spawnNest(ctx, { id: NEXT.id, x: NEXT.x, y: NEXT.y });

        // Neighbor claimed → home nest fills its cap with defenders and stops spawning.
        for (let t = 0; t <= 60; t++) step(t);
        expect(kidsOf(nest)).toHaveLength(8);
        expect(scoutsOf(nest)).toHaveLength(0);

        // Neighbor nest destroyed — the node is free again.
        neighborNest.hp = 0;
        neighborNest.active = false;
        step(61);

        const scouts = scoutsOf(nest);
        expect(scouts).toHaveLength(1);
        expect(scouts[0].lanterniteState.targetNestPoiId).toBe(NEXT.id);
        expect(scouts[0].lanterniteState.patrolFarWorld).toEqual({ x: NEXT.x, y: NEXT.y });
        expect(scouts[0].lanterniteState.nestConfig?.scoutConstructionSec).toBe(12);

        // The target is now claimed by that scout — no further promotions.
        step(62);
        expect(scoutsOf(nest)).toHaveLength(1);
    });

    it('promoted defenders leave guard/chase for scout travel', () => {
        const nest = spawnNest(ctx, HOME);
        spawnNest(ctx, { id: NEXT.id, x: NEXT.x, y: NEXT.y });
        for (let t = 0; t <= 20; t++) step(t);
        const defender = kidsOf(nest)[0];

        const toScout = (edges: typeof lnet_guard.edges) => edges.find((e) => e.targetNodeId === 'lnet_scout_travel')!;
        const aiContext = {} as never;
        expect(toScout(lnet_guard.edges).evaluate(defender, aiContext)).toBe(false);

        defender.lanterniteState.role = 'scout';
        defender.lanterniteState.patrolFarWorld = { x: NEXT.x, y: NEXT.y };
        expect(toScout(lnet_guard.edges).evaluate(defender, aiContext)).toBe(true);
        expect(toScout(lnet_chase.edges).evaluate(defender, aiContext)).toBe(true);
    });
});
