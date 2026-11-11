/**
 * Def-driven thorn hazards. Any ground effect whose `TerrainEffectDef` has a `thorns` block hurts
 * matching grounded units when they enter its cell or land on it, and wears out after its uses.
 * To add a variant: add a def entry with `thorns` (terrainEffectDefs.ts) plus a visual entry
 * (GameRenderer/terrainEffectDefs.ts).
 */

import type { Unit } from '../units/Unit';
import type { TerrainEffectRecord } from '../TerrainLayerManager';
import { getCreatureType } from '../units/unit_defs/unitDef';
import {
    getTerrainEffectDef,
    getThornHitsTaken,
    getThornUses,
    THORN_HITS_TAKEN_PARAM,
    type CreatureFilter,
    type ThornsDef,
} from './terrainEffectDefs';
import type { TileTransitionEngine } from './tileTransitions';

/** True when a terrain hazard's creature filter includes this unit. */
export function unitMatchesCreatureFilter(filter: CreatureFilter, unit: Unit): boolean {
    const creatureType = getCreatureType(unit.characterId);
    if ('only' in filter) return creatureType !== undefined && filter.only.includes(creatureType);
    return creatureType === undefined || !filter.except.includes(creatureType);
}

/** True when the thorns' creature filter includes this unit. */
export function unitIsHurtByThorns(thorns: ThornsDef, unit: Unit): boolean {
    return unitMatchesCreatureFilter(thorns.hurts, unit);
}

/** @returns true if the thorns damaged the unit. */
export function triggerThorns(
    effect: Pick<TerrainEffectRecord, 'id' | 'effectType' | 'ownerUnitId'> & Partial<Pick<TerrainEffectRecord, 'params'>>,
    unit: Unit,
    kind: 'enter' | 'land',
    engine: TileTransitionEngine,
): boolean {
    const thorns = getTerrainEffectDef(effect.effectType)?.thorns;
    if (!thorns) return false;
    if (!unit.isAlive()) return false;
    if (!unitIsHurtByThorns(thorns, unit)) return false;
    const amount = kind === 'enter' ? thorns.enterDamage : thorns.landDamage;
    unit.takeDamage(amount, effect.ownerUnitId ?? null, engine.eventBus);
    wearThorns(effect, engine);
    return true;
}

/** Count one trigger against the cell's uses; remove it once they run out. */
function wearThorns(
    effect: Pick<TerrainEffectRecord, 'id' | 'effectType'> & Partial<Pick<TerrainEffectRecord, 'params'>>,
    engine: TileTransitionEngine,
): void {
    const uses = getThornUses(effect);
    if (uses === undefined) return;
    const taken = getThornHitsTaken(effect) + 1;
    if (taken >= uses) engine.terrainLayers.remove(effect.id);
    else engine.terrainLayers.updateEffectParams(effect.id, { [THORN_HITS_TAKEN_PARAM]: taken });
}
