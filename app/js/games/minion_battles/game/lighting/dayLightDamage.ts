/**
 * DayLight damages dark creatures based on animated DayLight intensity.
 * Cadence matches thorn DoT: every other DOT milestone (0.25 rounds).
 */

import type { Unit } from '../units/Unit';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { isDarkCreatureCharacterId } from '../units/unit_defs/unitDef';
import { DOT_TICKS_PER_ROUND } from '../dotTick';
import { DAMAGE_VISUAL_KIND_DAYLIGHT } from '../EventBus';

/** Damage dealt per 1.0 DayLight intensity each damage pulse. */
export const DAYLIGHT_DAMAGE_PER_INTENSITY = 2;

/** How often DayLight damage pulses, in rounds (aligned with even DOT milestones). */
export const DAYLIGHT_DAMAGE_INTERVAL_ROUNDS = 0.25;

/** DOT milestones per DayLight pulse (DOT_TICKS_PER_ROUND * interval). */
export const DAYLIGHT_DAMAGE_DOT_STRIDE = Math.round(
    DOT_TICKS_PER_ROUND * DAYLIGHT_DAMAGE_INTERVAL_ROUNDS,
);

/**
 * @param dotMilestoneIndex — 0-based DoT milestone (same as `tickAllDots`).
 *   DayLight fires on even indices when stride is 2.
 */
export function tickDayLightDamage(
    units: readonly Unit[],
    engine: EngineContext,
    dotMilestoneIndex: number,
): void {
    if (dotMilestoneIndex % DAYLIGHT_DAMAGE_DOT_STRIDE !== 0) return;

    let damagedAny = false;
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        if (!isDarkCreatureCharacterId(unit.characterId)) continue;

        const col = Math.floor(unit.x / CELL_SIZE);
        const row = Math.floor(unit.y / CELL_SIZE);
        const intensity = engine.getLightIntensity(col, row, 'DayLight');
        if (intensity == null || intensity <= 0) continue;

        const damage = Math.floor(DAYLIGHT_DAMAGE_PER_INTENSITY * intensity);
        if (damage <= 0) continue;
        unit.takeDamage(damage, null, engine.eventBus, { visualKind: DAMAGE_VISUAL_KIND_DAYLIGHT });
        damagedAny = true;
    }
    if (damagedAny) {
        engine.eventBus.emit('daylight_damage_pulse', {});
    }
}
