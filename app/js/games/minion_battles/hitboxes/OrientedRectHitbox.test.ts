import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { HitboxEngineContext } from './Hitbox';
import {
    cellsInOrientedRect,
    orientedRectAt,
    orientedRectAtPointHitbox,
    pointInOrientedRect,
    type OrientedRect,
} from './OrientedRectHitbox';

const RADIUS = 10;
const LENGTH = 160;
const WIDTH = 120;
const MAX_RANGE = 140;

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy' = 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: 'test',
        name: id,
        radius: RADIUS,
    });
}

function engineOf(units: Unit[]): HitboxEngineContext {
    return { units, getUnit: (id) => units.find((u) => u.id === id), gameTime: 0 };
}

/** World point at (`along`, `across`) in the rectangle's frame. */
function local(rect: OrientedRect, along: number, across: number): { x: number; y: number } {
    return {
        x: rect.centerX + rect.dirX * along - rect.dirY * across,
        y: rect.centerY + rect.dirY * along + rect.dirX * across,
    };
}

describe('OrientedRectHitboxSpec', () => {
    const hitbox = orientedRectAtPointHitbox({ length: LENGTH, width: WIDTH, maxRange: MAX_RANGE });

    it('exposes its config; hits everything inside by default', () => {
        expect(hitbox.maxRange).toBe(MAX_RANGE);
        expect(hitbox.length).toBe(LENGTH);
        expect(hitbox.width).toBe(WIDTH);
        expect(hitbox.numTargets).toBe(99);
    });

    describe('aim clamp', () => {
        it('clamps the centre to maxRange along caster -> aim', () => {
            const rect = hitbox.getRect({ x: 100, y: 100 }, { x: 100 + 500, y: 100 });
            expect(rect.centerX).toBeCloseTo(100 + MAX_RANGE);
            expect(rect.centerY).toBeCloseTo(100);
            expect(rect.dirX).toBeCloseTo(1);
            expect(rect.dirY).toBeCloseTo(0);
        });

        it('keeps an aim inside maxRange as the centre', () => {
            const rect = hitbox.getRect({ x: 0, y: 0 }, { x: 30, y: 40 });
            expect(rect.centerX).toBeCloseTo(30);
            expect(rect.centerY).toBeCloseTo(40);
            expect(rect.dirX).toBeCloseTo(0.6);
            expect(rect.dirY).toBeCloseTo(0.8);
        });

        it('a far aim hits around the clamped centre, not the click', () => {
            const caster = makeUnit('caster', 0, 0, 'player');
            const atClamp = makeUnit('atClamp', MAX_RANGE, 0);
            const atClick = makeUnit('atClick', 400, 0);
            const hits = hitbox.resolveHits(engineOf([caster, atClamp, atClick]), caster, 400, 0);
            expect(hits.map((u) => u.id)).toEqual(['atClamp']);
        });
    });

    describe('rotated rectangle', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        // Aim at 45 degrees, beyond range: centre at 140 px along the diagonal.
        const aim = { x: 300, y: 300 };
        const rect = hitbox.getRect(caster, aim);

        it('is aimed along caster -> aim', () => {
            expect(rect.dirX).toBeCloseTo(Math.SQRT1_2);
            expect(rect.dirY).toBeCloseTo(Math.SQRT1_2);
            expect(Math.hypot(rect.centerX, rect.centerY)).toBeCloseTo(MAX_RANGE);
        });

        it('includes units whose body overlaps it and excludes the rest', () => {
            const at = (id: string, along: number, across: number, team?: 'player' | 'enemy') => {
                const p = local(rect, along, across);
                return makeUnit(id, p.x, p.y, team);
            };
            const units = [
                caster,
                at('centre', 0, 0),
                at('nearFrontEdge', 75, 0),
                // Centre outside the far edge, body still over it.
                at('bodyOverFront', 80 + RADIUS - 2, 0),
                at('bodyOverSide', 0, -(60 + RADIUS - 2)),
                at('pastFront', 80 + RADIUS + 2, 0),
                at('pastSide', 0, 60 + RADIUS + 2),
                // Inside the axis-aligned bounds of the rotated rectangle, but outside it.
                at('pastCorner', 80 + 8, 60 + 8),
                at('ally', 10, 10, 'player'),
            ];
            const hitIds = hitbox.resolveHits(engineOf(units), caster, aim.x, aim.y).map((u) => u.id);
            expect(hitIds.sort()).toEqual(['bodyOverFront', 'bodyOverSide', 'centre', 'nearFrontEdge']);
            // resolveTargets has no team filter (callers filter) but always drops the caster.
            const targetIds = hitbox.resolveTargets(caster, aim, units).map((u) => u.id);
            expect(targetIds.sort()).toEqual(['ally', 'bodyOverFront', 'bodyOverSide', 'centre', 'nearFrontEdge']);
        });

        it('sorts hits nearest the centre first', () => {
            const far = local(rect, 60, 0);
            const near = local(rect, 5, 0);
            const units = [caster, makeUnit('far', far.x, far.y), makeUnit('near', near.x, near.y)];
            expect(hitbox.resolveHits(engineOf(units), caster, aim.x, aim.y).map((u) => u.id)).toEqual(['near', 'far']);
        });

        it('cells are exactly the tiles whose centre lies inside it', () => {
            const cells = hitbox.resolveCells(caster, aim);
            expect(cells.length).toBeGreaterThan(0);
            // Brute-force check over a wide area around the rectangle.
            const expected: string[] = [];
            for (let row = -5; row <= 10; row++) {
                for (let col = -5; col <= 10; col++) {
                    const cx = (col + 0.5) * CELL_SIZE;
                    const cy = (row + 0.5) * CELL_SIZE;
                    const { x: lx, y: ly } = { x: cx - rect.centerX, y: cy - rect.centerY };
                    const along = lx * rect.dirX + ly * rect.dirY;
                    const across = -lx * rect.dirY + ly * rect.dirX;
                    if (Math.abs(along) <= LENGTH / 2 && Math.abs(across) <= WIDTH / 2) expected.push(`${col},${row}`);
                }
            }
            expect(cells.map((c) => `${c.col},${c.row}`)).toEqual(expected);
            for (const c of cells) {
                expect(pointInOrientedRect(rect, (c.col + 0.5) * CELL_SIZE, (c.row + 0.5) * CELL_SIZE)).toBe(true);
            }
        });
    });

    it('cells follow the rotation (length runs along the aim)', () => {
        // Aim straight up: length 160 vertical (y 390..550), width 100 horizontal (x 150..250).
        const narrow = orientedRectAtPointHitbox({ length: 160, width: 100, maxRange: 140 });
        const cells = narrow.resolveCells({ x: 200, y: 610 }, { x: 200, y: 0 });
        expect(cells).toEqual([
            { col: 4, row: 10 }, { col: 5, row: 10 },
            { col: 4, row: 11 }, { col: 5, row: 11 },
            { col: 4, row: 12 }, { col: 5, row: 12 },
            { col: 4, row: 13 }, { col: 5, row: 13 },
        ]);
        // The same rectangle aimed sideways covers 4 columns by 2 rows instead.
        const sideways = cellsInOrientedRect(orientedRectAt({ x: 60, y: 480 }, { x: 900, y: 480 }, 160, 100, 140));
        expect(new Set(sideways.map((c) => c.col)).size).toBe(4);
        expect(new Set(sideways.map((c) => c.row)).size).toBe(2);
        expect(sideways).toHaveLength(8);
    });

    describe('zero-length aim', () => {
        it("falls back to the caster's facing, centred on the caster", () => {
            const rect = hitbox.getRect({ x: 50, y: 50, facing: Math.PI / 2 }, { x: 50, y: 50 });
            expect(rect.centerX).toBeCloseTo(50);
            expect(rect.centerY).toBeCloseTo(50);
            expect(rect.dirX).toBeCloseTo(0);
            expect(rect.dirY).toBeCloseTo(1);
            // Length runs down the screen: (50, 50 + 75) is inside, (50 + 75, 50) is not.
            expect(pointInOrientedRect(rect, 50, 125)).toBe(true);
            expect(pointInOrientedRect(rect, 125, 50)).toBe(false);
        });

        it('faces +x when the caster has no facing', () => {
            const caster = makeUnit('caster', 0, 0, 'player');
            const rect = hitbox.getRect(caster, { x: 0, y: 0 });
            expect(rect.dirX).toBe(1);
            expect(rect.dirY).toBe(0);
            const alongLength = makeUnit('alongLength', 75, 0);
            const acrossWidth = makeUnit('acrossWidth', 0, 75);
            const hits = hitbox.resolveHits(engineOf([caster, alongLength, acrossWidth]), caster, 0, 0);
            expect(hits.map((u) => u.id)).toEqual(['alongLength']);
        });
    });

    it('draws the telegraph and returns the highlighted units', () => {
        const calls: string[] = [];
        const gr = new Proxy({}, {
            get: (_t, prop) => (...args: unknown[]) => {
                calls.push(String(prop));
                return args;
            },
        }) as never;
        const inside = makeUnit('inside', 100, 0);
        const highlighted = hitbox.renderTargetingPreview(gr, { x: 0, y: 0 }, { x: 100, y: 0 }, [inside]);
        expect(highlighted.map((u) => u.id)).toEqual(['inside']);
        expect(calls).toContain('fill');
        expect(calls).not.toContain('clear');
        calls.length = 0;
        hitbox.renderInvalidPreview(gr, { x: 0, y: 0 }, { x: 100, y: 0 });
        expect(calls).toContain('fill');
        expect(calls).not.toContain('clear');
    });
});
