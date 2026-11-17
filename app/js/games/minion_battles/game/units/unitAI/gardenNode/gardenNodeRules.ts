/**
 * Garden node movement rules, pure so tests can read them directly.
 *
 * "Knots stay put; Buds move." Whether a node is a Knot or a Bud is its place in the tree, so the rule reads the tree:
 * a node with a living child holds still, a node without one (a Bud) drifts toward the party, held to its Stem's
 * leash by the node-tree tick. A def with speed 0 (the Heart, the Mender Bloom) never moves either way.
 */

import type { Unit } from '../../Unit';
import { hasLivingChildren } from '../../components/nodeTree';

/** True when this node may walk: it has a speed and no living children (it is a Bud, not a Knot). */
export function canNodeMove(unit: Unit): boolean {
    return unit.speed > 0 && !hasLivingChildren(unit);
}
