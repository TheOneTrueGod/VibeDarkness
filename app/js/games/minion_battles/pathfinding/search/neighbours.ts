/**
 * neighbours - Shared direction tables and cost calculation for pathfinding.
 *
 * Exports the four direction tables (used by both aStar and GoalField for
 * deterministic tie-breaking) and the diagonal cost factor.
 */

/**
 * Neighbour order. Side 1 is the point reflection of side 0 (both offsets negated) and also pops
 * equal heap keys in the opposite index order, so every cost tie resolves the opposite way and two
 * units with different sides pass a symmetric obstacle on opposite sides.
 */
export const DIR_X_SIDE0 = [-1, 0, 1, -1, 1, -1, 0, 1];
export const DIR_Y_SIDE0 = [-1, -1, -1, 0, 0, 1, 1, 1];
export const DIR_X_SIDE1 = [1, 0, -1, 1, -1, 1, 0, -1];
export const DIR_Y_SIDE1 = [1, 1, 1, 0, 0, -1, -1, -1];

/** Diagonal move cost multiplier (14/10 ≈ 1.4). */
export const DIAGONAL_COST_FACTOR = 1.4;

/**
 * Compute the cost of stepping into a cell with the given step cost.
 *
 * @param cellCost The cell's step cost (integer, cardinal direction).
 * @param diagonal True if moving diagonally (else cardinal).
 * @returns The move cost (rounded, for diagonal moves).
 */
export function stepMoveCost(cellCost: number, diagonal: boolean): number {
    return diagonal ? Math.round(cellCost * DIAGONAL_COST_FACTOR) : cellCost;
}
