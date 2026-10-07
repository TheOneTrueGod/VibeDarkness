/**
 * Clones fade with their master: when no living Displacer Spirit remains on the clone team the
 * clone is scheduled to despawn on the next movement tick (same path as ephemeral summons).
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import { DISPLACER_SPIRIT_ID } from '../../../displacer/displacerConstants';

/** True (and schedules despawn) when the clone has no living master. */
export function despawnIfOrphaned(unit: Unit, context: AIContext): boolean {
    const masterAlive = context
        .getUnits()
        .some((u) => u.isAlive() && u.characterId === DISPLACER_SPIRIT_ID && u.teamId === unit.teamId);
    if (masterAlive) return false;
    unit.ephemeralDespawnAtGameTime = context.gameTime;
    return true;
}
