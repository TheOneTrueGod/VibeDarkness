/**
 * Symmetric placement helpers for mission authoring: write one quadrant, get the mirrored set.
 */

type GridCell = { col: number; row: number };

/**
 * Each item mirrored into all four quadrants around `centre` (fractions allowed: a centre of 21.5
 * mirrors cell 21 onto cell 22). Items on an axis are not duplicated. Order: the items as given,
 * then their east, south and south-east mirrors.
 */
export function mirrorFourWays<T extends GridCell>(items: readonly T[], centre: GridCell): T[] {
    const flips: ReadonlyArray<readonly [boolean, boolean]> = [[false, false], [true, false], [false, true], [true, true]];
    const seen = new Set<string>();
    const out: T[] = [];
    for (const [flipCol, flipRow] of flips) {
        for (const item of items) {
            const col = flipCol ? 2 * centre.col - item.col : item.col;
            const row = flipRow ? 2 * centre.row - item.row : item.row;
            const key = `${col}:${row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ ...item, col, row });
        }
    }
    return out;
}
