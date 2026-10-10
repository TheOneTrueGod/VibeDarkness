import '../../../abilities/AbilityRegistry';
import { describe, expect, it } from 'vitest';
import { RockSlideAbility_0537 } from './0537Ability';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { createTargetDummyAtWorld } from '../../../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import {
    earthCoreRockSlideScenario,
    ROCK_SLIDE_SCENARIO_ROCK_TILE,
    ROCK_SLIDE_SCENARIO_LANDING_TILE,
} from '../../../testing/scenarios/abilities/earthCoreScenarios';
import {
    ROCK_SLIDE_AIM_START,
    ROCK_SLIDE_SPAWN_TIME,
    ROCK_SLIDE_LAUNCH_TIME,
    ROCK_SLIDE_CAST_TIME,
    ROCK_SLIDE_DAMAGE,
    ROCK_SLIDE_ROCK_RESOURCE_GAIN,
} from '../earthCoreConstants';
import { Rock } from '../../../resources/Rock';
import {
    isSlideSpawnTile,
    resolveRockTile,
    resolveSlideDirection,
} from './rockSlideHelpers';
import { snapAdjacentCardinalTile, tileCentre } from '../../../abilities/tileAreaHelpers';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';

const SPAWN_TILE = { col: 4, row: 5 };

function setup(): { engine: GameEngine; player: Unit; start: number } {
    const engine = earthCoreRockSlideScenario.buildEngine() as GameEngine;
    for (const order of earthCoreRockSlideScenario.getInitialOrders(engine)) {
        engine.state.orderMgr.applyOrder(order);
    }
    // The order starts the cast on the first stepped tick.
    engine.stepSimulationFixedTicks(1);
    const player = engine.getLocalPlayerUnit()!;
    const active = player.activeAbilities.find((a) => a.abilityId === '0537');
    expect(active).toBeTruthy();
    return { engine, player, start: active!.startTime };
}

function tick(engine: GameEngine): void {
    resolveParallelOrderPause(engine);
    engine.stepSimulationFixedTicks(1);
}

/** Step until the cast has run for `seconds`. */
function stepToElapsed(engine: GameEngine, start: number, seconds: number): void {
    let guard = 0;
    while (engine.gameTime - start < seconds && guard++ < 1000) tick(engine);
}

function liveProjectiles(engine: GameEngine) {
    return engine.projectiles.filter((p) => p.active);
}

function terrain(engine: GameEngine, col: number, row: number): TerrainType {
    return engine.terrainManager!.getEffectiveTerrainType(col, row);
}

/** A pixel pick at the centre of a tile, shaped like a player click. */
function pixelAt(col: number, row: number) {
    return {
        type: 'pixel' as const,
        position: { x: (col + 0.5) * CELL_SIZE, y: (row + 0.5) * CELL_SIZE },
    };
}

describe('Rock Slide (0537) timeline', () => {
    it('plays the steps in order and the caster stays put until the slide', () => {
        const { engine, player, start } = setup();
        const startPos = { x: player.x, y: player.y };
        const { col, row } = ROCK_SLIDE_SCENARIO_ROCK_TILE;

        stepToElapsed(engine, start, ROCK_SLIDE_AIM_START - 0.05);
        expect(terrain(engine, col, row)).toBe(TerrainType.Rock);
        expect(liveProjectiles(engine)).toHaveLength(0);

        stepToElapsed(engine, start, ROCK_SLIDE_AIM_START + 0.05);
        expect(terrain(engine, col, row)).toBe(TerrainType.Rubble);
        expect(liveProjectiles(engine)).toHaveLength(0);

        stepToElapsed(engine, start, ROCK_SLIDE_SPAWN_TIME + 0.05);
        const held = liveProjectiles(engine);
        expect(held).toHaveLength(1);
        expect(held[0]!.projectileType).toBe('rock_slide');
        expect(held[0]!.isHeld).toBe(true);
        expect(held[0]!.heldBy).toEqual({ unitId: player.id, abilityId: '0537' });
        expect(held[0]!.x).toBeCloseTo((SPAWN_TILE.col + 0.5) * CELL_SIZE);
        expect(held[0]!.y).toBeCloseTo((SPAWN_TILE.row + 0.5) * CELL_SIZE);
        expect(player.x).toBe(startPos.x);
        expect(player.y).toBe(startPos.y);

        stepToElapsed(engine, start, ROCK_SLIDE_LAUNCH_TIME + 0.05);
        const flying = liveProjectiles(engine)[0]!;
        expect(flying.isHeld).toBe(false);
        expect(flying.velocityX).toBeGreaterThan(0);
        expect(flying.x).toBeGreaterThan((SPAWN_TILE.col + 0.5) * CELL_SIZE);
        expect(flying.velocityY).toBe(0);
    });

    it('grants the caster rock when the picked rock is destroyed at the end of the windup', () => {
        const { engine, player, start } = setup();
        const rock = new Rock();
        player.attachResource(rock, engine.eventBus);
        const { col, row } = ROCK_SLIDE_SCENARIO_ROCK_TILE;

        stepToElapsed(engine, start, ROCK_SLIDE_AIM_START - 0.05);
        expect(terrain(engine, col, row)).toBe(TerrainType.Rock);
        expect(rock.current).toBe(0);

        stepToElapsed(engine, start, ROCK_SLIDE_AIM_START + 0.05);
        expect(terrain(engine, col, row)).toBe(TerrainType.Rubble);
        expect(rock.current).toBe(ROCK_SLIDE_ROCK_RESOURCE_GAIN);

        // Granted once, not again later in the cast.
        stepToElapsed(engine, start, ROCK_SLIDE_CAST_TIME + 0.2);
        expect(rock.current).toBe(ROCK_SLIDE_ROCK_RESOURCE_GAIN);
    });

    it('finishes after ~1.4s with the rock landed against the wall and the dummy hit once', () => {
        const { engine, start } = setup();
        stepToElapsed(engine, start, ROCK_SLIDE_CAST_TIME + 0.2);
        const dummy = engine.getUnit('target_dummy')!;
        expect(dummy.maxHp - dummy.hp).toBe(ROCK_SLIDE_DAMAGE);
        expect(terrain(engine, ROCK_SLIDE_SCENARIO_LANDING_TILE.col, ROCK_SLIDE_SCENARIO_LANDING_TILE.row)).toBe(TerrainType.Rock);
        expect(liveProjectiles(engine)).toHaveLength(0);
        expect(engine.getLocalPlayerUnit()!.activeAbilities.some((a) => a.abilityId === '0537')).toBe(false);
    });
});

describe('Rock Slide (0537) interrupts', () => {
    it('interrupted after the rock is destroyed (before the projectile): rock stays destroyed, nothing spawns', () => {
        const { engine, player, start } = setup();
        stepToElapsed(engine, start, ROCK_SLIDE_AIM_START + 0.1);
        engine.interruptUnitAndRefundAbilities(player);
        stepToElapsed(engine, start, ROCK_SLIDE_CAST_TIME);
        const { col, row } = ROCK_SLIDE_SCENARIO_ROCK_TILE;
        expect(terrain(engine, col, row)).toBe(TerrainType.Rubble);
        expect(engine.projectiles).toHaveLength(0);
        const dummy = engine.getUnit('target_dummy')!;
        expect(dummy.hp).toBe(dummy.maxHp);
    });

    it('interrupted after the projectile spawns but before it launches: tile becomes rock, projectile deleted and never moves', () => {
        const { engine, player, start } = setup();
        stepToElapsed(engine, start, ROCK_SLIDE_SPAWN_TIME + 0.05);
        expect(liveProjectiles(engine)).toHaveLength(1);
        expect(terrain(engine, SPAWN_TILE.col, SPAWN_TILE.row)).not.toBe(TerrainType.Rock);

        engine.interruptUnitAndRefundAbilities(player);
        expect(liveProjectiles(engine)).toHaveLength(0);
        expect(terrain(engine, SPAWN_TILE.col, SPAWN_TILE.row)).toBe(TerrainType.Rock);

        stepToElapsed(engine, start, ROCK_SLIDE_CAST_TIME + 0.3);
        expect(engine.projectiles.filter((p) => p.active)).toHaveLength(0);
        const dummy = engine.getUnit('target_dummy')!;
        expect(dummy.hp).toBe(dummy.maxHp);
    });

    it('interrupted after launch: the projectile still flies, hits and lands', () => {
        const { engine, player, start } = setup();
        stepToElapsed(engine, start, ROCK_SLIDE_LAUNCH_TIME + 0.05);
        engine.interruptUnitAndRefundAbilities(player);
        stepToElapsed(engine, start, ROCK_SLIDE_CAST_TIME + 0.3);
        const dummy = engine.getUnit('target_dummy')!;
        expect(dummy.maxHp - dummy.hp).toBe(ROCK_SLIDE_DAMAGE);
        expect(terrain(engine, ROCK_SLIDE_SCENARIO_LANDING_TILE.col, ROCK_SLIDE_SCENARIO_LANDING_TILE.row)).toBe(TerrainType.Rock);
    });

    it('interrupted during cooldown: the cast ends immediately instead of running out the cooldown', () => {
        const { engine, player, start } = setup();
        stepToElapsed(engine, start, 1.1);
        expect(player.activeAbilities.some((a) => a.abilityId === '0537')).toBe(true);
        engine.interruptUnitAndRefundAbilities(player);
        expect(player.activeAbilities.some((a) => a.abilityId === '0537')).toBe(false);
    });

    it('a same-id recast while the rock is held puts the rock back on the spawn tile and removes the projectile', () => {
        const { engine, player, start } = setup();
        stepToElapsed(engine, start, ROCK_SLIDE_SPAWN_TIME + 0.05);
        expect(liveProjectiles(engine)).toHaveLength(1);

        // The first cast used one use; top it up so the recast is legal.
        const runtime = player.abilityRuntime['0537'];
        if (runtime) runtime.currentUses = Math.max(runtime.currentUses, 1);
        executeUnitAbility(player, RockSlideAbility_0537, [], engine);

        expect(liveProjectiles(engine)).toHaveLength(0);
        expect(terrain(engine, SPAWN_TILE.col, SPAWN_TILE.row)).toBe(TerrainType.Rock);
    });
});

describe('Rock Slide (0537) interactive targeting', () => {
    it('pauses for the direction only after the picked rock is already rubble, then the punch resumes with the pick', () => {
        const engine = earthCoreRockSlideScenario.buildEngine() as GameEngine;
        const player = engine.getLocalPlayerUnit()!;
        const { col, row } = ROCK_SLIDE_SCENARIO_ROCK_TILE;

        executeUnitAbility(player, RockSlideAbility_0537, [], engine);
        const active = player.activeAbilities.find((a) => a.abilityId === '0537')!;
        // Interactive run: the rock is picked up front, the direction is not yet known.
        active.targetsByLabel = { Rock: pixelAt(col, row) };
        const start = active.startTime;

        let guard = 0;
        while (!engine.waitingForTargetInput && guard++ < 300) tick(engine);

        expect(engine.waitingForTargetInput?.label).toBe('Direction');
        expect(terrain(engine, col, row)).toBe(TerrainType.Rubble);
        expect(engine.gameTime - start).toBeGreaterThanOrEqual(ROCK_SLIDE_AIM_START - 1e-6);
        expect(engine.gameTime - start).toBeLessThan(ROCK_SLIDE_AIM_START + 0.05);

        // Answer the direction prompt the way the UI does, then the punch launches the held rock.
        engine.waitingForTargetInput = null;
        active.targetsByLabel = { Rock: pixelAt(col, row), Direction: pixelAt(SPAWN_TILE.col, SPAWN_TILE.row) };
        stepToElapsed(engine, start, ROCK_SLIDE_SPAWN_TIME + 0.05);
        const held = liveProjectiles(engine);
        expect(held).toHaveLength(1);
        expect(held[0]!.isHeld).toBe(true);
    });
});

describe('Rock Slide (0537) projectile hits', () => {
    function addDummy(engine: GameEngine, id: string, x: number, y: number): Unit {
        const dummy = createTargetDummyAtWorld(engine, x, y, { id });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');
        return dummy;
    }

    it('knocks units 45 degrees toward the side of the projectile they are on', () => {
        const { engine, start } = setup();
        const rowY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const above = addDummy(engine, 'above', 5 * CELL_SIZE + 20, rowY - 8);
        const below = addDummy(engine, 'below', 6 * CELL_SIZE + 20, rowY + 8);
        const seen: Record<string, { x: number; y: number }> = {};
        let guard = 0;
        while (engine.gameTime - start < ROCK_SLIDE_CAST_TIME && guard++ < 400) {
            tick(engine);
            for (const u of [above, below]) {
                if (u.knockback && !seen[u.id]) seen[u.id] = { ...u.knockback.knockbackVector };
            }
        }
        const a = seen['above']!;
        const b = seen['below']!;
        expect(a).toBeTruthy();
        expect(b).toBeTruthy();
        // Travelling east: the unit above (smaller y) goes up-and-forward, the one below down-and-forward.
        expect(a.x).toBeGreaterThan(0);
        expect(a.y).toBeLessThan(0);
        expect(Math.abs(a.x)).toBeCloseTo(Math.abs(a.y), 3);
        expect(b.x).toBeGreaterThan(0);
        expect(b.y).toBeGreaterThan(0);
        expect(Math.abs(b.x)).toBeCloseTo(Math.abs(b.y), 3);
    });

    it('damages only the first 5 enemies but knocks back every enemy it touches', () => {
        const { engine, start } = setup();
        // The scenario dummy sits at tile 7; add six more in a column on tiles 5..8 so seven total are hit.
        const rowY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const extras: Unit[] = [];
        for (let i = 0; i < 6; i++) {
            extras.push(addDummy(engine, `extra${i}`, (5 + (i % 4)) * CELL_SIZE + 5 + i, rowY + (i % 2 === 0 ? -6 : 6)));
        }
        const everyone = [engine.getUnit('target_dummy')!, ...extras];
        const knocked = new Set<string>();
        const hits: Array<{ targetUnitId: string; damage: number }> = [];
        engine.eventBus.on('projectile_hit', (d) => hits.push(d as { targetUnitId: string; damage: number }));
        let guard = 0;
        while (engine.gameTime - start < ROCK_SLIDE_CAST_TIME + 0.2 && guard++ < 500) {
            tick(engine);
            for (const u of everyone) if (u.knockback) knocked.add(u.id);
        }
        // Exactly five damaging hits (units may also take incidental knockback-collision damage).
        expect(hits).toHaveLength(5);
        for (const h of hits) expect(h.damage).toBe(ROCK_SLIDE_DAMAGE);
        expect(new Set(hits.map((h) => h.targetUnitId)).size).toBe(5);
        // ...but all seven units in the path were knocked back, including the two past the limit.
        expect(knocked.size).toBe(everyone.length);
    });
});

describe('Rock Slide (0537) wall landing', () => {
    const DIRS = [
        { name: 'east', dc: 1, dr: 0 },
        { name: 'west', dc: -1, dr: 0 },
        { name: 'south', dc: 0, dr: 1 },
        { name: 'north', dc: 0, dr: -1 },
    ];
    const CASTER_TILE = { col: 10, row: 10 };
    const WALL_DISTANCE = 4;

    for (const dir of DIRS) {
        it(`punched ${dir.name} into a wall, it lands as rock on the tile in front of the wall`, () => {
            const engine = buildTinyBattleEngine({ gridW: 21, gridH: 21, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
            const grid = engine.terrainManager!.grid;
            const rock = { col: CASTER_TILE.col - 1, row: CASTER_TILE.row - 1 };
            grid.set(rock.col, rock.row, TerrainType.Rock);
            const wall = { col: CASTER_TILE.col + dir.dc * WALL_DISTANCE, row: CASTER_TILE.row + dir.dr * WALL_DISTANCE };
            // A wall line across the path, three tiles either side.
            for (let k = -3; k <= 3; k++) {
                grid.set(wall.col + (dir.dr !== 0 ? k : 0), wall.row + (dir.dc !== 0 ? k : 0), TerrainType.Rock);
            }
            placePlayerAndDummy(engine, {
                playerId: TINY_BATTLE_PLAYER_ID,
                playerWorld: tileCentre(CASTER_TILE),
                dummyWorld: tileCentre({ col: 1, row: 1 }),
                abilities: ['0537'],
            });
            const player = engine.getLocalPlayerUnit()!;
            engine.state.orderMgr.applyOrder({
                unitId: player.id,
                abilityId: '0537',
                targets: [
                    pixelAt(rock.col, rock.row),
                    pixelAt(CASTER_TILE.col + dir.dc, CASTER_TILE.row + dir.dr),
                ],
                endTurn: true,
            });
            for (let i = 0; i < 240; i++) tick(engine);

            const inFront = { col: wall.col - dir.dc, row: wall.row - dir.dr };
            expect(liveProjectiles(engine)).toHaveLength(0);
            expect(terrain(engine, inFront.col, inFront.row)).toBe(TerrainType.Rock);
            // The tile before that is still open: the rock rested against the wall, not short of it.
            expect(terrain(engine, inFront.col - dir.dc, inFront.row - dir.dr)).not.toBe(TerrainType.Rock);
        });
    }
});

describe('Rock Slide (0537) pick validation', () => {
    const selectDefs = RockSlideAbility_0537.abilityTimings
        .map((t) => ('targetDef' in t ? t.targetDef : undefined))
        .filter((d) => d?.kind === 'select');
    const rockDef = selectDefs[0]!;
    const dirDef = selectDefs[1]!;
    if (rockDef.kind !== 'select' || dirDef.kind !== 'select') throw new Error('expected select defs');

    function world() {
        const engine = earthCoreRockSlideScenario.buildEngine() as GameEngine;
        return { engine, caster: engine.getLocalPlayerUnit()! };
    }

    it('declares the two interactive picks in order', () => {
        expect(rockDef.label).toBe('Rock');
        expect(dirDef.label).toBe('Direction');
    });

    it('rock pick: accepts rock tiles within 2, rejects empty ground', () => {
        const { engine, caster } = world();
        const ctx = (pick: ReturnType<typeof pixelAt>) => ({ caster, engine, pick, collectedTargets: {} });
        expect(rockDef.validatePick!(ctx(pixelAt(3, 3)))).toBe(true); // rock, 2 tiles up
        expect(rockDef.validatePick!(ctx(pixelAt(4, 5)))).toBe(false); // grass
    });

    it('rock pick: a player-made rock (floor layer) counts', () => {
        const { engine, caster } = world();
        engine.terrainManager!.createOrMarkRock(2, 5);
        expect(rockDef.validatePick!({ caster, engine, pick: pixelAt(2, 5), collectedTargets: {} })).toBe(true);
    });

    it('rock pick: far clicks clamp to within 2 tiles of the caster', () => {
        const tile = resolveRockTile({ x: 3.5 * CELL_SIZE, y: 5.5 * CELL_SIZE }, { x: 11.5 * CELL_SIZE, y: 5.5 * CELL_SIZE });
        expect(tile).toEqual({ col: 5, row: 5 });
    });

    it('direction pick: snaps to a cardinal neighbour and must not be rock', () => {
        const { engine, caster } = world();
        const ctx = (pick: ReturnType<typeof pixelAt>) => ({ caster, engine, pick, collectedTargets: {} });
        expect(dirDef.validatePick!(ctx(pixelAt(4, 5)))).toBe(true); // east, grass
        engine.terrainManager!.createOrMarkRock(4, 5);
        expect(dirDef.validatePick!(ctx(pixelAt(4, 5)))).toBe(false); // east now rock
        // A diagonal click snaps to the dominant axis (north here), which is still free.
        expect(resolveSlideDirection({ x: 3.5 * CELL_SIZE, y: 5.5 * CELL_SIZE }, { x: 4.4 * CELL_SIZE, y: 3.6 * CELL_SIZE }))
            .toMatchObject({ tile: { col: 3, row: 4 }, dirCol: 0, dirRow: -1 });
    });

    it('geometry helpers', () => {
        expect(snapAdjacentCardinalTile(100, 100, 100, 100)).toBeNull();
        const { engine } = world();
        const tm = engine.terrainManager!;
        expect(tm.isIntactRockAt(3, 3)).toBe(true);
        expect(tm.isIntactRockAt(-1, 3)).toBe(false);
        expect(isSlideSpawnTile(tm, { col: 4, row: 5 })).toBe(true);
        expect(isSlideSpawnTile(tm, { col: 3, row: 3 })).toBe(false);
    });
});
