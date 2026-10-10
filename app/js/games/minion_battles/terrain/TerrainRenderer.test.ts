/**
 * The cached terrain sprite must repaint tiles whose effective terrain changes without a
 * `terrain_stone_damaged` event, e.g. rock raised by `createOrMarkRock` (Rock Slide landing,
 * Stone Tomb) or rock removed by a checkpoint restore.
 */
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

import { TerrainRenderer } from './TerrainRenderer';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainManager } from './TerrainManager';
import { TerrainType } from './TerrainType';
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
