/**
 * DoT (Damage over Time) tick system.
 *
 * One tick fires every 1/DOT_TICKS_PER_ROUND of a round. Bleed ticks every milestone;
 * thorn standing damage ticks every other milestone (4 HP/round total).
 * Enter/land thorn damage is handled separately in `terrainEffects/tileTransitions.ts`.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import type { TerrainLayerManager } from './TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';
import {
    BRAMBLE_SLOW_EFFECT_TYPE,
    DARK_THORN_EFFECT_TYPE,
    isImmuneToBrambleSlow,
    isImmuneToDarkThorn,
} from './terrainEffects/tileTransitions';

export const DOT_TICKS_PER_ROUND = 8;
/** Total thorn DoT over a full round of standing (1 HP every other milestone). */
export const THORN_DOT_DAMAGE_PER_ROUND = 4;
export const THORN_DOT_DAMAGE_PER_HIT = 1;

function tickThornEffect(
    effectType: string,
    units: readonly Unit[],
    terrainLayers: TerrainLayerManager,
    eventBus: EventBus,
    isImmune: (unit: Unit) => boolean,
): void {
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        if (isImmune(unit)) continue;
        const col = Math.floor(unit.x / CELL_SIZE);
        const row = Math.floor(unit.y / CELL_SIZE);
        const effect = terrainLayers.getGroundEffectAt(col, row);
        if (effect?.effectType === effectType) {
            unit.takeDamage(THORN_DOT_DAMAGE_PER_HIT, effect.ownerUnitId ?? null, eventBus);
        }
    }
}

/**
 * @param dotMilestoneIndex — 0-based index of the DoT milestone about to fire this round
 *   (matches `appliedDotTicks` before it is incremented). Thorns fire on even indices only.
 */
export function tickAllDots(
    units: readonly Unit[],
    terrainLayers: TerrainLayerManager,
    eventBus: EventBus,
    fx?: BleedDamageFxContext,
    dotMilestoneIndex = 0,
): void {
    tickBleedForRoundMilestone(units, eventBus, fx);
    // 4 hits × THORN_DOT_DAMAGE_PER_HIT over DOT_TICKS_PER_ROUND milestones.
    if (dotMilestoneIndex % 2 !== 0) return;

    // Regular thorns: only damage shadow (dark_creature) units — wolves, swarmlings, slimes, etc.
    tickThornEffect(BRAMBLE_SLOW_EFFECT_TYPE, units, terrainLayers, eventBus, isImmuneToBrambleSlow);
    // Dark thorns (Thornbinder): dark creatures are immune
    tickThornEffect(DARK_THORN_EFFECT_TYPE, units, terrainLayers, eventBus, isImmuneToDarkThorn);
}
