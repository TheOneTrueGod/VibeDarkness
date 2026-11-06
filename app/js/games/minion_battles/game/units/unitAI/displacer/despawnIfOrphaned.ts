/**
 * Clones fade with their master: when no living Displacer Spirit remains on the clone team the
 * clone is scheduled to despawn on the next movement tick (same path as ephemeral summons).
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import { DISPLACER_SPIRIT_ID } from '../../../displacer/displacerConstants';
import { despawnIfMasterGone } from '../../boundUnits';

/** True (and schedules despawn) when the clone has no living master. */
export function despawnIfOrphaned(unit: Unit, context: AIContext): boolean {
    return despawnIfMasterGone(unit, context, DISPLACER_SPIRIT_ID);
}
