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
import type { AIContext } from '../units/unitAI';
import type { Resource } from '../../resources/Resource';
import { Rage } from '../../resources/Rage';
import { Mana } from '../../resources/Mana';
import { Resonance } from '../../resources/Resonance';

function createResourceFromId(id: string): Resource | null {
    switch (id) {
        case 'rage':
            return new Rage();
        case 'mana':
            return new Mana();
        case 'resonance':
            return new Resonance();
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
        unit.pathfindingRetriggerOffset = this.ctx.generateRandomInteger(30, 90);
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

    gameTick(
        dt: number,
        engine: EngineContext,
        onNaturalAbilityCompletion: (unitId: string) => void,
        aiContext: AIContext,
        onBeforeEnemyAI?: () => void,
    ): void {
        // Phase 1: ability tick for all units before any movement
        for (const unit of this.units) {
            if (!unit.active || unit.activeAbilities.length === 0) continue;
            unit.tickActiveAbilities(dt, engine, () => onNaturalAbilityCompletion(unit.id));
        }
        // Phase 2: movement + ephemeral expiry
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

    toJSON(): Record<string, unknown>[] {
        return this.units.map((u) => u.toJSON());
    }

    restoreFromJSON(unitDataArray: Record<string, unknown>[], eventBus: EventBus): void {
        this.units = [];
        for (const unitData of unitDataArray) {
            const unit = Unit.fromJSON(unitData, eventBus);
            const resourceData = unitData.resources as Record<string, unknown>[] | undefined;
            if (resourceData) {
                for (const rd of resourceData) {
                    const resource = createResourceFromId(rd.id as string);
                    if (resource) {
                        resource.restoreFromJSON(rd);
                        unit.attachResource(resource, eventBus);
                    }
                }
            }
            this.units.push(unit);
        }
    }
}
