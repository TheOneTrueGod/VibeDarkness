import type { Unit } from '../game/units/Unit';

/** True when exactly one player-controlled unit is on the player team (typical solo campaign / single-player battles). */
export function isSinglePlayerBattle(units: Unit[] | undefined): boolean {
    if (!units?.length) return false;
    const n = units.filter((u) => u.teamId === 'player' && u.isPlayerControlled()).length;
    return n === 1;
}
