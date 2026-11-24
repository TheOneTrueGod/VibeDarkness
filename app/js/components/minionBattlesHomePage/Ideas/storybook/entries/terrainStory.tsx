import { useEffect, useRef } from 'react';
import { CELL_SIZE } from '../../../../../games/minion_battles/terrain/TerrainGrid';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../../../games/minion_battles/terrain/TerrainType';
import { HardEdgeLayerRenderer } from '../../../../../games/minion_battles/terrain/HardEdgeLayerRenderer';
import { MarchingSquaresLayerRenderer } from '../../../../../games/minion_battles/terrain/MarchingSquaresLayerRenderer';
import { LAYER_ORDER } from '../../../../../games/minion_battles/terrain/terrainLayerOrder';
import { controlNumber, controlString, type StorybookEntry } from '../storybookTypes';


const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const B = TerrainType.Brick;
const W = TerrainType.Grass;
const A = TerrainType.Water;
const S = TerrainType.ShallowWater;
const P = TerrainType.DeepWater;

/** Hand-made patches: one big gravel floor with neighbours, and a castle-room strip. */
const LAYOUTS: Record<string, readonly (readonly TerrainType[])[]> = {
    floor: [
        [W, W, W, W, W, W, W, W, W, W, W, W],
        [W, D, D, D, G, G, G, G, G, G, G, W],
        [W, D, D, D, G, G, G, G, G, G, G, W],
        [W, D, D, D, G, G, G, G, G, G, G, W],
        [W, G, G, G, G, G, G, G, R, R, G, W],
        [W, G, G, G, G, G, G, G, R, R, G, W],
        [W, G, G, G, G, G, G, G, G, G, G, W],
        [W, G, G, G, G, G, G, G, G, G, G, W],
        [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
    castle: [
        [B, B, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, D, D, D, D, D, D, D, D, G, B],
        [B, G, D, D, D, D, D, D, D, D, G, B],
        [B, G, G, G, G, G, G, G, R, G, G, B],
        [B, G, G, G, G, G, G, R, R, R, G, B],
        [B, G, G, G, G, G, G, G, R, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    /** Corner cuts (`cornerOwner.ts`): rock in a gravel cross, a rubble chequerboard, diagonal rocks. */
    corners: [
        [W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, G, W, W, G, R, G, W, R, W, W],
        [W, G, R, G, W, R, G, R, W, W, R, W],
        [W, W, G, W, W, G, R, G, W, W, W, R],
        [W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, D, W, W, W, W, W, W, W, W, W],
        [W, G, R, G, W, W, W, W, W, W, W, W],
        [W, W, G, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
    /** Soft corners: shallow tiles off rock corners (no slivers), lone tiles and a one-tile strip (diamonds). */
    water: [
        [P, P, A, A, A, A, D, D, D, D, D, D],
        [P, A, A, S, A, A, D, W, D, D, D, D],
        [A, A, R, A, S, A, D, D, D, D, W, W],
        [A, S, R, R, A, A, D, D, D, D, W, W],
        [A, A, A, A, S, S, D, D, D, D, D, D],
        [A, A, A, A, A, A, W, W, W, W, W, D],
        [W, W, W, W, W, W, D, D, D, D, D, D],
        [W, D, D, W, W, W, W, W, W, W, W, W],
        [W, D, W, D, W, W, W, W, W, W, W, W],
        [W, R, D, W, W, W, W, W, W, W, W, W],
    ],
};

function TerrainPatch({ layout, zoom }: { layout: string; zoom: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const rows = LAYOUTS[layout] ?? LAYOUTS.floor;
    const height = rows.length;
    const width = rows[0].length;

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const getTypeAt = (c: number, r: number): TerrainType => rows[r]?.[c] ?? TerrainType.Rock;
        // Same pipeline as TerrainRenderer.buildSprite: dirt base, then every layer in LAYER_ORDER.
        ctx.fillStyle = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
        ctx.fillRect(0, 0, width * CELL_SIZE, height * CELL_SIZE);
        for (const type of LAYER_ORDER) {
            const renderer =
                TERRAIN_PROPERTIES[type].renderStrategy === 'hard-edge'
                    ? new HardEdgeLayerRenderer(type)
                    : new MarchingSquaresLayerRenderer(type);
            renderer.drawLayer(ctx, getTypeAt, width, height, CELL_SIZE);
        }
    }, [rows, width, height]);

    return (
        <canvas
            ref={ref}
            width={width * CELL_SIZE}
            height={height * CELL_SIZE}
            style={{ width: width * CELL_SIZE * zoom, height: height * CELL_SIZE * zoom, imageRendering: 'pixelated' }}
        />
    );
}

export const TERRAIN_STORY: StorybookEntry = {
    id: 'terrain',
    name: 'Terrain',
    description: 'Terrain patches drawn by the real terrain layer renderers (soft and hard-edge), in LAYER_ORDER.',
    controls: [
        {
            kind: 'select',
            id: 'layout',
            label: 'Layout',
            options: [
                { value: 'floor', label: 'Open floor' },
                { value: 'castle', label: 'Castle room' },
                { value: 'corners', label: 'Corner cuts' },
                { value: 'water', label: 'Soft corners & lone tiles' },
            ],
            defaultValue: 'floor',
        },
        { kind: 'range', id: 'zoom', label: 'Zoom', min: 1, max: 3, step: 0.5, defaultValue: 2 },
    ],
    render: (values) => <TerrainPatch layout={controlString(values, 'layout')} zoom={controlNumber(values, 'zoom')} />,
};
