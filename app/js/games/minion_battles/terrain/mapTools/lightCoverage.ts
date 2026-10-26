/**
 * lightCoverage - Which cells a set of light spots would fully light.
 *
 * Uses the light grid's own distance rule (`roundedEuclideanDistance` in `game/LightGrid.ts`):
 * a cell is covered when its rounded distance to a light is within `radius`, where the light is
 * flat at full strength. Beyond that it only gets falloff, which does not count as covered.
 * Radii are set per placement by missions; for crystals use the standard
 * `CRYSTAL_DAYLIGHT_RADIUS` (`WorldOfDarkness/MapSegments/50_50_crystal_cave.ts`) unless the
 * brief says otherwise.
 */

import { roundedEuclideanDistance } from '../../game/LightGrid';
import { isPassable } from './edgeOpenings';
import type { GridCell, TerrainArray } from './paintCells';

export interface LightCoverageResult {
    covered: GridCell[];
    uncovered: GridCell[];
}

/**
 * Splits the passable cells of `area` (default: every passable cell) into covered and
 * uncovered by lights at `lights` with `radius` tiles.
 */
export function lightCoverage(
    terrain: TerrainArray,
    lights: readonly GridCell[],
    radius: number,
    area?: Iterable<GridCell>,
): LightCoverageResult {
    const cells: GridCell[] = [];
    if (area) {
        for (const c of area) if (terrain[c.row] && isPassable(terrain[c.row][c.col])) cells.push(c);
    } else {
        terrain.forEach((r, row) => r.forEach((t, col) => isPassable(t) && cells.push({ col, row })));
    }
    const covered: GridCell[] = [];
    const uncovered: GridCell[] = [];
    for (const cell of cells) {
        const lit = lights.some((l) => roundedEuclideanDistance(cell.col, cell.row, l.col, l.row) <= radius);
        (lit ? covered : uncovered).push(cell);
    }
    return { covered, uncovered };
}
