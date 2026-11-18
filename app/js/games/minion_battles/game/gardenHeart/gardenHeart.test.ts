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
    ENEMY_HIVE_GOURD,
    ENEMY_MENDER_BLOOM,
    ENEMY_POD_MORTAR,
    ENEMY_THORNSPITTER,
} from '../../constants/enemyConstants';
import {
    CREEPER_ID,
    HIVE_GOURD_ID,
    HIVE_GOURD_INTERVAL_SEC,
    HIVE_GOURD_MAX_CHILDREN,
    LOB_SEED_ABILITY_ID,
    LOB_SEED_WINDUP_SEC,
    MENDER_BLOOM_ID,
    MEND_ABILITY_ID,
    MEND_RADIUS_PX,
    POD_MORTAR_ID,
    POD_SEED_ID,
    RUNNER_VINE_ABILITY_ID,
    SPIKE_RING_ABILITY_ID,
    SPIKE_RING_COUNT,
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
    GARDEN_NODE_HOP_BLAST_RADII,
    GARDEN_NODE_HOP_DAMAGE,
    STEM_LEASH_PX,
} from '../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { thornFanOffsets, thornFanWaves, thornWaveTurn } from '../../card_defs/16_enemy_garden_heart/1601_ThornFans/1601Ability';
import { getBattleVariable, setBattleVariable } from '../battleVariables';
import { nodesInMendReach } from '../../card_defs/16_enemy_garden_heart/1603_Mend/1603Ability';
import { trailTiles } from '../../abilities/CastBehaviours/GroundTrailBehaviour';
import { gardenSpikeRingRate } from '../../card_defs/16_enemy_garden_heart/1605_SpikeRing/1605Ability';
import { peekPhaseState } from '../units/components/phaseComponent';
import { ROUND_DURATION } from '../gameConstants';
import { BURROWING_PROJECTILE_TYPE } from '../projectiles/projectile_defs/burrowingDef';
import { THORN_PROJECTILE_TYPE } from '../projectiles/projectile_defs/thornDef';
import { DARK_THORN_EFFECT_TYPE } from '../terrainEffects/terrainEffectDefs';
import {
    getNodeChildIds,
    getNodeParentId,
    hasLivingChildren,
    linkNodeChild,
} from '../units/components/nodeTree';
import { peekSpawnerState } from '../units/components/spawnerComponent';
import { serializeUnit } from '../units/unitToJSON';
import { applySerializedUnitState } from '../units/unitFromJSON';
import { distanceToSegment, listLiveTethers, tetherCoveredTiles } from '../tethers/tether';
import { resolveBurrowRender } from '../units/unitRenderOptions';
import { applyUnitFlatReductions } from '../units/flatDamageReduction';
import { BURROW_HOP_COMPONENT_ID, isBurrowHopDue, peekBurrowHopState } from '../units/components/burrowHop';
import { hopKeepsTethers } from '../units/components/burrowHopHooks';
import { getBurrowVisual } from '../units/components/phaseBurrow';
import { UnitTag, hasUnitTag } from '../units/unitTag';
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

describe('Garden Heart registration', () => {
    it('registers every ability and card, every unit def, and lists the node kinds in the Bestiary', () => {
        for (const id of [THORN_FANS_ABILITY_ID, LOB_SEED_ABILITY_ID, MEND_ABILITY_ID, RUNNER_VINE_ABILITY_ID, SPIKE_RING_ABILITY_ID]) {
            expect(getAbility(id), id).toBeDefined();
            expect(CARD_DEF_MAP.get(id), id).toBeDefined();
        }
        for (const id of [THORNSPITTER_ID, POD_MORTAR_ID, MENDER_BLOOM_ID, HIVE_GOURD_ID, CREEPER_ID, 'garden_heart']) {
            expect(getUnitDefEntry(id), id).toBeDefined();
            expect(getBestiaryUnitIds()).toContain(id);
        }
        expect(getUnitAITree('gardenNode')).not.toBeNull();
    });

    it('every node kind and the Heart carries the Shell (condition hasLivingChildren) and a node-tree component', () => {
        for (const id of [THORNSPITTER_ID, POD_MORTAR_ID, MENDER_BLOOM_ID, HIVE_GOURD_ID, CREEPER_ID, 'garden_heart']) {
            const def = getUnitDefEntry(id)!;
            expect(def.flatDamageReductions?.[0]?.condition, id).toBe('hasLivingChildren');
            expect(def.components?.some((c) => c.type.id === 'nodeTree'), id).toBe(true);
        }
    });

    it('nothing in the garden walks; every node but the Mender Bloom and the Heart hops by burrowing', () => {
        for (const id of ['garden_heart', THORNSPITTER_ID, POD_MORTAR_ID, MENDER_BLOOM_ID, HIVE_GOURD_ID, CREEPER_ID]) {
            expect(getUnitDefEntry(id)!.speed, id).toBe(0);
        }
        const hops = (id: string): boolean =>
            (getUnitDefEntry(id)!.components ?? []).some((c) => c.type.id === BURROW_HOP_COMPONENT_ID);
        expect([THORNSPITTER_ID, POD_MORTAR_ID, CREEPER_ID, HIVE_GOURD_ID].every(hops)).toBe(true);
        expect([MENDER_BLOOM_ID, 'garden_heart'].some(hops)).toBe(false);
    });
});

describe('Garden Heart units are rooted plants', () => {
    const GARDEN_UNITS = ['garden_heart', THORNSPITTER_ID, POD_MORTAR_ID, MENDER_BLOOM_ID, HIVE_GOURD_ID, CREEPER_ID, POD_SEED_ID];

    it('every Garden Heart unit is a Structure and bleed-immune', () => {
        for (const id of GARDEN_UNITS) {
            const tags = getUnitDefEntry(id)!.tags ?? [];
            expect(tags, id).toContain(UnitTag.Structure);
            expect(tags, id).toContain(UnitTag.BleedImmune);
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
        expect(applyUnitFlatReductions(knot, 25).damage).toBeLessThan(25);
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

describe('Mender Bloom', () => {
    it('heals the other nodes in reach (a shelled Heart included) and nothing else', () => {
        setupEngine();
        const bloom = addEnemy(ENEMY_MENDER_BLOOM, centre(20), centre(20));
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(23), centre(20));
        const budOfHeart = addEnemy(ENEMY_THORNSPITTER, centre(26), centre(20));
        linkNodeChild(heart, budOfHeart);
        const far = addEnemy(ENEMY_THORNSPITTER, centre(20) + MEND_RADIUS_PX * 3, centre(20));
        const player = addPlayer(centre(18), centre(20));
        for (const u of [heart, budOfHeart, far, bloom]) u.hp = Math.floor(u.maxHp / 2);
        player.hp = Math.floor(player.maxHp / 2);
        const before = new Map([heart, budOfHeart, far, bloom, player].map((u) => [u.id, u.hp]));

        expect(hasLivingChildren(heart)).toBe(true);
        expect(nodesInMendReach(bloom, engine.units).map((u) => u.id).sort()).toEqual([budOfHeart.id, heart.id].sort());

        cast(bloom, MEND_ABILITY_ID, []);
        stepSeconds(1.5);
        expect(heart.hp).toBeGreaterThan(before.get(heart.id)!);
        expect(budOfHeart.hp).toBeGreaterThan(before.get(budOfHeart.id)!);
        expect(far.hp).toBe(before.get(far.id));
        expect(bloom.hp).toBe(before.get(bloom.id));
        expect(player.hp).toBe(before.get(player.id));
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
        const thorns = [...engine.terrainLayers.allEffects.values()].filter((e) => e.effectType === DARK_THORN_EFFECT_TYPE);
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

    it('matches the design: P1 one Bud; P2 two Buds; P3 two Knots with a Bud each; P4 two Knots with two Buds and two Heart Pod Mortars', () => {
        const [p1, p2, p3, p4] = GARDEN_TREE_LAYOUTS;
        expect(p1).toHaveLength(1);
        expect(p1![0]!.kind).toBe(THORNSPITTER_ID);
        expect(p2!.map((n) => n.kind).sort()).toEqual([POD_MORTAR_ID, THORNSPITTER_ID].sort());
        expect(p2!.every((n) => n.parent === null)).toBe(true);

        expect(knotKeys(p3!).size).toBe(2);
        const p3Knots = p3!.filter((n) => knotKeys(p3!).has(n.key)).map((n) => n.kind).sort();
        expect(p3Knots).toEqual([CREEPER_ID, HIVE_GOURD_ID].sort());
        const p3Buds = p3!.filter((n) => !knotKeys(p3!).has(n.key)).map((n) => n.kind).sort();
        expect(p3Buds).toEqual([MENDER_BLOOM_ID, THORNSPITTER_ID].sort());
        // The Mender Bloom is a Bud, never a parent.
        for (const layout of GARDEN_TREE_LAYOUTS) {
            const parents = knotKeys(layout);
            expect(layout.filter((n) => n.kind === MENDER_BLOOM_ID).every((n) => !parents.has(n.key))).toBe(true);
        }

        const knots4 = knotKeys(p4!);
        expect(knots4.size).toBe(2);
        for (const k of knots4) expect(p4!.filter((n) => n.parent === k)).toHaveLength(2);
        const heartBuds = p4!.filter((n) => n.parent === null && !knots4.has(n.key));
        expect(heartBuds).toHaveLength(2);
        expect(heartBuds.every((n) => n.kind === POD_MORTAR_ID)).toBe(true);
        expect(new Set(p4!.map((n) => n.kind)).size).toBe(5);
    });

    it('returns undefined for a phase with no layout', () => {
        expect(gardenTreeLayout(0)).toBeUndefined();
        expect(gardenTreeLayout(5)).toBeUndefined();
    });
});

describe('Spike Ring', () => {
    it('the rate climbs slowly at first and jumps at the end of each phase, reaching 8 a round in the final phase', () => {
        expect(gardenSpikeRingRate(1, 1)).toBe(0); // phase 1: never
        expect(gardenSpikeRingRate(2, 0)).toBe(1); // phase 2: about once a round with the tree whole
        expect(gardenSpikeRingRate(4, 1)).toBe(8); // final tree gone: 8 a round
        for (const phase of [2, 3, 4]) {
            const at = (f: number): number => gardenSpikeRingRate(phase, f);
            for (let f = 0.1; f <= 1; f += 0.1) expect(at(f)).toBeGreaterThan(at(f - 0.1));
            const climb = at(1) - at(0);
            expect(at(0.5) - at(0)).toBeLessThan(climb * 0.2); // half the tree gone: still gentle
            expect(at(1) - at(0.75)).toBeGreaterThan(climb * 0.5); // the last quarter is most of the climb
            if (phase > 2) expect(at(0)).toBeGreaterThan(gardenSpikeRingRate(phase - 1, 0)); // each phase starts higher
        }
    });

    function ringsIn(seconds: number): number {
        let n = 0;
        const count = (e: { abilityId: string }): void => {
            if (e.abilityId === SPIKE_RING_ABILITY_ID) n++;
        };
        engine.eventBus.on('ability_used', count);
        stepSeconds(seconds);
        engine.eventBus.off('ability_used', count);
        return n;
    }

    function heartInPhase(phase: number): Unit {
        setupEngine();
        const heart = addEnemy(ENEMY_GARDEN_HEART, centre(20), centre(20));
        addPlayer(centre(38), centre(38));
        peekPhaseState(heart)!.index = phase - 1;
        return heart;
    }

    it('fires a ring of thorns evenly around the Heart', () => {
        const heart = heartInPhase(4);
        dismissGardenTree(engine, heart);
        let guard = 0;
        while (!engine.projectiles.some((p) => p.sourceAbilityId === SPIKE_RING_ABILITY_ID) && guard++ < TICKS_PER_SEC * 5) {
            stepSeconds(1 / TICKS_PER_SEC);
        }
        const thorns = engine.projectiles.filter((p) => p.sourceAbilityId === SPIKE_RING_ABILITY_ID);
        expect(thorns).toHaveLength(SPIKE_RING_COUNT);
        expect(thorns.every((p) => p.projectileType === THORN_PROJECTILE_TYPE)).toBe(true);
        const angles = thorns.map((p) => Math.atan2(p.velocityY, p.velocityX)).sort((a, b) => a - b);
        for (let i = 1; i < angles.length; i++) expect(angles[i]! - angles[i - 1]!).toBeCloseTo((Math.PI * 2) / SPIKE_RING_COUNT, 5);
        expect(thorns.every((p) => p.sourceTeamId === heart.teamId)).toBe(true);
    });

    it('never fires in phase 1', () => {
        const heart = heartInPhase(1);
        growGardenTree(growCtx(), heart, 1);
        expect(ringsIn(12)).toBe(0);
    });

    it('fires about once a round in phase 2 with the tree whole, and more once it is cut down', () => {
        const heart = heartInPhase(2);
        growGardenTree(growCtx(), heart, 2);
        expect(ringsIn(ROUND_DURATION * 2 + 0.5)).toBe(2);
        dismissGardenTree(engine, heart);
        expect(ringsIn(ROUND_DURATION * 2 + 0.5)).toBe(5); // 2.5 a round
    });

    it('fires 8 times a round in the final phase with every node gone', () => {
        const heart = heartInPhase(4);
        dismissGardenTree(engine, heart);
        expect(ringsIn(ROUND_DURATION + 0.1)).toBe(8);
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
