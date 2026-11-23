/**
 * Ephemeral expiry: units with `ephemeralDespawnAtGameTime` (Displacer decoys, spirit clones, bound units)
 * die when the world clock reaches it. `Unit.ephemeralExpiryPolicy` decides what a cast in progress does:
 *
 * - `'immediate'` — the unit dies on time, mid-cast or not.
 * - `'finishCast'` — while a cast is still in action (`isCastInAction`: before its last non-cooldown window
 *   ends) the unit **lingers**; it dies on the first tick no cast is in action. Its cooldown is not waited for.
 *
 * A lingering unit is derived, never stored (`isUnitLingering`): it is alive past its time. The AI phase skips
 * it (no new casts or goals), and pet commands never pick it (`getCommandablePetsOfUnit`), but a follow-up of
 * its running cast (`BattleOrder.followUpOf`, e.g. Pounce → Spirit Flurry) still starts, so a chain finishes.
 */
import type { Unit } from './Unit';
import { unitHasCastInAction, type CastPriorityEngine } from './castPriority';

/** Whether the unit's ephemeral time has come (`gameTime >= ephemeralDespawnAtGameTime`). */
export function isUnitPastEphemeralTime(unit: Unit, gameTime: number): boolean {
    return unit.ephemeralDespawnAtGameTime != null && gameTime >= unit.ephemeralDespawnAtGameTime;
}

/** Alive past its ephemeral time: finishing its last cast before it fades. Starts nothing new. */
export function isUnitLingering(unit: Unit, gameTime: number): boolean {
    return unit.isAlive() && isUnitPastEphemeralTime(unit, gameTime);
}

/** Whether the unit should expire now, per its `ephemeralExpiryPolicy`. */
export function shouldEphemeralUnitExpire(unit: Unit, engine: CastPriorityEngine): boolean {
    if (!isUnitPastEphemeralTime(unit, engine.gameTime)) return false;
    if (unit.ephemeralExpiryPolicy === 'finishCast' && unitHasCastInAction(unit, engine)) return false;
    return true;
}
