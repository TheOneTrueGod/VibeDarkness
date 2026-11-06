import { describe, expect, it } from 'vitest';
import { Unit } from '../../units/Unit';
import { UnitTag } from '../../units/unitTag';
import type { TeamId } from '../../teams';
import { UNIT_SIZE_MAP } from '../../units/unit_defs/unitConstants';
import { PLAYER_CHARACTER_ID } from '../../units/unit_defs/unitDef';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { TerrainLayerManager } from '../../TerrainLayerManager';
import { CrowdSpacingGrid } from '../shared/CrowdSpacingGrid';
import { MassResolver, getCrowdPushBudget } from './MassResolver';
import { CROWD_MASS_ENEMY_RESISTANCE } from './massConstants';

const DT = 1 / 60;
/** Fast enough that the push budget never limits a single small overlap. */
const UNLIMITED_SPEED = 100_000;
const SLOW_SPEED = 30;
const MEDIUM = UNIT_SIZE_MAP.Medium;
const FLOAT_EPS = 1e-6;

type MakeOpts = {
    radius?: number;
    speed?: number;
    teamId?: TeamId;
    ownerId?: string;
    characterId?: string;
    tags?: UnitTag[];
};

function makeUnit(id: string, x: number, y: number, opts: MakeOpts = {}): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: opts.speed ?? UNLIMITED_SPEED,
        teamId: opts.teamId ?? 'enemy',
        ownerId: opts.ownerId ?? 'ai',
        characterId: opts.characterId ?? 'alpha_wolf',
        name: id,
        radius: opts.radius ?? MEDIUM,
        abilities: [],
    });
    unit.tags = [...(opts.tags ?? [])];
    return unit;
}

function makePlayer(id: string, x: number, y: number, opts: MakeOpts = {}): Unit {
    return makeUnit(id, x, y, {
        teamId: 'player',
        ownerId: id,
        characterId: PLAYER_CHARACTER_ID,
        ...opts,
    });
}

function makeGrassManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function resolveOnce(
    units: Unit[],
    opts: {
        terrainManager?: TerrainManager | null;
        resolver?: MassResolver;
        /** How far each unit already moved this tick (its pre-movement snapshot is `pos − moved`). */
        moved?: Record<string, { x: number; y: number }>;
    } = {},
): Array<[string, string]> {
    const resolver = opts.resolver ?? new MassResolver();
    const participants = units.filter((u) => resolver.isParticipant(u));
    const grid = new CrowdSpacingGrid();
    grid.rebuild(participants.map((u) => ({ id: u.id, x: u.x, y: u.y, radius: resolver.radius(u) })));
    const tickStartPositions = new Map<string, { x: number; y: number }>();
    for (const u of units) {
        const m = opts.moved?.[u.id] ?? { x: 0, y: 0 };
        tickStartPositions.set(u.id, { x: u.x - m.x, y: u.y - m.y });
    }
    const contacts: Array<[string, string]> = [];
    resolver.resolve({
        participants,
        grid,
        terrainManager: opts.terrainManager ?? null,
        dt: DT,
        gameTime: 0,
        tickStartPositions,
        onContact: (a, b) => contacts.push([a.id, b.id]),
    });
    return contacts;
}

/**
 * Walk `walker` along +x at its own speed for `ticks` ticks, resolving after each step, and
 * return how far it got.
 */
function walkInto(walker: Unit, others: Unit[], ticks: number): number {
    const startX = walker.x;
    const step = walker.speed * DT;
    for (let t = 0; t < ticks; t++) {
        walker.x += step;
        resolveOnce([walker, ...others], { moved: { [walker.id]: { x: step, y: 0 } } });
    }
    return walker.x - startX;
}

function dist(a: Unit, b: Unit): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

describe('MassResolver', () => {
    it('a heavy unit moves less than a light one', () => {
        const light = makeUnit('a_light', 0, 0, { radius: UNIT_SIZE_MAP.Small });
        const heavy = makeUnit('b_heavy', 20, 0, { radius: UNIT_SIZE_MAP.Giant });
        resolveOnce([light, heavy]);
        const lightMove = Math.abs(light.x);
        const heavyMove = Math.abs(heavy.x - 20);
        expect(heavyMove).toBeGreaterThan(0);
        expect(lightMove).toBeGreaterThan(heavyMove);
    });

    it('a braced unit never moves; its partner takes the whole overlap', () => {
        for (const tag of [UnitTag.Structure, UnitTag.CrowdSpacingAnchor]) {
            const wall = makeUnit('a_wall', 0, 0, { tags: [tag] });
            const soft = makeUnit('b_soft', 10, 0);
            const overlap = 2 * MEDIUM - 10;
            resolveOnce([wall, soft]);
            expect(wall.x).toBe(0);
            expect(wall.y).toBe(0);
            expect(soft.x).toBeCloseTo(10 + overlap, 5);
        }
    });

    it('a knockback-braced unit is not moved by a soft', () => {
        const kb = makeUnit('a_kb', 0, 0);
        kb.knockback = {
            knockbackVector: { x: CELL_SIZE, y: 0 },
            knockbackAirTime: 0,
            knockbackSlideTime: 0.2,
            knockbackSource: { unitId: 'src', abilityId: 'test' },
            knockbackElapsed: 0,
        };
        const soft = makeUnit('b_soft', 10, 0);
        resolveOnce([kb, soft]);
        expect(kb.x).toBe(0);
        expect(soft.x).toBeGreaterThan(10);
    });

    it('a pushed unit moves at most its budget; the pusher takes the rest', () => {
        const pusher = makeUnit('a_fast', 0, 0);
        const slow = makeUnit('b_slow', 10, 0, { speed: SLOW_SPEED });
        const overlap = 2 * MEDIUM - 10;
        const budget = getCrowdPushBudget(slow, DT);
        expect(budget).toBeLessThan(overlap / 2);

        resolveOnce([pusher, slow], { moved: { a_fast: { x: 5, y: 0 } } });

        expect(Math.abs(slow.x - 10)).toBeLessThanOrEqual(budget + FLOAT_EPS);
        // Residual goes back to the pusher, so the pair still fully separates.
        expect(dist(pusher, slow)).toBeCloseTo(2 * MEDIUM, 5);
    });

    it('two budget-capped non-pushers do not separate faster than their budgets', () => {
        const a = makeUnit('a', 0, 0, { speed: SLOW_SPEED });
        const b = makeUnit('b', 10, 0, { speed: SLOW_SPEED });
        const budget = getCrowdPushBudget(a, DT);
        resolveOnce([a, b]);
        expect(Math.abs(a.x)).toBeLessThanOrEqual(budget + FLOAT_EPS);
        expect(Math.abs(b.x - 10)).toBeLessThanOrEqual(budget + FLOAT_EPS);
        expect(dist(a, b)).toBeLessThanOrEqual(10 + 2 * budget + FLOAT_EPS);
        expect(dist(a, b)).toBeGreaterThan(10);
    });

    it('an enemy line resists a walking player more than an ally line does', () => {
        const PLAYER_RADIUS = MEDIUM + 10; // player padding
        const SPEED = 120;
        const buildLine = (teamId: TeamId): Unit[] =>
            [0, 1, 2].map((i) =>
                makeUnit(`l${i}`, PLAYER_RADIUS + MEDIUM + i * 2 * MEDIUM, 0, { teamId, speed: SPEED }),
            );
        const ticks = 60;
        const enemyProgress = walkInto(makePlayer('p1', 0, 0, { speed: SPEED }), buildLine('enemy'), ticks);
        const allyProgress = walkInto(makePlayer('p1', 0, 0, { speed: SPEED }), buildLine('player'), ticks);
        const freeWalk = SPEED * DT * ticks;
        expect(allyProgress).toBeLessThan(freeWalk);
        expect(enemyProgress).toBeLessThan(allyProgress * 0.6);
    });

    it('an enemy pressing into a standing player moves it at the player budget ÷ resistance', () => {
        const player = makePlayer('a_p1', 0, 0, { speed: SLOW_SPEED });
        const enemy = makeUnit('b_e', 25, 0);
        const playerBudget = getCrowdPushBudget(player, DT);
        resolveOnce([player, enemy], { moved: { b_e: { x: -5, y: 0 } } });
        expect(player.x).toBeLessThan(0);
        expect(Math.abs(player.x)).toBeLessThanOrEqual(playerBudget / CROWD_MASS_ENEMY_RESISTANCE + FLOAT_EPS);
        // The pusher takes the rest of the overlap.
        // Mass mode has no player padding: separation is body radius + body radius.
        expect(dist(player, enemy)).toBeCloseTo(MEDIUM + MEDIUM, 5);
    });

    it('the budget uses the unit local step when its clock is running', () => {
        const unit = makeUnit('u', 0, 0, { speed: SLOW_SPEED });
        expect(getCrowdPushBudget(unit, DT)).toBeCloseTo(0.6 * SLOW_SPEED * DT, 10);
        unit.localClockActive = true;
        unit.localStep = 0;
        expect(getCrowdPushBudget(unit, DT)).toBe(0);
        unit.localStep = DT * 2;
        expect(getCrowdPushBudget(unit, DT)).toBeCloseTo(0.6 * SLOW_SPEED * DT * 2, 10);
    });

    it('a player walking into an enemy pinned against a wall is pushed back', () => {
        const terrainManager = makeGrassManager(8, 4);
        terrainManager.grid.set(1, 2, TerrainType.Rock);
        const enemyX = CELL_SIZE * 2 + 1;
        const y = CELL_SIZE * 2.5;
        const enemy = makeUnit('e', enemyX, y);
        const playerStartX = enemyX + 15;
        const player = makePlayer('p1', playerStartX, y, { speed: 100 });
        const spacing = MEDIUM + MEDIUM; // mass mode: no player padding
        const overlap = spacing - 15;

        // The player walked 5 px toward the enemy this tick, so it is the pair's pusher.
        resolveOnce([enemy, player], { terrainManager, moved: { p1: { x: -5, y: 0 } } });

        expect(Math.abs(enemy.x - enemyX)).toBeLessThan(2);
        expect(terrainManager.isPassable(enemy.x, enemy.y)).toBe(true);
        // One tick: the player keeps its own (capped) share plus the enemy's unmet share; its own
        // leftover is dropped (the enemy is not a pusher), so the rest resolves over the next ticks.
        expect(player.x - playerStartX).toBeGreaterThan(overlap * 0.4);
        expect(player.x - playerStartX).toBeGreaterThan(getCrowdPushBudget(player, DT));
    });

    it('a non-pusher next to a wall-pinned unit gets no uncapped pushback', () => {
        const terrainManager = makeGrassManager(8, 4);
        terrainManager.grid.set(1, 2, TerrainType.Rock);
        const enemyX = CELL_SIZE * 2 + 1;
        const y = CELL_SIZE * 2.5;
        const enemy = makeUnit('e', enemyX, y);
        const playerStartX = enemyX + 15;
        const player = makePlayer('p1', playerStartX, y, { speed: 100 });
        resolveOnce([enemy, player], { terrainManager });
        // Neither pushes: the player moves at most its own (resisted) budget.
        expect(player.x - playerStartX).toBeLessThanOrEqual(getCrowdPushBudget(player, DT) + FLOAT_EPS);
    });

    it('players are not anchors: a player and an equal enemy split the overlap', () => {
        const player = makePlayer('a_p1', 0, 0);
        const enemy = makeUnit('b_e', 20, 0);
        resolveOnce([player, enemy]);
        expect(player.x).toBeLessThan(0);
        expect(enemy.x).toBeGreaterThan(20);
        expect(Math.abs(player.x)).toBeCloseTo(enemy.x - 20, 5);
    });

    it('a summon yields fully to its owner', () => {
        const owner = makePlayer('p1', 0, 0);
        const summon = makeUnit('s1', 20, 0, { teamId: 'player', ownerId: 'p1' });
        resolveOnce([owner, summon]);
        expect(owner.x).toBe(0);
        expect(summon.x).toBeGreaterThan(20);
        // Another player's summon does not yield.
        const other = makePlayer('p2', 0, 0);
        const foreign = makeUnit('s2', 20, 0, { teamId: 'player', ownerId: 'p1' });
        resolveOnce([other, foreign]);
        expect(other.x).toBeLessThan(0);
    });

    it('skips braced–braced pairs and reports contacts for the rest', () => {
        const a = makeUnit('a', 0, 0, { tags: [UnitTag.Structure] });
        const b = makeUnit('b', 10, 0, { tags: [UnitTag.Structure] });
        const c = makeUnit('c', 0, 10);
        const contacts = resolveOnce([a, b, c]);
        expect(contacts).toEqual([
            ['a', 'c'],
            ['b', 'c'],
        ]);
        expect(a.x).toBe(0);
        expect(b.x).toBe(10);
    });

    it('is deterministic under shuffled input order', () => {
        const build = (): Unit[] => [
            makePlayer('p1', 0, 0, { speed: 120 }),
            makeUnit('e1', 12, 3, { speed: 60 }),
            makeUnit('e2', 25, -6, { radius: UNIT_SIZE_MAP.Large, speed: 40 }),
            makeUnit('e3', 5, 18, { radius: UNIT_SIZE_MAP.Tiny, speed: 90 }),
            makeUnit('s1', -10, 8, { teamId: 'player', ownerId: 'p1', speed: 70 }),
            makeUnit('b1', 30, 20, { radius: UNIT_SIZE_MAP.Giant, speed: 30, tags: [UnitTag.Boss] }),
        ];
        const moved = { p1: { x: 2, y: 0 }, e3: { x: 0, y: -1.5 } };
        const ordered = build();
        resolveOnce(ordered, { moved });
        const shuffled = build();
        const order = [3, 0, 5, 1, 4, 2].map((i) => shuffled[i]!);
        resolveOnce(order, { moved });
        const pos = (units: Unit[]) =>
            [...units].sort((a, b) => (a.id < b.id ? -1 : 1)).map((u) => [u.id, u.x, u.y]);
        expect(pos(shuffled)).toEqual(pos(ordered));
        // Something actually moved.
        expect(ordered[0]!.x).not.toBe(0);
    });
});
