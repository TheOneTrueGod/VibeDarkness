/**
 * Def-driven thorn hazards. Any ground effect whose `TerrainEffectDef` has a `thorns` block hurts
 * matching grounded units when they enter its cell or land on it, and is optionally consumed.
 * To add a variant: add a def entry with `thorns` (terrainEffectDefs.ts) plus a visual entry
 * (GameRenderer/terrainEffectDefs.ts).
 */

import type { Unit } from '../units/Unit';
import type { TerrainEffectRecord } from '../TerrainLayerManager';
import { getCreatureType } from '../units/unit_defs/unitDef';
import { getTerrainEffectDef, type ThornsDef } from './terrainEffectDefs';
import type { TileTransitionEngine } from './tileTransitions';

/** True when the thorns' creature filter includes this unit. */
export function unitIsHurtByThorns(thorns: ThornsDef, unit: Unit): boolean {
    const creatureType = getCreatureType(unit.characterId);
    const { hurts } = thorns;
    if ('only' in hurts) return creatureType !== undefined && hurts.only.includes(creatureType);
    return creatureType === undefined || !hurts.except.includes(creatureType);
}

/** @returns true if the thorns damaged the unit. */
export function triggerThorns(
    effect: Pick<TerrainEffectRecord, 'id' | 'effectType' | 'ownerUnitId'>,
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
    if (thorns.consumeOnTrigger) engine.terrainLayers.remove(effect.id);
    return true;
}
