import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { findNearestPassableCell } from '../forceMove';
import {
    applySlingshotLaunch,
    computeSlingshotDirection,
    CONTROLLED_SLINGSHOT_AIR_TIME,
    CONTROLLED_SLINGSHOT_SLIDE_TIME,
    findNearestPassableDirection,
    GENERIC_SLINGSHOT_MAGNITUDE,
    GENERIC_SLINGSHOT_AIR_TIME,
    GENERIC_SLINGSHOT_SLIDE_TIME,
    snapToCardinal,
} from './slingshotHelpers';
import { CONTROLLED_SLINGSHOT } from '../gameConstants';
import { getAbility } from '../../abilities/AbilityRegistry';
import { refundAbilityCost } from '../../abilities/Ability';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { getUnitEffectiveSpeed, isEntombedProtectionActive } from './unitAbilityQueries';

/** Seconds a unit must spend in a wall before being snapped to the nearest passable cell. */
export const WALL_SNAP_DELAY = 0.1;

/**
 * If the unit is inside an impassable tile, nudge it toward the nearest passable cell each tick.
 * After WALL_SNAP_DELAY seconds of continuous wall contact, fire a slingshot launch (unless an
 * Entombed ability is in a non-Cooldown phase, in which case suppression holds).
 */
export function tickWallUnstick(unit: Unit, dt: number, engine: EngineContext): void {
    const gameTime = engine.gameTime;

    if (engine.terrainManager!.isPassable(unit.x, unit.y)) {
        unit.wallEntryPoint = { x: unit.x, y: unit.y };
        unit.wallStuckTime = 0;
        unit.controlledSlingshotDir = null;
        unit.controlled = false;
        unit.controlledUntilTime = null;
        return;
    }

    unit.wallStuckTime += dt;

    // Suppress while any Entombed ability is still in an active (non-Cooldown) phase.
    if (isEntombedProtectionActive(unit, engine)) {
        unit.wallStuckTime = 0;
        unit.controlled = false;
        unit.controlledUntilTime = null;
        return;
    }

    if (CONTROLLED_SLINGSHOT) {
        if (!unit.controlled) {
            unit.controlled = true;
            // Interrupt active abilities that are not in a cooldown phase.
            // Cooldown/CoopCooldown are designed to coexist with the slingshot
            // (e.g. DiggingClaws waits out the slingshot window during its cooldown).
            const kept = unit.activeAbilities.filter((active) => {
                const ability = getAbility(active.abilityId);
                if (!ability) return false;
                const elapsed = engine.gameTime - active.startTime;
                const entries = resolveAbilityTimingEntries(ability, unit, engine);
                const intervals = normalizeAbilityTimingsToIntervals(entries);
                const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);
                if (phase === AbilityPhase.Cooldown || phase === AbilityPhase.CoopCooldown) {
                    return true;
                }
                refundAbilityCost(unit, ability);
                return false;
            });
            unit.activeAbilities = kept;
            if (unit.activeAbilities.length === 0) {
                unit.clearAbilityNote();
            }
        }
        tickControlledSlingshot(unit, engine);
        return;
    }

    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    const nearest = findNearestPassableCell(engine.terrainManager!, col, row);
    if (!nearest) return;

    const targetX = nearest.col * CELL_SIZE + CELL_SIZE / 2;
    const targetY = nearest.row * CELL_SIZE + CELL_SIZE / 2;

    if (unit.wallStuckTime >= WALL_SNAP_DELAY) {
        const tm = engine.terrainManager;
        const dir = tm
            ? computeSlingshotDirection(unit.wallEntryPoint?.x, unit.wallEntryPoint?.y, unit.x, unit.y, tm)
            : null;
        if (dir) {
            // Flat punishment damage; return value unused, so no need for the shield/armour breakdown.
            unit.takeDamage(5, null, engine.eventBus);
            // Snap to nearest passable cell first; knockback starting inside a wall is immediately
            // cancelled by computeForcedDisplacement (distance = 0 when first step is also in wall).
            unit.x = targetX;
            unit.y = targetY;
            applySlingshotLaunch(
                unit, dir.x, dir.y,
                GENERIC_SLINGSHOT_MAGNITUDE, GENERIC_SLINGSHOT_AIR_TIME, GENERIC_SLINGSHOT_SLIDE_TIME,
                engine.eventBus, unit.id, 'wall_eject',
            );
            unit.wallStuckTime = 0;
            unit.wallEntryPoint = null;
        } else {
            // Last resort: teleport to nearest passable cell when no exit direction is found.
            unit.x = targetX;
            unit.y = targetY;
            unit.wallStuckTime = 0;
        }
        return;
    }

    // Nudge toward the exit at normal movement speed while below the threshold.
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
        const step = getUnitEffectiveSpeed(unit, gameTime) * dt;
        unit.x += (dx / dist) * Math.min(step, dist);
        unit.y += (dy / dist) * Math.min(step, dist);
    }
}

/**
 * CONTROLLED_SLINGSHOT variant of wall ejection. Called from tickWallUnstick when the flag
 * is enabled. Bounces the unit one tile per 0.2 s in a cardinal direction, dealing 5 damage
 * per bounce. Chains automatically through walls; reverses at map edges.
 */
export function tickControlledSlingshot(unit: Unit, engine: EngineContext): void {
    const tm = engine.terrainManager!;

    // Suppress while the current bounce arc is still in flight.
    if (unit.knockback !== null) {
        unit.wallStuckTime = 0;
        return;
    }

    // First entry into a wall: honour WALL_SNAP_DELAY (lets Entombed abilities suppress).
    // Subsequent bounces in a chain: fire immediately (controlledSlingshotDir already set).
    if (unit.controlledSlingshotDir === null && unit.wallStuckTime < WALL_SNAP_DELAY) {
        return;
    }

    // Compute cardinal direction on first bounce of a new chain.
    if (!unit.controlledSlingshotDir) {
        const rawDir = computeSlingshotDirection(
            unit.wallEntryPoint?.x, unit.wallEntryPoint?.y, unit.x, unit.y, tm,
        );
        if (rawDir) {
            unit.controlledSlingshotDir = snapToCardinal(rawDir.x, rawDir.y);
        } else {
            const nearest = findNearestPassableDirection(tm, unit.x, unit.y);
            unit.controlledSlingshotDir = nearest
                ? snapToCardinal(nearest.x, nearest.y)
                : { x: 1, y: 0 }; // absolute fallback
        }
    }

    let { x: dirX, y: dirY } = unit.controlledSlingshotDir;

    // Reverse direction when the next tile would be outside the map bounds.
    const { width, height, cellSize } = tm.getGridSize();
    const nextCol = Math.floor((unit.x + dirX * cellSize) / cellSize);
    const nextRow = Math.floor((unit.y + dirY * cellSize) / cellSize);
    if (nextCol < 0 || nextRow < 0 || nextCol >= width || nextRow >= height) {
        dirX = -dirX;
        dirY = -dirY;
        unit.controlledSlingshotDir = { x: dirX, y: dirY };
    }

    // Flat punishment damage; return value unused, so no need for the shield/armour breakdown.
    unit.takeDamage(5, null, engine.eventBus);

    // Arc knockback: exactly one tile, 0.2 s air, terrain-bypassing so the unit travels through walls.
    unit.applyKnockback({
        knockbackVector: { x: dirX * cellSize, y: dirY * cellSize },
        knockbackAirTime: CONTROLLED_SLINGSHOT_AIR_TIME,
        knockbackSlideTime: CONTROLLED_SLINGSHOT_SLIDE_TIME,
        knockbackSource: { unitId: unit.id, abilityId: 'controlled_wall_bounce' },
        passThroughTerrain: true,
    }, engine.eventBus);

    unit.controlledUntilTime = engine.gameTime + CONTROLLED_SLINGSHOT_AIR_TIME + CONTROLLED_SLINGSHOT_SLIDE_TIME;
    unit.wallStuckTime = 0;
    unit.wallEntryPoint = null;
}
