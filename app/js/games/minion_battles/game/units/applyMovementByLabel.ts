/**
 * Apply `ActiveAbility.movementByLabel` entries onto a unit's movement path.
 *
 * Non-lunge abilities apply at select-interval entry (stored path as-is).
 * Lunge abilities defer until cooldown entry and repath from the post-lunge cell
 * so a destination chosen during deferred targeting stays valid after the slide.
 *
 * Pre-cast walk (order movePath) is preserved via `Unit.walkIntent` across any
 * `invalidateMovementPath` (lunge / dash / knockback) — not via this module.
 */

import type { EngineContext } from '../EngineContext';
import type { Unit } from './Unit';
import { buildPlayerMovePathThroughWaypoints } from '../../terrain/playerMovePath';

export type MovementByLabelEntry = {
    movePath: { col: number; row: number }[];
    moveTargetUnitId?: string;
    moveTargetPixel?: { x: number; y: number };
};

/** ActiveAbility fields used when flushing ITS movementByLabel. */
export type MovementByLabelActive = {
    movementByLabel?: Record<string, MovementByLabelEntry>;
};

/** Last grid cell of a stored re-input path (the intended destination). */
export function movementByLabelDestination(
    mov: MovementByLabelEntry,
): { col: number; row: number } | null {
    if (mov.movePath.length === 0) return null;
    const last = mov.movePath[mov.movePath.length - 1]!;
    return { col: last.col, row: last.row };
}

/**
 * Set unit movement from a stored re-input.
 * When `repathFromCurrent`, rebuild the path from the unit's current cell to the
 * stored destination (and keep moveTargetPixel / moveTargetUnitId).
 */
export function applyMovementByLabelEntry(
    unit: Unit,
    mov: MovementByLabelEntry,
    engine: EngineContext,
    opts: { repathFromCurrent: boolean },
): void {
    if (mov.movePath.length === 0) return;

    if (!opts.repathFromCurrent || !engine.terrainManager) {
        unit.setMovement(mov.movePath, mov.moveTargetUnitId, engine.gameTick, mov.moveTargetPixel);
        return;
    }

    const dest = movementByLabelDestination(mov);
    if (!dest) return;

    const from = engine.terrainManager.grid.worldToGrid(unit.x, unit.y);
    if (from.col === dest.col && from.row === dest.row) {
        if (mov.moveTargetPixel) {
            unit.setMovement(
                [{ col: dest.col, row: dest.row }],
                mov.moveTargetUnitId,
                engine.gameTick,
                mov.moveTargetPixel,
            );
        } else {
            unit.clearMovement();
        }
        return;
    }

    const repath = buildPlayerMovePathThroughWaypoints(
        engine.terrainManager,
        from.col,
        from.row,
        [dest],
    );
    if (repath == null) {
        // Unreachable from post-lunge pose — keep the stored path as a last resort.
        unit.setMovement(mov.movePath, mov.moveTargetUnitId, engine.gameTick, mov.moveTargetPixel);
        return;
    }
    if (repath.length === 0) {
        unit.clearMovement();
        return;
    }
    unit.setMovement(repath, mov.moveTargetUnitId, engine.gameTick, mov.moveTargetPixel);
}

/** Apply every remaining movementByLabel entry (repath when requested), then clear the map. */
export function flushMovementByLabel(
    unit: Unit,
    active: MovementByLabelActive,
    engine: EngineContext,
    opts: { repathFromCurrent: boolean },
): void {
    const map = active.movementByLabel;
    if (!map) return;
    for (const label of Object.keys(map)) {
        const mov = map[label];
        if (!mov || mov.movePath.length === 0) continue;
        applyMovementByLabelEntry(unit, mov, engine, opts);
    }
    active.movementByLabel = undefined;
}
