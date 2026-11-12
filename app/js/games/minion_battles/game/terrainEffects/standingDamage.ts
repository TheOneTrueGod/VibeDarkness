/**
 * Def-driven lingering hazards. Any ground/air effect whose `TerrainEffectDef` has a
 * `standingDamage` block pulses damage into matching units standing in a cell it owns, and
 * optionally stuns them (`stunSec`, through the hard-CC armour gate).
 * Pulses land on world-clock boundaries (`floor(gameTime / intervalSec)` ticking over), so the
 * rule is stateless and identical across clients. To add a variant: add a def entry with
 * `standingDamage` (terrainEffectDefs.ts) plus a visual entry (GameRenderer/terrainEffectDefs.ts).
 */

import type { EventBus } from '../EventBus';
import type { TerrainEffectRecord, TerrainLayerManager } from '../TerrainLayerManager';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { tryApplyHardCcStun } from '../../crowdControl/tryApplyHardCcStun';
import { areEnemies } from '../teams';
import { getTerrainEffectDef, STANDING_DAMAGE_PARAM, type StandingDamageDef } from './terrainEffectDefs';
import { unitMatchesCreatureFilter } from './thorns';
import { isUnitAirborne } from './tileTransitions';

export interface StandingDamageEngine {
    terrainLayers: TerrainLayerManager;
    eventBus: EventBus;
    gameTime: number;
    /** Stamped on the stun buff (`stunSec` hazards). */
    roundNumber: number;
    /** Interrupts a unit's casts when a hazard's stun lands (the engine's usual stun interrupt path). */
    interruptUnitAndRefundAbilities?(unit: Unit): void;
}

const LAYERS = ['ground', 'air'] as const;

/** True when a standing hazard's `hurts` includes this unit (team-aware for `'enemiesOfOwner'`). */
export function unitIsHurtByStandingDamage(
    standing: StandingDamageDef,
    effect: Pick<TerrainEffectRecord, 'teamId'>,
    unit: Unit,
): boolean {
    if (standing.hurts === 'enemiesOfOwner') {
        return effect.teamId !== undefined && areEnemies(effect.teamId, unit.teamId);
    }
    return unitMatchesCreatureFilter(standing.hurts, unit);
}

/** Damage per pulse: the record's `params.damage` when the def allows it, else the def's damage. */
export function getStandingDamageAmount(
    standing: StandingDamageDef,
    effect: Pick<TerrainEffectRecord, 'params'>,
): number {
    if (standing.damageFromRecord) {
        const override = effect.params?.[STANDING_DAMAGE_PARAM];
        if (typeof override === 'number') return override;
    }
    return standing.damage;
}

/** Apply this tick's standing-damage pulses to one unit. `dt` is the world time just elapsed. */
export function tickStandingTerrainDamage(unit: Unit, dt: number, engine: StandingDamageEngine): void {
    if (!unit.active || !unit.isAlive()) return;
    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    for (const layer of LAYERS) {
        const effect = engine.terrainLayers.getEffectAt(layer, col, row);
        if (!effect) continue;
        const standing = getTerrainEffectDef(effect.effectType)?.standingDamage;
        if (!standing) continue;
        const prevPulse = Math.floor((engine.gameTime - dt) / standing.intervalSec);
        const currPulse = Math.floor(engine.gameTime / standing.intervalSec);
        if (currPulse <= prevPulse) continue;
        if (layer === 'ground' && isUnitAirborne(unit)) continue;
        if (!unitIsHurtByStandingDamage(standing, effect, unit)) continue;
        unit.takeDamage(getStandingDamageAmount(standing, effect), effect.ownerUnitId ?? null, engine.eventBus);
        if (!unit.isAlive()) return;
        if (standing.stunSec !== undefined && standing.stunSec > 0) {
            const stun = tryApplyHardCcStun(unit, standing.stunSec, engine.gameTime, engine.roundNumber, engine.eventBus);
            if (stun.outcome === 'applied') engine.interruptUnitAndRefundAbilities?.(unit);
        }
    }
}
