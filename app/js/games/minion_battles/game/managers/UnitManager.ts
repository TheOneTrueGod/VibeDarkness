/**
 * UnitManager - Owns the unit list and provides CRUD, queries, and
 * per-tick crystal-aura tagging.
 */

import { Unit } from '../units/Unit';
import { UnitTag } from '../units/unitTag';
import { PHASE_COMPONENT } from '../units/components/phaseComponent';
import { evaluateUnitPhases } from '../units/components/phaseRuntime';
import { areAllies } from '../teams';
import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import { runUnitAI, getUnitAITree } from '../units/unitAI';
import { tickSpawnAnimation } from '../units/spawnAnimation';
import { tickTerrainHazard } from '../terrainHazards/drowning';
import { getUnitTravelSpeedPx, tickUnitFrozenUpkeep } from '../units/unitMovementTick';
import { collectAbilityBoundaryOffsets } from '../units/unitAbilityTick';
import { resolvePendingFrozenHits } from '../units/unitDamage';
import { isSinglePieceStep, planStepPieces } from '../time/stepPieces';
import { processUnitPassives } from '../../abilities/passiveRunner';
import type { AIContext } from '../units/unitAI';
import { createResourceFromId } from '../../resources/createResourceFromId';
import { countNinjutsuEnemyUnits } from '../ninjutsu/NinjutsuManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getUnitMaxPerTile, getUnitShovePriority } from '../units/unit_defs/unitDef';
import type { CellOccupancyManager } from './CellOccupancyManager';
import { refreshActiveTargets } from '../../abilities/targetDowngrade';
import { processUnitTileTransition } from '../terrainEffects/tileTransitions';
import {
    PERF_UNITS_ABILITIES,
    PERF_UNITS_AI,
    PERF_UNITS_CROWD_SPACING,
    PERF_UNITS_MOVEMENT,
    PERF_UNITS_NINJUTSU,
    PERF_UNITS_OCCUPANCY,
    PERF_UNITS_PASSIVES,
    PERF_UNITS_PATHFINDING,
    PERF_UNITS_RESOURCES,
    PERF_UNITS_TARGETS,
    tickPerformanceTracker,
} from '../performance/tickPerformanceTracker';

/** One unit's step cut into pieces for this tick (see `game/time/stepPieces.ts`). */
interface UnitStepPlan {
    pieces: number[];
    /** Local time at the end of each piece. */
    ends: number[];
    originalLocalStep: number;
    /** Local time to leave on the unit after all pieces ran. */
    finalLocalTime: number;
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

export class UnitManager {
    units: Unit[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    registerListeners(): void {
        this.ctx.eventBus.on('damage_taken', (event) => this.processPhaseTriggers(event.unitId));
    }

    /**
     * After damage: enter any phase the hit satisfied (HP thresholds; a hit crossing several enters each in order).
     * Non-damage conditions are checked once per tick by the `phase` component's tick hook.
     */
    private processPhaseTriggers(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit?.isAlive() || !unit.components.has(PHASE_COMPONENT.id)) return;
        evaluateUnitPhases(unit, this.ctx, 'damage');
    }

    addUnit(unit: Unit): void {
        if (!unit.isPlayerControlled()) {
            unit.moveJitter = this.ctx.generateRandomInteger(0, 1000) / 1000;
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
            if (escape && !unit.movement && !unit.abilityOwnsMovementThisTick) {
                unit.setMovement([escape], undefined, engine.gameTick);
                unit.shoveFromCell = { col, row };
            }
        }
    }

    /**
     * Cut each unit's step into pieces when it is longer than one tick (hasted unit or carried `timeDebt`).
     * Returns plans only for such units; everyone else takes the single-call path (exactly the pre-dilation behaviour).
     * Debt is consumed into the plan here and the leftover written back to `unit.timeDebt`.
     */
    private planUnitSteps(engine: EngineContext): Map<Unit, UnitStepPlan> | null {
        let plans: Map<Unit, UnitStepPlan> | null = null;
        for (const unit of this.units) {
            if (!unit.active || !unit.localClockActive || unit.localFrozen) continue;
            if (unit.timeDebt === 0 && isSinglePieceStep(unit.localStep)) continue;
            const total = unit.localStep + unit.timeDebt;
            if (!(total > 0)) continue;
            const base = unit.localTime - unit.localStep;
            const plan = planStepPieces({
                stepDt: total,
                nextEventIn: unit.activeAbilities.length > 0 ? collectAbilityBoundaryOffsets(unit, engine, base, total) : undefined,
                speedPx: getUnitTravelSpeedPx(unit, engine),
            });
            if (plan.pieces.length === 0) continue;
            let executed = 0;
            const ends = plan.pieces.map((p) => {
                executed += p;
                return base + executed;
            });
            (plans ??= new Map()).set(unit, {
                pieces: plan.pieces,
                ends,
                originalLocalStep: unit.localStep,
                finalLocalTime: plan.debt === 0 && unit.timeDebt === 0 ? unit.localTime : base + executed,
            });
            unit.timeDebt = plan.debt;
        }
        return plans;
    }

    /** Point the unit's local clock at the end of piece `k` (so cast elapsed and owner buffs read piece time). */
    private beginPiece(unit: Unit, plan: UnitStepPlan | undefined, k: number): void {
        if (!plan) return;
        unit.localStep = plan.pieces[k]!;
        unit.localTime = plan.ends[k]!;
    }

    /** Local seconds the movement/knockback piece `k` covers. */
    private pieceDt(unit: Unit, plan: UnitStepPlan | undefined, k: number, worldDt: number): number {
        if (plan) return plan.pieces[k]!;
        return unit.localClockActive && unit.localStep > 0 ? unit.localStep : worldDt;
    }

    /** One movement piece: spawn animation (first piece), movement/knockback, tile transition, map node. */
    private runMovementPiece(unit: Unit, pieceDt: number, worldDt: number, first: boolean, engine: EngineContext): void {
        if (unit.isSpawning()) {
            if (first) tickSpawnAnimation(unit, worldDt, engine);
            return;
        }
        if (unit.isInTerrainHazard()) {
            if (first) tickTerrainHazard(unit, worldDt, engine);
            return;
        }
        if (first && unit.growAnimTimer > 0) {
            unit.growAnimTimer = Math.max(0, unit.growAnimTimer - worldDt);
        }
        unit.tickMovement(pieceDt, engine, first ? { upkeepDt: worldDt } : { skipUpkeep: true });
        processUnitTileTransition(unit, engine);
        // Incremental map-network membership update — the unit "notifies" the manager of a
        // node change right after its position is finalized for this piece, instead of the
        // manager rescanning every participating unit every tick. See MapNetworkManager.updateUnitNode.
        engine.mapNetworkManager.updateUnitNode(unit);
    }

    /**
     * One engine tick of unit simulation.
     *
     * `dt` is WORLD dt (`worldPace x FIXED_DT`): passives and resource `onTick` run on it. Abilities, movement and
     * knockback run on each unit's own local step (`unit.localStep`, from `advanceUnitLocalClocks`). A step of at
     * most one tick is a single piece, the same single call as before time dilation. A longer step is cut into
     * pieces (`planStepPieces`): piece 0 runs in the normal phases below, pieces 1.. run (ability then movement,
     * per unit) right after the movement phase. Global phases (occupancy, pathfinding, crowd spacing, AI) run once
     * per tick. Frozen units (tempo 0) run no abilities, movement, knockback or AI, only world-clock upkeep.
     */
    gameTick(
        dt: number,
        engine: EngineContext,
        onNaturalAbilityCompletion: (unitId: string) => void,
        aiContext: AIContext,
    ): void {
        // Ephemeral ability-movement claim — dash/lunge/moveUnit re-claim while still sliding.
        for (const unit of this.units) {
            unit.abilityOwnsMovementThisTick = false;
            // Hits held by the 'onResume' frozen-hit policy land, in order, on the first tick the unit thaws.
            if (unit.pendingFrozenHits.length > 0) resolvePendingFrozenHits(unit, engine.eventBus);
        }
        const plans = this.planUnitSteps(engine);
        // Phase 1a: passive ability tick (all alive units, no cast required) — world clock
        tickPerformanceTracker.measure([PERF_UNITS_PASSIVES], () => {
            for (const unit of this.units) {
                if (!unit.active) continue;
                processUnitPassives(unit, dt, engine);
            }
        });
        // Phase 1b: active ability tick (piece 0)
        tickPerformanceTracker.measure([PERF_UNITS_ABILITIES], () => {
            for (const unit of this.units) {
                if (!unit.active || unit.activeAbilities.length === 0 || unit.localFrozen || unit.isInTerrainHazard()) continue;
                this.beginPiece(unit, plans?.get(unit), 0);
                unit.tickActiveAbilities(dt, engine, () => onNaturalAbilityCompletion(unit.id));
            }
        });
        // Phase 1c: per-tick resource hooks (e.g. gravity grazing) — world clock
        tickPerformanceTracker.measure([PERF_UNITS_RESOURCES], () => {
            for (const unit of this.units) {
                if (!unit.active || !unit.isAlive()) continue;
                for (const resource of unit.resources) {
                    resource.onTick?.(unit, engine, dt);
                }
            }
        });
        // Phase 2a: occupancy rebuild + shove displacement
        tickPerformanceTracker.measure([PERF_UNITS_OCCUPANCY], () => {
            const occupancyMgr = engine.cellOccupancyManager as CellOccupancyManager | null;
            occupancyMgr?.rebuild(this.units);
            if (occupancyMgr) this.applyOccupancyDisplacement(occupancyMgr, engine);
        });
        // Phase 2a': pathfinding — turn walk goals into paths (terrain is frozen until abilities run next tick)
        tickPerformanceTracker.measure([PERF_UNITS_PATHFINDING], () => {
            engine.pathfindingManager.tick(this.units, engine);
        });
        // Phase 2b: movement + ephemeral expiry (piece 0), then any further pieces
        tickPerformanceTracker.measure([PERF_UNITS_MOVEMENT], () => {
            for (const unit of this.units) {
                if (!unit.active) continue;
                if (unit.localFrozen) {
                    tickUnitFrozenUpkeep(unit, dt, engine);
                    continue;
                }
                const plan = plans?.get(unit);
                this.beginPiece(unit, plan, 0);
                this.runMovementPiece(unit, this.pieceDt(unit, plan, 0, dt), dt, true, engine);
            }
            if (plans) {
                const planned = [...plans.keys()];
                let maxPieces = 0;
                for (const plan of plans.values()) maxPieces = Math.max(maxPieces, plan.pieces.length);
                for (let k = 1; k < maxPieces; k++) {
                    for (const unit of planned) {
                        const plan = plans.get(unit)!;
                        if (!unit.active || k >= plan.pieces.length) continue;
                        this.beginPiece(unit, plan, k);
                        if (unit.activeAbilities.length > 0 && !unit.isInTerrainHazard()) {
                            unit.tickActiveAbilities(dt, engine, () => onNaturalAbilityCompletion(unit.id));
                        }
                        if (!unit.active) continue;
                        this.runMovementPiece(unit, plan.pieces[k]!, dt, false, engine);
                    }
                }
                for (const [unit, plan] of plans) {
                    unit.localTime = plan.finalLocalTime;
                    unit.localStep = plan.originalLocalStep;
                }
            }
        });
        // Phase 2c: CrowdSpacing — soft radius pack after positions settle for the tick
        tickPerformanceTracker.measure([PERF_UNITS_CROWD_SPACING], () => {
            engine.crowdSpacingManager.tick(this.units, engine.terrainManager);
        });
        // Phase 3: AI decisions (all positions settled). Once per tick; frozen units do not think.
        tickPerformanceTracker.measure([PERF_UNITS_AI], () => {
            for (const unit of this.units) {
                if (!unit.active || unit.localFrozen || unit.isPlayerControlled() || !unit.canAct() || !unit.isAlive() || unit.isSpawning()) continue;
                const tree = getUnitAITree(unit.unitAITreeId);
                if (tree) runUnitAI(unit, tree, aiContext);
                unit.pendingInterrupts.clear();
            }
        });
        // Phase 3b: resolve deferred ninjutsu attack grants — units that registered requests in Phase 3
        // have their orders queued here, ordered by ability priority with ties broken randomly.
        tickPerformanceTracker.measure([PERF_UNITS_NINJUTSU], () => {
            if (aiContext.ninjutsuManager) {
                aiContext.ninjutsuManager.resolveRequests(
                    engine.gameTime,
                    (tick, order) => aiContext.queueOrder(tick, order),
                    (min, max) => engine.generateRandomInteger(min, max),
                    countNinjutsuEnemyUnits(this.units),
                );
            }
        });
        // Phase 4: downgrade dead unit targets to pixel targets at last known position.
        // Runs after all ticks (so kills from any source are captured) but before
        // cleanupInactive removes dead units from engine.units.
        tickPerformanceTracker.measure([PERF_UNITS_TARGETS], () => {
            for (const unit of this.units) {
                for (const active of unit.activeAbilities) {
                    refreshActiveTargets(active, engine);
                }
            }
        });
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
