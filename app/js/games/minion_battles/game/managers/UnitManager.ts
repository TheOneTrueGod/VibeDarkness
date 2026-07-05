/**
 * UnitManager - Owns the unit list and provides CRUD, queries, and
 * per-tick crystal-aura tagging.
 */

import { Unit } from '../units/Unit';
import { UnitTag, addUnitTag, hasUnitTag } from '../units/unitTag';
import { areAllies } from '../teams';
import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import { runUnitAI, runPathfindingRetrigger, getUnitAITree } from '../units/unitAI';
import { tickSpawnAnimation } from '../units/spawnAnimation';
import { processUnitPassives } from '../../abilities/passiveRunner';
import type { AIContext } from '../units/unitAI';
import type { Resource } from '../../resources/Resource';
import { countNinjutsuEnemyUnits } from '../ninjutsu/NinjutsuManager';
import { Rage } from '../../resources/Rage';
import { Mana } from '../../resources/Mana';
import { Resonance } from '../../resources/Resonance';
import { Light } from '../../resources/Light';
import { EarthPower } from '../../resources/EarthPower';
import { Gravity } from '../../resources/Gravity';
import { Movement } from '../../resources/Movement';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getUnitMaxPerTile, getUnitShovePriority } from '../units/unit_defs/unitDef';
import type { CellOccupancyManager } from './CellOccupancyManager';
import { refreshActiveTargets } from '../../abilities/targetDowngrade';

function refreshPlayerPursuitPath(unit: Unit, aiContext: AIContext): void {
    const targetId = unit.movement?.targetUnitId;
    if (!targetId) return;
    const target = aiContext.getUnit(targetId);
    if (!target?.isAlive()) {
        if (unit.movement) unit.movement.targetUnitId = undefined;
        return;
    }
    const stopDist = unit.radius + target.radius + MIN_FOLLOW_RADIUS;
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    if (dx * dx + dy * dy <= stopDist * stopDist) {
        unit.clearMovement();
        return;
    }
    const tm = aiContext.terrainManager;
    if (!tm) return;
    const unitGrid = tm.grid.worldToGrid(unit.x, unit.y);
    const targetGrid = tm.grid.worldToGrid(target.x, target.y);
    const path = aiContext.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, targetGrid.col, targetGrid.row);
    if (path && path.length > 0) {
        unit.setMovement(path, targetId, aiContext.gameTick);
    }
}

/** 8-directional neighbour offsets (cardinal first, then diagonal). */
const NEIGHBOUR_DIRS = [
    { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 },
    { dc: 1, dr: -1 }, { dc: 1, dr: 1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 },
];

/**
 * Find the best adjacent cell for a displaced unit to escape into.
 * Excludes `shoveFromCell` to prevent bounce-back.
 * If all adjacent cells are full, allows entering a cell with totalUsage < 1.5 (cascade).
 */
function findEscapeCell(
    col: number,
    row: number,
    maxPerTile: number,
    jitter: number,
    mgr: CellOccupancyManager,
    grid: { worldToGrid: (x: number, y: number) => { col: number; row: number } } | null | undefined,
    shoveFromCell: { col: number; row: number } | undefined,
): { col: number; row: number } | null {
    const jitterAngle = jitter * Math.PI * 2;

    type Candidate = { col: number; row: number; usage: number; angle: number };
    const preferred: Candidate[] = [];
    const cascade: Candidate[] = [];

    for (const { dc, dr } of NEIGHBOUR_DIRS) {
        const nc = col + dc;
        const nr = row + dr;
        if (shoveFromCell && nc === shoveFromCell.col && nr === shoveFromCell.row) continue;
        if (grid) {
            // Use grid bounds via a worldToGrid round-trip check (grid exposes width/height indirectly)
            // Just check passability if the grid has it; otherwise skip bounds check
        }
        const usage = mgr.getTotalUsage(nc, nr);
        const angle = Math.atan2(dr, dc);
        const angularDist = Math.abs(((angle - jitterAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const candidate = { col: nc, row: nr, usage, angle: angularDist };
        if (mgr.canEnter(nc, nr, maxPerTile)) {
            preferred.push(candidate);
        } else if (usage < 1.5) {
            cascade.push(candidate);
        }
    }

    const best = (candidates: Candidate[]) =>
        candidates.sort((a, b) => a.angle - b.angle)[0] ?? null;

    return (
        (preferred.length > 0 ? { col: best(preferred)!.col, row: best(preferred)!.row } : null) ??
        (cascade.length > 0 ? { col: best(cascade)!.col, row: best(cascade)!.row } : null)
    );
}

function createResourceFromId(id: string): Resource | null {
    switch (id) {
        case 'rage':
            return new Rage();
        case 'mana':
            return new Mana();
        case 'resonance':
            return new Resonance();
        case 'light':
            return new Light();
        case 'earth_power':
            return new EarthPower();
        case 'gravity':
            return new Gravity();
        case 'movement_points':
            return new Movement();
        default:
            return null;
    }
}

export class UnitManager {
    units: Unit[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    registerListeners(): void {
        this.ctx.eventBus.on('damage_taken', (event) => this.processEnrageTriggers(event.unitId));
    }

    private processEnrageTriggers(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit?.isAlive() || !unit.enrageDef) return;

        const { enrageDef } = unit;
        if (hasUnitTag(unit, enrageDef.tag)) return;

        const triggered =
            enrageDef.conditionType === 'health_below_percent' &&
            unit.hp / unit.maxHp <= enrageDef.threshold;

        if (triggered) {
            addUnitTag(unit, enrageDef.tag);
            this.ctx.eventBus.emit('unit_enraged', { unitId: unit.id, tag: enrageDef.tag });
        }
    }

    addUnit(unit: Unit): void {
        if (!unit.isPlayerControlled()) {
            unit.moveJitter = this.ctx.generateRandomInteger(0, 1000) / 1000;
            unit.pathfindingRetriggerOffset = 30 + Math.floor(unit.moveJitter * 60);
        } else {
            unit.pathfindingRetriggerOffset = this.ctx.generateRandomInteger(30, 90);
        }
        this.units.push(unit);
    }

    getUnit(id: string): Unit | undefined {
        return this.units.find((u) => u.id === id);
    }

    getUnits(): Unit[] {
        return this.units;
    }

    getLocalPlayerUnit(localPlayerId: string): Unit | undefined {
        return this.units.find(
            (u) => u.ownerId === localPlayerId && u.isAlive(),
        );
    }

    getAllies(caster: Unit): Unit[] {
        return this.units.filter(
            (u) => u.id !== caster.id && u.isAlive() && areAllies(caster.teamId, u.teamId),
        );
    }

    /** Tag player units near a Crystal with {@link UnitTag.ProtectedByCrystal}. */
    processCrystalAura(): void {
        const grid = this.ctx.terrainManager?.grid;
        if (!grid) return;
        const crystalTiles = this.ctx.specialTiles.filter((t) => t.defId === 'Crystal' && t.hp > 0);
        for (const unit of this.units) {
            if (!unit.isPlayerControlled() || !unit.isAlive()) continue;
            const { col: uc, row: ur } = grid.worldToGrid(unit.x, unit.y);
            const nearCrystal = crystalTiles.some((c) => {
                const radius = c.protectRadius ?? 0;
                return Math.max(Math.abs(uc - c.col), Math.abs(ur - c.row)) <= radius;
            });
            if (nearCrystal) {
                if (!unit.tags.includes(UnitTag.ProtectedByCrystal)) {
                    unit.tags = [...unit.tags, UnitTag.ProtectedByCrystal];
                }
            } else {
                unit.tags = unit.tags.filter((t) => t !== UnitTag.ProtectedByCrystal);
            }
        }
    }

    /**
     * For any managed unit that finds itself in an overfull cell (e.g. displaced by a shover),
     * set a 1-step escape movement toward the nearest passable, less-full adjacent cell.
     * `shoveFromCell` on the unit prevents it from bouncing back to where it came from.
     */
    private applyOccupancyDisplacement(mgr: CellOccupancyManager, engine: EngineContext): void {
        const grid = engine.terrainManager?.grid;
        for (const unit of this.units) {
            if (!unit.active || !unit.isAlive()) continue;
            const maxPerTile = getUnitMaxPerTile(unit.characterId);
            if (maxPerTile === undefined) continue;
            if (getUnitShovePriority(unit.characterId) !== undefined) continue; // shovers self-manage

            const col = Math.floor(unit.x / CELL_SIZE);
            const row = Math.floor(unit.y / CELL_SIZE);
            if (mgr.getTotalUsage(col, row) <= 1.001) {
                unit.shoveFromCell = undefined;
                continue;
            }

            // Find an escape cell — prefer less-full, exclude shoveFromCell to prevent bounce
            const escape = findEscapeCell(col, row, maxPerTile, unit.moveJitter ?? 0, mgr, grid, unit.shoveFromCell);
            if (escape && !unit.movement) {
                unit.setMovement([escape], undefined, engine.gameTick);
                unit.shoveFromCell = { col, row };
            }
        }
    }

    gameTick(
        dt: number,
        engine: EngineContext,
        onNaturalAbilityCompletion: (unitId: string) => void,
        aiContext: AIContext,
        onBeforeEnemyAI?: () => void,
    ): void {
        // Phase 1a: passive ability tick (all alive units, no cast required)
        for (const unit of this.units) {
            if (!unit.active) continue;
            processUnitPassives(unit, dt, engine);
        }
        // Phase 1b: active ability tick
        for (const unit of this.units) {
            if (!unit.active || unit.activeAbilities.length === 0) continue;
            unit.tickActiveAbilities(dt, engine, () => onNaturalAbilityCompletion(unit.id));
        }
        // Phase 1c: per-tick resource hooks (e.g. gravity grazing)
        for (const unit of this.units) {
            if (!unit.active || !unit.isAlive()) continue;
            for (const resource of unit.resources) {
                resource.onTick?.(unit, engine, dt);
            }
        }
        // Phase 2: movement + ephemeral expiry
        const occupancyMgr = engine.cellOccupancyManager as CellOccupancyManager | null;
        occupancyMgr?.rebuild(this.units);
        if (occupancyMgr) this.applyOccupancyDisplacement(occupancyMgr, engine);

        for (const unit of this.units) {
            if (!unit.active) continue;
            if (unit.isSpawning()) {
                tickSpawnAnimation(unit, dt, engine);
                continue;
            }
            if (unit.growAnimTimer > 0) {
                unit.growAnimTimer = Math.max(0, unit.growAnimTimer - dt);
            }
            if (unit.pathfindingRetriggerOffset > 0 && engine.gameTick % unit.pathfindingRetriggerOffset === 0) {
                if (unit.isPlayerControlled() && unit.movement?.targetUnitId) {
                    refreshPlayerPursuitPath(unit, aiContext);
                }
                const tree = getUnitAITree(unit.unitAITreeId);
                if (tree) runPathfindingRetrigger(unit, tree, aiContext);
            }
            unit.tickMovement(dt, engine);
        }
        // Phase 3: AI decisions (all positions settled)
        for (const unit of this.units) {
            if (!unit.active || unit.isPlayerControlled() || !unit.canAct() || !unit.isAlive() || unit.isSpawning()) continue;
            onBeforeEnemyAI?.();
            const tree = getUnitAITree(unit.unitAITreeId);
            if (tree) runUnitAI(unit, tree, aiContext);
            unit.pendingInterrupts.clear();
        }
        // Phase 3b: resolve deferred ninjutsu attack grants — units that registered requests in Phase 3
        // have their orders queued here, ordered by ability priority with ties broken randomly.
        if (aiContext.ninjutsuManager) {
            aiContext.ninjutsuManager.resolveRequests(
                engine.gameTime,
                (tick, order) => aiContext.queueOrder(tick, order),
                (min, max) => engine.generateRandomInteger(min, max),
                countNinjutsuEnemyUnits(this.units),
            );
        }
        // Phase 4: downgrade dead unit targets to pixel targets at last known position.
        // Runs after all ticks (so kills from any source are captured) but before
        // cleanupInactive removes dead units from engine.units.
        for (const unit of this.units) {
            for (const active of unit.activeAbilities) {
                refreshActiveTargets(active, engine);
            }
        }
    }

    tickDarknessCorruption(dt: number, engine: EngineContext): void {
        for (const unit of this.units) {
            if (!unit.isPlayerControlled() || !unit.isAlive()) continue;
            unit.tickDarknessCorruption(dt, engine);
        }
    }

    onRoundStart(roundNumber: number, engine: EngineContext): void {
        for (const unit of this.units) unit.onRoundStart(roundNumber, engine);
    }

    onRoundEnd(roundNumber: number): void {
        for (const unit of this.units) unit.onRoundEnd(roundNumber);
    }

    cleanupInactive(): void {
        this.units = this.units.filter((u) => u.active);
    }

    toJSON(currentGameTick: number = 0): Record<string, unknown>[] {
        return this.units.map((u) => u.toJSON(currentGameTick));
    }

    restoreFromJSON(unitDataArray: Record<string, unknown>[], eventBus: EventBus, currentGameTick: number = 0): void {
        this.units = [];
        for (const unitData of unitDataArray) {
            const unit = Unit.fromJSON(unitData, eventBus, currentGameTick);
            const resourceData = unitData.resources as Record<string, unknown>[] | undefined;
            if (resourceData) {
                for (const rd of resourceData) {
                    const resource = createResourceFromId(rd.id as string);
                    if (resource) {
                        resource.restoreFromJSON(rd);
                        unit.attachResource(resource, eventBus);
                        // Fresh instances lose tile/proximity context that tooltips read;
                        // prime immediately so gain rates show right after restore.
                        resource.primeDisplayContext?.(unit, this.ctx);
                    }
                }
            }
            this.units.push(unit);
        }
    }
}
