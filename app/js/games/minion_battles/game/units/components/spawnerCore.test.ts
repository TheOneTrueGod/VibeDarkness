import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../EventBus';
import { resetGameObjectIdCounter } from '../../GameObject';
import { createGenericEnemy } from '../GenericEnemy';
import type { Unit } from '../Unit';
import { UnitTag } from '../unitTag';
import type { SpawnUnitContext } from '../spawning/spawnUnit';
import {
    MIN_SPAWN_INTERVAL_SEC,
    createSpawnerState,
    poolSharedConstruction,
    spawnSpawnerChildren,
    tickSpawner,
    type SpawnerEnv,
    type SpawnerSpec,
    type SpawnerState,
} from './spawnerCore';
import { SWARM_SPAWNER } from '../../lanternite/swarmNestTick';
import { LANTERNITE_SPAWNER } from '../../lanternite/lanterniteNestTick';

interface TestCfg {
    cap: number;
    every: number;
    burst?: number;
}

/** A spawner that makes slimes on the spawner's own team. Proves the core is not tied to the nest types. */
const SLIME_SPAWNER: SpawnerSpec<TestCfg> = {
    child: {
        characterId: 'slime',
        name: 'Slimelet',
        abilities: [],
        team: 'inherit',
        aiSettings: null,
        spawnRadiusExtraPx: 40,
        inheritInvulnerability: false,
    },
    maxChildren: (c) => c.cap,
    intervalSec: (c) => c.every,
    burstCount: (c) => c.burst ?? 1,
    describeChild: (spawner, living) => ({
        unitAITreeId: 'hunt',
        aiHookup: { kind: 'swarm', orbitAngle: living, nestOwnerUnitId: spawner.id },
    }),
};

function makeSpawner(characterId = 'swarm_nest', tags: UnitTag[] = []): Unit {
    const u = createGenericEnemy(
        { id: 'spawner_1', x: 200, y: 200, hp: 50, speed: 0, teamId: 'enemy', characterId, name: 'Spawner', abilities: [] },
        new EventBus(),
    );
    u.tags = tags;
    return u;
}

describe('spawnerCore', () => {
    let units: Unit[];
    let spawnCtx: SpawnUnitContext;
    let spawner: Unit;

    beforeEach(() => {
        resetGameObjectIdCounter();
        units = [];
        let seed = 7;
        spawnCtx = {
            units,
            eventBus: new EventBus(),
            addUnit: (u) => units.push(u),
            terrainManager: null,
            lightLevelEnabled: false,
            aiControllerId: null,
            mapPOIs: [],
            getLightAt: () => null,
            getZoneById: () => undefined,
            generateRandomInteger: (min, max) => min + ((seed = (seed * 16807) % 2147483647) % (max - min + 1)),
        };
        spawner = makeSpawner();
        units.push(spawner);
    });

    const env = (gameTime: number): SpawnerEnv => ({ units, gameTime });
    const children = () => units.filter((u) => u.characterId === 'slime');

    it('createSpawnerState schedules the first burst one interval out, floored', () => {
        expect(createSpawnerState(10, 4)).toEqual({ spawnedIds: [], nextSpawnAtGameTime: 14 });
        expect(createSpawnerState(10, 0).nextSpawnAtGameTime).toBe(10 + MIN_SPAWN_INTERVAL_SEC);
    });

    it('waits for the timer, then spawns a burst on the spawner team and reschedules', () => {
        const cfg: TestCfg = { cap: 5, every: 4, burst: 2 };
        const state = createSpawnerState(0, cfg.every);
        const run = (t: number) => tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(t) });

        run(3.9);
        expect(children()).toHaveLength(0);
        run(4);
        expect(children()).toHaveLength(2);
        expect(children().every((c) => c.teamId === 'enemy')).toBe(true);
        expect(state.spawnedIds).toEqual(children().map((c) => c.id));
        expect(state.nextSpawnAtGameTime).toBe(8);

        run(7.9);
        expect(children()).toHaveLength(2);
    });

    it('never exceeds the cap, even inside one burst', () => {
        const cfg: TestCfg = { cap: 3, every: 1, burst: 5 };
        const state = createSpawnerState(0, 1);
        tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(1) });
        expect(children()).toHaveLength(3);
        tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(2) });
        expect(children()).toHaveLength(3);
    });

    it('drops dead children from its bookkeeping so the cap frees up', () => {
        const cfg: TestCfg = { cap: 2, every: 1 };
        const state = createSpawnerState(0, 1);
        tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(1) });
        tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(2) });
        expect(state.spawnedIds).toHaveLength(2);

        children()[0].hp = 0;
        tickSpawner({ spawner, cfg, state, spec: SLIME_SPAWNER, spawnCtx, env: env(3) });
        expect(state.spawnedIds).toHaveLength(2);
        expect(children().filter((c) => c.isAlive())).toHaveLength(2);
    });

    it('canSpawn=false skips the tick without touching the timer', () => {
        const spec: SpawnerSpec<TestCfg> = { ...SLIME_SPAWNER, canSpawn: () => false };
        const cfg: TestCfg = { cap: 2, every: 1 };
        const state = createSpawnerState(0, 1);
        tickSpawner({ spawner, cfg, state, spec, spawnCtx, env: env(5) });
        expect(children()).toHaveLength(0);
        expect(state.nextSpawnAtGameTime).toBe(1);
    });

    it('describeChild=null ends the burst but still reschedules', () => {
        const spec: SpawnerSpec<TestCfg> = { ...SLIME_SPAWNER, describeChild: () => null };
        const cfg: TestCfg = { cap: 2, every: 3 };
        const state = createSpawnerState(0, 3);
        tickSpawner({ spawner, cfg, state, spec, spawnCtx, env: env(3) });
        expect(children()).toHaveLength(0);
        expect(state.nextSpawnAtGameTime).toBe(6);
    });

    it('is a no-op without config or state', () => {
        tickSpawner({ spawner, cfg: null, state: createSpawnerState(0, 1), spec: SLIME_SPAWNER, spawnCtx, env: env(9) });
        tickSpawner({ spawner, cfg: { cap: 1, every: 1 }, state: null, spec: SLIME_SPAWNER, spawnCtx, env: env(9) });
        expect(children()).toHaveLength(0);
    });

    it('spawnSpawnerChildren spawns on demand (the on-death shape) without pacing, honouring the cap', () => {
        const cfg: TestCfg = { cap: 2, every: 99 };
        const state: SpawnerState = { spawnedIds: [], nextSpawnAtGameTime: 1000 };
        const spawned = spawnSpawnerChildren({ spawner, cfg, state, spec: SLIME_SPAWNER, count: 5, spawnCtx, env: env(0) });
        expect(spawned).toHaveLength(2);
        expect(state.nextSpawnAtGameTime).toBe(1000);
    });

    it('inheritInvulnerability copies the Invincible tag and decrements generations', () => {
        const inheriting: SpawnerSpec<TestCfg> = {
            ...SLIME_SPAWNER,
            child: { ...SLIME_SPAWNER.child, inheritInvulnerability: true, team: 'nature' },
        };
        const boss = makeSpawner('swarm_nest', [UnitTag.Invincible]);
        boss.id = 'boss_1';
        boss.invulnerabilityGenerations = 2;
        units.push(boss);
        const state: SpawnerState = { spawnedIds: [], nextSpawnAtGameTime: 0 };
        const [child] = spawnSpawnerChildren({
            spawner: boss,
            cfg: { cap: 1, every: 1 },
            state,
            spec: inheriting,
            count: 1,
            spawnCtx,
            env: env(0),
        });
        expect(child.teamId).toBe('nature');
        expect(child.tags).toContain(UnitTag.Invincible);
        expect(child.invulnerabilityGenerations).toBe(1);
    });
});

describe('nest spawner specs', () => {
    it('describe the lanternite and swarm nests as data', () => {
        expect(LANTERNITE_SPAWNER.child).toMatchObject({
            characterId: 'lanternite',
            team: 'nature',
            inheritInvulnerability: true,
            spawnRadiusExtraPx: 70,
            spawnSource: 'nestSpawn',
        });
        expect(SWARM_SPAWNER.child).toMatchObject({
            characterId: 'swarmling',
            team: 'inherit',
            inheritInvulnerability: false,
            spawnRadiusExtraPx: 60,
        });
        const lanterniteCfg = { maxLanternites: 6, spawnIntervalSec: 14, spawnCount: 2 } as never;
        expect(LANTERNITE_SPAWNER.maxChildren(lanterniteCfg)).toBe(6);
        expect(LANTERNITE_SPAWNER.burstCount(lanterniteCfg)).toBe(2);
        expect(SWARM_SPAWNER.burstCount({ maxSwarmlings: 3, spawnIntervalSec: 8 } as never)).toBe(1);
    });
});

describe('poolSharedConstruction', () => {
    function builder(id: string, site: string | null, completeAt: number | null): Unit {
        const u = createGenericEnemy(
            { id, x: 0, y: 0, hp: 5, speed: 0, teamId: 'enemy', characterId: 'slime', name: id, abilities: [] },
            new EventBus(),
        );
        (u as unknown as { site: string | null; completeAt: number | null }).site = site;
        (u as unknown as { site: string | null; completeAt: number | null }).completeAt = completeAt;
        return u;
    }
    const siteOf = (u: Unit) => (u as unknown as { site: string | null }).site;
    const completeAtOf = (u: Unit) => (u as unknown as { completeAt: number | null }).completeAt;
    const setCompleteAt = (u: Unit, t: number) => {
        (u as unknown as { completeAt: number }).completeAt = t;
    };

    it('pulls each builder in a group of N closer by (N-1) * dt, never below now', () => {
        const a = builder('a', 'poi', 20);
        const b = builder('b', 'poi', 20);
        const c = builder('c', 'poi', 20);
        const lone = builder('lone', 'other', 20);
        poolSharedConstruction({ units: [a, b, c, lone], gameTime: 10, dt: 0.5, siteOf, completeAtOf, setCompleteAt });
        expect([a, b, c].map(completeAtOf)).toEqual([19, 19, 19]);
        expect(completeAtOf(lone)).toBe(20);

        const nearlyDone = [builder('x', 'p', 10.2), builder('y', 'p', 10.2)];
        poolSharedConstruction({ units: nearlyDone, gameTime: 10, dt: 1, siteOf, completeAtOf, setCompleteAt });
        expect(nearlyDone.map(completeAtOf)).toEqual([10, 10]);
    });

    it('ignores dead units, finished builders and units with no site', () => {
        const dead = builder('dead', 'poi', 20);
        dead.hp = 0;
        const done = builder('done', 'poi', 5);
        const idle = builder('idle', null, 20);
        const live = builder('live', 'poi', 20);
        poolSharedConstruction({ units: [dead, done, idle, live], gameTime: 10, dt: 1, siteOf, completeAtOf, setCompleteAt });
        expect(completeAtOf(live)).toBe(20);
        expect(completeAtOf(idle)).toBe(20);
    });
});
