/**
 * Garden Heart nodes: the five node kinds (one behaviour each), the Shell on every node, the per-phase tree layouts
 * and growing / dismissing a tree. No number-tuning assertions: each test checks that a behaviour happens, not how
 * big its numbers are.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { createUnitFromSpawnConfig } from '../units';
import type { Unit } from '../units/Unit';
import { executeUnitAbility } from '../units/unitAbilityLifecycle';
import { getAbility } from '../../abilities/AbilityRegistry';
import { resolveParallelOrderPause } from '../../testing/runner/SimulationRunner';
import { CARD_DEF_MAP } from '../../card_defs/index';
import { getBestiaryUnitIds, getUnitDefEntry as getDefEntry, type UnitDefId } from '../units/unit_defs/unitDef';
import type { ResolvedTarget } from '../types';
import type { EnemySpawnDef } from '../../storylines/types';
import {
    ENEMY_CREEPER,
    ENEMY_DARK_WOLF,
    ENEMY_GARDEN_HEART,
    ENEMY_GLOAM_LILY,
    ENEMY_HIVE_GOURD,
    ENEMY_POD_MORTAR,
    ENEMY_THORNSPITTER,
} from '../../constants/enemyConstants';
import {
    CREEPER_ID,
    DRINK_LIGHT_ABILITY_ID,
    GLOAM_LILY_ID,
    HIVE_GOURD_ID,
    HIVE_GOURD_INTERVAL_SEC,
    HIVE_GOURD_MAX_CHILDREN,
    LOB_SEED_ABILITY_ID,
    LOB_SEED_WINDUP_SEC,
    POD_MORTAR_ID,
    POD_SEED_ID,
    RUNNER_VINE_ABILITY_ID,
    SPIKE_RING_ABILITY_ID,
    SPIKE_RING_COUNT,
    BLOOM_BURST_ABILITY_ID,
    BLOOM_BURST_COUNT,
    GARDEN_BARED_BANNER_TEXT,
    GARDEN_BARED_SECONDS,
    GARDEN_REGROWN_BANNER_TEXT,
    GARDEN_SEVERANCE_DAMAGE,
    GARDEN_NODE_EMERGE,
    GARDEN_ORBIT,
    GARDEN_ROUND_ORBIT_TILES,
    GARDEN_HEART_ROUND_HOP_BLAST_PX,
    GARDEN_HEART_ROUND_HOP_DAMAGE,
    GARDEN_TRICKLE_REGROW_SEC,
    GARDEN_TRICKLE_REGROW_SEC_BY_PHASE,
    HEART_SHELL_REDUCTION,
    PINWHEEL_ABILITY_ID,
    PINWHEEL_DOUBLED_ABILITY_ID,
    SPIKE_RING_RATES,
    RUNNER_VINE_MAX_TILES,
    RUNNER_VINE_MIN_TILES,
    THORNSPITTER_ID,
    THORN_FANS_ABILITY_ID,
    THORN_FAN_COUNT,
    THORN_FAN_SIZE,
    THORN_FAN_WAVES_BY_PHASE,
    THORN_MAX_RANGE,
    THORN_AI_RANGE,
    GARDEN_GROWTH_PHASE_VARIABLE,
    GARDEN_NODE_HOP,
    GARDEN_WILD_HIT_RULE,
    GARDEN_NODE_HOP_BLAST_RADII,
    GARDEN_NODE_HOP_DAMAGE,
    STEM_LEASH_PX,
} from '../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { thornFanOffsets, thornFanWaves, thornWaveTurn } from '../../card_defs/16_enemy_garden_heart/1601_ThornFans/1601Ability';
import { getBattleVariable, setBattleVariable } from '../battleVariables';
import { trailTiles } from '../../abilities/CastBehaviours/GroundTrailBehaviour';
import { gardenSpikeRingRate } from '../../card_defs/16_enemy_garden_heart/1605_SpikeRing/1605Ability';
import { peekPhaseState } from '../units/components/phaseComponent';
import { ROUND_DURATION } from '../gameConstants';
import { BURROWING_PROJECTILE_TYPE } from '../projectiles/projectile_defs/burrowingDef';
import { THORN_PROJECTILE_TYPE } from '../projectiles/projectile_defs/thornDef';
import { GARDEN_THORN_EFFECT_TYPE, getTerrainEffectDef } from '../terrainEffects/terrainEffectDefs';
import { unitIsHurtByThorns } from '../terrainEffects/thorns';
import {
    getNodeChildIds,
    getNodeParentId,
    hasLivingChildren,
    linkNodeChild,
    NODE_TREE_COMPONENT,
    hasLeashSlack,
    type NodeTreeState,
} from '../units/components/nodeTree';
import { getComponentState } from '../units/components/unitComponent';
import { peekSpawnerState } from '../units/components/spawnerComponent';
import { serializeUnit } from '../units/unitToJSON';
import { applySerializedUnitState } from '../units/unitFromJSON';
import { distanceToSegment, listLiveTethers, tetherCoveredTiles } from '../tethers/tether';
import { resolveBurrowRender } from '../units/unitRenderOptions';
import { applyUnitFlatReductions } from '../units/flatDamageReduction';
import { BURROW_HOP_COMPONENT_ID, isBurrowHopDue, peekBurrowHopState } from '../units/components/burrowHop';
import { chooseHopPoint, hopKeepsTethers } from '../units/components/burrowHopHooks';
import { getBurrowVisual } from '../units/components/phaseBurrow';
import { UnitTag, hasUnitTag, isCcImmune } from '../units/unitTag';
import { isBurrowEmerging } from '../units/components/burrowEmergeHooks';
import { peekRoundHopState } from '../units/components/roundHop';

import { ellipseOrbitPoint } from '../geometry/ellipseOrbit';
import { gardenOrbitClockwiseTiles } from '../../card_defs/16_enemy_garden_heart/gardenHeartRegistrations';
import { getActiveUnitBanner } from '../unitBanner';
import { getNodeRegrowthStatus } from '../units/components/nodeRegrowth';
import { canHit } from '../hitRule';
import { applyBleedStack, isBleeding } from '../../buffs/bleedRuntime';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { getUnitAITree } from '../units/unitAI';
import {
    GARDEN_PHASE_COUNT,
    GARDEN_TREE_LAYOUTS,
    gardenTreeLayout,
    knotKeys,
} from './gardenTreeLayouts';
import {
    dismissGardenTree,
    emergeGardenTree,
    gardenTreeDescendants,
    growGardenTree,
    nearestPassablePoint,
    type GardenGrowContext,
} from './growGardenTree';

const GRID = 40;
const TICKS_PER_SEC = 60;
const centre = (cell: number): number => (cell + 0.5) * CELL_SIZE;

let engine: GameEngine;

afterEach(() => {
    engine?.destroy();
});

function setupEngine(rockCells: Array<[number, number]> = []): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(GRID, GRID, CELL_SIZE, TerrainType.Grass);
    for (const [col, row] of rockCells) grid.set(col, row, TerrainType.Rock);
    engine = new GameEngine();
    engine.prepareForNewGame({
        localPlayerId: 'p1',
        randomSeed: 1,
        terrainManager: new TerrainManager(grid),
        aiControllerId: null,
    });
    engine.setMissionLightConfig(false, 0);
    engine.enemyScalingPlayerCount = 1;
    return engine;
}

function addEnemy(def: EnemySpawnDef, x: number, y: number): Unit {
    const u = createUnitFromSpawnConfig({ ...def, x, y, ownerId: 'ai', unitAITreeId: 'none' }, engine.eventBus, engine);
    engine.addUnit(u, 'initialGameSpawn');
    return u;
}

function addPlayer(x: number, y: number): Unit {
    const p = createUnitFromSpawnConfig(
        { characterId: 'player', name: 'P', x, y, teamId: 'player', ownerId: 'p1', abilities: ['0104'] },
        engine.eventBus,
        engine,
    );
    engine.addUnit(p, 'initialGameSpawn');
    return p;
}

const at = (u: { x: number; y: number }): ResolvedTarget[] => [{ type: 'pixel', position: { x: u.x, y: u.y } }];

function stepSeconds(seconds: number, each?: () => void): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SEC); i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
        each?.();
    }
}

function cast(unit: Unit, abilityId: string, targets: ResolvedTarget[]): void {
    executeUnitAbility(unit, getAbility(abilityId)!, targets, engine);
}

const getUnitDefEntry = (id: string) => getDefEntry(id as UnitDefId);

const growCtx = (): GardenGrowContext => engine as unknown as GardenGrowContext;
const getNodeTreeState = (u: Unit): NodeTreeState => getComponentState(u, NODE_TREE_COMPONENT);

describe('Garden Heart registration', () => {
    it('registers every ability and card, every unit def, and lists the node kinds in the Bestiary', () => {
        for (const id of [THORN_FANS_ABILITY_ID, LOB_SEED_ABILITY_ID, RUNNER_VINE_ABILITY_ID, SPIKE_RING_ABILITY_ID, PINWHEEL_ABILITY_ID, PINWHEEL_DOUBLED_ABILITY_ID, BLOOM_BURST_ABILITY_ID, DRINK_LIGHT_ABILITY_ID]) {
            expect(getAbility(id), id).toBeDefined();
            expect(CARD_DEF_MAP.get(id), id).toBeDefined();
        }
        for (const id of [THORNSPITTER_ID, POD_MORTAR_ID, HIVE_GOURD_ID, CREEPER_ID, GLOAM_LILY_ID, 'garden_heart']) {
            expect(getUnitDefEntry(id), id).toBeDefined();
            expect(getBestiaryUnitIds()).toContain(id);
        }
        expect(getUnitAITree('gardenNode')).not.toBeNull();
    });

    it('every node kind and the Heart carries the Shell (condition hasLivingChildren) and a node-tree component', () => {
        for (const id of [THORNSPITTER_ID, POD_MORTAR_ID, HIVE_GOURD_ID, CREEPER_ID, GLOAM_LILY_ID, 'garden_heart']) {
            const def = getUnitDefEntry(id)!;
            expect(def.flatDamageReductions?.[0]?.condition, id).toBe('hasLivingChildren');
            expect(def.components?.some((c) => c.type.id === 'nodeTree'), id).toBe(true);
        }
    });

    it('nothing in the garden walks; every node hops by burrowing (the Heart moves once a round instead)', () => {
        for (const id of ['garden_heart', THORNSPITTER_ID, POD_MORTAR_ID, HIVE_GOURD_ID, CREEPER_ID, GLOAM_LILY_ID]) {
            expect(getUnitDefEntry(id)!.speed, id).toBe(0);
        }
        const hops = (id: string): boolean =>
            (getUnitDefEntry(id)!.components ?? []).some((c) => c.type.id === BURROW_HOP_COMPONENT_ID);
        expect([THORNSPITTER_ID, POD_MORTAR_ID, CREEPER_ID, HIVE_GOURD_ID, GLOAM_LILY_ID].every(hops)).toBe(true);
        expect(hops('garden_heart')).toBe(false);
    });
});

describe('Garden Heart units are rooted plants', () => {
    const GARDEN_UNITS = ['garden_heart', THORNSPITTER_ID, POD_MORTAR_ID, HIVE_GOURD_ID, CREEPER_ID, GLOAM_LILY_ID, POD_SEED_ID];

    it('every Garden Heart unit is a Structure, bleed-immune and plant kin', () => {
        for (const id of GARDEN_UNITS) {
            const tags = getUnitDefEntry(id)!.tags ?? [];
            expect(tags, id).toContain(UnitTag.Structure);
            expect(tags, id).toContain(UnitTag.BleedImmune);
            expect(tags, id).toContain(UnitTag.GardenKin);
        }
    });

    it('a knockback does not move a node, and bleed never sticks to one (a wolf still bleeds)', () => {
        setupEngine();
        const node = addEnemy(ENEMY_THORNSPITTER, centre(20), centre(20));
        const wolf = addEnemy(ENEMY_DARK_WOLF, centre(10), centre(10));
        addPlayer(centre(30), centre(30));
        const before = { x: node.x, y: node.y };
        tryApplyKnockbackByTier(node, 3, { unitId: 'tester', abilityId: 'test' }, node.x - 40, node.y, knockbackCtxFromEngine(engine));
        stepSeconds(0.5);
        expect([node.x, node.y]).toEqual([before.x, before.y]);

        applyBleedStack(node, engine.gameTime, engine.roundNumber, 5);
        applyBleedStack(wolf, engine.gameTime, engine.roundNumber, 5);
        expect(isBleeding(node)).toBe(false);
        expect(isBleeding(wolf)).toBe(true);
    });
});

describe('Shell on node units', () => {
    it('a node with a living child takes reduced hits; once the child dies it takes full hits', () => {
        setupEngine();
        const knot = addEnemy(ENEMY_THORNSPITTER, centre(10), centre(10));
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(14), centre(10));
        linkNodeChild(knot, bud);
        // 16 off every hit, never below 1.
        expect(applyUnitFlatReductions(knot, 25).damage).toBe(9);
        expect(applyUnitFlatReductions(knot, 14).damage).toBe(1);
        expect(applyUnitFlatReductions(knot, 1).damage).toBe(1);
        bud.takeDamage(bud.maxHp * 10, null, engine.eventBus);
        expect(hasLivingChildren(knot)).toBe(false);
        expect(applyUnitFlatReductions(knot, 25).damage).toBe(25);
    });

    it('a Bud (no children) is never shelled', () => {
        setupEngine();
        const bud = addEnemy(ENEMY_POD_MORTAR, centre(10), centre(10));
        expect(applyUnitFlatReductions(bud, 25).damage).toBe(25);
    });
});

describe('Thornspitter', () => {
    it('spits two fans of five thorn-shaped thorns at a player, each fan symmetric around the aim', () => {
        setupEngine();
        const spitter = addEnemy(ENEMY_THORNSPITTER, centre(5), centre(20));
        const player = addPlayer(centre(20), centre(20));
        cast(spitter, THORN_FANS_ABILITY_ID, at(player));
        stepSeconds(1.9, () => {
            player.hp = player.maxHp;
        });
        const thorns = engine.projectiles.filter((p) => p.sourceUnitId === spitter.id);
        expect(THORN_FAN_SIZE).toBe(5);
        expect(thorns).toHaveLength(THORN_FAN_COUNT * THORN_FAN_SIZE);
        expect(thorns.every((p) => p.projectileType === THORN_PROJECTILE_TYPE)).toBe(true);
        // Every thorn flies its full range (twice the cast range), past the player it was aimed at.
        expect(THORN_MAX_RANGE).toBe(THORN_AI_RANGE * 2);
        expect(thorns.every((p) => p.maxDistance === THORN_MAX_RANGE)).toBe(true);
        // Aim is along +x: each fan is the evenly spread fan, turned by its wave's turn.
        const headings = thorns.map((p) => (Math.atan2(p.velocityY, p.velocityX) * 180) / Math.PI).sort((a, b) => a - b);
        const expected = Array.from({ length: THORN_FAN_COUNT }, (_, w) =>
            thornFanOffsets().map((d) => d + thornWaveTurn(w, THORN_FAN_COUNT)),
        )
            .flat()
            .sort((x, y) => x - y);
        headings.forEach((h, i) => expect(h).toBeCloseTo(expected[i]!, 0));
        // No thorn of the second wave flies along a first-wave heading: the waves interleave.
        const first = new Set(thornFanOffsets().map((d) => Math.round(d + thornWaveTurn(0, THORN_FAN_COUNT))));
        for (const d of thornFanOffsets()) expect(first.has(Math.round(d + thornWaveTurn(1, THORN_FAN_COUNT)))).toBe(false);
    });

    it('fires more waves as the garden grows, read from the growth-phase battle variable', () => {
        setupEngine();
        const spitter = addEnemy(ENEMY_THORNSPITTER, centre(5), centre(20));
        const player = addPlayer(centre(20), centre(20));
        const thornsFrom = (): number => engine.projectiles.filter((p) => p.sourceUnitId === spitter.id).length;
        expect(thornFanWaves(engine)).toBe(THORN_FAN_COUNT); // unset: the default

        // A Heart growing its phase-3 tree sets the variable itself.
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(30), centre(5));
        growGardenTree(growCtx(), heart, 3);
        expect(getBattleVariable(engine, GARDEN_GROWTH_PHASE_VARIABLE)).toBe(3);
        expect(thornFanWaves(engine)).toBe(THORN_FAN_WAVES_BY_PHASE[3]);

        // No Heart needed: setting the variable directly escalates the same way.
        dismissGardenTree(engine, heart);
        setBattleVariable(engine, GARDEN_GROWTH_PHASE_VARIABLE, 4);
        cast(spitter, THORN_FANS_ABILITY_ID, at(player));
        stepSeconds(4, () => {
            player.hp = player.maxHp;
        });
        expect(thornsFrom()).toBe(THORN_FAN_WAVES_BY_PHASE[4]! * THORN_FAN_SIZE);
        expect(THORN_FAN_WAVES_BY_PHASE[4]).toBeGreaterThan(THORN_FAN_WAVES_BY_PHASE[1]!);
    });

    it('every wave of a cast flies down its own lanes, stepping across one gap', () => {
        for (const waves of [2, 3, 4, 5]) {
            const turns = Array.from({ length: waves }, (_, w) => thornWaveTurn(w, waves, 16));
            // Distinct lanes: every turn is a different fraction of the 16 degree gap.
            expect(new Set(turns.map((t) => (((Math.round(t * 100) % 1600) + 1600) % 1600))).size).toBe(waves);
            expect(turns[waves - 1]! - turns[0]!).toBeLessThan(16);
            expect(turns[0]! + turns[waves - 1]!).toBeCloseTo(0); // centred on the aim
        }
        expect(thornWaveTurn(1, 2, 16) - thornWaveTurn(0, 2, 16)).toBeCloseTo(8); // two waves: exactly half a gap
        expect(thornWaveTurn(0, 1)).toBe(0);
    });

    it('fan offsets are evenly spaced around zero', () => {
        const offsets = thornFanOffsets(3, 10);
        expect(offsets).toEqual([-10, 0, 10]);
    });
});

describe('Pod Mortar', () => {
    const seeds = (): Unit[] => engine.units.filter((u) => u.characterId === POD_SEED_ID);
    const burrows = () => engine.projectiles.filter((p) => p.projectileType === BURROWING_PROJECTILE_TYPE);

    it('sends a seed burrowing out from itself; it surfaces at the target as a destructible enemy seed', () => {
        setupEngine();
        const mortar = addEnemy(ENEMY_POD_MORTAR, centre(5), centre(20));
        const player = addPlayer(centre(12), centre(20));
        cast(mortar, LOB_SEED_ABILITY_ID, at(player));
        stepSeconds(LOB_SEED_WINDUP_SEC + 0.1);
        // Launched: a burrowing projectile on its way from the node, nothing above ground yet.
        expect(seeds()).toHaveLength(0);
        const [growth] = burrows();
        expect(growth).toBeDefined();
        expect(growth!.x).toBeGreaterThan(mortar.x);
        expect(growth!.x).toBeLessThan(player.x);

        let guard = 0;
        while (seeds().length === 0 && guard++ < TICKS_PER_SEC * 3) stepSeconds(1 / TICKS_PER_SEC);
        const seed = seeds()[0];
        expect(seed).toBeDefined();
        expect(seed!.teamId).toBe(mortar.teamId);
        expect(Math.hypot(seed!.x - player.x, seed!.y - player.y)).toBeLessThan(CELL_SIZE);
        expect(seed!.isAlive()).toBe(true);
        expect(burrows()).toHaveLength(0);
    });

    it('a launched seed still surfaces after the Pod Mortar dies', () => {
        setupEngine();
        const mortar = addEnemy(ENEMY_POD_MORTAR, centre(5), centre(20));
        const player = addPlayer(centre(14), centre(20));
        cast(mortar, LOB_SEED_ABILITY_ID, at(player));
        stepSeconds(LOB_SEED_WINDUP_SEC + 0.1);
        expect(burrows()).toHaveLength(1);

        mortar.takeDamage(mortar.maxHp * 10, player.id, engine.eventBus);
        stepSeconds(0.1);
        expect(engine.getUnit(mortar.id)).toBeUndefined(); // dead and cleared from the field

        let guard = 0;
        while (seeds().length === 0 && guard++ < TICKS_PER_SEC * 3) stepSeconds(1 / TICKS_PER_SEC);
        const seed = seeds()[0];
        expect(seed).toBeDefined();
        expect(seed!.teamId).toBe(mortar.teamId);
        expect(Math.hypot(seed!.x - player.x, seed!.y - player.y)).toBeLessThan(CELL_SIZE);
    });

    it('a mortar killed during its windup launches nothing', () => {
        setupEngine();
        const mortar = addEnemy(ENEMY_POD_MORTAR, centre(5), centre(20));
        const player = addPlayer(centre(12), centre(20));
        cast(mortar, LOB_SEED_ABILITY_ID, at(player));
        stepSeconds(LOB_SEED_WINDUP_SEC / 2);
        mortar.takeDamage(mortar.maxHp * 10, player.id, engine.eventBus);
        stepSeconds(3);
        expect(burrows()).toHaveLength(0);
        expect(seeds()).toHaveLength(0);
    });
});

describe('Hive Gourd', () => {
    it('keeps birthing swarmlings and slimes up to its cap, alternating the kinds', () => {
        setupEngine();
        const gourd = addEnemy(ENEMY_HIVE_GOURD, centre(20), centre(20));
        const player = addPlayer(centre(2), centre(2));
        const run = (seconds: number): void => stepSeconds(seconds, () => (player.hp = player.maxHp));
        run(2);
        expect(peekSpawnerState(gourd)!.spawnedIds).toHaveLength(0);
        run(5);
        const first = peekSpawnerState(gourd)!.spawnedIds;
        expect(first).toHaveLength(1);
        expect(engine.getUnit(first[0]!)!.characterId).toBe('swarmling');
        run(60);
        const ids = peekSpawnerState(gourd)!.spawnedIds;
        expect(ids).toHaveLength(HIVE_GOURD_MAX_CHILDREN);
        const kinds = ids.map((id) => engine.getUnit(id)!.characterId);
        expect(new Set(kinds)).toEqual(new Set(['swarmling', 'slime']));
        expect(ids.every((id) => engine.getUnit(id)!.teamId === gourd.teamId)).toBe(true);
    });

    it('replaces a child that dies, and keeps its spawner state through a save', () => {
        setupEngine();
        const gourd = addEnemy(ENEMY_HIVE_GOURD, centre(20), centre(20));
        const player = addPlayer(centre(2), centre(2));
        const run = (seconds: number): void => stepSeconds(seconds, () => (player.hp = player.maxHp));
        run(60);
        const state = peekSpawnerState(gourd)!;
        const victim = engine.getUnit(state.spawnedIds[0]!)!;
        victim.takeDamage(victim.maxHp * 10, null, engine.eventBus);
        run(0.1);
        expect(peekSpawnerState(gourd)!.spawnedIds).toHaveLength(HIVE_GOURD_MAX_CHILDREN - 1);
        // A fresh interval has to pass before the replacement grows.
        run(HIVE_GOURD_INTERVAL_SEC + 0.5);
        expect(peekSpawnerState(gourd)!.spawnedIds).toHaveLength(HIVE_GOURD_MAX_CHILDREN);

        const json = serializeUnit(gourd, engine.gameTick);
        const copy = createUnitFromSpawnConfig(
            { ...ENEMY_HIVE_GOURD, x: 0, y: 0, ownerId: 'ai', unitAITreeId: 'none' },
            engine.eventBus,
            engine,
        );
        applySerializedUnitState(copy, json, engine.eventBus, engine.gameTick);
        expect(peekSpawnerState(copy)!.spawnedIds).toEqual(peekSpawnerState(gourd)!.spawnedIds);
        expect(peekSpawnerState(copy)!.nextSpawnAtGameTime).toBe(peekSpawnerState(gourd)!.nextSpawnAtGameTime);
        expect(copy.flatDamageReductions).toEqual(gourd.flatDamageReductions);
    });
});

describe('Creeper', () => {
    it('lays dark thorns along a straight line toward the target, a few tiles, and they stay after it pulls back', () => {
        setupEngine();
        const creeper = addEnemy(ENEMY_CREEPER, centre(5), centre(20));
        const player = addPlayer(centre(25), centre(20));
        cast(creeper, RUNNER_VINE_ABILITY_ID, at(player));
        stepSeconds(3, () => {
            player.hp = player.maxHp;
        });
        const thorns = [...engine.terrainLayers.allEffects.values()].filter((e) => e.effectType === GARDEN_THORN_EFFECT_TYPE);
        expect(thorns.length).toBeGreaterThanOrEqual(RUNNER_VINE_MIN_TILES);
        expect(thorns.length).toBeLessThanOrEqual(RUNNER_VINE_MAX_TILES);
        const cells = thorns.map((t) => (t.area as { col: number; row: number }));
        expect(new Set(cells.map((c) => c.row))).toEqual(new Set([20]));
        // Starts next to the Creeper and runs outward: the columns are consecutive.
        const cols = cells.map((c) => c.col).sort((a, b) => a - b);
        expect(cols[0]).toBeGreaterThanOrEqual(5);
        for (let i = 1; i < cols.length; i++) expect(cols[i]! - cols[i - 1]!).toBe(1);
    });

    it('trailTiles walks outward one tile at a time with no repeats, even on a diagonal', () => {
        const tiles = trailTiles({ x: centre(3), y: centre(3) }, Math.SQRT1_2, Math.SQRT1_2, 5);
        expect(tiles).toHaveLength(5);
        expect(new Set(tiles.map((t) => `${t.col},${t.row}`)).size).toBe(5);
    });
});

describe('node movement: rooted, hopping by burrow', () => {
    it('stays put between hops, and every 5-7 s burrows up to 5 tiles within its leash', () => {
        setupEngine();
        const knot = addEnemy(ENEMY_THORNSPITTER, centre(20), centre(20));
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(24), centre(20));
        linkNodeChild(knot, bud, { tetherMaxLength: STEM_LEASH_PX });
        addPlayer(centre(38), centre(38)); // a living party keeps the battle running
        const start = { x: bud.x, y: bud.y };
        const still = (): void => {
            expect([bud.x, bud.y]).toEqual([start.x, start.y]);
        };

        stepSeconds(1 / TICKS_PER_SEC);
        const state = peekBurrowHopState(bud)!;
        const firstHop = state.nextHopAtGameTime!;
        expect(firstHop - engine.gameTime).toBeGreaterThanOrEqual(GARDEN_NODE_HOP.intervalSeconds.min - 0.05);
        expect(firstHop - engine.gameTime).toBeLessThanOrEqual(GARDEN_NODE_HOP.intervalSeconds.max);

        // Until the time comes it does not move at all.
        stepSeconds(firstHop - engine.gameTime - 0.1, still);
        expect(state.burrow).toBeNull();

        let guard = 0;
        while (!state.burrow && guard++ < TICKS_PER_SEC) stepSeconds(1 / TICKS_PER_SEC);
        expect(state.burrow).not.toBeNull();
        expect(hasUnitTag(bud, UnitTag.Invincible)).toBe(true);
        expect(getBurrowVisual(state, engine.tickTime)).not.toBeNull();

        guard = 0;
        while (state.burrow && guard++ < TICKS_PER_SEC * 5) stepSeconds(1 / TICKS_PER_SEC);
        expect(state.burrow).toBeNull();
        const moved = Math.hypot(bud.x - start.x, bud.y - start.y);
        expect(moved).toBeGreaterThan(0);
        expect(moved).toBeLessThanOrEqual(GARDEN_NODE_HOP.maxDistancePx + 1);
        expect(Math.hypot(bud.x - knot.x, bud.y - knot.y)).toBeLessThanOrEqual(STEM_LEASH_PX);
        expect(engine.terrainManager!.isPassable(bud.x, bud.y)).toBe(true);
        expect(hasUnitTag(bud, UnitTag.Invincible)).toBe(false);
        // The next hop is a fresh 5-7 s from landing.
        expect(state.nextHopAtGameTime! - engine.gameTime).toBeGreaterThanOrEqual(GARDEN_NODE_HOP.intervalSeconds.min - 0.05);
        expect(state.nextHopAtGameTime! - engine.gameTime).toBeLessThanOrEqual(GARDEN_NODE_HOP.intervalSeconds.max);
    });

    it('tunnels toward the line between the Heart and the nearest player', () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(10));
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(25), centre(12));
        linkNodeChild(heart, bud, { tetherMaxLength: STEM_LEASH_PX });
        const player = addPlayer(centre(20), centre(36));
        const offLine = (): number => distanceToSegment(bud.x, bud.y, heart.x, heart.y, player.x, player.y);
        const before = offLine();
        stepSeconds(1 / TICKS_PER_SEC);
        const state = peekBurrowHopState(bud)!;
        state.nextHopAtGameTime = engine.gameTime;
        let guard = 0;
        while (!state.burrow && guard++ < TICKS_PER_SEC) stepSeconds(1 / TICKS_PER_SEC);
        guard = 0;
        while (state.burrow && guard++ < TICKS_PER_SEC * 5) stepSeconds(1 / TICKS_PER_SEC);
        expect(offLine()).toBeLessThan(before - CELL_SIZE);
        expect(Math.hypot(bud.x - heart.x, bud.y - heart.y)).toBeLessThanOrEqual(STEM_LEASH_PX);
    });

    it('surfaces in a blast 4x its size, marked from the start of the tunnel, with a shower of rock chips', () => {
        setupEngine();
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(20), centre(20));
        const player = addPlayer(centre(38), centre(38));
        stepSeconds(1 / TICKS_PER_SEC);
        const state = peekBurrowHopState(bud)!;
        state.nextHopAtGameTime = engine.gameTime;
        let guard = 0;
        while (state.burrow?.stage !== 'travel' && guard++ < TICKS_PER_SEC * 3) stepSeconds(1 / TICKS_PER_SEC);
        const radius = GARDEN_NODE_HOP_BLAST_RADII * bud.radius;
        const telegraph = resolveBurrowRender(bud, engine.tickTime)!.eruption!;
        expect(telegraph).toMatchObject({ x: state.burrow!.toX, y: state.burrow!.toY, radiusPx: radius, fill: 0 });

        // Stand at the edge of the circle: the blast reaches.
        player.x = state.burrow!.toX + radius * 0.9;
        player.y = state.burrow!.toY;
        player.clearMovement();
        const hpBefore = player.hp;
        guard = 0;
        while (state.burrow && guard++ < TICKS_PER_SEC * 5) {
            player.x = state.burrow.toX + radius * 0.9;
            player.y = state.burrow.toY;
            stepSeconds(1 / TICKS_PER_SEC);
        }
        expect(player.hp).toBe(hpBefore - GARDEN_NODE_HOP_DAMAGE);
        expect(engine.effects.filter((e) => e.effectType === 'RockChipParticle').length).toBeGreaterThan(0);
        expect(engine.waitingForOrders).toBeFalsy(); // not a reaction frame
    });

    it('a hop that comes due mid-cast waits for the cast to finish, and the node starts no new cast meanwhile', () => {
        setupEngine();
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(20), centre(20));
        addPlayer(centre(38), centre(38));
        stepSeconds(1 / TICKS_PER_SEC);
        const state = peekBurrowHopState(bud)!;
        const start = { x: bud.x, y: bud.y };

        cast(bud, THORN_FANS_ABILITY_ID, [{ type: 'pixel', position: { x: centre(20), y: centre(36) } }]);
        expect(bud.activeAbilities).toHaveLength(1);
        state.nextHopAtGameTime = engine.gameTime + 0.1;
        stepSeconds(0.3);
        expect(bud.activeAbilities).toHaveLength(1); // still casting
        expect(state.burrow).toBeNull();
        expect(isBurrowHopDue(bud, engine.gameTime)).toBe(true); // the AI holds its next cast
        expect([bud.x, bud.y]).toEqual([start.x, start.y]);

        let guard = 0;
        while (bud.activeAbilities.length > 0 && guard++ < TICKS_PER_SEC * 5) {
            expect(state.burrow).toBeNull();
            stepSeconds(1 / TICKS_PER_SEC);
        }
        stepSeconds(2 / TICKS_PER_SEC);
        expect(state.burrow).not.toBeNull();
    });

    it('a hop keeps both ends of every Stem within its leash, and a hop in progress survives a checkpoint', () => {
        setupEngine();
        const parent = addEnemy(ENEMY_THORNSPITTER, centre(10), centre(10));
        const knot = addEnemy(ENEMY_THORNSPITTER, centre(14), centre(10));
        const bud = addEnemy(ENEMY_THORNSPITTER, centre(18), centre(10));
        linkNodeChild(parent, knot, { tetherMaxLength: STEM_LEASH_PX });
        linkNodeChild(knot, bud, { tetherMaxLength: STEM_LEASH_PX });
        addPlayer(centre(38), centre(38));
        expect(hopKeepsTethers(knot, centre(15), centre(12), engine)).toBe(true);
        expect(hopKeepsTethers(knot, centre(4), centre(10), engine)).toBe(false); // too far from its Bud
        expect(hopKeepsTethers(knot, centre(22), centre(10), engine)).toBe(false); // too far from its parent

        const state = peekBurrowHopState(bud)!;
        stepSeconds(1 / TICKS_PER_SEC);
        state.nextHopAtGameTime = engine.gameTime;
        stepSeconds(0.5);
        expect(state.burrow).not.toBeNull();
        const json = serializeUnit(bud, engine.gameTick);
        const copy = createUnitFromSpawnConfig(
            { ...ENEMY_THORNSPITTER, x: 0, y: 0, ownerId: 'ai', unitAITreeId: 'none' },
            engine.eventBus,
            engine,
        );
        applySerializedUnitState(copy, json, engine.eventBus, engine.gameTick);
        expect(peekBurrowHopState(copy)).toEqual(state);
    });
});

describe('phase tree layouts', () => {
    it('has four phases and every parent appears before its children with unique keys', () => {
        expect(GARDEN_PHASE_COUNT).toBe(4);
        for (const layout of GARDEN_TREE_LAYOUTS) {
            const seen = new Set<string>();
            for (const node of layout) {
                expect(seen.has(node.key)).toBe(false);
                if (node.parent !== null) expect(seen.has(node.parent)).toBe(true);
                seen.add(node.key);
            }
        }
    });

    it('matches the design: P1 one Bud; P2 two Buds; P3 three on the Heart and one chained Bud; P4 two Knots with two Buds, a Heart Pod Mortar and a Heart Gloam Lily', () => {
        const [p1, p2, p3, p4] = GARDEN_TREE_LAYOUTS;
        expect(p1).toHaveLength(1);
        expect(p1![0]!.kind).toBe(THORNSPITTER_ID);
        expect(p2!.map((n) => n.kind).sort()).toEqual([POD_MORTAR_ID, THORNSPITTER_ID].sort());
        expect(p2!.every((n) => n.parent === null)).toBe(true);

        // P3: four nodes, three on the Heart and one chained from the Hive Gourd.
        expect(p3).toHaveLength(4);
        expect(p3!.filter((n) => n.parent === null).map((n) => n.kind).sort()).toEqual([CREEPER_ID, GLOAM_LILY_ID, HIVE_GOURD_ID].sort());
        expect([...knotKeys(p3!)].map((k) => p3!.find((n) => n.key === k)!.kind)).toEqual([HIVE_GOURD_ID]);
        expect(p3!.filter((n) => n.parent !== null).map((n) => n.kind)).toEqual([THORNSPITTER_ID]);

        const knots4 = knotKeys(p4!);
        expect(knots4.size).toBe(2);
        for (const k of knots4) expect(p4!.filter((n) => n.parent === k)).toHaveLength(2);
        const heartBuds = p4!.filter((n) => n.parent === null && !knots4.has(n.key));
        expect(heartBuds).toHaveLength(2);
        expect(heartBuds.map((n) => n.kind).sort()).toEqual([GLOAM_LILY_ID, POD_MORTAR_ID].sort());
        expect(new Set(p4!.map((n) => n.kind)).size).toBe(5);
    });

    it('returns undefined for a phase with no layout', () => {
        expect(gardenTreeLayout(0)).toBeUndefined();
        expect(gardenTreeLayout(5)).toBeUndefined();
    });
});

function ringsIn(seconds: number): number {
    return abilityUsesIn(seconds, SPIKE_RING_ABILITY_ID);
}

/** How many times the ability `abilityId` is used while stepping `seconds`. */
function abilityUsesIn(seconds: number, abilityId: string): number {
    let n = 0;
    const count = (e: { abilityId: string }): void => {
        if (e.abilityId === abilityId) n++;
    };
    engine.eventBus.on('ability_used', count);
    stepSeconds(seconds);
    engine.eventBus.off('ability_used', count);
    return n;
}

/** A Heart (the real def) standing in growth phase `phase` (1-4), the player far away; no tree yet. */
function heartInPhase(phase: number): Unit {
    setupEngine();
    const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
    addPlayer(centre(38), centre(38));
    peekPhaseState(heart)!.index = phase - 1;
    return heart;
}

const bannerOf = (heart: Unit): string | null =>
    getActiveUnitBanner(engine as unknown as Parameters<typeof getActiveUnitBanner>[0], heart.id);

/** Kill every living node under `heart`, deepest first, as a player would (a kill: Severance, and Bared at the last). */
function killTree(heart: Unit): void {
    for (const node of gardenTreeDescendants(engine, heart).reverse()) {
        if (node.isAlive()) node.takeDamage(node.maxHp * 10, 'tester', engine.eventBus);
    }
}

describe('Spike Ring', () => {
    it('has a flat rate per phase: none in phase 1, then 1, 1.5 and 2 a round', () => {
        expect(gardenSpikeRingRate(1)).toBe(0);
        for (const phase of [2, 3, 4]) expect(gardenSpikeRingRate(phase)).toBe(SPIKE_RING_RATES[phase]);
        expect(gardenSpikeRingRate(3)).toBeGreaterThan(gardenSpikeRingRate(2));
        expect(gardenSpikeRingRate(4)).toBeGreaterThan(gardenSpikeRingRate(3));
    });

    it('fires a Wild ring of thorns evenly around the Heart', () => {
        const heart = heartInPhase(4);
        growGardenTree(growCtx(), heart, 4);
        let guard = 0;
        // Within a round and a bit: a ring due while the Heart is moving round the pond fires as it surfaces.
        while (!engine.projectiles.some((p) => p.sourceAbilityId === SPIKE_RING_ABILITY_ID) && guard++ < TICKS_PER_SEC * 12) {
            stepSeconds(1 / TICKS_PER_SEC);
        }
        const thorns = engine.projectiles.filter((p) => p.sourceAbilityId === SPIKE_RING_ABILITY_ID);
        expect(thorns).toHaveLength(SPIKE_RING_COUNT);
        expect(thorns.every((p) => p.projectileType === THORN_PROJECTILE_TYPE)).toBe(true);
        const angles = thorns.map((p) => Math.atan2(p.velocityY, p.velocityX)).sort((a, b) => a - b);
        for (let i = 1; i < angles.length; i++) expect(angles[i]! - angles[i - 1]!).toBeCloseTo((Math.PI * 2) / SPIKE_RING_COUNT, 5);
        expect(thorns.every((p) => p.sourceTeamId === heart.teamId)).toBe(true);
        // Wild: it hits a unit of its own team that is not plant kin, and spares plants.
        const kin = { teamId: heart.teamId, tags: [UnitTag.GardenKin] };
        const wolf = { teamId: heart.teamId, tags: [] as UnitTag[] };
        expect(thorns.every((p) => canHit(p.hitRule, p.sourceTeamId, wolf) && !canHit(p.hitRule, p.sourceTeamId, kin))).toBe(true);
    });

    it('never fires in phase 1', () => {
        const heart = heartInPhase(1);
        growGardenTree(growCtx(), heart, 1);
        expect(ringsIn(12)).toBe(0);
    });

    it('fires about once a round in phase 2 while shelled, and no faster as nodes are cut', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        expect(ringsIn(ROUND_DURATION * 2 + 0.5)).toBe(2);
        // Cut one of the two nodes: still shelled, and the cadence does not escalate.
        const [first] = gardenTreeDescendants(engine, heart);
        first!.takeDamage(first!.maxHp * 10, 'tester', engine.eventBus);
        expect(hasLivingChildren(heart)).toBe(true);
        expect(ringsIn(ROUND_DURATION * 2)).toBe(2);
    });

    it('holds its fire while the Heart is Bared', () => {
        const heart = heartInPhase(4);
        growGardenTree(growCtx(), heart, 4);
        killTree(heart);
        expect(getNodeRegrowthStatus(heart, engine.gameTime).open).toBe(true);
        expect(ringsIn(GARDEN_BARED_SECONDS - 0.5)).toBe(0);
    });
});

describe('Bared windows, Severance and regrowth', () => {
    it('the Heart ignores crowd control and is plant kin itself', () => {
        const def = getUnitDefEntry('garden_heart')!;
        expect(def.tags).toContain(UnitTag.CcImmune);
        expect(def.tags).toContain(UnitTag.GardenKin);
        const heart = heartInPhase(1);
        expect(isCcImmune(heart)).toBe(true);
    });

    it('takes more damage while Bared than the same hit while shelled', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        const lossFrom = (hit: number): number => {
            const before = heart.hp;
            heart.takeDamage(hit, 'tester', engine.eventBus);
            return before - heart.hp;
        };
        const shelled = lossFrom(30);
        killTree(heart);
        const bared = lossFrom(30);
        expect(bared).toBeGreaterThan(30);
        expect(bared).toBeGreaterThan(shelled);
    });

    it("the Heart's own Shell takes 100 off every hit, down to nothing, while a node lives", () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        expect(HEART_SHELL_REDUCTION).toMatchObject({ amount: 100, floor: 0 });
        expect(applyUnitFlatReductions(heart, 30).damage).toBe(0);
        expect(applyUnitFlatReductions(heart, 150).damage).toBe(50);
        const before = heart.hp;
        heart.takeDamage(60, 'tester', engine.eventBus);
        expect(heart.hp).toBe(before);
        // Phase 2's nodes are Buds on the Heart: no Shell of their own.
        const [node] = gardenTreeDescendants(engine, heart);
        expect(applyUnitFlatReductions(node!, 30).damage).toBe(30);
    });

    it.each([
        [2, GARDEN_TRICKLE_REGROW_SEC_BY_PHASE[2]!],
        [3, GARDEN_TRICKLE_REGROW_SEC],
    ])('phase %i trickles a lost node back after %i s while shelled', (phase, seconds) => {
        const heart = heartInPhase(phase);
        growGardenTree(growCtx(), heart, phase);
        const living = (): number => gardenTreeDescendants(engine, heart).filter((u) => u.isAlive()).length;
        const full = living();
        // A Bud (a leaf), so the Heart stays shelled.
        const bud = gardenTreeDescendants(engine, heart).find((u) => getNodeChildIds(u).length === 0)!;
        bud.takeDamage(bud.maxHp * 10, 'tester', engine.eventBus);
        expect(living()).toBe(full - 1);
        stepSeconds(seconds - 1);
        expect(living()).toBe(full - 1);
        stepSeconds(1.5);
        expect(living()).toBe(full);
    });
    it('phase 2 regrows more slowly than the default', () => {
        expect(GARDEN_TRICKLE_REGROW_SEC_BY_PHASE[2]).toBeGreaterThan(GARDEN_TRICKLE_REGROW_SEC);
    });

    it('a node kill costs the Heart health (Severance), however shelled it is', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        const [node] = gardenTreeDescendants(engine, heart);
        const before = heart.hp;
        node!.takeDamage(node!.maxHp * 10, 'tester', engine.eventBus);
        expect(before - heart.hp).toBe(GARDEN_SEVERANCE_DAMAGE);
    });

    it('killing the last node opens a Bared window; when it ends the whole tree regrows', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        const layoutSize = gardenTreeLayout(2)!.length;
        killTree(heart);
        expect(getNodeRegrowthStatus(heart, engine.gameTime).open).toBe(true);
        expect(bannerOf(heart)).toBe(GARDEN_BARED_BANNER_TEXT);
        expect(gardenTreeDescendants(engine, heart).filter((u) => u.isAlive())).toHaveLength(0);

        stepSeconds(GARDEN_BARED_SECONDS - 0.5);
        expect(getNodeRegrowthStatus(heart, engine.gameTime).open).toBe(true);
        stepSeconds(1);
        expect(getNodeRegrowthStatus(heart, engine.gameTime).open).toBe(false);
        expect(gardenTreeDescendants(engine, heart).filter((u) => u.isAlive())).toHaveLength(layoutSize);
        expect(hasLivingChildren(heart)).toBe(true);
        expect(bannerOf(heart)).toBe(GARDEN_REGROWN_BANNER_TEXT);
    });

    it('phase 1 opens with a Bloom Burst', () => {
        const heart = heartInPhase(1);
        growGardenTree(growCtx(), heart, 1);
        killTree(heart);
        stepSeconds(0.5);
        const burst = engine.projectiles.filter((p) => p.sourceAbilityId === BLOOM_BURST_ABILITY_ID);
        expect(burst).toHaveLength(BLOOM_BURST_COUNT);
        expect(engine.projectiles.some((p) => p.sourceAbilityId === PINWHEEL_ABILITY_ID)).toBe(false);
    });

    it('phase 2 opens with a Gentle Pinwheel that keeps firing through the window', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        killTree(heart);
        stepSeconds(1);
        const early = engine.projectiles.filter((p) => p.sourceAbilityId === PINWHEEL_ABILITY_ID).length;
        expect(early).toBeGreaterThan(0);
        expect(engine.projectiles.some((p) => p.sourceAbilityId === BLOOM_BURST_ABILITY_ID)).toBe(false);
        stepSeconds(2);
        const thorns = engine.projectiles.filter((p) => p.sourceAbilityId === PINWHEEL_ABILITY_ID);
        expect(thorns.length).toBeGreaterThan(early);
        expect(thorns.every((p) => p.hitRule?.kind === 'allExceptKin')).toBe(true);
    });

    it('phase 4 opens with the Doubled Pinwheel', () => {
        const heart = heartInPhase(4);
        growGardenTree(growCtx(), heart, 4);
        killTree(heart);
        stepSeconds(0.5);
        expect(engine.projectiles.some((p) => p.sourceAbilityId === PINWHEEL_DOUBLED_ABILITY_ID)).toBe(true);
        expect(engine.projectiles.some((p) => p.sourceAbilityId === PINWHEEL_ABILITY_ID)).toBe(false);
    });
});

describe('the Heart circles the pond', () => {
    it('once a round, at the same moment in the second half, it burrows 3-6 tiles clockwise round the ring', () => {
        setupEngine();
        // Due west on the ring's middle line (the tiny map is big enough for the arena's ring).
        const start = ellipseOrbitPoint(GARDEN_ORBIT, Math.PI, 0);
        const heart = addEnemy(ENEMY_GARDEN_HEART, start.x, start.y);
        addPlayer(centre(38), centre(38));
        // Phase 1: no Spike Ring, so no cast ever delays the move.
        growGardenTree(growCtx(), heart, 1);
        stepSeconds(1 / 60);
        const state = peekRoundHopState(heart)!;
        const offset = state.offsetSeconds!;
        expect(offset).toBeGreaterThanOrEqual(ROUND_DURATION / 2);
        expect(offset).toBeLessThanOrEqual(ROUND_DURATION);

        const moves: Array<{ at: number; from: { x: number; y: number }; to: { x: number; y: number } }> = [];
        let wasMoving = false;
        stepSeconds(ROUND_DURATION * 2.5, () => {
            const b = state.burrow;
            if (b && !wasMoving) {
                moves.push({ at: engine.gameTime, from: { x: b.fromX, y: b.fromY }, to: { x: b.toX, y: b.toY } });
                expect(hasUnitTag(heart, UnitTag.Invincible)).toBe(true);
            }
            wasMoving = b !== null;
        });
        expect(moves.length).toBeGreaterThanOrEqual(2);
        for (const m of moves) {
            // Same moment every round (to a tick).
            const intoRound = m.at - Math.floor(m.at / ROUND_DURATION) * ROUND_DURATION;
            expect(Math.abs(intoRound - offset)).toBeLessThan(2 / 60);
            const tiles = gardenOrbitClockwiseTiles(m.from, m.to);
            expect(tiles).toBeGreaterThanOrEqual(GARDEN_ROUND_ORBIT_TILES.min - 0.05);
            expect(tiles).toBeLessThanOrEqual(GARDEN_ROUND_ORBIT_TILES.max + 0.05);
        }
        // Each landing is somewhere new: not a perfect ellipse (the depth across the band is rolled per move).
        const depths = moves.map((m) => Math.hypot(m.to.x - GARDEN_ORBIT.cx, m.to.y - GARDEN_ORBIT.cy));
        expect(new Set(depths.map((d) => Math.round(d))).size).toBeGreaterThan(1);
        expect(hasUnitTag(heart, UnitTag.Invincible)).toBe(false);
    });

    it('surfaces from its round move in a marked blast that hits what stands there', () => {
        setupEngine();
        const start = ellipseOrbitPoint(GARDEN_ORBIT, Math.PI, 0);
        const heart = addEnemy(ENEMY_GARDEN_HEART, start.x, start.y);
        addPlayer(centre(38), centre(38));
        growGardenTree(growCtx(), heart, 1);
        // Not plant kin, so the Wild blast hits it. Held on the landing spot once the move starts.
        const wolf = addEnemy(ENEMY_DARK_WOLF, centre(2), centre(2));
        wolf.maxHp = wolf.hp = 1000;
        stepSeconds(1 / 60);
        const state = peekRoundHopState(heart)!;
        let landing: { x: number; y: number } | null = null;
        let telegraphRadius: number | null = null;
        let hpBefore = wolf.hp;
        stepSeconds(ROUND_DURATION * 1.5, () => {
            const b = state.burrow;
            if (b && !landing) {
                landing = { x: b.toX, y: b.toY };
                hpBefore = wolf.hp;
            }
            if (landing && !telegraphRadius && b) {
                telegraphRadius = resolveBurrowRender(heart, engine.tickTime)?.eruption?.radiusPx ?? null;
            }
            if (landing && b) {
                wolf.x = landing.x;
                wolf.y = landing.y;
            }
        });
        expect(landing).not.toBeNull();
        expect(telegraphRadius).toBeCloseTo(GARDEN_HEART_ROUND_HOP_BLAST_PX, 5);
        expect(hpBefore - wolf.hp).toBeGreaterThanOrEqual(GARDEN_HEART_ROUND_HOP_DAMAGE);
    });

    it('leaves its nodes behind: a Stem stretches past its leash, and the node reconnects on its next hop', () => {
        setupEngine();
        const start = ellipseOrbitPoint(GARDEN_ORBIT, Math.PI, 0);
        const heart = addEnemy(ENEMY_GARDEN_HEART, start.x, start.y);
        addPlayer(centre(38), centre(38));
        const [bud] = [...growGardenTree(growCtx(), heart, 1).values()];
        const leash = getNodeTreeState(bud!).tetherMaxLength!;
        // Keep the Bud from hopping on its own until the Heart has gone, then let it decide.
        stepSeconds(1 / 60);
        const hop = peekBurrowHopState(bud!)!;
        const heartHop = peekRoundHopState(heart)!;
        hop.nextHopAtGameTime = heartHop.nextAtGameTime! + 4;
        // Put the Bud south of the Heart, near the end of its leash: the Heart's move clockwise from due west goes
        // north, so the Stem surely stretches past its leash.
        bud!.x = heart.x;
        bud!.y = heart.y + leash * 0.95;
        const budAt = { x: bud!.x, y: bud!.y };
        let guard = 0;
        while (heartHop.burrow === null && guard++ < 60 * 12) stepSeconds(1 / 60);
        while (heartHop.burrow !== null && guard++ < 60 * 20) stepSeconds(1 / 60);
        const stretched = Math.hypot(bud!.x - heart.x, bud!.y - heart.y);
        // Left where it was: not dragged, not carried.
        expect(Math.hypot(bud!.x - budAt.x, bud!.y - budAt.y)).toBeLessThan(1);
        expect(isBurrowEmerging(bud!)).toBe(false);
        expect(stretched).toBeGreaterThan(leash);
        expect(hasLeashSlack(bud!)).toBe(true);
        expect(getNodeTreeState(bud!).leashSlackPx!).toBeGreaterThanOrEqual(stretched - 1);
        // Its next hop takes it back within its leash, however far it had to go.
        while (hop.burrow === null && guard++ < 60 * 30) stepSeconds(1 / 60);
        while (hop.burrow !== null && guard++ < 60 * 40) stepSeconds(1 / 60);
        expect(Math.hypot(bud!.x - heart.x, bud!.y - heart.y)).toBeLessThanOrEqual(leash);
        expect(hasLeashSlack(bud!)).toBe(false);
    });

    it('a node whose Stem has slack hops back within its leash even from far beyond its normal hop range', () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(10), centre(20));
        const [bud] = [...growGardenTree(growCtx(), heart, 1).values()];
        const tree = getNodeTreeState(bud!);
        // 14 tiles away: far past both the leash (6) and a normal hop (5).
        bud!.x = heart.x + 14 * CELL_SIZE;
        bud!.y = heart.y;
        tree.leashSlackPx = 14 * CELL_SIZE;
        const rng = (min: number, max: number): number => engine.generateRandomInteger(min, max);
        for (let i = 0; i < 5; i++) {
            const p = chooseHopPoint(bud!, GARDEN_NODE_HOP, engine, rng)!;
            expect(p).not.toBeNull();
            expect(Math.hypot(p.x - heart.x, p.y - heart.y)).toBeLessThanOrEqual(tree.tetherMaxLength!);
        }
    });
});

describe('growing and dismissing a tree', () => {
    it.each([1, 2, 3, 4])('phase %i grows exactly its layout, linked and tethered under the right parents', (phase) => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        const grown = growGardenTree(growCtx(), heart, phase);
        const layout = gardenTreeLayout(phase)!;
        expect(grown.size).toBe(layout.length);
        for (const spec of layout) {
            const unit = grown.get(spec.key)!;
            expect(unit.characterId).toBe(spec.kind);
            expect(getNodeParentId(unit)).toBe(spec.parent === null ? heart.id : grown.get(spec.parent)!.id);
        }
        expect(listLiveTethers(engine)).toHaveLength(layout.length);
        expect(hasLivingChildren(heart)).toBe(true);
        for (const key of knotKeys(layout)) expect(hasLivingChildren(grown.get(key)!)).toBe(true);
    });

    it('scales node health by player count like other enemies', () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        const solo = [...growGardenTree(growCtx(), heart, 1).values()][0]!;
        dismissGardenTree(engine, heart);
        engine.enemyScalingPlayerCount = 3;
        const trio = [...growGardenTree(growCtx(), heart, 1).values()][0]!;
        expect(trio.maxHp).toBeGreaterThan(solo.maxHp);
    });

    it('dismissing the tree kills every node, leaves Briar where the Stems lay, and opens the Heart', () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        const grown = growGardenTree(growCtx(), heart, 3);
        const stems = [...grown.values()].map((u) => {
            const parent = engine.getUnit(getNodeParentId(u)!)!;
            return tetherCoveredTiles(parent.x, parent.y, u.x, u.y);
        });
        expect(dismissGardenTree(engine, heart)).toBe(grown.size);
        for (const unit of grown.values()) expect(unit.isAlive()).toBe(false);
        expect(getNodeChildIds(heart)).toEqual([]);
        expect(applyUnitFlatReductions(heart, 25).damage).toBe(25);
        const tm = engine.terrainManager!;
        const someBriar = stems.flat().some(({ col, row }) => tm.getEffectiveTerrainType(col, row) === TerrainType.Briar);
        expect(someBriar).toBe(true);
    });

    it("the tree's entry: each node burrows out to its spot, Knots from the Heart first, then their Buds", () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        addPlayer(centre(38), centre(38));
        const layout = gardenTreeLayout(3)!;
        const grown = growGardenTree(growCtx(), heart, 3);
        const spots = new Map([...grown].map(([k, u]) => [k, { x: u.x, y: u.y }]));
        const delay = 0.5;
        emergeGardenTree(engine, heart, 3, grown, { delaySeconds: delay, ...GARDEN_NODE_EMERGE });
        const hop = GARDEN_NODE_EMERGE.travelSeconds + GARDEN_NODE_EMERGE.riseSeconds;
        const knots = layout.filter((s) => s.parent === null).map((s) => s.key);
        const buds = layout.filter((s) => s.parent !== null);

        // Everything starts underground at the Heart (on-Heart nodes) or at its parent's spot, untargetable.
        for (const spec of layout) {
            const unit = grown.get(spec.key)!;
            const from = spec.parent === null ? heart : spots.get(spec.parent)!;
            expect(isBurrowEmerging(unit)).toBe(true);
            expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(true);
            expect(Math.hypot(unit.x - from.x, unit.y - from.y)).toBeLessThan(1);
            expect(resolveBurrowRender(unit, engine.tickTime)).not.toBeNull();
        }
        // Survives a save mid-entry.
        const sample = grown.get(buds[0]!.key)!;
        const json = serializeUnit(sample, engine.gameTick);
        expect(json.emergeBurrow).toBeDefined();

        // The first wave is up; the Buds are still on their way.
        stepSeconds(delay + hop + 0.05);
        for (const key of knots) {
            const unit = grown.get(key)!;
            expect(isBurrowEmerging(unit)).toBe(false);
            expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(false);
            expect(Math.hypot(unit.x - spots.get(key)!.x, unit.y - spots.get(key)!.y)).toBeLessThan(1);
        }
        for (const spec of buds) expect(isBurrowEmerging(grown.get(spec.key)!)).toBe(true);

        stepSeconds(hop);
        for (const [key, unit] of grown) {
            expect(isBurrowEmerging(unit)).toBe(false);
            expect(hasUnitTag(unit, UnitTag.Invincible)).toBe(false);
            expect(Math.hypot(unit.x - spots.get(key)!.x, unit.y - spots.get(key)!.y)).toBeLessThan(1);
        }
    });

    it("with an eruption, each node of the entry surfaces in a marked blast that hits what stands there", () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        addPlayer(centre(38), centre(38));
        const grown = growGardenTree(growCtx(), heart, 1);
        const [bud] = [...grown.values()];
        // Not plant kin, so the Wild blast hits it.
        const wolf = addEnemy(ENEMY_DARK_WOLF, bud!.x, bud!.y);
        wolf.maxHp = wolf.hp = 1000;
        emergeGardenTree(engine, heart, 1, grown, { delaySeconds: 0.2, ...GARDEN_NODE_EMERGE, eruption: GARDEN_NODE_HOP.burrow.eruption });
        // Marked from the start, at the spot it will rise, 4x its size.
        const telegraph = resolveBurrowRender(bud!, engine.tickTime)!.eruption!;
        expect(telegraph).not.toBeNull();
        expect(Math.hypot(telegraph.x - wolf.x, telegraph.y - wolf.y)).toBeLessThan(1);
        expect(telegraph.radiusPx).toBeCloseTo(bud!.radius * GARDEN_NODE_HOP_BLAST_RADII, 5);
        const before = wolf.hp;
        stepSeconds(0.2 + GARDEN_NODE_EMERGE.travelSeconds + GARDEN_NODE_EMERGE.riseSeconds + 0.1);
        expect(isBurrowEmerging(bud!)).toBe(false);
        expect(before - wolf.hp).toBe(GARDEN_NODE_HOP_DAMAGE);
    });

    it('nudges a node off rock onto passable ground', () => {
        setupEngine([[25, 20]]);
        const tm = engine.terrainManager!;
        const p = nearestPassablePoint(tm, centre(25), centre(20));
        expect(tm.isPassable(p.x, p.y)).toBe(true);
        expect(Math.hypot(p.x - centre(25), p.y - centre(20))).toBeLessThanOrEqual(CELL_SIZE * 1.5);
        const clear = nearestPassablePoint(tm, centre(10), centre(10));
        expect(clear).toEqual({ x: centre(10), y: centre(10) });
    });
});

describe('Gloam Lily', () => {
    function addLight(id: string, col: number, row: number, amount: number): void {
        engine.addSpecialTile({
            id,
            defId: 'Campfire',
            col,
            row,
            hp: 5,
            maxHp: 5,
            emitsLight: { lightAmount: amount, radius: 4 },
        });
    }
    const lightOf = (id: string): number => engine.specialTiles.find((t) => t.id === id)?.emitsLight?.lightAmount ?? 0;
    const isLit = (id: string): boolean => {
        const tile = engine.specialTiles.find((t) => t.id === id);
        return tile != null && tile.hp > 0 && (tile.emitsLight?.lightAmount ?? 0) > 0;
    };

    it('drinks one strength from the nearest light each cast, and a light drunk dry stays out after the Lily dies', () => {
        setupEngine();
        const lily = addEnemy({ ...ENEMY_GLOAM_LILY }, centre(20), centre(20));
        const player = addPlayer(centre(2), centre(2));
        addLight('near', 22, 20, 2);
        addLight('far', 35, 35, 5);

        const run = (seconds: number): void => stepSeconds(seconds, () => (player.hp = player.maxHp));
        cast(lily, DRINK_LIGHT_ABILITY_ID, []);
        run(1.2);
        expect(lightOf('near')).toBe(1);
        expect(lightOf('far')).toBe(5);

        run(3);
        cast(lily, DRINK_LIGHT_ABILITY_ID, []);
        run(1.2);
        expect(isLit('near')).toBe(false);

        lily.takeDamage(lily.maxHp * 10, 'tester', engine.eventBus);
        run(1);
        expect(lily.isAlive()).toBe(false);
        expect(isLit('near')).toBe(false);
        expect(isLit('far')).toBe(true);
    });

    it('casts Drink Light on its own, with no player in sight, while a light is lit', () => {
        setupEngine();
        const lily = createUnitFromSpawnConfig(
            { ...ENEMY_GLOAM_LILY, x: centre(20), y: centre(20), ownerId: 'ai' },
            engine.eventBus,
            engine,
        );
        engine.addUnit(lily, 'initialGameSpawn');
        const player = addPlayer(centre(2), centre(2));
        addLight('crystal', 24, 20, 3);
        stepSeconds(2, () => (player.hp = player.maxHp));
        expect(lightOf('crystal')).toBeLessThan(3);
    });

    it('is a rooted, shelled plant that hops by burrowing like every node', () => {
        const def = getUnitDefEntry(GLOAM_LILY_ID)!;
        expect(def.speed).toBe(0);
        expect(def.flatDamageReductions?.[0]?.condition).toBe('hasLivingChildren');
        expect(def.components?.some((c) => c.type.id === BURROW_HOP_COMPONENT_ID)).toBe(true);
        expect(ENEMY_GLOAM_LILY.abilities).toContain(DRINK_LIGHT_ABILITY_ID);
    });
});

describe('shelled nodes', () => {
    it('a shelled Knot still attacks on its own (its Shell only blunts hits)', () => {
        setupEngine();
        const spawnAi = (def: typeof ENEMY_THORNSPITTER, x: number, y: number) => {
            const u = createUnitFromSpawnConfig({ ...def, x, y, ownerId: 'ai' }, engine.eventBus, engine);
            engine.addUnit(u, 'initialGameSpawn');
            return u;
        };
        const knot = spawnAi(ENEMY_THORNSPITTER, centre(20), centre(20));
        const bud = spawnAi(ENEMY_GLOAM_LILY, centre(20), centre(23));
        linkNodeChild(knot, bud);
        const player = addPlayer(centre(25), centre(20));
        expect(hasLivingChildren(knot)).toBe(true);
        let fired = false;
        stepSeconds(4, () => {
            player.hp = player.maxHp;
            if (engine.projectiles.some((p) => p.sourceUnitId === knot.id)) fired = true;
        });
        expect(hasLivingChildren(knot)).toBe(true);
        expect(fired).toBe(true);
    });

    it("in the grown phase-4 tree, both shelled Knots (Hive Gourd, Creeper) act while their Buds live", () => {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        const grown = growGardenTree(growCtx(), heart, 4);
        const gourd = grown.get('gourd')!;
        const creeper = grown.get('creeper')!;
        const player = addPlayer(creeper.x + 3 * 40, creeper.y);
        let creeperCast = false;
        stepSeconds(8, () => {
            player.hp = player.maxHp;
            if (creeper.activeAbilities.length > 0) creeperCast = true;
        });
        expect(hasLivingChildren(gourd) && hasLivingChildren(creeper)).toBe(true);
        expect(peekSpawnerState(gourd)!.spawnedIds.length).toBeGreaterThan(0);
        expect(creeperCast).toBe(true);
    });
});

describe('Wild garden attacks', () => {
    it('a Thornspitter thorn damages a dark wolf in its path and leaves a plant node in front of it untouched', () => {
        setupEngine();
        const spitter = addEnemy(ENEMY_THORNSPITTER, centre(5), centre(20));
        // The first wave's fan flies at -36, -20, -4, 12 and 28 degrees from the aim (east): the plant sits on the -4
        // thorn's line, the wolf on the 12 thorn's, past the plant's reach.
        const onLine = (deg: number, dist: number): { x: number; y: number } => ({
            x: spitter.x + Math.cos((deg * Math.PI) / 180) * dist,
            y: spitter.y + Math.sin((deg * Math.PI) / 180) * dist,
        });
        const plantAt = onLine(-4, 160);
        const wolfAt = onLine(12, 300);
        const plant = addEnemy(ENEMY_GLOAM_LILY, plantAt.x, plantAt.y);
        const wolf = addEnemy(ENEMY_DARK_WOLF, wolfAt.x, wolfAt.y);
        const player = addPlayer(centre(36), centre(20));
        cast(spitter, THORN_FANS_ABILITY_ID, at(player));
        stepSeconds(6, () => {
            player.hp = player.maxHp;
        });
        expect(wolf.hp).toBeLessThan(wolf.maxHp);
        expect(plant.hp).toBe(plant.maxHp);
    });

    it('the Hive Gourd\'s swarmlings and slimes are plant kin', () => {
        setupEngine();
        const gourd = addEnemy(ENEMY_HIVE_GOURD, centre(20), centre(20));
        const player = addPlayer(centre(2), centre(2));
        stepSeconds(8, () => (player.hp = player.maxHp));
        const children = peekSpawnerState(gourd)!.spawnedIds.map((id) => engine.getUnit(id)!);
        expect(children.length).toBeGreaterThan(0);
        for (const child of children) expect(hasUnitTag(child, UnitTag.GardenKin)).toBe(true);
    });

    it('the Pod seed burst and the node hop and resprout eruptions are Wild', () => {
        const seedBurst = getUnitDefEntry(POD_SEED_ID)!.components!.map((c) => c.options as { onExpiry?: { hitRule?: unknown } });
        expect(seedBurst.some((o) => o.onExpiry?.hitRule != null)).toBe(true);
        expect(GARDEN_NODE_HOP.burrow.eruption?.hitRule).toEqual(GARDEN_WILD_HIT_RULE);
        const heartPhases = getUnitDefEntry('garden_heart')!.phases!;
        for (const phase of heartPhases) {
            const transition = phase.transition as { burrow?: { eruption?: { hitRule?: unknown } } };
            expect(transition.burrow?.eruption?.hitRule ?? GARDEN_WILD_HIT_RULE).toEqual(GARDEN_WILD_HIT_RULE);
        }
    });

    it('the Creeper\'s thorns hurt a dark creature but not a plant', () => {
        const thorns = getTerrainEffectDef(GARDEN_THORN_EFFECT_TYPE)!.thorns!;
        setupEngine();
        const wolf = addEnemy(ENEMY_DARK_WOLF, centre(5), centre(5));
        const plant = addEnemy(ENEMY_GLOAM_LILY, centre(8), centre(8));
        expect(unitIsHurtByThorns(thorns, wolf)).toBe(true);
        expect(unitIsHurtByThorns(thorns, plant)).toBe(false);
    });
});
