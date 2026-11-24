import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CELL_SIZE } from '../../../../../games/minion_battles/terrain/TerrainGrid';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../../../games/minion_battles/terrain/TerrainType';
import { HardEdgeLayerRenderer } from '../../../../../games/minion_battles/terrain/HardEdgeLayerRenderer';
import { MarchingSquaresLayerRenderer } from '../../../../../games/minion_battles/terrain/MarchingSquaresLayerRenderer';
import { LAYER_ORDER } from '../../../../../games/minion_battles/terrain/terrainLayerOrder';
import { controlNumber, controlString, type StorybookEntry, type StorybookSetValue } from '../storybookTypes';

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

/** Terrain types the paint palette offers: every type the renderer draws, in draw order. */
const BRUSHES: readonly TerrainType[] = LAYER_ORDER;
const DEFAULT_BRUSH = TerrainType.Gravel;

/** One letter per terrain for the copied text grid. */
const COPY_LETTERS: Partial<Record<TerrainType, string>> = {
    [TerrainType.Grass]: 'g',
    [TerrainType.ThickGrass]: 't',
    [TerrainType.Tangle]: 'n',
    [TerrainType.Dirt]: 'd',
    [TerrainType.ShallowWater]: 's',
    [TerrainType.Water]: 'w',
    [TerrainType.DeepWater]: 'D',
    [TerrainType.Gravel]: 'v',
    [TerrainType.Rock]: 'r',
    [TerrainType.Brick]: 'b',
    [TerrainType.Briar]: 'x',
    [TerrainType.Impassable]: '#',
};

/**
 * Painted grid as a URL value: `<layout>~<rows>`, each row one base-36 digit per cell (the `TerrainType`
 * number, which never changes), rows joined by `.`. Tied to its layout so switching layout shows the
 * layout fresh.
 */
export function encodeTerrainPaint(layout: string, rows: readonly (readonly TerrainType[])[]): string {
    return `${layout}~${rows.map((row) => row.map((t) => t.toString(36)).join('')).join('.')}`;
}

/** The painted grid stored for `layout`, or null when there is none (or it does not parse). */
export function decodeTerrainPaint(value: string, layout: string): TerrainType[][] | null {
    const prefix = `${layout}~`;
    if (!value.startsWith(prefix)) return null;
    const rows = value
        .slice(prefix.length)
        .split('.')
        .map((line) => [...line].map((ch) => parseInt(ch, 36) as TerrainType));
    const width = rows[0]?.length ?? 0;
    const valid =
        width > 0 &&
        rows.every((row) => row.length === width && row.every((t) => TERRAIN_PROPERTIES[t] !== undefined));
    return valid ? rows : null;
}

/**
 * The layout as pasteable text for a debugging chat: a fenced letter grid (row 0 at the top), a legend of the
 * letters used, and the Storybook link that reopens it.
 */
export function formatTerrainLayoutForCopy(
    layout: string,
    rows: readonly (readonly TerrainType[])[],
    edited: boolean,
    url: string,
): string {
    const letter = (t: TerrainType): string => COPY_LETTERS[t] ?? '?';
    const used = [...new Set(rows.flat())].sort((a, b) => a - b);
    const legend = used.map((t) => `${letter(t)} = ${TERRAIN_PROPERTIES[t].name}`).join(', ');
    return [
        `Terrain layout "${layout}"${edited ? ' (edited)' : ''}, ${rows[0]?.length ?? 0}x${rows.length} cells, row 0 at the top:`,
        '```',
        ...rows.map((row) => row.map(letter).join('')),
        '```',
        `Legend: ${legend}`,
        `Storybook: ${url}`,
    ].join('\n');
}

/** Copy `text`, falling back to a hidden textarea where the async clipboard API is refused. */
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    }
}

interface TerrainPatchProps {
    layout: string;
    zoom: number;
    paint: string;
    brush: TerrainType;
    setValue: StorybookSetValue;
}

const BUTTON_CLASS =
    'rounded border border-border-custom px-2.5 py-1 text-xs text-gray-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent';

function TerrainPatch({ layout, zoom, paint, brush, setValue }: TerrainPatchProps) {
    const ref = useRef<HTMLCanvasElement>(null);
    const painting = useRef(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const painted = useMemo(() => decodeTerrainPaint(paint, layout), [paint, layout]);
    const rows = useMemo(
        () => painted ?? (LAYOUTS[layout] ?? LAYOUTS.floor).map((row) => [...row]),
        [painted, layout],
    );
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

    useEffect(() => {
        if (copyStatus === 'idle') return;
        const timer = window.setTimeout(() => setCopyStatus('idle'), 2000);
        return () => window.clearTimeout(timer);
    }, [copyStatus]);

    const paintAt = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
        const rect = e.currentTarget.getBoundingClientRect();
        const col = Math.floor(((e.clientX - rect.left) / rect.width) * width);
        const row = Math.floor(((e.clientY - rect.top) / rect.height) * height);
        if (col < 0 || row < 0 || col >= width || row >= height || rows[row][col] === brush) return;
        const next = rows.map((r) => [...r]);
        next[row][col] = brush;
        setValue('paint', encodeTerrainPaint(layout, next));
    };

    const copyLayout = async (): Promise<void> => {
        const ok = await copyText(formatTerrainLayoutForCopy(layout, rows, painted !== null, window.location.href));
        setCopyStatus(ok ? 'copied' : 'failed');
    };

    const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy layout';

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Terrain to paint">
                {BRUSHES.map((type) => (
                    <button
                        key={type}
                        type="button"
                        aria-pressed={type === brush}
                        onClick={() => setValue('brush', String(type))}
                        className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                            type === brush
                                ? 'border-primary bg-primary/20 text-white'
                                : 'border-border-custom text-gray-200 hover:bg-white/10'
                        }`}
                    >
                        <span
                            className="h-4 w-4 shrink-0 rounded border border-border-custom"
                            style={{ background: TERRAIN_PROPERTIES[type].color }}
                        />
                        {TERRAIN_PROPERTIES[type].name}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Click or drag on the patch to paint.</span>
                <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => setValue('paint', encodeTerrainPaint(layout, rows.map((r) => r.map(() => brush))))}
                >
                    Fill with {TERRAIN_PROPERTIES[brush].name}
                </button>
                <button type="button" className={BUTTON_CLASS} disabled={painted === null} onClick={() => setValue('paint', '')}>
                    Reset layout
                </button>
                <button type="button" className={BUTTON_CLASS} onClick={() => void copyLayout()} aria-live="polite">
                    {copyLabel}
                </button>
            </div>
            <div className="overflow-auto">
                <canvas
                    ref={ref}
                    width={width * CELL_SIZE}
                    height={height * CELL_SIZE}
                    className="cursor-crosshair"
                    style={{
                        width: width * CELL_SIZE * zoom,
                        height: height * CELL_SIZE * zoom,
                        imageRendering: 'pixelated',
                        touchAction: 'none',
                    }}
                    onPointerDown={(e) => {
                        painting.current = true;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        paintAt(e);
                    }}
                    onPointerMove={(e) => {
                        if (painting.current) paintAt(e);
                    }}
                    onPointerUp={() => {
                        painting.current = false;
                    }}
                    onPointerCancel={() => {
                        painting.current = false;
                    }}
                />
            </div>
        </div>
    );
}

function brushFromValue(value: string): TerrainType {
    const type = Number(value) as TerrainType;
    return BRUSHES.includes(type) ? type : DEFAULT_BRUSH;
}

export const TERRAIN_STORY: StorybookEntry = {
    id: 'terrain',
    name: 'Terrain',
    description:
        'Terrain patches drawn by the real terrain layer renderers (soft and hard-edge), in LAYER_ORDER. Paint on a patch to try other combinations; Copy layout gives text to paste into a bug report.',
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
        { kind: 'range', id: 'zoom', label: 'Zoom', min: 0.5, max: 3, step: 0.5, defaultValue: 1 },
        /** Painted grid (`encodeTerrainPaint`); empty shows the layout as authored. */
        { kind: 'state', id: 'paint', defaultValue: '' },
        /** Selected palette terrain, as its `TerrainType` number. */
        { kind: 'state', id: 'brush', defaultValue: String(DEFAULT_BRUSH) },
    ],
    render: (values, setValue) => (
        <TerrainPatch
            layout={controlString(values, 'layout')}
            zoom={controlNumber(values, 'zoom')}
            paint={controlString(values, 'paint')}
            brush={brushFromValue(controlString(values, 'brush'))}
            setValue={setValue}
        />
    ),
};
