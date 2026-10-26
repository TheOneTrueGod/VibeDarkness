/**
 * ascii - Convert terrain to and from text.
 *
 * - `terrainToAscii` prints a segment (with optional marks such as a route or POIs) to check
 *   a design at a glance.
 * - `terrainFromAscii` turns an ASCII sketch into terrain, so an approved sketch can be the
 *   starting point for painting.
 * - `terrainToTsRows` writes the rows in the segment-file format, ready to paste.
 */

import { TerrainType } from '../TerrainType';
import type { GridCell, TerrainArray } from './paintCells';

/** One character per terrain type. Shared by print and parse so they round-trip. */
export const TERRAIN_ASCII: Record<TerrainType, string> = {
    [TerrainType.Dirt]: '.',
    [TerrainType.Grass]: ',',
    [TerrainType.ThickGrass]: '"',
    [TerrainType.Rock]: '#',
    [TerrainType.Rubble]: '%',
    [TerrainType.Impassable]: ' ',
};

/** Segment-file shorthand consts (`const _ = TerrainType.Grass` etc.), as used across `MapSegments/`. */
export const TERRAIN_TS_SHORTHAND: Partial<Record<TerrainType, string>> = {
    [TerrainType.Dirt]: 'D',
    [TerrainType.Grass]: '_',
    [TerrainType.ThickGrass]: 'T',
    [TerrainType.Rock]: 'R',
};

/** Cells drawn with one character on top of the terrain (later marks win). */
export interface AsciiMark {
    char: string;
    cells: Iterable<GridCell>;
}

export interface AsciiOptions {
    marks?: AsciiMark[];
    /** Prefix each line with its row number (default false). */
    rowNumbers?: boolean;
}

/** Terrain as text, one line per row. */
export function terrainToAscii(terrain: TerrainArray, options: AsciiOptions = {}): string {
    const lines = terrain.map((row) => row.map((type) => TERRAIN_ASCII[type] ?? '?'));
    for (const mark of options.marks ?? []) {
        for (const { col, row } of mark.cells) {
            if (lines[row] && col >= 0 && col < lines[row].length) lines[row][col] = mark.char;
        }
    }
    const pad = String(Math.max(0, terrain.length - 1)).length;
    return lines
        .map((chars, row) => (options.rowNumbers ? `${String(row).padStart(pad)} ` : '') + chars.join(''))
        .join('\n');
}

/**
 * Terrain from text using `TERRAIN_ASCII` (plus `extra` for sketch-only characters, e.g. mark
 * POIs with 'C' and map them to Dirt). Throws on an unknown character or ragged rows.
 */
export function terrainFromAscii(text: string, extra: Record<string, TerrainType> = {}): TerrainArray {
    const lookup = new Map<string, TerrainType>();
    for (const [type, char] of Object.entries(TERRAIN_ASCII)) lookup.set(char, Number(type) as TerrainType);
    for (const [char, type] of Object.entries(extra)) lookup.set(char, type);

    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const width = lines[0]?.length ?? 0;
    return lines.map((line, row) => {
        if (line.length !== width) {
            throw new Error(`terrainFromAscii: row ${row} has ${line.length} columns, expected ${width}`);
        }
        return [...line].map((char, col) => {
            const type = lookup.get(char);
            if (type === undefined) throw new Error(`terrainFromAscii: unknown '${char}' at col ${col}, row ${row}`);
            return type;
        });
    });
}

/** Rows in segment-file format: `    [R, R, D, ...],` per line, using `TERRAIN_TS_SHORTHAND`. */
export function terrainToTsRows(terrain: TerrainArray, indent = '    '): string {
    return terrain
        .map((row) => {
            const cells = row.map((type) => {
                const short = TERRAIN_TS_SHORTHAND[type];
                if (!short) throw new Error(`terrainToTsRows: no shorthand for terrain type ${type}`);
                return short;
            });
            return `${indent}[${cells.join(', ')}],`;
        })
        .join('\n');
}
