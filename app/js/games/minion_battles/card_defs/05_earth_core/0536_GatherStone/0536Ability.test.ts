import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { GatherStoneAbility_0536 } from './0536Ability';
import { Unit } from '../../../game/units/Unit';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { enterInterval, timingsFor } from '../earthCoreTestHelpers';
import { EventBus } from '../../../game/EventBus';
import { Rock } from '../../../resources/Rock';
import { TerrainType } from '../../../terrain/TerrainType';
import type { ResolvedTarget } from '../../../game/types';
import {
    snapSquareTileAreaCenter,
    worldToTile,
} from '../../../abilities/tileAreaHelpers';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import {
    EARTH_TREE_ID,
    EARTH_NODE_GATHER_STONE_RUBBLE_STRIKE,
} from '../../../../../researchTrees/trees/earth';
import {
    GATHER_STONE_ROCK_DAMAGE,
    GATHER_STONE_RUBBLE_DAMAGE,
} from '../earthCoreConstants';

const CELL = 40;
const center = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });

function makeUnit(config: { id: string; teamId: 'player' | 'enemy'; col: number; row: number }): Unit {
    const { x, y } = center(config.col, config.row);
    return new Unit({
        x,
        y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

interface TerrainStub {
    types: Map<string, TerrainType>;
    width: number;
    height: number;
    damageRock: ReturnType<typeof vi.fn>;
}

function makeEngine(opts: {
    terrain?: Record<string, TerrainType>;
    gridW?: number;
    gridH?: number;
    researchNodes?: string[];
    units?: Unit[];
}): { engine: unknown; terrain: TerrainStub; eventBus: EventBus } {
    const eventBus = new EventBus();
    const types = new Map<string, TerrainType>(Object.entries(opts.terrain ?? {}) as [string, TerrainType][]);
    const width = opts.gridW ?? 40;
    const height = opts.gridH ?? 40;
    const damageRock = vi.fn();
    const terrain: TerrainStub = { types, width, height, damageRock };
    const engine = {
        units: opts.units ?? [],
        getUnit: (id: string) => (opts.units ?? []).find((u) => u.id === id),
        gameTime: 0,
        eventBus,
        addEffect: () => {},
        addEffectEmitter: () => {},
        localPlayerId: 'p1',
        getPlayerResearchNodes: (_playerId: string, treeId: string) =>
            treeId === EARTH_TREE_ID ? (opts.researchNodes ?? []) : [],
        terrainManager: {
            getEffectiveTerrainType: (col: number, row: number) =>
                types.get(`${col},${row}`) ?? TerrainType.Grass,
            getGridSize: () => ({ width, height, cellSize: CELL }),
            isInBounds: (col: number, row: number) => col >= 0 && row >= 0 && col < width && row < height,
            isIntactRockAt: (col: number, row: number) =>
                col >= 0 && row >= 0 && col < width && row < height && types.get(`${col},${row}`) === TerrainType.Rock,
            damageRock,
            grid: { gridToWorld: (col: number, row: number) => center(col, row) },
        },
    };
    return { engine, terrain, eventBus };
}

const pixelTarget = (col: number, row: number): ResolvedTarget[] => [
    { type: 'pixel', position: center(col, row) },
];

describe('tileAreaHelpers', () => {
    it('clamps each axis of the center to +/- maxTileOffset', () => {
        const c = center(5, 5);
        expect(snapSquareTileAreaCenter(c.x, c.y, ...axis(25, 5), 2)).toEqual({ col: 7, row: 5 });
        expect(snapSquareTileAreaCenter(c.x, c.y, ...axis(25, 25), 2)).toEqual({ col: 7, row: 7 });
        expect(snapSquareTileAreaCenter(c.x, c.y, ...axis(0, 0), 2)).toEqual({ col: 3, row: 3 });
        // in range: unchanged
        expect(snapSquareTileAreaCenter(c.x, c.y, ...axis(6, 4), 2)).toEqual({ col: 6, row: 4 });
        // maxTileOffset 0 => always centered on caster
        expect(snapSquareTileAreaCenter(c.x, c.y, ...axis(9, 9), 0)).toEqual({ col: 5, row: 5 });
    });

    it('returns 9 row-major cells for a half=1 area', () => {
        const square = tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 2 },
            shape: tileShapes.square(1),
            castRange: 180,
        });
        const cells = square.cellsAround({ col: 7, row: 5 });
        expect(cells).toHaveLength(9);
        expect(cells[0]).toEqual({ col: 6, row: 4 });
        expect(cells[4]).toEqual({ col: 7, row: 5 });
        expect(cells[8]).toEqual({ col: 8, row: 6 });
    });

    it('worldToTile matches floor(x / CELL_SIZE)', () => {
        expect(worldToTile(215, 41)).toEqual({ col: 5, row: 1 });
    });
});

function axis(col: number, row: number): [number, number] {
    const { x, y } = center(col, row);
    return [x, y];
}

describe('TileAreaHitboxSpec (square preset)', () => {
    it('is ground-only and never a lock-on', () => {
        const hb = tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 2 },
            shape: tileShapes.square(1),
            castRange: 180,
        });
        expect(hb.numTargets).toBe(0);
        expect(hb.maxRange).toBe(180);
        expect(hb.resolveTargets({} as Unit, { x: 0, y: 0 }, [])).toEqual([]);
        expect(hb.resolveHits({} as never, {} as Unit, 0, 0)).toEqual([]);
    });

    it('draws a closed square and returns no candidates', () => {
        const hb = tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 2 },
            shape: tileShapes.square(1),
            castRange: 180,
        });
        const calls: string[] = [];
        const gr = {
            clear: () => calls.push('clear'),
            moveTo: () => calls.push('moveTo'),
            lineTo: () => calls.push('lineTo'),
            circle: () => calls.push('circle'),
            fill: () => calls.push('fill'),
            stroke: () => calls.push('stroke'),
        };
        const out = hb.renderTargetingPreview(gr, { x: 220, y: 220, radius: 12 } as never, { x: 260, y: 220 }, []);
        expect(out).toEqual([]);
        expect(calls).toContain('moveTo');
        expect(calls).toContain('fill');
        expect(calls).toContain('stroke');
    });
});

const gather = (engine: unknown, caster: Unit, targets: ResolvedTarget[]): void =>
    enterInterval(GatherStoneAbility_0536, 'gather', engine as AbilityEngineContext, caster, targets);

describe('Gather Stone (0536) cast behaviours', () => {
    it('declarative, and nothing fires before the gather window', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        caster.attachResource(new Rock(), new EventBus());
        const { engine, terrain } = makeEngine({ terrain: { '5,5': TerrainType.Rock } });

        enterInterval(GatherStoneAbility_0536, 'windup', engine as AbilityEngineContext, caster, pixelTarget(5, 5));
        expect(terrain.damageRock).not.toHaveBeenCalled();

        gather(engine, caster, pixelTarget(5, 5));
        expect(terrain.damageRock).toHaveBeenCalledTimes(1);
    });

    it('cracks each intact rock tile in the 3x3 and banks 1 rock per tile', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        caster.attachResource(new Rock(), new EventBus());
        const { engine, terrain } = makeEngine({
            terrain: {
                '4,5': TerrainType.Rock,
                '5,5': TerrainType.Rock,
                '6,5': TerrainType.Rock,
                '5,4': TerrainType.Grass,
                '7,5': TerrainType.Rock, // outside the 3x3 centered on (5,5)
            },
        });

        gather(engine, caster, pixelTarget(5, 5));

        expect(terrain.damageRock).toHaveBeenCalledTimes(3);
        for (const c of [[4, 5], [5, 5], [6, 5]]) {
            expect(terrain.damageRock).toHaveBeenCalledWith(c[0], c[1], GATHER_STONE_ROCK_DAMAGE, caster.id);
        }
        expect(caster.getResource('rock')!.current).toBe(3);
    });

    it('skips out-of-bounds cells so edge-of-map voids do not grant rock', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        caster.attachResource(new Rock(), new EventBus());
        const { engine, terrain } = makeEngine({
            gridW: 6,
            terrain: { '4,5': TerrainType.Rock, '5,5': TerrainType.Rock, '6,5': TerrainType.Rock },
        });

        gather(engine, caster, pixelTarget(5, 5));

        expect(terrain.damageRock).toHaveBeenCalledTimes(2);
        expect(terrain.damageRock).not.toHaveBeenCalledWith(6, 5, expect.anything(), expect.anything());
        expect(caster.getResource('rock')!.current).toBe(2);
    });

    it('does not strike rubble-standing enemies without the Grinding Debris node', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        caster.attachResource(new Rock(), new EventBus());
        const enemy = makeUnit({ id: 'enemy', teamId: 'enemy', col: 5, row: 5 });
        const { engine } = makeEngine({ terrain: { '5,5': TerrainType.Rubble }, units: [caster, enemy] });

        gather(engine, caster, pixelTarget(5, 5));

        expect(enemy.hp).toBe(enemy.maxHp);
        expect(timingsFor(GatherStoneAbility_0536, caster, engine).find((i) => i.id === 'gather')?.castBehaviours).toHaveLength(1);
    });

    it('with the node, attaches the rubble strike and hits each rubble-standing enemy once for 6', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        caster.attachResource(new Rock(), new EventBus());
        const onRubble = makeUnit({ id: 'on_rubble', teamId: 'enemy', col: 5, row: 5 });
        const onGrass = makeUnit({ id: 'on_grass', teamId: 'enemy', col: 6, row: 5 });
        const outsideRegion = makeUnit({ id: 'outside', teamId: 'enemy', col: 9, row: 9 });
        const { engine } = makeEngine({
            terrain: { '5,5': TerrainType.Rubble, '9,9': TerrainType.Rubble },
            researchNodes: [EARTH_NODE_GATHER_STONE_RUBBLE_STRIKE],
            units: [caster, onRubble, onGrass, outsideRegion],
        });

        expect(timingsFor(GatherStoneAbility_0536, caster, engine).find((i) => i.id === 'gather')?.castBehaviours).toHaveLength(2);
        gather(engine, caster, pixelTarget(5, 5));

        expect(onRubble.maxHp - onRubble.hp).toBe(GATHER_STONE_RUBBLE_DAMAGE);
        expect(onGrass.hp).toBe(onGrass.maxHp);
        expect(outsideRegion.hp).toBe(outsideRegion.maxHp);
    });

    it('bails cleanly when there is no terrain manager', () => {
        const caster = makeUnit({ id: 'caster', teamId: 'player', col: 5, row: 5 });
        const engine = { units: [], gameTime: 0, eventBus: new EventBus(), addEffect: () => {}, addEffectEmitter: () => {}, terrainManager: null };
        expect(() => gather(engine, caster, pixelTarget(5, 5))).not.toThrow();
    });
});
