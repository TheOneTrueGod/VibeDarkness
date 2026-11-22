/**
 * Is this unit in the middle of a burrow right now, whatever started it (a phase transition, a hop, an emergence or
 * carried move, a round hop)? One place to ask, so rules like the node-tree leash need not know every burrow source.
 */

import type { Unit } from '../Unit';
import { peekPhaseState } from './phaseComponent';
import { peekBurrowHopState } from './burrowHop';
import { peekBurrowEmergeState } from './burrowEmerge';
import { peekRoundHopState } from './roundHop';

export function isUnitBurrowing(unit: Unit): boolean {
    return (
        peekPhaseState(unit)?.burrow != null ||
        peekBurrowHopState(unit)?.burrow != null ||
        peekBurrowEmergeState(unit)?.burrow != null ||
        peekRoundHopState(unit)?.burrow != null
    );
}
