/**
 * The cached terrain sprite must repaint tiles whose effective terrain changes without a
 * `terrain_stone_damaged` event, e.g. rock raised by `createOrMarkRock` (Rock Slide landing,
 * Stone Tomb) or rock removed by a checkpoint restore.
 */
import { GRAVEL_CHIP_COLORS } from './gravelSpeckle';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

const textureUpdate = vi.fn();

vi.mock('pixi.js', () => {
    class Sprite {
        x = 0;
        y = 0;
        label = '';
        texture: unknown;
        constructor(texture: unknown) {
            this.texture = texture;
        }
        destroy(): void {}
    }
    return {
        Sprite,
        Texture: {
            from: () => ({ source: { update: textureUpdate }, destroy: () => {} }),
        },
    };
});

import { LAYER_ORDER, TerrainRenderer } from './TerrainRenderer';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainManager } from './TerrainManager';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { BRICK_MORTAR_COLOR, HardEdgeLayerRenderer, ROCK_BORDER_COLOR } from './HardEdgeLayerRenderer';
import { TerrainLayerManager } from '../game/TerrainLayerManager';

/** A 2D context whose every method is a no-op (image data calls return a zeroed buffer). */
function makeFakeContext(): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        measureText: () => ({ width: 0 }),
    };
    return new Proxy(target, {
        get: (t, prop: string) => (prop in t ? t[prop] : () => {}),
        set: (t, prop: string, value) => {
            t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
    vi.stubGlobal('document', {
        createElement: () => ({ width: 0, height: 0, getContext: () => makeFakeContext() }),
    });
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function makeTerrainManager(): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(8, 6, CELL_SIZE, TerrainType.Grass);
    const tm = new TerrainManager(grid);
    tm.setTerrainLayers(new TerrainLayerManager());
    return tm;
}

function repaintedCells(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map((args) => `${args[2]},${args[3]}`);
}

describe('TerrainRenderer change detection', () => {
    it('repaints a tile raised to rock by createOrMarkRock, which emits no stone-damaged event', () => {
        const tm = makeTerrainManager();
        const renderer = new TerrainRenderer();
        renderer.buildSprite(tm);
        const repaint = vi.spyOn(renderer as unknown as { repaintCell: () => void }, 'repaintCell');

        renderer.update(tm);
        expect(repaint).not.toHaveBeenCalled();

        tm.createOrMarkRock(3, 2);
        textureUpdate.mockClear();
        renderer.update(tm);

        expect(repaintedCells(repaint)).toContain('3,2');
        expect(textureUpdate).toHaveBeenCalled();

        // Nothing changed since: no further repaint.
        repaint.mockClear();
        renderer.update(tm);
        expect(repaint).not.toHaveBeenCalled();
    });

    it('repaints a tile whose rock is removed, e.g. by destroyRock or a restore', () => {
        const tm = makeTerrainManager();
        tm.createOrMarkRock(4, 4);
        const renderer = new TerrainRenderer();
        renderer.buildSprite(tm);
        const repaint = vi.spyOn(renderer as unknown as { repaintCell: () => void }, 'repaintCell');

        tm.destroyRock(4, 4);
        renderer.update(tm);

        expect(repaintedCells(repaint)).toContain('4,4');
    });

    it('rescans when given a different TerrainManager (engine rebuilt from a checkpoint)', () => {
        const tm = makeTerrainManager();
        const renderer = new TerrainRenderer();
        renderer.buildSprite(tm);
        const repaint = vi.spyOn(renderer as unknown as { repaintCell: () => void }, 'repaintCell');

        const restored = makeTerrainManager();
        restored.createOrMarkRock(1, 1);
        // Same epoch value as the original manager would have after one change; identity still differs.
        renderer.update(restored);

        expect(repaintedCells(repaint)).toContain('1,1');
    });
});

/** One stroked path: its style and the line segments it drew. */
interface StrokeRecord {
    style: string;
    segments: Array<[number, number, number, number]>;
}

/** A 2D context that records stroked segments and fill styles; everything else is a no-op. */
function makeRecordingContext(): { ctx: CanvasRenderingContext2D; strokes: StrokeRecord[]; fills: string[] } {
    const strokes: StrokeRecord[] = [];
    const fills: string[] = [];
    let path: Array<[number, number, number, number]> = [];
    let pen: [number, number] = [0, 0];
    const target: Record<string, unknown> = {
        strokeStyle: '',
        fillStyle: '',
        beginPath: () => {
            path = [];
        },
        moveTo: (x: number, y: number) => {
            pen = [x, y];
        },
        lineTo: (x: number, y: number) => {
            path.push([pen[0], pen[1], x, y]);
            pen = [x, y];
        },
        stroke: () => {
            strokes.push({ style: String(target.strokeStyle), segments: path });
        },
        fill: () => fills.push(String(target.fillStyle)),
        fillRect: () => fills.push(String(target.fillStyle)),
    };
    const ctx = new Proxy(target, {
        get: (t, prop: string) => (prop in t ? t[prop] : () => {}),
        set: (t, prop: string, value) => {
            t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, strokes, fills };
}

/** Grass map with the given cells set; out of bounds reads as Grass. */
function typeMap(cells: Array<[number, number, TerrainType]>): (c: number, r: number) => TerrainType {
    const map = new Map(cells.map(([c, r, t]) => [`${c},${r}`, t]));
    return (c, r) => map.get(`${c},${r}`) ?? TerrainType.Grass;
}

/** True when a segment runs along the vertical line x (within half a pixel). */
function isVerticalAt(seg: [number, number, number, number], x: number): boolean {
    return Math.abs(seg[0] - x) <= 0.5 && Math.abs(seg[2] - x) <= 0.5 && seg[1] !== seg[3];
}

/** Mortar joints (vertical mortar segments) whose course starts at pixel row `top`. */
function jointsAt(strokes: StrokeRecord[], top: number): number[] {
    return strokes
        .filter((s) => s.style === BRICK_MORTAR_COLOR)
        .flatMap((s) => s.segments)
        .filter((seg) => seg[0] === seg[2] && Math.min(seg[1], seg[3]) === top)
        .map((seg) => seg[0]);
}

describe('Gravel rendering', () => {
    const cs = CELL_SIZE;

    it('fills Gravel in its own colour and draws speckle chips; Rock has none', () => {
        const getTypeAt = typeMap([[1, 1, TerrainType.Gravel], [3, 1, TerrainType.Rock]]);

        const gravel = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Gravel).drawCell(gravel.ctx, cs, cs, cs, 1, 1, getTypeAt);
        expect(gravel.fills).toContain(TERRAIN_PROPERTIES[TerrainType.Gravel].color);
        expect(gravel.fills.filter((f) => GRAVEL_CHIP_COLORS.includes(f)).length).toBeGreaterThanOrEqual(5);

        const rock = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(rock.ctx, 3 * cs, cs, cs, 3, 1, getTypeAt);
        expect(rock.fills.some((f) => GRAVEL_CHIP_COLORS.includes(f))).toBe(false);
    });
});

describe('Brick rendering', () => {
    const cs = CELL_SIZE;

    it('draws Brick straight after Rock', () => {
        expect(LAYER_ORDER.indexOf(TerrainType.Brick)).toBe(LAYER_ORDER.indexOf(TerrainType.Rock) + 1);
    });

    it('fills Brick in its own colour and adds running-bond mortar; Rock has none', () => {
        const getTypeAt = typeMap([[1, 1, TerrainType.Brick], [3, 1, TerrainType.Rock]]);

        const brick = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Brick).drawCell(brick.ctx, cs, cs, cs, 1, 1, getTypeAt);
        expect(brick.fills).toContain(TERRAIN_PROPERTIES[TerrainType.Brick].color);
        const mortar = brick.strokes.filter((s) => s.style === BRICK_MORTAR_COLOR);
        expect(mortar).toHaveLength(1);
        // One course line per third of the cell.
        expect(mortar[0].segments.filter((seg) => seg[1] === seg[3])).toHaveLength(3);
        // Alternate courses offset their joints by half a brick.
        const course = (k: number) => jointsAt(brick.strokes, Math.round(cs + (k * cs) / 3));
        expect(course(0).length).toBeGreaterThan(0);
        expect(course(1).length).toBeGreaterThan(0);
        expect(course(0)).not.toEqual(course(1));
        expect(course(0)).toEqual(course(2));

        const rock = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(rock.ctx, 3 * cs, cs, cs, 3, 1, getTypeAt);
        expect(rock.strokes.some((s) => s.style === BRICK_MORTAR_COLOR)).toBe(false);
    });

    it('keeps the half-brick offset alternating across a cell boundary', () => {
        const getTypeAt = typeMap([[0, 0, TerrainType.Brick], [0, 1, TerrainType.Brick]]);
        const renderer = new HardEdgeLayerRenderer(TerrainType.Brick);
        const top = makeRecordingContext();
        renderer.drawCell(top.ctx, 0, 0, cs, 0, 0, getTypeAt);
        const below = makeRecordingContext();
        renderer.drawCell(below.ctx, 0, cs, cs, 0, 1, getTypeAt);
        // 3 courses per cell: row 0's last course and row 1's first course are offset from each other.
        expect(jointsAt(top.strokes, Math.round((2 * cs) / 3))).not.toEqual(jointsAt(below.strokes, cs));
    });

    it('draws no seam border between Brick and Rock, from either side', () => {
        const getTypeAt = typeMap([[1, 1, TerrainType.Brick], [2, 1, TerrainType.Rock]]);
        const seamX = 2 * cs;

        const brick = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Brick).drawCell(brick.ctx, cs, cs, cs, 1, 1, getTypeAt);
        const brickBorders = brick.strokes.filter((s) => s.style === ROCK_BORDER_COLOR).flatMap((s) => s.segments);
        expect(brickBorders.length).toBeGreaterThan(0);
        expect(brickBorders.some((seg) => isVerticalAt(seg, seamX - 0.5))).toBe(false);

        const rock = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(rock.ctx, seamX, cs, cs, 2, 1, getTypeAt);
        const rockBorders = rock.strokes.filter((s) => s.style === ROCK_BORDER_COLOR).flatMap((s) => s.segments);
        expect(rockBorders.length).toBeGreaterThan(0);
        expect(rockBorders.some((seg) => isVerticalAt(seg, seamX + 0.5))).toBe(false);
    });

    it('outlines Brick against open ground', () => {
        const getTypeAt = typeMap([[1, 1, TerrainType.Brick]]);
        const brick = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Brick).drawCell(brick.ctx, cs, cs, cs, 1, 1, getTypeAt);
        const borders = brick.strokes.filter((s) => s.style === ROCK_BORDER_COLOR).flatMap((s) => s.segments);
        // The east border sits inside the 2px bleed strip, on the pixel centre.
        expect(borders.some((seg) => isVerticalAt(seg, 2 * cs - 2 - 0.5))).toBe(true);
    });

    it('builds a sprite with a Brick layer for a map with Brick next to Rock and Gravel', () => {
        const grid = TerrainGrid.createFilledTerrain(6, 4, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Brick);
        grid.set(2, 1, TerrainType.Rock);
        grid.set(3, 1, TerrainType.Gravel);
        const tm = new TerrainManager(grid);
        tm.setTerrainLayers(new TerrainLayerManager());
        const draw = vi.spyOn(HardEdgeLayerRenderer.prototype, 'drawLayer');
        new TerrainRenderer().buildSprite(tm);
        const drawnTypes = draw.mock.contexts.map((r) => (r as unknown as { terrainType: TerrainType }).terrainType);
        // Every hard-edge layer draws (Briar too); Brick must come after Gravel and Rock so it sits on top.
        const relevant = [TerrainType.Gravel, TerrainType.Rock, TerrainType.Brick];
        expect(drawnTypes.filter((t) => relevant.includes(t))).toEqual(relevant);
        draw.mockRestore();
    });
});

describe('Hard-edge corner cuts', () => {
    const cs = CELL_SIZE;

    it('fills a rock corner cut with the gravel wrapping it, not the grass diagonal', () => {
        // Rock at (1,1) inside a gravel cross; grass on all four diagonals.
        const getTypeAt = typeMap([
            [1, 0, TerrainType.Gravel],
            [0, 1, TerrainType.Gravel],
            [2, 1, TerrainType.Gravel],
            [1, 2, TerrainType.Gravel],
            [1, 1, TerrainType.Rock],
        ]);
        const rock = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(rock.ctx, cs, cs, cs, 1, 1, getTypeAt);
        expect(rock.fills).not.toContain(TERRAIN_PROPERTIES[TerrainType.Grass].color);
    });

    it('does not fill a rock corner cut with a diagonal rock that cuts the same corner', () => {
        const getTypeAt = typeMap([[1, 1, TerrainType.Rock], [2, 2, TerrainType.Rock]]);
        const rock = makeRecordingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(rock.ctx, cs, cs, cs, 1, 1, getTypeAt);
        const rockColor = TERRAIN_PROPERTIES[TerrainType.Rock].color;
        // Only the base fill, the chamfered core and nothing else is rock-coloured.
        expect(rock.fills.filter((f) => f === rockColor).length).toBe(2);
    });

    it('repaints cells two away when a tile changes, since corner owners read that far', () => {
        const tm = makeTerrainManager();
        const renderer = new TerrainRenderer();
        renderer.buildSprite(tm);
        const repaint = vi.spyOn(renderer as unknown as { repaintCell: () => void }, 'repaintCell');

        tm.createOrMarkRock(3, 2);
        renderer.update(tm);

        expect(repaintedCells(repaint)).toEqual(expect.arrayContaining(['3,0', '1,2', '5,2', '3,4', '1,1', '5,3']));
    });
});

/**
 * A 2D context that records every fill (rects and paths) so tests can ask which colour ends up
 * at a point. Clipping, strokes and alpha are ignored.
 */
function makeSamplingContext(): { ctx: CanvasRenderingContext2D; colourAt: (px: number, py: number) => string } {
    const shapes: Array<{ color: string; poly: Array<[number, number]> }> = [];
    let path: Array<[number, number]> = [];
    const target: Record<string, unknown> = {
        fillStyle: '',
        beginPath: () => {
            path = [];
        },
        moveTo: (x: number, y: number) => path.push([x, y]),
        lineTo: (x: number, y: number) => path.push([x, y]),
        fill: () => shapes.push({ color: String(target.fillStyle), poly: path.slice() }),
        fillRect: (x: number, y: number, w: number, h: number) =>
            shapes.push({ color: String(target.fillStyle), poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] }),
    };
    const ctx = new Proxy(target, {
        get: (t, prop: string) => (prop in t ? t[prop] : () => {}),
        set: (t, prop: string, value) => {
            t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    const inside = (poly: Array<[number, number]>, px: number, py: number): boolean => {
        let hit = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i];
            const [xj, yj] = poly[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
    };
    const colourAt = (px: number, py: number): string => {
        for (let i = shapes.length - 1; i >= 0; i--) if (inside(shapes[i].poly, px, py)) return shapes[i].color;
        return '';
    };
    return { ctx, colourAt };
}

describe('Hard-edge corners between two different neighbours', () => {
    const cs = CELL_SIZE;
    const grass = TERRAIN_PROPERTIES[TerrainType.Grass].color;
    const dirt = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
    // Rock at (2,2): dirt north and east, grass west and south.
    const rows = ['ggggg', 'ddddg', 'dgrdg', 'ddgdg', 'ggggg'];
    const getTypeAt = (c: number, r: number): TerrainType => {
        const ch = rows[r]?.[c];
        return ch === 'd' ? TerrainType.Dirt : ch === 'r' ? TerrainType.Rock : TerrainType.Grass;
    };

    function drawRock(): (px: number, py: number) => string {
        const { ctx, colourAt } = makeSamplingContext();
        new HardEdgeLayerRenderer(TerrainType.Rock).drawCell(ctx, 2 * cs, 2 * cs, cs, 2, 2, getTypeAt);
        return colourAt;
    }

    it('splits a mixed corner cut: each half matches the edge strip it touches', () => {
        const colourAt = drawRock();
        const x = 2 * cs;
        const y = 2 * cs;
        // Top-left cut (inner corner at x+2, y+2): west strip is grass, north strip is dirt.
        expect(colourAt(x + 2.5, y + 4.5)).toBe(grass);
        expect(colourAt(x + 4.5, y + 2.5)).toBe(dirt);
        // Bottom-right cut (inner corner at x+38, y+38): south strip is grass, east strip is dirt.
        expect(colourAt(x + 35.5, y + 37.5)).toBe(grass);
        expect(colourAt(x + 37.5, y + 35.5)).toBe(dirt);
    });

    it('splits the 2px strip corner square along the same diagonal as the cut', () => {
        const colourAt = drawRock();
        const x = 2 * cs;
        const y = 2 * cs;
        // Top-left square: above the diagonal touches the north strip, below it the west strip.
        expect(colourAt(x + 1.2, y + 0.4)).toBe(dirt);
        expect(colourAt(x + 0.4, y + 1.2)).toBe(grass);
        // Bottom-right square: above the diagonal touches the east strip, below it the south strip.
        expect(colourAt(x + cs - 0.8, y + cs - 1.6)).toBe(dirt);
        expect(colourAt(x + cs - 1.6, y + cs - 0.8)).toBe(grass);
    });
});
