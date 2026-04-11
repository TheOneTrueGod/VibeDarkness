/**
 * UnitManager - Owns the unit list and provides CRUD, queries, and
 * per-tick crystal-aura tagging.
 */

import { Unit } from '../../objects/Unit';
import { areAllies } from '../teams';
import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import type { Resource } from '../../resources/Resource';
import { Rage } from '../../resources/Rage';
import { Mana } from '../../resources/Mana';

function createResourceFromId(id: string): Resource | null {
    switch (id) {
        case 'rage':
            return new Rage();
        case 'mana':
            return new Mana();
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

    /** Tag player units near a Crystal with 'protectedByCrystal'. */
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
                if (!unit.tags.includes('protectedByCrystal')) unit.tags = [...unit.tags, 'protectedByCrystal'];
            } else {
                unit.tags = unit.tags.filter((t) => t !== 'protectedByCrystal');
            }
        }
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
